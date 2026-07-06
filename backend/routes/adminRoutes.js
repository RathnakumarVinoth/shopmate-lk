const express = require("express");

const {
  createShop,
  createShopUser,
  disableShop,
  enableShop,
  getShopDetails,
  getShops,
  getShopUsers,
  getSummary,
  resetShopPassword,
  resetUserPassword,
  resetShopUserPassword,
  updateShop,
  updateShopUser,
  updateSubscription,
} = require("../controllers/adminController");
const { getAdminBackupStatus } = require("../controllers/backupController");
const { getAuditLogs } = require("../controllers/auditLogController");
const { getLoginActivity } = require("../controllers/loginActivityController");
const { getNotifications } = require("../controllers/notificationController");
const {
  getApiRequestLogs,
  getErrorLogs,
  getSystemAlerts,
  getSystemHealth,
  markSystemAlertRead,
} = require("../controllers/monitoringController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("admin"));

router.get("/summary", getSummary);
router.get("/backups/status", getAdminBackupStatus);
router.get("/system-health", getSystemHealth);
router.get("/system-alerts", getSystemAlerts);
router.patch("/system-alerts/:id/read", markSystemAlertRead);
router.get("/error-logs", getErrorLogs);
router.get("/api-request-logs", getApiRequestLogs);
router.get("/audit-logs", getAuditLogs);
router.get("/login-activity", getLoginActivity);
router.get("/notifications", getNotifications);
router.post("/users/:id/reset-password", resetUserPassword);
router.post("/shops", createShop);
router.get("/shops", getShops);
router.get("/shops/:id", getShopDetails);
router.put("/shops/:id", updateShop);
router.put("/shops/:id/subscription", updateSubscription);
router.put("/shops/:id/enable", enableShop);
router.put("/shops/:id/disable", disableShop);
router.post("/shops/:id/reset-password", resetShopPassword);
router.put("/shops/:id/reset-password", resetShopPassword);
router.get("/shops/:id/users", getShopUsers);
router.post("/shops/:id/users", createShopUser);
router.put("/shops/:id/users/:userId", updateShopUser);
router.put("/shops/:id/users/:userId/reset-password", resetShopUserPassword);

module.exports = router;
