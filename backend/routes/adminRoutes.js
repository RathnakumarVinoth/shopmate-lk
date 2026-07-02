const express = require("express");

const {
  disableShop,
  enableShop,
  getShopDetails,
  getShops,
  getSummary,
  updateSubscription,
} = require("../controllers/adminController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("admin"));

router.get("/summary", getSummary);
router.get("/shops", getShops);
router.get("/shops/:id", getShopDetails);
router.put("/shops/:id/subscription", updateSubscription);
router.put("/shops/:id/enable", enableShop);
router.put("/shops/:id/disable", disableShop);

module.exports = router;
