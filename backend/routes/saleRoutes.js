const express = require("express");

const {
  createSale,
  getSaleById,
  getSales,
} = require("../controllers/saleController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, createSale);
router.get("/", authMiddleware, getSales);
router.get("/:id", authMiddleware, getSaleById);

module.exports = router;
