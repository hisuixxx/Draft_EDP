import { Op, fn, col, literal } from "sequelize";
import { sequelize } from "../models/db.js";
import { MenuItem, Order, OrderItem, OrderStatusHistory, Payment } from "../models/restaurantModel.js";

const page = (res, view, data = {}) => res.render(view, { title: "RestoFlow Restaurant", ...data });
const money = value => Number.parseFloat(value || 0).toFixed(2);
const makeOrderNumber = () => `XF-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 90 + 10)}`;
const validTransitions = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Preparing", "Cancelled"],
  Preparing: ["Ready", "Cancelled"],
  Ready: ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: []
};

export const dashboardPage = async (req, res) => {
  const isCustomer = req.session.userRole === "customer";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isCustomer) {
    const [orders, recent] = await Promise.all([
      Order.findAll({ where: { customerId: req.session.userId }, attributes: ["status", [fn("COUNT", col("id")), "count"]], group: ["status"], raw: true }),
      Order.findAll({ where: { customerId: req.session.userId }, include: [{ model: OrderItem, as: "items", include: [{ model: MenuItem, as: "menuItem" }] }], order: [["createdAt", "DESC"]], limit: 8 })
    ]);
    const counts = { total: orders.reduce((sum, row) => sum + Number(row.count), 0), ...Object.fromEntries(orders.map(row => [row.status, row.count])) };
    return page(res, "dashboard", { counts, recent, sales: "0.00", menuCount: 0, isCustomer: true });
  }
  const [orders, recent, sales, menuCount] = await Promise.all([
    Order.findAll({ attributes: ["status", [fn("COUNT", col("id")), "count"]], group: ["status"], raw: true }),
    Order.findAll({ include: [{ model: OrderItem, as: "items", include: [{ model: MenuItem, as: "menuItem" }] }], order: [["createdAt", "DESC"]], limit: 8 }),
    Order.sum("total", { where: { status: "Completed", createdAt: { [Op.gte]: today } } }),
    MenuItem.count()
  ]);
  const counts = { total: orders.reduce((sum, row) => sum + Number(row.count), 0), ...Object.fromEntries(orders.map(row => [row.status, row.count])) };
  return page(res, "dashboard", { counts, recent, sales: money(sales), menuCount, isCustomer: false });
};

export const menuPage = async (req, res) => page(res, "menu", {
  items: await MenuItem.findAll({ order: [["category", "ASC"], ["name", "ASC"]] })
});

export const menuCreate = async (req, res) => {
  const { name, description, price, category, image } = req.body;
  if (!name?.trim() || !category?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0) {
    req.flash("error_msg", "Please provide a valid name, category, and price.");
    return res.redirect("/menu");
  }
  await MenuItem.create({ name: name.trim(), description: description?.trim() || null, price: Number(price), category: category.trim(), image: req.file ? `/uploads/menu/${req.file.filename}` : image?.trim() || null });
  req.flash("success_msg", "Menu item added successfully!");
  res.redirect("/menu");
};

export const menuUpdate = async (req, res) => {
  const item = await MenuItem.findByPk(req.params.id);
  if (!item) {
    req.flash("error_msg", "Menu item not found.");
    return res.redirect("/menu");
  }
  const { name, description, price, category, image } = req.body;
  if (!name?.trim() || !category?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0) {
    req.flash("error_msg", "Please provide valid menu item details.");
    return res.redirect("/menu");
  }
  await item.update({ name: name.trim(), description: description?.trim() || null, price: Number(price), category: category.trim(), image: req.file ? `/uploads/menu/${req.file.filename}` : item.image || image?.trim() || null });
  req.flash("success_msg", "Menu item updated successfully!");
  res.redirect("/menu");
};

export const menuToggle = async (req, res) => {
  const item = await MenuItem.findByPk(req.params.id);
  if (!item) {
    req.flash("error_msg", "Menu item not found.");
    return res.redirect("/menu");
  }
  await item.update({ available: !item.available });
  req.flash("success_msg", `Menu item ${item.available ? "enabled" : "disabled"} successfully.`);
  res.redirect("/menu");
};

export const menuDelete = async (req, res) => {
  const item = await MenuItem.findByPk(req.params.id);
  if (!item) {
    req.flash("error_msg", "Menu item not found.");
    return res.redirect("/menu");
  }
  await item.update({ available: false });
  req.flash("success_msg", "Menu item removed from the menu.");
  res.redirect("/menu");
};

export const newOrderPage = async (req, res) => page(res, "order-new", {
  items: await MenuItem.findAll({ where: { available: true }, order: [["category", "ASC"], ["name", "ASC"]] }),
  isCustomer: req.session.userRole === "customer"
});

export const createOrder = async (req, res) => {
  const { customerName, orderType, tableNumber, paymentMethod, amountPaid, itemIds = [], quantities = {}, submissionKey } = req.body;
  const ids = [...new Set((Array.isArray(itemIds) ? itemIds : [itemIds]).filter(Boolean).map(Number))];
  if (!customerName?.trim() || !ids.length || !["Dine-in", "Takeout", "Pickup"].includes(orderType)) {
    req.flash("error_msg", "Customer details, order type, and at least one menu item are required.");
    return res.redirect(req.session.userRole === "customer" ? "/checkout" : "/orders/new");
  }
  if (orderType === "Dine-in" && !tableNumber?.trim()) {
    req.flash("error_msg", "A table number is required for dine-in orders.");
    return res.redirect("/checkout");
  }
  const transaction = await sequelize.transaction();
  try {
    const menuItems = await MenuItem.findAll({ where: { id: { [Op.in]: ids }, available: true }, transaction });
    if (menuItems.length !== ids.length) throw new Error("One or more selected items are unavailable.");
    const lines = menuItems.map(item => ({ item, quantity: Math.max(1, Math.floor(Number(quantities[item.id] || 1))) }));
    const total = lines.reduce((sum, line) => sum + Number(line.item.price) * line.quantity, 0);
    const paid = Number(amountPaid || 0);
    const status = paymentMethod === "Cash" && paid >= total ? "Paid" : "Unpaid";
    const order = await Order.create({
      orderNumber: makeOrderNumber(), customerName: customerName.trim(), customerId: req.session.userId || null,
      orderType, tableNumber: orderType === "Dine-in" ? tableNumber.trim() : null, total, idempotencyKey: submissionKey || null
    }, { transaction });
    await OrderItem.bulkCreate(lines.map(line => ({
      orderId: order.id, menuItemId: line.item.id, quantity: line.quantity, price: line.item.price
    })), { transaction });
    await Payment.create({ orderId: order.id, method: paymentMethod || "Cash", amountPaid: status === "Paid" ? paid : 0, change: status === "Paid" ? paid - total : 0, status, paidAt: status === "Paid" ? new Date() : null }, { transaction });
    await OrderStatusHistory.create({ orderId: order.id, status: "Pending", changedBy: req.session.userId || null }, { transaction });
    await transaction.commit();
    req.flash("success_msg", "Your order has been placed successfully!");
    return res.redirect(req.session.userRole === "customer" ? `/orders/${order.id}/confirmation` : "/orders");
  } catch (error) {
    await transaction.rollback();
    req.flash("error_msg", error.name === "SequelizeUniqueConstraintError" ? "This order was already submitted." : "Failed to place order.");
    return res.redirect(req.session.userRole === "customer" ? "/checkout" : "/orders/new");
  }
};

export const ordersPage = async (req, res) => {
  const { search = "", status = "", date = "" } = req.query;
  const where = {};
  if (req.session.userRole === "customer") where.customerId = req.session.userId;
  if (search) where[Op.or] = [{ orderNumber: { [Op.like]: `%${search}%` } }, { customerName: { [Op.like]: `%${search}%` } }];
  if (status) where.status = status;
  if (date) where.createdAt = { [Op.gte]: new Date(`${date}T00:00:00`), [Op.lt]: new Date(`${date}T23:59:59`) };
  const orders = await Order.findAll({ where, include: [{ model: OrderItem, as: "items", include: [{ model: MenuItem, as: "menuItem" }] }, { model: Payment, as: "payment" }], order: [["createdAt", "DESC"]] });
  page(res, "orders", { orders, filters: req.query, isCustomer: req.session.userRole === "customer" });
};

export const orderConfirmationPage = async (req, res) => {
  const order = await Order.findOne({ where: { id: req.params.id, customerId: req.session.userId }, include: [{ model: OrderItem, as: "items", include: [{ model: MenuItem, as: "menuItem" }] }, { model: Payment, as: "payment" }] });
  if (!order) return res.redirect("/orders");
  page(res, "order-confirmation", { order });
};

export const updateOrderStatus = async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  const nextStatus = req.body.status;
  if (!order || !validTransitions[order.status]?.includes(nextStatus)) {
    req.flash("error_msg", "Invalid order status transition.");
    return res.redirect("/orders");
  }
  await sequelize.transaction(async transaction => {
    await order.update({ status: nextStatus }, { transaction });
    await OrderStatusHistory.create({ orderId: order.id, status: nextStatus, changedBy: req.session.userId }, { transaction });
  });
  req.flash("success_msg", nextStatus === "Cancelled" ? "Order cancelled successfully!" : "Order status updated successfully!");
  res.redirect("/orders");
};

export const reportsPage = async (req, res) => {
  const completed = await Order.findAll({ where: { status: "Completed" }, attributes: [[fn("DATE", col("createdAt")), "day"], [fn("SUM", col("total")), "sales"], [fn("COUNT", col("id")), "orders"]], group: [literal("DATE(`createdAt`)")], order: [[literal("day"), "DESC"]], limit: 31, raw: true });
  page(res, "reports", { reports: completed.map(row => ({ ...row, sales: money(row.sales) })) });
};
