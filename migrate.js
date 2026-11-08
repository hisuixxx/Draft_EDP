import "dotenv/config";
import crypto from "node:crypto";
import { Sequelize } from "sequelize";
import { sequelize } from "./models/db.js";
import { User } from "./models/userModel.js";
import "./models/restaurantModel.js";
import { hashPassword } from "./utils/password.js";
import inquirer from "inquirer";

const databaseName = process.env.DB_NAME || "servesync_db";
const databaseHost = process.env.DB_HOST || "localhost";
const databasePort = process.env.DB_PORT || 3306;
const databaseUser = process.env.DB_USER || "root";
const databasePassword = process.env.DB_PASSWORD || "";
const rootSequelize = new Sequelize({
  username: databaseUser,
  password: databasePassword,
  host: databaseHost,
  port: databasePort,
  dialect: "mysql",
  logging: false
});

const { createDb } = await inquirer.prompt([{
  type: "confirm",
  name: "createDb",
  message: `Database '${databaseName}' may not exist. Create it?`,
  default: true
}]);

try {
  if (createDb) {
    const safeDatabaseName = databaseName.replace(/`/g, "``");
    await rootSequelize.query(`CREATE DATABASE IF NOT EXISTS \`${safeDatabaseName}\`;`);
  }

  await sequelize.authenticate();
  await sequelize.sync({ alter: true });

  if (!await User.findOne({ where: { role: "admin" } })) {
    const initialAdminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString("base64url");
    await User.create({
      name: "Administrator",
      email: process.env.ADMIN_EMAIL || "admin@servesync.local",
      password: await hashPassword(initialAdminPassword),
      role: "admin"
    });
    console.log(`Initial admin: ${process.env.ADMIN_EMAIL || "admin@servesync.local"} / ${initialAdminPassword}`);
  }

  console.log("Tables created and database is ready.");
} catch (err) {
  console.error("Migration failed:", err.message);
  if (err.original?.code) console.error(`MySQL error code: ${err.original.code}`);
} finally {
  await rootSequelize.close();
  await sequelize.close();
}
