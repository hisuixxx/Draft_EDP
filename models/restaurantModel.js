import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

export const MenuItem = sequelize.define("MenuItem", {
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, validate: { min: 0 } },
  category: { type: DataTypes.STRING, allowNull: false },
  categoryId: { type: DataTypes.INTEGER, allowNull: true },
  image: { type: DataTypes.STRING, allowNull: true },
  available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  trackInventory: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  stockQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  lowStockThreshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5, validate: { min: 0 } }
});

export const Category = sequelize.define("Category", {
  name: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  description: { type: DataTypes.STRING(255), allowNull: true },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
});

export const RestaurantSetting = sequelize.define("RestaurantSetting", {
  key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  value: { type: DataTypes.TEXT, allowNull: true }
});

export const Order = sequelize.define("Order", {
  orderNumber: { type: DataTypes.STRING, allowNull: false, unique: true },
  customerName: { type: DataTypes.STRING, allowNull: false },
  customerId: { type: DataTypes.INTEGER, allowNull: true },
  orderType: { type: DataTypes.ENUM("Dine-in", "Takeout", "Pickup"), allowNull: false },
  tableNumber: { type: DataTypes.STRING, allowNull: true },
  idempotencyKey: { type: DataTypes.STRING(128), allowNull: true, unique: true },
  status: { type: DataTypes.ENUM("Pending", "Confirmed", "Preparing", "Ready", "Completed", "Cancelled"), defaultValue: "Pending" },
  total: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 }
});

export const OrderItem = sequelize.define("OrderItem", {
  quantity: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false }
});

export const Payment = sequelize.define("Payment", {
  method: { type: DataTypes.ENUM("Cash", "GCash"), allowNull: false },
  amountPaid: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  change: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.ENUM("Unpaid", "Paid", "Refunded"), allowNull: false, defaultValue: "Unpaid" },
  referenceNumber: { type: DataTypes.STRING, allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: true }
});

export const OrderStatusHistory = sequelize.define("OrderStatusHistory", {
  status: { type: DataTypes.ENUM("Pending", "Confirmed", "Preparing", "Ready", "Completed", "Cancelled"), allowNull: false },
  changedBy: { type: DataTypes.INTEGER, allowNull: true }
});

export const InventoryTransaction = sequelize.define("InventoryTransaction", {
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  type: { type: DataTypes.ENUM("addition", "deduction", "adjustment"), allowNull: false },
  reason: { type: DataTypes.STRING, allowNull: false }
});

export const AuditLog = sequelize.define("AuditLog", {
  action: { type: DataTypes.STRING(80), allowNull: false },
  entity: { type: DataTypes.STRING(80), allowNull: false },
  entityId: { type: DataTypes.STRING(80), allowNull: true },
  details: { type: DataTypes.TEXT, allowNull: true },
  ipAddress: { type: DataTypes.STRING(45), allowNull: true }
});

Order.hasMany(OrderItem, { as: "items", foreignKey: "orderId", onDelete: "CASCADE" });
OrderItem.belongsTo(Order, { foreignKey: "orderId" });
MenuItem.hasMany(OrderItem, { foreignKey: "menuItemId" });
OrderItem.belongsTo(MenuItem, { as: "menuItem", foreignKey: "menuItemId" });
Category.hasMany(MenuItem, { as: "menuItems", foreignKey: "categoryId" });
MenuItem.belongsTo(Category, { as: "categoryRecord", foreignKey: "categoryId" });
Order.hasOne(Payment, { as: "payment", foreignKey: "orderId", onDelete: "CASCADE" });
Payment.belongsTo(Order, { foreignKey: "orderId" });
Order.hasMany(OrderStatusHistory, { as: "statusHistory", foreignKey: "orderId", onDelete: "CASCADE" });
OrderStatusHistory.belongsTo(Order, { foreignKey: "orderId" });
MenuItem.hasMany(InventoryTransaction, { as: "inventoryTransactions", foreignKey: "menuItemId", onDelete: "CASCADE" });
InventoryTransaction.belongsTo(MenuItem, { foreignKey: "menuItemId" });
User.hasMany(InventoryTransaction, { as: "inventoryChanges", foreignKey: "changedBy" });
InventoryTransaction.belongsTo(User, { as: "changedByUser", foreignKey: "changedBy" });
User.hasMany(AuditLog, { as: "auditLogs", foreignKey: "userId" });
AuditLog.belongsTo(User, { as: "user", foreignKey: "userId" });
Order.belongsTo(User, { as: "customer", foreignKey: "customerId" });
User.hasMany(Order, { as: "orders", foreignKey: "customerId" });

export { sequelize };
