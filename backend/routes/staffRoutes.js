const express = require("express");

const {
  addStaff,
  deleteStaff,
  getStaff,
  updateStaff,
} = require("../controllers/staffController");
const authMiddleware = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware, allowRoles("owner"));

router.post("/", addStaff);
router.get("/", getStaff);
router.put("/:id", updateStaff);
router.delete("/:id", deleteStaff);

module.exports = router;
