const express = require("express");

const {
  createStockAdjustment,
  createStockReconciliation,
  getProductStockMovements,
  getStockAdjustments,
  getStockMovements,
  getStockReconciliationById,
  getStockReconciliations,
  getStockSummary,
  postStockReconciliation,
  restockProduct,
} = require("../controllers/stockController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner", "staff"), requireModule("stock"));

router.post("/restock", requirePermission("stock_access"), restockProduct);
router.get("/movements", requirePermission("stock_access"), getStockMovements);
router.get("/summary", requirePermission("stock_access"), getStockSummary);
router.get("/product/:id", requirePermission("stock_access"), getProductStockMovements);

router.get(
  "/adjustments",
  requirePermission("stock_adjustments_manage"),
  getStockAdjustments
);
router.post(
  "/adjustments",
  requirePermission("stock_adjustments_manage"),
  createStockAdjustment
);

router.get(
  "/reconciliations",
  requirePermission("stock_reconciliation_manage"),
  getStockReconciliations
);
router.post(
  "/reconciliations",
  requirePermission("stock_reconciliation_manage"),
  createStockReconciliation
);
router.get(
  "/reconciliations/:id",
  requirePermission("stock_reconciliation_manage"),
  getStockReconciliationById
);
router.post(
  "/reconciliations/:id/post",
  requirePermission("stock_reconciliation_manage"),
  postStockReconciliation
);

module.exports = router;
