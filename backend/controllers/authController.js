const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/db");
const { createAuditLog } = require("../utils/auditLog");
const {
  ensureUserPermissionColumns,
  getEffectivePermissions,
  serializePermissions,
} = require("../utils/permissions");
const { ensureSaasSchema } = require("../utils/saasSchema");
const {
  createLoginActivity,
  ensureSecurityTables,
  generateResetToken,
  hashToken,
  validateStrongPassword,
} = require("../utils/security");
const { getShopAccessError } = require("../utils/shopAccess");

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
      username: user.username || null,
      name: user.name,
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
  return res.status(403).json({
    message: "Accounts are created by ShopMate LK admin.",
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }

  try {
    await ensureSaasSchema();
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

    if (user.role !== "admin") {
      await createLoginActivity({
        user_id: user.id,
        shop_id: user.shop_id,
        email: user.email,
        role: user.role,
        status: "failed",
        message: "Use shop login",
        ...getRequestMeta(req),
      });
      return res.status(403).json({ message: "Use shop login to access this shop." });
    }

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

    const tokenUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username || null,
      role: user.role,
      shop_id: null,
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

exports.roleLogin = async (req, res) => {
  const { username, password, shop_token, shop_id, shopId } = req.body;
  const loginUsername = String(username || "").trim();
  let tokenShopId = null;
  const hasBodyShopId = shop_id !== undefined || shopId !== undefined;
  const bodyShopId = hasBodyShopId ? Number(shop_id ?? shopId) : null;

  if (!loginUsername || !password) {
    return res.status(400).json({ message: "username and password are required" });
  }

  if (hasBodyShopId && (!Number.isInteger(bodyShopId) || bodyShopId <= 0)) {
    return res.status(400).json({ message: "Invalid shop session" });
  }

  try {
    await ensureSaasSchema();
    await ensureUserPermissionColumns();
    await ensureSecurityTables();

    if (!shop_token) {
      await createLoginActivity({
        email: loginUsername,
        status: "failed",
        message: "Shop session is required",
        ...getRequestMeta(req),
      });
      return res.status(400).json({ message: "Shop session is required" });
    }

    try {
      const decodedShop = jwt.verify(shop_token, process.env.JWT_SECRET);
      tokenShopId = Number(decodedShop.shop_id);

      if (
        decodedShop.type !== "shop" ||
        !Number.isInteger(tokenShopId) ||
        tokenShopId <= 0
      ) {
        await createLoginActivity({
          email: loginUsername,
          status: "failed",
          message: "Invalid shop session",
          ...getRequestMeta(req),
        });
        return res.status(401).json({ message: "Invalid shop session" });
      }

      if (hasBodyShopId && tokenShopId !== bodyShopId) {
        await createLoginActivity({
          shop_id: tokenShopId,
          email: loginUsername,
          status: "failed",
          message: "Shop session mismatch",
          ...getRequestMeta(req),
        });
        return res.status(401).json({ message: "Invalid shop session" });
      }
    } catch (error) {
      await createLoginActivity({
        email: loginUsername,
        status: "failed",
        message: "Invalid or expired shop session",
        ...getRequestMeta(req),
      });
      return res.status(401).json({ message: "Invalid or expired shop session" });
    }

    if (!Number.isInteger(tokenShopId) || tokenShopId <= 0) {
      await createLoginActivity({
        email: loginUsername,
        status: "failed",
        message: "Invalid shop session",
        ...getRequestMeta(req),
      });
      return res.status(400).json({ message: "Invalid shop session" });
    }

    const [shops] = await db.promise().query(
      `SELECT id, shop_name, shop_code, is_enabled, subscription_status,
              subscription_expiry_date
       FROM shops
       WHERE id = ?
       LIMIT 1`,
      [tokenShopId]
    );
    const shop = shops[0];
    const accessError = getShopAccessError(shop);

    if (accessError) {
      await createLoginActivity({
        shop_id: tokenShopId,
        status: "failed",
        message: accessError.message,
        ...getRequestMeta(req),
      });
      return res.status(accessError.status).json({ message: accessError.message });
    }

    const [users] = await db.promise().query(
      `SELECT id, name, username, email, password, role, permissions, shop_id, is_active
       FROM users
       WHERE shop_id = ? AND username = ?
       LIMIT 1`,
      [tokenShopId, loginUsername]
    );

    if (users.length === 0) {
      await createLoginActivity({
        shop_id: tokenShopId,
        email: loginUsername,
        status: "failed",
        message: "Invalid username/password",
        ...getRequestMeta(req),
      });
      return res.status(401).json({ message: "Invalid username/password" });
    }

    const user = users[0];

    if (!user.is_active) {
      await createLoginActivity({
        user_id: user.id,
        shop_id: user.shop_id,
        email: user.email || user.username,
        role: user.role,
        status: "failed",
        message: "User inactive",
        ...getRequestMeta(req),
      });
      return res.status(403).json({ message: "User inactive" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      await createLoginActivity({
        user_id: user.id,
        shop_id: user.shop_id,
        email: user.email || user.username,
        role: user.role,
        status: "failed",
        message: "Invalid username/password",
        ...getRequestMeta(req),
      });
      return res.status(401).json({ message: "Invalid username/password" });
    }

    const tokenUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email || null,
      role: user.role,
      shop_id: user.shop_id,
      permissions: getEffectivePermissions(user),
    };
    const token = signToken(tokenUser);

    await createLoginActivity({
      user_id: tokenUser.id,
      shop_id: tokenUser.shop_id,
      email: tokenUser.email || tokenUser.username,
      role: tokenUser.role,
      status: "role_success",
      message: "Role login success",
      ...getRequestMeta(req),
    });

    await createAuditLog({
      shop_id: tokenUser.shop_id,
      user_id: tokenUser.id,
      user_name: tokenUser.name,
      user_role: tokenUser.role,
      action: "role_login",
      entity_type: "user",
      entity_id: tokenUser.id,
      description: `${tokenUser.name} logged in to ${shop.shop_name}`,
      ip_address: req.ip,
    });

    return res.json({
      message: "Login successful",
      token,
      user: tokenUser,
      shop: {
        shop_id: shop.id,
        shop_name: shop.shop_name,
        shop_code: shop.shop_code || null,
      },
    });
  } catch (error) {
    console.error("Role login error:", error.message);
    return res.status(500).json({ message: "Server error during role login" });
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
