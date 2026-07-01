const express = require("express");

const {
  addExpense,
  deleteExpense,
  getExpenseSummary,
  getExpenses,
  updateExpense,
} = require("../controllers/expenseController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner"));

router.post("/", addExpense);
router.get("/", getExpenses);
router.get("/summary", getExpenseSummary);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

module.exports = router;
