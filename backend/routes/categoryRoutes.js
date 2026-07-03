const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const {
  addCategory,
  deleteCategory,
  getCategories,
  updateCategory,
} = require("../controllers/categoryController");

router.get("/", authMiddleware, allowRoles("owner", "staff"), requirePermission("products_view"), getCategories);
router.post("/", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), addCategory);
router.put("/:id", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), updateCategory);
router.delete("/:id", authMiddleware, allowRoles("owner"), requirePermission("products_manage"), deleteCategory);

module.exports = router;
