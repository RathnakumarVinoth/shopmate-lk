const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("../config/db");

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
              users.is_active, COALESCE(users.shop_id, shops.id) AS shop_id
       FROM users
       LEFT JOIN shops ON shops.owner_id = users.id
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

    const tokenUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      shop_id: user.shop_id,
    };

    const token = signToken(tokenUser);

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
