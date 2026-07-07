const express = require("express");

const {
  getDailySales,
  getExpensesByCategory,
  getExpensesChart,
  getMonthlyComparison,
  getOverview,
  getPaymentMethods,
  getProfitChart,
  getSalesChart,
  getSummary,
  getTopProducts,
} = require("../controllers/reportController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner", "staff"), requirePermission("reports_access"), requireModule("reports"));

router.get("/summary", getSummary);
router.get("/overview", getOverview);
router.get("/daily-sales", getDailySales);
router.get("/sales-chart", getSalesChart);
router.get("/profit-chart", getProfitChart);
router.get("/expenses-chart", getExpensesChart);
router.get("/top-products", getTopProducts);
router.get("/payment-methods", getPaymentMethods);
router.get("/monthly-comparison", getMonthlyComparison);
router.get("/expenses-by-category", getExpensesByCategory);

module.exports = router;
