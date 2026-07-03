const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/db");
const { createAuditLog } = require("../utils/auditLog");

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
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

exports.register = async (req, res) => {
  const { name, email, password, shop_name, phone, address } = req.body;

  if (!name || !email || !password || !shop_name || !phone || !address) {
    return res.status(400).json({
      message:
        "name, email, password, shop_name, phone, and address are required",
    });
  }

  const connection = db.promise();

  try {
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
      "INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, ?, 1)",
      [name, email, hashedPassword, "owner"]
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
    const [users] = await db.promise().query(
      `SELECT users.id, users.name, users.email, users.password, users.role,
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
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ message: "Account is inactive" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.role !== "admin") {
      if (!user.shop_id) {
        return res.status(403).json({ message: "Shop account not found" });
      }

      if (user.is_enabled !== null && Number(user.is_enabled) === 0) {
        return res
          .status(403)
          .json({ message: "Shop account is disabled. Contact support." });
      }

      if (user.subscription_status === "suspended") {
        return res
          .status(403)
          .json({ message: "Subscription suspended. Contact support." });
      }

      if (user.subscription_status === "expired") {
        return res
          .status(403)
          .json({ message: "Subscription expired. Please renew." });
      }

      if (
        user.subscription_expiry_date &&
        new Date(user.subscription_expiry_date) < new Date()
      ) {
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
    };

    const token = signToken(tokenUser);

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
