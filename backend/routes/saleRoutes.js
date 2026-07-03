const express = require("express");

const {
  createSale,
  getSaleById,
  getSales,
  syncOfflineSales,
} = require("../controllers/saleController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.post("/", authMiddleware, allowRoles("owner", "staff"), requirePermission("pos_access"), createSale);
router.post("/sync-offline", authMiddleware, allowRoles("owner", "staff"), requirePermission("pos_access"), syncOfflineSales);
router.get("/", authMiddleware, allowRoles("owner", "staff"), requirePermission("pos_access"), getSales);
router.get("/:id", authMiddleware, allowRoles("owner", "staff"), requirePermission("pos_access"), getSaleById);

module.exports = router;
