const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getProductsExport,
  getSalesExport,
  getSaleItemsExport,
  getExpensesExport,
  getCreditsExport,
  getSuppliersExport,
  getSupplierTransactionsExport,
  getStockMovementsExport,
} = require("../controllers/exportController");

router.get("/products", authMiddleware, getProductsExport);
router.get("/sales", authMiddleware, getSalesExport);
router.get("/sale-items", authMiddleware, getSaleItemsExport);
router.get("/expenses", authMiddleware, getExpensesExport);
router.get("/credits", authMiddleware, getCreditsExport);
router.get("/suppliers", authMiddleware, getSuppliersExport);
router.get("/supplier-transactions", authMiddleware, getSupplierTransactionsExport);
router.get("/stock-movements", authMiddleware, getStockMovementsExport);

module.exports = router;