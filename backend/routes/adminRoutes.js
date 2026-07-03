const express = require("express");

const {
  createShop,
  createShopUser,
  disableShop,
  enableShop,
  getShopDetails,
  getShops,
  getShopUsers,
  getSummary,
  resetShopPassword,
  resetShopUserPassword,
  updateShop,
  updateShopUser,
  updateSubscription,
} = require("../controllers/adminController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("admin"));

router.get("/summary", getSummary);
router.post("/shops", createShop);
router.get("/shops", getShops);
router.get("/shops/:id", getShopDetails);
router.put("/shops/:id", updateShop);
router.put("/shops/:id/subscription", updateSubscription);
router.put("/shops/:id/enable", enableShop);
router.put("/shops/:id/disable", disableShop);
router.put("/shops/:id/reset-password", resetShopPassword);
router.get("/shops/:id/users", getShopUsers);
router.post("/shops/:id/users", createShopUser);
router.put("/shops/:id/users/:userId", updateShopUser);
router.put("/shops/:id/users/:userId/reset-password", resetShopUserPassword);

module.exports = router;
