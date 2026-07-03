const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const {
  getAuditLogsExport,
  getCategoriesExport,
  getCustomersExport,
  getLoginActivityExport,
  getPaymentVerificationsExport,
  getProductsExport,
  getSalesExport,
  getSaleItemsExport,
  getExpensesExport,
  getCreditsExport,
  getSuppliersExport,
  getSupplierTransactionsExport,
  getStockMovementsExport,
} = require("../controllers/exportController");

router.use(authMiddleware, requirePermission("backup_export_access"));

router.get("/products", getProductsExport);
router.get("/categories", getCategoriesExport);
router.get("/sales", getSalesExport);
router.get("/sale-items", getSaleItemsExport);
router.get("/expenses", getExpensesExport);
router.get("/credits", getCreditsExport);
router.get("/customers", getCustomersExport);
router.get("/suppliers", getSuppliersExport);
router.get("/supplier-transactions", getSupplierTransactionsExport);
router.get("/stock-movements", getStockMovementsExport);
router.get("/payment-verifications", getPaymentVerificationsExport);
router.get("/audit-logs", getAuditLogsExport);
router.get("/login-activity", getLoginActivityExport);

module.exports = router;
