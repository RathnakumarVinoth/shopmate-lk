const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/db");
const { createAuditLog } = require("../utils/auditLog");
const {
  ensureUserPermissionColumns,
  getEffectivePermissions,
  serializePermissions,
} = require("../utils/permissions");
const {
  createLoginActivity,
  ensureSecurityTables,
  generateResetToken,
  hashToken,
  validateStrongPassword,
} = require("../utils/security");

const MAX_JWT_LIFETIME_SECONDS = 8 * 60 * 60;

const getJwtLifetimeSeconds = () => {
  const configured = String(process.env.JWT_EXPIRES_IN || "8h").trim();
  const match = configured.match(/^(\d+)\s*([smhd]?)$/i);

  if (!match) return MAX_JWT_LIFETIME_SECONDS;

  const value = Number(match[1]);
  const multipliers = {
    "": 1,
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60,
  };
  const seconds = value * multipliers[match[2].toLowerCase()];

  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    return MAX_JWT_LIFETIME_SECONDS;
  }

  return Math.min(seconds, MAX_JWT_LIFETIME_SECONDS);
};

const signToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      shop_id: user.shop_id,
      permissions: user.permissions || [],
    },
    process.env.JWT_SECRET,
    { expiresIn: getJwtLifetimeSeconds() }
  );
};

exports.autoLogout = async (req, res) => {
  const allowedMessages = ["Idle timeout", "Session expired"];
  const message = allowedMessages.includes(req.body.message)
    ? req.body.message
    : "Session expired";

  await createLoginActivity({
    user_id: req.user.id,
    shop_id: req.user.shop_id,
    email: req.user.email,
    role: req.user.role,
    status: "auto_logout",
    message,
    ...getRequestMeta(req),
  });

  return res.json({ message: "Auto logout recorded" });
};

const getRequestMeta = (req) => ({
  ip_address: req.ip,
  user_agent: req.get("user-agent") || null,
});

exports.register = async (req, res) => {
  const { name, email, password, shop_name, phone, address } = req.body;

  if (!name || !email || !password || !shop_name || !phone || !address) {
    return res.status(400).json({
      message:
        "name, email, password, shop_name, phone, and address are required",
    });
  }

  const passwordError = validateStrongPassword(password);

  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  const connection = db.promise();

  try {
    await ensureUserPermissionColumns();
    await ensureSecurityTables();

    const [existingUsers] = await connection.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await connection.beginTransaction();

    const [userResult] = await connection.query(
      "INSERT INTO users (name, email, password, role, permissions, is_active) VALUES (?, ?, ?, ?, ?, 1)",
      [name, email, hashedPassword, "owner", serializePermissions([])]
    );

    const ownerId = userResult.insertId;

    const [shopResult] = await connection.query(
      "INSERT INTO shops (owner_id, shop_name, phone, address) VALUES (?, ?, ?, ?)",
      [ownerId, shop_name, phone, address]
    );

    await connection.query("UPDATE users SET shop_id = ? WHERE id = ?", [
      shopResult.insertId,
      ownerId,
    ]);

    await connection.commit();

    const user = {
      id: ownerId,
      name,
      email,
      role: "owner",
      shop_id: shopResult.insertId,
    };
    user.permissions = getEffectivePermissions(user);

    const token = signToken(user);

    return res.status(201).json({
      message: "Registration successful",
      token,
      user,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Registration rollback failed:", rollbackError.message);
    }

    console.error("Register error:", error.message);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Email is already registered" });
    }

    return res.status(500).json({ message: "Server error during registration" });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }

  try {
    await ensureUserPermissionColumns();
    await ensureSecurityTables();

    const [users] = await db.promise().query(
      `SELECT users.id, users.name, users.email, users.password, users.role,
              users.permissions,
              users.is_active, COALESCE(users.shop_id, shops.id) AS shop_id,
              shops.is_enabled, shops.subscription_status,
              shops.subscription_expiry_date
       FROM users
       LEFT JOIN shops ON shops.owner_id = users.id
         OR shops.id = users.shop_id
       WHERE users.email = ?
       LIMIT 1`,
      [email]
    );

    if (users.length === 0) {
      await createLoginActivity({
        email,
        status: "failed",
        ...getRequestMeta(req),
      });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = users[0];

    if (!user.is_active) {
      await createLoginActivity({
        user_id: user.id,
        shop_id: user.shop_id,
        email: user.email,
        role: user.role,
        status: "failed",
        ...getRequestMeta(req),
      });
      return res.status(403).json({ message: "Account is inactive" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      await createLoginActivity({
        user_id: user.id,
        shop_id: user.shop_id,
        email: user.email,
        role: user.role,
        status: "failed",
        ...getRequestMeta(req),
      });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.role !== "admin") {
      if (!user.shop_id) {
        await createLoginActivity({
          user_id: user.id,
          shop_id: null,
          email: user.email,
          role: user.role,
          status: "failed",
          ...getRequestMeta(req),
        });
        return res.status(403).json({ message: "Shop account not found" });
      }

      if (user.is_enabled !== null && Number(user.is_enabled) === 0) {
        await createLoginActivity({
          user_id: user.id,
          shop_id: user.shop_id,
          email: user.email,
          role: user.role,
          status: "failed",
          ...getRequestMeta(req),
        });
        return res
          .status(403)
          .json({ message: "Shop account is disabled. Contact support." });
      }

      if (user.subscription_status === "suspended") {
        await createLoginActivity({
          user_id: user.id,
          shop_id: user.shop_id,
          email: user.email,
          role: user.role,
          status: "failed",
          ...getRequestMeta(req),
        });
        return res
          .status(403)
          .json({ message: "Subscription suspended. Contact support." });
      }

      if (user.subscription_status === "expired") {
        await createLoginActivity({
          user_id: user.id,
          shop_id: user.shop_id,
          email: user.email,
          role: user.role,
          status: "failed",
          ...getRequestMeta(req),
        });
        return res
          .status(403)
          .json({ message: "Subscription expired. Please renew." });
      }

      if (
        user.subscription_expiry_date &&
        new Date(user.subscription_expiry_date) < new Date()
      ) {
        await createLoginActivity({
          user_id: user.id,
          shop_id: user.shop_id,
          email: user.email,
          role: user.role,
          status: "failed",
          ...getRequestMeta(req),
        });
        return res
          .status(403)
          .json({ message: "Subscription expired. Please renew." });
      }
    }

    const tokenUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      shop_id: user.role === "admin" ? null : user.shop_id,
      permissions: getEffectivePermissions(user),
    };

    const token = signToken(tokenUser);

    await createLoginActivity({
      user_id: tokenUser.id,
      shop_id: tokenUser.shop_id,
      email: tokenUser.email,
      role: tokenUser.role,
      status: "success",
      ...getRequestMeta(req),
    });

    await createAuditLog({
      shop_id: tokenUser.shop_id,
      user_id: tokenUser.id,
      user_name: tokenUser.name,
      user_role: tokenUser.role,
      action: "user_login",
      entity_type: "user",
      entity_id: tokenUser.id,
      description: `${tokenUser.name} logged in`,
      ip_address: req.ip,
    });

    return res.json({
      message: "Login successful",
      token,
      user: tokenUser,
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({ message: "Server error during login" });
  }
};

exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res
      .status(400)
      .json({ message: "current_password and new_password are required" });
  }

  const passwordError = validateStrongPassword(new_password);

  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    await ensureSecurityTables();

    const [users] = await db.promise().query(
      "SELECT id, password FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const passwordMatches = await bcrypt.compare(current_password, users[0].password);

    if (!passwordMatches) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    await db.promise().query(
      `UPDATE users
       SET password = ?, reset_token_hash = NULL, reset_token_expires_at = NULL
       WHERE id = ?`,
      [hashedPassword, req.user.id]
    );

    return res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while changing password" });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "email is required" });
  }

  try {
    await ensureSecurityTables();

    const [users] = await db.promise().query(
      "SELECT id, email FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    const response = {
      message: "If the email exists, a password reset link will be sent.",
    };

    if (users.length === 0) {
      return res.json(response);
    }

    const resetToken = generateResetToken();
    const resetTokenHash = hashToken(resetToken);

    await db.promise().query(
      `UPDATE users
       SET reset_token_hash = ?, reset_token_expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
       WHERE id = ?`,
      [resetTokenHash, users[0].id]
    );

    if (process.env.NODE_ENV !== "production") {
      response.reset_token = resetToken;
    }

    return res.json(response);
  } catch (error) {
    console.error("Forgot password error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while preparing password reset" });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, new_password } = req.body;

  if (!token || !new_password) {
    return res.status(400).json({ message: "token and new_password are required" });
  }

  const passwordError = validateStrongPassword(new_password);

  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    await ensureSecurityTables();

    const tokenHash = hashToken(token);
    const [users] = await db.promise().query(
      `SELECT id
       FROM users
       WHERE reset_token_hash = ?
         AND reset_token_expires_at IS NOT NULL
         AND reset_token_expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (users.length === 0) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    await db.promise().query(
      `UPDATE users
       SET password = ?, reset_token_hash = NULL, reset_token_expires_at = NULL
       WHERE id = ?`,
      [hashedPassword, users[0].id]
    );

    return res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while resetting password" });
  }
};
