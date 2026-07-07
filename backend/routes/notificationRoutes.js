const express = require("express");

const {
  getNotificationPreferences,
  getNotifications,
  markNotificationRead,
  updateNotificationPreferences,
} = require("../controllers/notificationController");
const authMiddleware = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/",
  allowRoles("owner", "staff", "admin"),
  requirePermission("notifications_access"),
  requireModule("notifications"),
  getNotifications
);
router.patch(
  "/:id/read",
  allowRoles("owner", "staff", "admin"),
  requirePermission("notifications_access"),
  requireModule("notifications"),
  markNotificationRead
);
router.get(
  "/preferences",
  allowRoles("owner", "admin"),
  requireModule("notifications"),
  getNotificationPreferences
);
router.put(
  "/preferences",
  allowRoles("owner", "admin"),
  requireModule("notifications"),
  updateNotificationPreferences
);

module.exports = router;
