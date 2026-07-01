const express = require("express");

const {
  createSale,
  getSaleById,
  getSales,
} = require("../controllers/saleController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/", authMiddleware, allowRoles("owner", "staff"), createSale);
router.get("/", authMiddleware, allowRoles("owner", "staff"), getSales);
router.get("/:id", authMiddleware, allowRoles("owner", "staff"), getSaleById);

module.exports = router;
