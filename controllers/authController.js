
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
    
import { User } from "../models/userModel.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

export const loginPage = (req, res) => res.render("login", { title: "Login" });
export const registerPage = (req, res) => res.render("register", { title: "Register" });
export const forgotPasswordPage = (req, res) => res.render("forgotpassword", { title: "Forgot Password" });
export const loginUser = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    req.flash("error_msg", "Enter a valid email address.");
    return res.redirect("/login");
  }
  if (typeof password !== "string" || password.length === 0) {
    req.flash("error_msg", "Enter your password.");
    return res.redirect("/login");
  }
  const user = await User.findOne({ where: { email: normalizedEmail } });
  if (!user || !user.active) { req.flash("error_msg", "Invalid email or password."); return res.redirect("/login"); }
  const match = typeof password === "string" && await verifyPassword(password, user.password);
  if (!match) { req.flash("error_msg", "Invalid email or password."); return res.redirect("/login"); }
  req.session.userId = user.id; req.session.userRole = user.role; req.session.userName = user.name;
  res.redirect("/dashboard");
};

export const registerUser = async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || typeof password !== "string" || password.length < 6) { req.flash("error_msg", "Use a name, valid email, and password with at least 6 characters."); return res.redirect("/register"); }
  try {
    const user = await User.create({ name: normalizedName, email: normalizedEmail, password: await hashPassword(password), role: "customer", active: true });
    req.session.userId = user.id; req.session.userRole = user.role; req.session.userName = user.name;
    res.redirect("/dashboard");
  } catch (error) { console.error("Customer registration failed:", error); req.flash("error_msg", error.name === "SequelizeUniqueConstraintError" ? "That email is already registered." : "We could not create your account. Please try again."); res.redirect("/register"); }
};

export const logoutUser = (req, res) => {
  req.session.destroy(error => {
    if (error) console.error("Logout failed:", error);
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
};

export const profilePage = async (req, res) => {
  const user = await User.findByPk(req.session.userId, {
    attributes: ["id", "name", "email", "role", "active", "createdAt"]
  });
  if (!user || !user.active) {
    req.session.destroy(() => res.redirect("/login"));
    return;
  }
  res.render("profile", { title: "My Profile", profile: user });
};

export const updateProfile = async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    req.flash("error_msg", "Enter a valid name and email address.");
    return res.redirect("/profile");
  }
  const user = await User.findByPk(req.session.userId);
  if (!user || !user.active) {
    req.flash("error_msg", "Your account is no longer available.");
    return res.redirect("/login");
  }
  try {
    await user.update({ name, email });
    req.session.userName = user.name;
    req.flash("success_msg", "Profile updated successfully.");
  } catch (error) {
    console.error("Profile update failed:", error);
    req.flash("error_msg", error.name === "SequelizeUniqueConstraintError" ? "That email is already registered." : "Could not update your profile.");
  }
  res.redirect("/profile");
};

export const changeOwnPassword = async (req, res) => {
  const { currentPassword, password, confirmPassword } = req.body;
  if (typeof currentPassword !== "string" || typeof password !== "string" || password.length < 6 || password !== confirmPassword) {
    req.flash("error_msg", "New passwords must match and contain at least 6 characters.");
    return res.redirect("/profile");
  }
  const user = await User.findByPk(req.session.userId);
  if (!user || !user.active || !(await verifyPassword(currentPassword, user.password))) {
    req.flash("error_msg", "The current password is incorrect.");
    return res.redirect("/profile");
  }
  await user.update({ password: await hashPassword(password) });
  req.flash("success_msg", "Password changed successfully.");
  res.redirect("/profile");
};

export const usersPage = async (req, res) => res.render("users", { title: "User Management", users: await User.findAll({ order: [["name", "ASC"]] }) });
export const createUser = async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name?.trim() || !email?.trim() || !password || password.length < 6 || !["admin", "staff", "customer"].includes(role)) {
    req.flash("error_msg", "Provide a valid name, email, role, and password with at least 6 characters.");
    return res.redirect("/users");
  }
  try { await User.create({ name: name.trim(), email: email.trim().toLowerCase(), password: await hashPassword(password), role, active: true }); req.flash("success_msg", "User account created."); }
  catch (error) { console.error("Admin user creation failed:", error); req.flash("error_msg", error.name === "SequelizeUniqueConstraintError" ? "That email is already registered." : "Could not create user. Check the database connection and required fields."); }
  res.redirect("/users");
};
export const deleteUser = async (req, res) => {
  if (Number(req.params.id) === req.session.userId) { req.flash("error_msg", "You cannot delete your own account."); return res.redirect("/users"); }
  await User.destroy({ where: { id: req.params.id } }); req.flash("success_msg", "User account deleted."); res.redirect("/users");
};

export const changeUserPassword = async (req, res) => {
  const { password, confirmPassword } = req.body;
  if (!password || password.length < 6 || password !== confirmPassword) {
    req.flash("error_msg", "Passwords must match and contain at least 6 characters.");
    return res.redirect("/users");
  }
  const user = await User.findByPk(req.params.id);
  if (!user) {
    req.flash("error_msg", "User account not found.");
    return res.redirect("/users");
  }
  await user.update({ password: await hashPassword(password) });
  req.flash("success_msg", "Password updated successfully.");
  res.redirect("/users");
};

export const updateUserRole = async (req, res) => {
  const { role } = req.body;
  if (!["admin", "staff", "customer"].includes(role)) {
    req.flash("error_msg", "Choose a valid user role.");
    return res.redirect("/users");
  }
  if (Number(req.params.id) === req.session.userId && role !== "admin") {
    req.flash("error_msg", "You cannot remove your own administrator access.");
    return res.redirect("/users");
  }
  const user = await User.findByPk(req.params.id);
  if (!user) {
    req.flash("error_msg", "User account not found.");
    return res.redirect("/users");
  }
  await user.update({ role });
  req.flash("success_msg", "User role updated successfully.");
  res.redirect("/users");
};

export const toggleUserStatus = async (req, res) => {
  if (Number(req.params.id) === req.session.userId) {
    req.flash("error_msg", "You cannot deactivate your own account.");
    return res.redirect("/users");
  }
  const user = await User.findByPk(req.params.id);
  if (!user) {
    req.flash("error_msg", "User account not found.");
    return res.redirect("/users");
  }
  await user.update({ active: !user.active });
  req.flash("success_msg", `User account ${user.active ? "activated" : "deactivated"}.`);
  res.redirect("/users");
};
