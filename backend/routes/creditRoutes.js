const express = require("express");

const {
  addCredit,
  addCustomer,
  getCreditSummary,
  getCredits,
  getCustomerHistory,
  getCustomers,
  payCredit,
} = require("../controllers/creditController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner", "staff"), requirePermission("credit_book_access"));

router.post("/customers", addCustomer);
router.get("/customers", getCustomers);
router.get("/customers/:id/history", getCustomerHistory);
router.get("/summary", getCreditSummary);
router.post("/", addCredit);
router.get("/", getCredits);
router.put("/:id/pay", payCredit);

module.exports = router;
