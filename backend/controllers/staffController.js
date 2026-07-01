const bcrypt = require("bcryptjs");

const db = require("../config/db");

const isMissing = (value) => value === undefined || value === null || value === "";

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const formatStaff = (staff) => ({
  id: staff.id,
  name: staff.name,
  email: staff.email,
  role: staff.role,
  shop_id: staff.shop_id,
  is_active: Boolean(staff.is_active),
  created_at: staff.created_at,
});

exports.addStaff = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ message: "name, email, and password are required" });
  }

  try {
    const [existingUsers] = await db.promise().query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.promise().query(
      `INSERT INTO users (name, email, password, role, shop_id, is_active)
       VALUES (?, ?, ?, 'staff', ?, 1)`,
      [name, email, hashedPassword, req.user.shop_id]
    );

    const [staffRows] = await db.promise().query(
      `SELECT id, name, email, role, shop_id, is_active, created_at
       FROM users
       WHERE id = ? AND shop_id = ? AND role = 'staff'
       LIMIT 1`,
      [result.insertId, req.user.shop_id]
    );

    return res.status(201).json({
      message: "Staff account added successfully",
      staff: formatStaff(staffRows[0]),
    });
  } catch (error) {
    console.error("Add staff error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Email is already registered" });
    }

    return res.status(500).json({ message: "Server error while adding staff" });
  }
};

exports.getStaff = async (req, res) => {
  try {
    const [staffRows] = await db.promise().query(
      `SELECT id, name, email, role, shop_id, is_active, created_at
       FROM users
       WHERE shop_id = ? AND role = 'staff'
       ORDER BY id DESC`,
      [req.user.shop_id]
    );

    return res.json({
      message: "Staff accounts fetched successfully",
      staff: staffRows.map(formatStaff),
    });
  } catch (error) {
    console.error("Get staff error:", error.message);
    return res.status(500).json({ message: "Server error while fetching staff" });
  }
};

exports.updateStaff = async (req, res) => {
  const { id } = req.params;
  const { name, email, is_active } = req.body;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: "Valid staff id is required" });
  }

  if (isMissing(name) || isMissing(email)) {
    return res.status(400).json({ message: "name and email are required" });
  }

  const activeValue = is_active === undefined ? 1 : is_active ? 1 : 0;

  try {
    const [result] = await db.promise().query(
      `UPDATE users
       SET name = ?, email = ?, is_active = ?
       WHERE id = ? AND shop_id = ? AND role = 'staff'`,
      [name, email, activeValue, id, req.user.shop_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Staff account not found" });
    }

    return res.json({ message: "Staff account updated successfully" });
  } catch (error) {
    console.error("Update staff error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Email is already registered" });
    }

    return res.status(500).json({ message: "Server error while updating staff" });
  }
};

exports.deleteStaff = async (req, res) => {
  const { id } = req.params;

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: "Valid staff id is required" });
  }

  try {
    const [result] = await db.promise().query(
      "DELETE FROM users WHERE id = ? AND shop_id = ? AND role = 'staff'",
      [id, req.user.shop_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Staff account not found" });
    }

    return res.json({ message: "Staff account deleted successfully" });
  } catch (error) {
    console.error("Delete staff error:", error.message);
    return res.status(500).json({ message: "Server error while deleting staff" });
  }
};
