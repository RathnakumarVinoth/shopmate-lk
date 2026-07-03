const { staffRoles } = require("../utils/permissions");

const allowRoles = (...roles) => {
  return (req, res, next) => {
    const acceptedRoles = new Set(roles);

    if (acceptedRoles.has("staff")) {
      staffRoles.forEach((role) => acceptedRoles.add(role));
    }

    if (!req.user || !acceptedRoles.has(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};

module.exports = { allowRoles };
