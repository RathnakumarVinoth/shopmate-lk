const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const db = require("../config/db");

const generateAdminPassword = () =>
  `ShopMateAdmin#${crypto.randomBytes(6).toString("base64url")}7Aa!`;

const adminUser = {
  name: "Super Admin",
  email: "admin@shopmate.lk",
  password: process.env.ADMIN_PASSWORD || generateAdminPassword(),
  role: "admin",
};

const createAdmin = async () => {
  try {
    const [existingUsers] = await db
      .promise()
      .query("SELECT id FROM users WHERE email = ? LIMIT 1", [adminUser.email]);

    if (existingUsers.length > 0) {
      console.log("Admin user already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(adminUser.password, 10);

    await db.promise().query(
      `INSERT INTO users (name, email, password, role, shop_id, is_active)
       VALUES (?, ?, ?, ?, NULL, 1)`,
      [adminUser.name, adminUser.email, hashedPassword, adminUser.role]
    );

    console.log("Admin user created successfully");
    console.log(`Email: ${adminUser.email}`);
    console.log(`Password: ${adminUser.password}`);
  } catch (error) {
    console.error("Create admin error:", error.message);
    process.exitCode = 1;
  } finally {
    db.end();
  }
};

createAdmin();
