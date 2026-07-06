const express = require("express");

const {
  createManualBackup,
  downloadBackup,
  getHistory,
  getStatus,
  restoreBackup,
} = require("../controllers/backupController");
const authMiddleware = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get(
  "/status",
  authMiddleware,
  allowRoles("owner"),
  requirePermission("backup_export_access"),
  getStatus
);
router.get(
  "/history",
  authMiddleware,
  allowRoles("owner"),
  requirePermission("backup_export_access"),
  getHistory
);
router.post(
  "/manual",
  authMiddleware,
  allowRoles("owner"),
  requirePermission("backup_export_access"),
  createManualBackup
);
router.post(
  "/restore",
  authMiddleware,
  allowRoles("owner", "admin"),
  requirePermission("backup_export_access"),
  restoreBackup
);
router.get(
  "/:id/download",
  authMiddleware,
  allowRoles("owner"),
  requirePermission("backup_export_access"),
  downloadBackup
);

module.exports = router;
