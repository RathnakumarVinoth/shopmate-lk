const db = require("../config/db");
const { isModuleEnabled, normalizeEnabledModules } = require("../utils/shopModules");

const requireModule = (moduleKey) => async (req, res, next) => {
  if (!moduleKey || req.user?.role === "admin") {
    return next();
  }

  const shopId = Number(req.user?.shop_id || req.shop?.shop_id || req.shop?.id);

  if (!Number.isInteger(shopId) || shopId <= 0) {
    return res.status(403).json({ message: "Shop context is required" });
  }

  try {
    let shopContext = req.shop;

    if (!shopContext || shopContext.enabled_modules === undefined) {
      const [shops] = await db.promise().query(
        `SELECT id, shop_type, enabled_modules
         FROM shops
         WHERE id = ?
         LIMIT 1`,
        [shopId]
      );
      shopContext = shops[0] || null;
    }

    if (!shopContext) {
      return res.status(403).json({ message: "Shop context is required" });
    }

    const enabledModules = normalizeEnabledModules(
      shopContext.enabled_modules,
      shopContext.shop_type
    );

    if (!isModuleEnabled(enabledModules, moduleKey)) {
      return res
        .status(403)
        .json({ message: "Module not enabled for this shop." });
    }

    return next();
  } catch (error) {
    console.error("Module guard error:", error.message);
    return res.status(500).json({ message: "Server error while checking module access" });
  }
};

module.exports = { requireModule };
