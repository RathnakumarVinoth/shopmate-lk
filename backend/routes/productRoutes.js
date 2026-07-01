const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  addProduct,
  getProducts,
  getLowStockProducts,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

router.post("/", authMiddleware, addProduct);
router.get("/", authMiddleware, getProducts);
router.get("/low-stock", authMiddleware, getLowStockProducts);
router.put("/:id", authMiddleware, updateProduct);
router.delete("/:id", authMiddleware, deleteProduct);

module.exports = router;