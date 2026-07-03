const express = require("express");

const { getDashboard } = require("../controllers/dashboardController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  allowRoles("owner", "staff"),
  requirePermission("dashboard_view"),
  getDashboard
);

module.exports = router;
