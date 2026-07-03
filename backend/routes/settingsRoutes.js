const express = require("express");

const {
  getSecuritySettings,
  getSettings,
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

router.use(authMiddleware, allowRoles("owner", "staff"), requirePermission("settings_access"));

router.get("/", getSettings);
router.put("/", updateSettings);

module.exports = router;
