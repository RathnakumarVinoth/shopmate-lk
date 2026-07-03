const db = require("../config/db");
const { ensureSecurityTables } = require("../utils/security");

exports.getLoginActivity = async (req, res) => {
  const conditions = [];
  const values = [];

  if (req.user.role !== "admin") {
    conditions.push("shop_id = ?");
    values.push(req.user.shop_id);
  }

  if (req.query.status) {
    conditions.push("status = ?");
    values.push(req.query.status);
  }

  if (req.query.date_from) {
    conditions.push("DATE(created_at) >= ?");
    values.push(req.query.date_from);
  }

  if (req.query.date_to) {
    conditions.push("DATE(created_at) <= ?");
    values.push(req.query.date_to);
  }

  try {
    await ensureSecurityTables();

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [activity] = await db.promise().query(
      `SELECT id, user_id, shop_id, email, role, status, message, ip_address,
              user_agent, created_at
       FROM login_activity
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT 500`,
      values
    );

    return res.json({
      message: "Login activity fetched successfully",
      activity,
    });
  } catch (error) {
    console.error("Get login activity error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error while fetching login activity" });
  }
};
