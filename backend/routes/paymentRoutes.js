const express = require("express");

const {
  failPayment,
  getPendingPayments,
  verifyPayment,
} = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");

const router = express.Router();

router.get("/pending", authMiddleware, allowRoles("owner"), requirePermission("payment_verification_access"), requireModule("pos"), getPendingPayments);
router.put("/:sale_id/verify", authMiddleware, allowRoles("owner"), requirePermission("payment_verification_access"), requireModule("pos"), verifyPayment);
router.put("/:sale_id/fail", authMiddleware, allowRoles("owner"), requirePermission("payment_verification_access"), requireModule("pos"), failPayment);

module.exports = router;
