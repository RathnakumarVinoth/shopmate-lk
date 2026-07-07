const express = require("express");

const {
  cancelPurchaseOrder,
  createGrn,
  createPurchaseOrder,
  getGrnById,
  getGrns,
  getProductBatches,
  getPurchaseOrderById,
  getPurchaseOrders,
  postGrn,
  submitPurchaseOrder,
  updatePurchaseOrder,
} = require("../controllers/purchasingController");
const authMiddleware = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");

const router = express.Router();

router.use(
  authMiddleware,
  allowRoles("owner", "staff"),
  requirePermission("purchasing_access"),
  requireModule("purchasing")
);

router.get("/purchase-orders", getPurchaseOrders);
router.post("/purchase-orders", requirePermission("purchasing_manage"), createPurchaseOrder);
router.get("/purchase-orders/:id", getPurchaseOrderById);
router.put("/purchase-orders/:id", requirePermission("purchasing_manage"), updatePurchaseOrder);
router.post(
  "/purchase-orders/:id/submit",
  requirePermission("purchasing_manage"),
  submitPurchaseOrder
);
router.post(
  "/purchase-orders/:id/cancel",
  requirePermission("purchasing_manage"),
  cancelPurchaseOrder
);

router.get("/grns", requireModule("grn"), getGrns);
router.post("/grns", requireModule("grn"), requirePermission("purchasing_manage"), createGrn);
router.get("/grns/:id", requireModule("grn"), getGrnById);
router.post("/grns/:id/post", requireModule("grn"), requirePermission("purchasing_manage"), postGrn);

router.get("/products/:productId/batches", getProductBatches);

module.exports = router;
