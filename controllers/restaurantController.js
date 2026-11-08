import { Op, fn, col, literal } from "sequelize";
import { sequelize } from "../models/db.js";
import { MenuItem, Category, RestaurantSetting, Order, OrderItem, OrderStatusHistory, Payment, InventoryTransaction } from "../models/restaurantModel.js";
import { recordAudit } from "../utils/audit.js";

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
  items: await MenuItem.findAll({ include: [{ model: Category, as: "categoryRecord" }], order: [["category", "ASC"], ["name", "ASC"]] }),
  categories: await Category.findAll({ where: { active: true }, order: [["name", "ASC"]] })
});

export const categoriesPage = async (req, res) => page(res, "categories", {
  categories: await Category.findAll({ order: [["active", "DESC"], ["name", "ASC"]] })
});

export const createCategory = async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
  if (!name || name.length > 80) {
    req.flash("error_msg", "Category names are required and must be 80 characters or fewer.");
    return res.redirect("/categories");
  }
  try {
    const category = await Category.create({ name, description: description || null });
    await recordAudit(req, "create", "category", category.id, `Created category ${category.name}`);
    req.flash("success_msg", "Category created successfully.");
  } catch (error) {
    console.error("Category creation failed:", error);
    req.flash("error_msg", error.name === "SequelizeUniqueConstraintError" ? "That category already exists." : "Could not create category.");
  }
  res.redirect("/categories");
};

export const toggleCategory = async (req, res) => {
  const category = await Category.findByPk(req.params.id);
  if (!category) {
    req.flash("error_msg", "Category not found.");
    return res.redirect("/categories");
  }
  await category.update({ active: !category.active });
  await recordAudit(req, "status_change", "category", category.id, `${category.name} ${category.active ? "activated" : "archived"}`);
  req.flash("success_msg", `Category ${category.active ? "activated" : "archived"}.`);
  res.redirect("/categories");
};

export const settingsPage = async (req, res) => {
  const settings = await RestaurantSetting.findAll({ order: [["key", "ASC"]] });
  res.render("settings", { title: "Restaurant settings", settings: Object.fromEntries(settings.map(setting => [setting.key, setting.value])) });
};

export const updateSettings = async (req, res) => {
  const allowed = ["restaurantName", "restaurantDescription", "contactPhone", "address", "openingHours"];
  try {
    await sequelize.transaction(async transaction => {
      for (const key of allowed) {
        const value = typeof req.body[key] === "string" ? req.body[key].trim() : "";
        await RestaurantSetting.upsert({ key, value: value.slice(0, 1000) }, { transaction });
      }
    });
    await recordAudit(req, "update", "restaurant_settings", null, "Restaurant settings updated");
    req.flash("success_msg", "Restaurant settings saved.");
  } catch (error) {
    console.error("Restaurant settings update failed:", error);
    req.flash("error_msg", "Could not save restaurant settings.");
  }
  res.redirect("/settings");
};

export const menuCreate = async (req, res) => {
  const { name, description, price, category, categoryId, image, trackInventory, stockQuantity, lowStockThreshold } = req.body;
  const selectedCategory = categoryId ? await Category.findOne({ where: { id: categoryId, active: true } }) : null;
  const categoryName = selectedCategory?.name || category;
  const stock = Number(stockQuantity || 0);
  const threshold = Number(lowStockThreshold || 0);
  if (!name?.trim() || !categoryName?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(threshold) || threshold < 0) {
    req.flash("error_msg", "Please provide a valid name, category, and price.");
    return res.redirect("/menu");
  }
  const item = await MenuItem.create({ name: name.trim(), description: description?.trim() || null, price: Number(price), category: categoryName.trim(), categoryId: selectedCategory?.id || null, image: req.file ? `/uploads/menu/${req.file.filename}` : image?.trim() || null, trackInventory: trackInventory === "on", stockQuantity: stock, lowStockThreshold: threshold });
  if (item.trackInventory && stock > 0) await InventoryTransaction.create({ menuItemId: item.id, quantity: stock, type: "addition", reason: "Initial stock", changedBy: req.session.userId });
  await recordAudit(req, "create", "menu_item", item.id, `Created menu item ${item.name}`);
  req.flash("success_msg", "Menu item added successfully!");
  res.redirect("/menu");
};

export const menuUpdate = async (req, res) => {
  const item = await MenuItem.findByPk(req.params.id);
  if (!item) {
    req.flash("error_msg", "Menu item not found.");
    return res.redirect("/menu");
  }
  const { name, description, price, category, categoryId, image, trackInventory, stockQuantity, lowStockThreshold } = req.body;
  const selectedCategory = categoryId ? await Category.findOne({ where: { id: categoryId, active: true } }) : null;
  const categoryName = selectedCategory?.name || category;
  const stock = Number(stockQuantity || 0);
  const threshold = Number(lowStockThreshold || 0);
  if (!name?.trim() || !categoryName?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(threshold) || threshold < 0) {
    req.flash("error_msg", "Please provide valid menu item details.");
    return res.redirect("/menu");
  }
  const previousStock = item.stockQuantity;
  const trackingEnabled = trackInventory === "on";
  await item.update({ name: name.trim(), description: description?.trim() || null, price: Number(price), category: categoryName.trim(), categoryId: selectedCategory?.id || null, image: req.file ? `/uploads/menu/${req.file.filename}` : item.image || image?.trim() || null, trackInventory: trackingEnabled, stockQuantity: stock, lowStockThreshold: threshold });
  if (trackingEnabled && stock !== previousStock) await InventoryTransaction.create({ menuItemId: item.id, quantity: stock - previousStock, type: stock > previousStock ? "addition" : "deduction", reason: "Menu stock update", changedBy: req.session.userId });
  await recordAudit(req, "update", "menu_item", item.id, `Updated menu item ${item.name}`);
  req.flash("success_msg", "Menu item updated successfully!");
  res.redirect("/menu");
};

export const adjustInventory = async (req, res) => {
  const quantity = Number(req.body.quantity);
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!Number.isInteger(quantity) || quantity === 0 || !reason || reason.length > 255) {
    req.flash("error_msg", "Enter a non-zero whole-number adjustment and a reason.");
    return res.redirect("/manage/menu");
  }
  try {
    await sequelize.transaction(async transaction => {
      const item = await MenuItem.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!item) throw new Error("Menu item not found.");
      const nextStock = item.stockQuantity + quantity;
      if (nextStock < 0) throw new Error("Stock cannot become negative.");
      await item.update({ trackInventory: true, stockQuantity: nextStock }, { transaction });
      await InventoryTransaction.create({ menuItemId: item.id, quantity, type: quantity > 0 ? "addition" : "deduction", reason, changedBy: req.session.userId }, { transaction });
      await recordAudit(req, "inventory_adjustment", "menu_item", item.id, `${quantity > 0 ? "Added" : "Removed"} ${Math.abs(quantity)} stock: ${reason}`, transaction);
    });
    req.flash("success_msg", "Inventory updated successfully.");
  } catch (error) {
    req.flash("error_msg", error.message === "Stock cannot become negative." ? error.message : "Could not update inventory.");
  }
  res.redirect("/manage/menu");
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
    const menuItems = await MenuItem.findAll({ where: { id: { [Op.in]: ids }, available: true }, transaction, lock: transaction.LOCK.UPDATE });
    if (menuItems.length !== ids.length) throw new Error("One or more selected items are unavailable.");
    const lines = menuItems.map(item => ({ item, quantity: Math.max(1, Math.floor(Number(quantities[item.id] || 1))) }));
    for (const line of lines) {
      if (line.item.trackInventory && line.quantity > line.item.stockQuantity) throw new Error(`${line.item.name} does not have enough stock.`);
    }
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
    for (const line of lines) {
      if (!line.item.trackInventory) continue;
      await line.item.decrement("stockQuantity", { by: line.quantity, transaction });
      await InventoryTransaction.create({ menuItemId: line.item.id, quantity: -line.quantity, type: "deduction", reason: `Order ${order.orderNumber}`, changedBy: req.session.userId || null }, { transaction });
    }
    await recordAudit(req, "create", "order", order.id, `Created order ${order.orderNumber}`, transaction);
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
    await recordAudit(req, "status_change", "order", order.id, `Order status changed to ${nextStatus}`, transaction);
  });
  req.flash("success_msg", nextStatus === "Cancelled" ? "Order cancelled successfully!" : "Order status updated successfully!");
  res.redirect("/orders");
};

export const reportsPage = async (req, res) => {
  const { from = "", to = "" } = req.query;
  const where = { status: "Completed" };
  if (from || to) where.createdAt = {};
  if (from) where.createdAt[Op.gte] = new Date(`${from}T00:00:00`);
  if (to) where.createdAt[Op.lt] = new Date(`${to}T23:59:59`);
  const completed = await Order.findAll({ where, attributes: [[fn("DATE", col("createdAt")), "day"], [fn("SUM", col("total")), "sales"], [fn("COUNT", col("id")), "orders"]], group: [literal("DATE(`createdAt`)")], order: [[literal("day"), "DESC"]], limit: 366, raw: true });
  page(res, "reports", { reports: completed.map(row => ({ ...row, sales: money(row.sales) })), filters: { from, to } });
};

export const reportsCsv = async (req, res) => {
  const { from = "", to = "" } = req.query;
  const where = { status: "Completed" };
  if (from || to) where.createdAt = {};
  if (from) where.createdAt[Op.gte] = new Date(`${from}T00:00:00`);
  if (to) where.createdAt[Op.lt] = new Date(`${to}T23:59:59`);
  const rows = await Order.findAll({ where, attributes: [[fn("DATE", col("createdAt")), "day"], [fn("SUM", col("total")), "sales"], [fn("COUNT", col("id")), "orders"]], group: [literal("DATE(`createdAt`)")], order: [[literal("day"), "ASC"]], raw: true });
  const csv = ["date,orders,sales", ...rows.map(row => `${row.day},${row.orders},${money(row.sales)}`)].join("\r\n");
  res.type("text/csv").attachment("servesync-sales-report.csv").send(csv);
};
