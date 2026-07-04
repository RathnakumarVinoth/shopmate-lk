const express = require("express");

const {
  getSecuritySettings,
  getSettings,
  updateSecuritySettings,
  updateSettings,
} = require("../controllers/settingsController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.get(
  "/security",
  authMiddleware,
  allowRoles("owner", "staff"),
  getSecuritySettings
);
router.put(
  "/security",
  authMiddleware,
  allowRoles("owner"),
  updateSecuritySettings
);

router.get("/", authMiddleware, allowRoles("owner", "staff"), getSettings);
router.put(
  "/",
  authMiddleware,
  allowRoles("owner"),
  requirePermission("settings_access"),
  updateSettings
);

module.exports = router;
