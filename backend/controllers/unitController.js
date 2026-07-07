const db = require("../config/db");
const {
  normalizeUnitCode,
  ensureProductCatalogSchema,
} = require("../utils/productCatalogSchema");

const isPositiveNumber = (value) =>
  value !== "" &&
  value !== null &&
  value !== undefined &&
  !Number.isNaN(Number(value)) &&
  Number(value) > 0;

const optionalText = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return String(value).trim();
};

const formatUnit = (unit) => ({
  ...unit,
  allows_decimal: Boolean(Number(unit.allows_decimal || 0)),
  default_precision: Number(unit.default_precision || 0),
  is_active: Boolean(Number(unit.is_active ?? 1)),
});

const formatConversion = (conversion) => ({
  ...conversion,
  shop_id: conversion.shop_id === 0 ? null : conversion.shop_id,
  factor: Number(conversion.factor),
  is_active: Boolean(Number(conversion.is_active ?? 1)),
});

exports.getUnits = async (req, res) => {
  try {
    await ensureProductCatalogSchema();

    const [units] = await db.promise().query(
      `SELECT code, name, unit_type, allows_decimal, default_precision,
              is_active, sort_order
       FROM unit_master
       WHERE is_active = 1
       ORDER BY sort_order ASC, code ASC`
    );

    return res.json({ units: units.map(formatUnit) });
  } catch (error) {
    console.error("Get units error:", error.message);
    return res.status(500).json({
      message: "Failed to get units",
      error: error.message,
    });
  }
};

exports.getUnitConversions = async (req, res) => {
  try {
    await ensureProductCatalogSchema();

    const shopId = Number(req.user?.shop_id || 0);
    const [conversions] = await db.promise().query(
      `SELECT unit_conversions.id, unit_conversions.shop_id,
              unit_conversions.from_unit, from_units.name AS from_unit_name,
              unit_conversions.to_unit, to_units.name AS to_unit_name,
              unit_conversions.factor, unit_conversions.description,
              unit_conversions.is_active, unit_conversions.created_at
       FROM unit_conversions
       INNER JOIN unit_master AS from_units
         ON from_units.code = unit_conversions.from_unit
       INNER JOIN unit_master AS to_units
         ON to_units.code = unit_conversions.to_unit
       WHERE unit_conversions.is_active = 1
         AND (unit_conversions.shop_id = 0 OR unit_conversions.shop_id = ?)
       ORDER BY unit_conversions.shop_id ASC, unit_conversions.from_unit ASC,
                unit_conversions.to_unit ASC`,
      [shopId]
    );

    return res.json({ conversions: conversions.map(formatConversion) });
  } catch (error) {
    console.error("Get unit conversions error:", error.message);
    return res.status(500).json({
      message: "Failed to get unit conversions",
      error: error.message,
    });
  }
};

exports.addUnitConversion = async (req, res) => {
  const fromUnit = normalizeUnitCode(req.body.from_unit, null);
  const toUnit = normalizeUnitCode(req.body.to_unit, null);
  const factor = Number(req.body.factor);
  const description = optionalText(req.body.description);

  if (!fromUnit || !toUnit) {
    return res.status(400).json({ message: "from_unit and to_unit are required" });
  }

  if (fromUnit === toUnit) {
    return res.status(400).json({ message: "from_unit and to_unit must be different" });
  }

  if (!isPositiveNumber(factor)) {
    return res.status(400).json({ message: "factor must be greater than 0" });
  }

  try {
    await ensureProductCatalogSchema();

    const [units] = await db
      .promise()
      .query("SELECT code FROM unit_master WHERE is_active = 1 AND code IN (?)", [
        [fromUnit, toUnit],
      ]);

    if (units.length !== 2) {
      return res.status(400).json({ message: "Both units must exist in unit master" });
    }

    const shopId = req.user.role === "admin" ? 0 : Number(req.user.shop_id);

    if (!Number.isInteger(shopId) || shopId < 0) {
      return res.status(403).json({ message: "Shop context is required" });
    }

    const [result] = await db.promise().query(
      `INSERT INTO unit_conversions
         (shop_id, from_unit, to_unit, factor, description, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         factor = VALUES(factor),
         description = VALUES(description),
         is_active = 1,
         created_by = VALUES(created_by)`,
      [shopId, fromUnit, toUnit, factor, description, req.user.id]
    );

    return res.status(201).json({
      message: "Unit conversion saved successfully",
      conversion_id: result.insertId || null,
    });
  } catch (error) {
    console.error("Add unit conversion error:", error.message);
    return res.status(500).json({
      message: "Failed to save unit conversion",
      error: error.message,
    });
  }
};
