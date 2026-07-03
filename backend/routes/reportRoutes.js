const express = require("express");

const {
  getDailySales,
  getExpensesByCategory,
  getPaymentMethods,
  getSummary,
  getTopProducts,
} = require("../controllers/reportController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner", "staff"), requirePermission("reports_access"));

router.get("/summary", getSummary);
router.get("/daily-sales", getDailySales);
router.get("/top-products", getTopProducts);
router.get("/payment-methods", getPaymentMethods);
router.get("/expenses-by-category", getExpensesByCategory);

module.exports = router;
