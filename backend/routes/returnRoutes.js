const express = require("express");

const {
  createReturn,
  getReturnById,
  getReturns,
  getSaleForReturn,
} = require("../controllers/returnController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner", "staff"), requirePermission("returns_access"));

router.get("/sale/:sale_id", getSaleForReturn);
router.post("/", createReturn);
router.get("/", getReturns);
router.get("/:id", getReturnById);

module.exports = router;
