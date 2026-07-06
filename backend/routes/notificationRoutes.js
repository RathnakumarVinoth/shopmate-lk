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

const router = express.Router();

router.use(authMiddleware);

router.get(
  "/",
  allowRoles("owner", "staff", "admin"),
  requirePermission("notifications_access"),
  getNotifications
);
router.patch(
  "/:id/read",
  allowRoles("owner", "staff", "admin"),
  requirePermission("notifications_access"),
  markNotificationRead
);
router.get(
  "/preferences",
  allowRoles("owner", "admin"),
  getNotificationPreferences
);
router.put(
  "/preferences",
  allowRoles("owner", "admin"),
  updateNotificationPreferences
);

module.exports = router;
