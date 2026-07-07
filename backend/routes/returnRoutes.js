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
const { requireModule } = require("../middleware/moduleMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner", "staff"), requirePermission("returns_access"), requireModule("returns_exchange"));

router.get("/sale/:sale_id", getSaleForReturn);
router.post("/", createReturn);
router.get("/", getReturns);
router.get("/:id", getReturnById);

module.exports = router;
