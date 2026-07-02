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

const router = express.Router();

router.use(authMiddleware, allowRoles("owner"));

router.post("/customers", addCustomer);
router.get("/customers", getCustomers);
router.get("/customers/:id/history", getCustomerHistory);
router.get("/summary", getCreditSummary);
router.post("/", addCredit);
router.get("/", getCredits);
router.put("/:id/pay", payCredit);

module.exports = router;
