const express = require("express");

const {
  failPayment,
  getPendingPayments,
  verifyPayment,
} = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/pending", authMiddleware, allowRoles("owner", "staff"), getPendingPayments);
router.put("/:sale_id/verify", authMiddleware, allowRoles("owner", "staff"), verifyPayment);
router.put("/:sale_id/fail", authMiddleware, allowRoles("owner"), failPayment);

module.exports = router;
