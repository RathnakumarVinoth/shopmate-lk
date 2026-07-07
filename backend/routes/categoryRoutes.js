const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");

const {
  addCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} = require("../controllers/categoryController");

router.get("/", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), requireModule("products"), getCategories);
router.post("/", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), requireModule("products"), addCategory);
router.put("/:id", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), requireModule("products"), updateCategory);
router.delete("/:id", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), requireModule("products"), deleteCategory);

module.exports = router;
