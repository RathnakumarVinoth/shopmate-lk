const express = require("express");

const {
  addUnitConversion,
  getUnitConversions,
  getUnits,
} = require("../controllers/unitController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");

const router = express.Router();

router.get("/", authMiddleware, allowRoles("owner", "staff", "admin"), requirePermission("products_view"), requireModule("products"), getUnits);
router.get("/conversions", authMiddleware, allowRoles("owner", "staff", "admin"), requirePermission("products_view"), requireModule("products"), getUnitConversions);
router.post("/conversions", authMiddleware, allowRoles("owner", "admin"), requirePermission("products_manage"), requireModule("products"), addUnitConversion);

module.exports = router;
