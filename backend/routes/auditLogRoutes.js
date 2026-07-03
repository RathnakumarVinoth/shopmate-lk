const express = require("express");

const { getAuditLogs } = require("../controllers/auditLogController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  allowRoles("owner", "admin", "staff"),
  requirePermission("audit_logs_access"),
  getAuditLogs
);

module.exports = router;
