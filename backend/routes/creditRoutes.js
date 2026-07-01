const express = require("express");

const {
  addCredit,
  addCustomer,
  getCreditSummary,
  getCredits,
  getCustomers,
  payCredit,
} = require("../controllers/creditController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/customers", authMiddleware, addCustomer);
router.get("/customers", authMiddleware, getCustomers);
router.get("/summary", authMiddleware, getCreditSummary);
router.post("/", authMiddleware, addCredit);
router.get("/", authMiddleware, getCredits);
router.put("/:id/pay", authMiddleware, payCredit);

module.exports = router;
