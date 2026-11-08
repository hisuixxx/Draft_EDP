
  /*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    
import express from "express";
import { homePage } from "../controllers/homeController.js";
import { requireAuth, requireAdmin, requireStaff, requireCustomer } from "../middleware/auth.js";
import { menuImageUpload } from "../middleware/upload.js";
import { dashboardPage, menuPage, categoriesPage, createCategory, toggleCategory, settingsPage, updateSettings, menuCreate, menuUpdate, menuToggle, menuDelete, adjustInventory, newOrderPage, createOrder, ordersPage, orderConfirmationPage, updateOrderStatus, reportsPage, reportsCsv } from "../controllers/restaurantController.js";
const router = express.Router();
const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
router.get("/", asyncHandler(homePage));

import { loginPage, registerPage, forgotPasswordPage, loginUser, registerUser, logoutUser, profilePage, updateProfile, changeOwnPassword, usersPage, auditLogsPage, createUser, deleteUser, changeUserPassword, updateUserRole, toggleUserStatus } from "../controllers/authController.js";

router.get("/login", loginPage);
router.post("/login", asyncHandler(loginUser));
router.get("/register", registerPage);
router.post("/register", asyncHandler(registerUser));
router.get("/forgot-password", forgotPasswordPage);
router.get("/dashboard", requireAuth, asyncHandler(dashboardPage));
router.get("/profile", requireAuth, asyncHandler(profilePage));
router.post("/profile", requireAuth, asyncHandler(updateProfile));
router.post("/profile/password", requireAuth, asyncHandler(changeOwnPassword));
router.get("/menu", asyncHandler((req, res, next) => req.session.userRole === "admin" ? res.redirect("/manage/menu") : homePage(req, res, next)));
router.get("/manage/menu", requireAuth, requireAdmin, asyncHandler(menuPage));
router.get("/categories", requireAuth, requireAdmin, asyncHandler(categoriesPage));
router.post("/categories", requireAuth, requireAdmin, asyncHandler(createCategory));
router.post("/categories/:id/toggle", requireAuth, requireAdmin, asyncHandler(toggleCategory));
router.get("/settings", requireAuth, requireAdmin, asyncHandler(settingsPage));
router.post("/settings", requireAuth, requireAdmin, asyncHandler(updateSettings));
router.post("/manage/menu", requireAuth, requireAdmin, menuImageUpload.single("image"), asyncHandler(menuCreate));
router.post("/manage/menu/:id/edit", requireAuth, requireAdmin, menuImageUpload.single("image"), asyncHandler(menuUpdate));
router.post("/manage/menu/:id/toggle", requireAuth, requireAdmin, asyncHandler(menuToggle));
router.post("/manage/menu/:id/delete", requireAuth, requireAdmin, asyncHandler(menuDelete));
router.post("/manage/menu/:id/inventory", requireAuth, requireAdmin, asyncHandler(adjustInventory));
router.get("/orders/new", requireAuth, requireStaff, asyncHandler(newOrderPage));
router.get("/checkout", requireAuth, requireCustomer, asyncHandler(newOrderPage));
router.post("/orders", requireAuth, asyncHandler(createOrder));
router.get("/orders", requireAuth, asyncHandler(ordersPage));
router.get("/orders/:id/confirmation", requireAuth, requireCustomer, asyncHandler(orderConfirmationPage));
router.post("/orders/:id/status", requireAuth, requireStaff, asyncHandler(updateOrderStatus));
router.get("/reports", requireAuth, requireAdmin, asyncHandler(reportsPage));
router.get("/reports.csv", requireAuth, requireAdmin, asyncHandler(reportsCsv));
router.get("/users", requireAuth, requireAdmin, asyncHandler(usersPage));
router.get("/audit-logs", requireAuth, requireAdmin, asyncHandler(auditLogsPage));
router.post("/users", requireAuth, requireAdmin, asyncHandler(createUser));
router.post("/users/:id/password", requireAuth, requireAdmin, asyncHandler(changeUserPassword));
router.post("/users/:id/role", requireAuth, requireAdmin, asyncHandler(updateUserRole));
router.post("/users/:id/status", requireAuth, requireAdmin, asyncHandler(toggleUserStatus));
router.post("/users/:id/delete", requireAuth, requireAdmin, asyncHandler(deleteUser));
router.get("/logout", logoutUser);

export default router;
