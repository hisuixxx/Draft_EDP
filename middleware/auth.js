export const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.redirect("/login");
  next();
};

export const requireAdmin = (req, res, next) => {
  if (req.session.userRole !== "admin") {
    req.flash("error_msg", "Administrator access is required.");
    return res.redirect("/dashboard");
  }
  next();
};

export const requireStaff = (req, res, next) => {
  if (!["admin", "staff"].includes(req.session.userRole)) {
    req.flash("error_msg", "Staff access is required.");
    return res.redirect("/");
  }
  next();
};

export const requireCustomer = (req, res, next) => {
  if (req.session.userRole !== "customer") {
    req.flash("error_msg", "Customer access is required.");
    return res.redirect("/dashboard");
  }
  next();
};
