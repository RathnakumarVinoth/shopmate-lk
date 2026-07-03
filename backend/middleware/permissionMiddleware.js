const { hasPermission } = require("../utils/permissions");

const requirePermission = (permissionName) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role === "owner" || req.user.role === "admin") {
      return next();
    }

    if (hasPermission(req.user, permissionName)) {
      return next();
    }

    return res
      .status(403)
      .json({ message: "You do not have permission to access this page." });
  };
};

module.exports = { requirePermission };
