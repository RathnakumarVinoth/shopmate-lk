const bcrypt = require("bcryptjs");

const db = require("../config/db");
const { createAuditLogFromRequest } = require("../utils/auditLog");
const {
  ensureUserPermissionColumns,
  getRolePermissions,
  normalizePermissions,
  serializePermissions,
  staffRoles,
} = require("../utils/permissions");
const { ensureSaasSchema } = require("../utils/saasSchema");
const { validateStrongPassword } = require("../utils/security");

const isMissing = (value) => value === undefined || value === null || value === "";

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

const formatStaff = (staff) => ({
  id: staff.id,
  name: staff.name,
  username: staff.username,
  email: staff.email,
  role: staff.role,
  permissions: normalizePermissions(staff.permissions),
  shop_id: staff.shop_id,
  is_active: Boolean(staff.is_active),
  created_at: staff.created_at,
});

exports.addStaff = async (req, res) => {
  const { name, username, email, password } = req.body;
  const role = staffRoles.includes(req.body.role) ? req.body.role : "staff";
  const permissions =
    req.body.permissions === undefined
      ? getRolePermissions(role)
      : normalizePermissions(req.body.permissions);

  if (!name || !username || !password) {
    return res
      .status(400)
      .json({ message: "name, username, and password are required" });
  }

  const passwordError = validateStrongPassword(password);

  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    await ensureSaasSchema();
    await ensureUserPermissionColumns();

    const [existingUsers] = await db.promise().query(
      "SELECT id FROM users WHERE shop_id = ? AND username = ? LIMIT 1",
      [req.user.shop_id, username]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: "Username already exists for this shop" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.promise().query(
      `INSERT INTO users (name, username, email, password, role, permissions, shop_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [name, username, email || null, hashedPassword, role, serializePermissions(permissions), req.user.shop_id]
    );

    const [staffRows] = await db.promise().query(
      `SELECT id, name, username, email, role, permissions, shop_id, is_active, created_at
       FROM users
       WHERE id = ? AND shop_id = ? AND role IN (?)
       LIMIT 1`,
      [result.insertId, req.user.shop_id, staffRoles]
    );

    await createAuditLogFromRequest(req, {
      action: "staff_add",
      entity_type: "user",
      entity_id: result.insertId,
      description: `Added ${role} account ${name}`,
    });

    return res.status(201).json({
      message: "Staff account added successfully",
      staff: formatStaff(staffRows[0]),
    });
  } catch (error) {
    console.error("Add staff error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Username already exists for this shop" });
    }

    return res.status(500).json({ message: "Server error while adding staff" });
  }
};

exports.getStaff = async (req, res) => {
  try {
    await ensureSaasSchema();
    await ensureUserPermissionColumns();

    const [staffRows] = await db.promise().query(
      `SELECT id, name, username, email, role, permissions, shop_id, is_active, created_at
       FROM users
       WHERE shop_id = ? AND role IN (?)
       ORDER BY id DESC`,
      [req.user.shop_id, staffRoles]
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
  const { name, username, email, is_active, password } = req.body;
  const role = staffRoles.includes(req.body.role) ? req.body.role : "staff";
  const permissions =
    req.body.permissions === undefined
      ? getRolePermissions(role)
      : normalizePermissions(req.body.permissions);
  const newPassword = password === undefined || password === null ? "" : String(password);

  if (!isPositiveInteger(id)) {
    return res.status(400).json({ message: "Valid staff id is required" });
  }

  if (isMissing(name) || isMissing(username)) {
    return res.status(400).json({ message: "name and username are required" });
  }

  if (newPassword.trim()) {
    const passwordError = validateStrongPassword(newPassword);

    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }
  }

  const activeValue = is_active === undefined ? 1 : is_active ? 1 : 0;

  try {
    await ensureSaasSchema();
    await ensureUserPermissionColumns();

    const fields = [
      "name = ?",
      "username = ?",
      "email = ?",
      "role = ?",
      "permissions = ?",
      "is_active = ?",
    ];
    const values = [
      name,
      username,
      email || null,
      role,
      serializePermissions(permissions),
      activeValue,
    ];

    if (newPassword.trim()) {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      fields.push("password = ?");
      values.push(hashedPassword);
    }

    values.push(id, req.user.shop_id, staffRoles);

    const [result] = await db.promise().query(
      `UPDATE users
       SET ${fields.join(", ")}
       WHERE id = ? AND shop_id = ? AND role IN (?)`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Staff account not found" });
    }

    await createAuditLogFromRequest(req, {
      action: activeValue === 0 ? "staff_disable" : "staff_update",
      entity_type: "user",
      entity_id: Number(id),
      description:
        activeValue === 0
          ? `Disabled staff account ${name}`
          : `Updated ${role} account ${name}`,
    });

    return res.json({ message: "Staff account updated successfully" });
  } catch (error) {
    console.error("Update staff error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Username already exists for this shop" });
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
    await ensureSaasSchema();
    await ensureUserPermissionColumns();

    const [staffRows] = await db.promise().query(
      "SELECT name FROM users WHERE id = ? AND shop_id = ? AND role IN (?) LIMIT 1",
      [id, req.user.shop_id, staffRoles]
    );

    const [result] = await db.promise().query(
      "DELETE FROM users WHERE id = ? AND shop_id = ? AND role IN (?)",
      [id, req.user.shop_id, staffRoles]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Staff account not found" });
    }

    await createAuditLogFromRequest(req, {
      action: "staff_disable",
      entity_type: "user",
      entity_id: Number(id),
      description: `Removed staff account ${staffRows[0]?.name || id}`,
    });

    return res.json({ message: "Staff account deleted successfully" });
  } catch (error) {
    console.error("Delete staff error:", error.message);
    return res.status(500).json({ message: "Server error while deleting staff" });
  }
};
