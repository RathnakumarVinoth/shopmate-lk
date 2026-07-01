const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const {
  addProduct,
  getProducts,
  getProductByCode,
  getLowStockProducts,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

router.post("/", authMiddleware, allowRoles("owner"), addProduct);
router.get("/", authMiddleware, allowRoles("owner", "staff"), getProducts);
router.get("/search-code/:code", authMiddleware, allowRoles("owner", "staff"), getProductByCode);
router.get("/low-stock", authMiddleware, allowRoles("owner", "staff"), getLowStockProducts);
router.put("/:id", authMiddleware, allowRoles("owner"), updateProduct);
router.delete("/:id", authMiddleware, allowRoles("owner"), deleteProduct);

module.exports = router;
