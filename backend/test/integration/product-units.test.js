require("../helpers/loadTestEnv");

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");

const {
  ensureTestDatabase,
  getProductStock,
  resetAndSeed,
} = require("../helpers/testDatabase");

let app;
let db;
let server;
let baseUrl;
let seed;

const closeServer = () =>
  new Promise((resolve, reject) => {
    if (!server) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
  });

const closeDatabase = () =>
  new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.end((error) => (error ? reject(error) : resolve()));
  });

const request = async (method, path, { body, token } = {}) => {
  const headers = { Accept: "application/json" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    body: json,
  };
};

const expectStatus = (response, status) => {
  assert.equal(
    response.status,
    status,
    `Expected ${status}, got ${response.status}: ${JSON.stringify(response.body)}`
  );
};

const shopLogin = async (shop) => {
  const response = await request("POST", "/api/shop-auth/login", {
    body: {
      login_email: shop.email,
      password: shop.password,
    },
  });
  expectStatus(response, 200);
  return response.body;
};

const roleLogin = async (shopToken, user) => {
  const response = await request("POST", "/api/auth/role-login", {
    body: {
      username: user.username,
      password: user.password,
      shop_token: shopToken,
    },
  });
  expectStatus(response, 200);
  return response.body;
};

const loginOwnerA = async () => {
  const shopSession = await shopLogin(seed.shopA);
  return roleLogin(shopSession.shop_token, seed.shopA.owner);
};

const createProduct = async (token, body) => {
  const response = await request("POST", "/api/products", { token, body });
  expectStatus(response, 201);
  return response.body.product_id;
};

const createSale = async (token, productId, quantity, unitPrice = 130) => {
  const response = await request("POST", "/api/sales", {
    token,
    body: {
      payment_type: "cash",
      paid_amount: Number((unitPrice * quantity).toFixed(2)),
      items: [{ product_id: productId, quantity }],
    },
  });
  expectStatus(response, 201);
  return response.body.sale;
};

before(async () => {
  await ensureTestDatabase();
  app = require("../../app");
  db = require("../../config/db");

  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  seed = await resetAndSeed(db.promise());
});

after(async () => {
  await closeServer();
  await closeDatabase();
});

test("unit master exists and is seeded", async () => {
  const owner = await loginOwnerA();

  const response = await request("GET", "/api/units", { token: owner.token });
  expectStatus(response, 200);

  const codes = response.body.units.map((unit) => unit.code);
  assert.ok(codes.includes("PCS"));
  assert.ok(codes.includes("KG"));
  assert.ok(codes.includes("SERVICE"));
  assert.ok(codes.includes("HOUR"));
});

test("product can use KG with decimal quantity", async () => {
  const owner = await loginOwnerA();

  const productId = await createProduct(owner.token, {
    product_name: "Loose dhal",
    product_code: "A-DHAL-KG",
    category_id: seed.shopA.categoryId,
    unit: "KG",
    default_selling_unit: "KG",
    default_purchase_unit: "KG",
    base_unit: "KG",
    allow_decimal_qty: true,
    quantity_precision: 3,
    tracking_method: "WEIGHT_STOCK",
    buying_price: 300,
    wholesale_price: 300,
    selling_price: 420,
    stock_quantity: 12.5,
    low_stock_limit: 1.25,
  });

  const products = await request("GET", "/api/products", { token: owner.token });
  expectStatus(products, 200);
  const product = products.body.find((item) => item.id === productId);

  assert.equal(product.default_selling_unit, "KG");
  assert.equal(Number(product.allow_decimal_qty), 1);
  assert.equal(Number(product.quantity_precision), 3);
  assert.equal(product.tracking_method, "WEIGHT_STOCK");
  assert.equal(Number(product.stock_quantity), 12.5);
});

test("product can use PCS with integer quantity", async () => {
  const owner = await loginOwnerA();

  const productId = await createProduct(owner.token, {
    product_name: "Phone charger",
    product_code: "A-CHARGER",
    category_id: seed.shopA.categoryId,
    unit: "PCS",
    default_selling_unit: "PCS",
    default_purchase_unit: "PCS",
    base_unit: "PCS",
    allow_decimal_qty: false,
    quantity_precision: 0,
    tracking_method: "SIMPLE_STOCK",
    buying_price: 800,
    wholesale_price: 800,
    selling_price: 1200,
    stock_quantity: 5,
    low_stock_limit: 1,
  });

  const sale = await createSale(owner.token, productId, 2, 1200);

  assert.equal(sale.total_amount, 2400);
  assert.equal(await getProductStock(db.promise(), productId), 3);
});

test("POS rejects decimal quantity for non-decimal product", async () => {
  const owner = await loginOwnerA();

  const response = await request("POST", "/api/sales", {
    token: owner.token,
    body: {
      payment_type: "cash",
      paid_amount: 195,
      items: [{ product_id: seed.shopA.productId, quantity: 1.5 }],
    },
  });

  expectStatus(response, 400);
  assert.match(response.body.message, /Decimal quantity is not allowed/);
});

test("POS allows decimal quantity for decimal-enabled product", async () => {
  const owner = await loginOwnerA();
  const productId = await createProduct(owner.token, {
    product_name: "Bulk rice",
    product_code: "A-BULK-RICE",
    category_id: seed.shopA.categoryId,
    unit: "KG",
    default_selling_unit: "KG",
    default_purchase_unit: "KG",
    base_unit: "KG",
    allow_decimal_qty: true,
    quantity_precision: 3,
    tracking_method: "WEIGHT_STOCK",
    buying_price: 100,
    wholesale_price: 100,
    selling_price: 160,
    stock_quantity: 10,
    low_stock_limit: 1,
  });

  const sale = await createSale(owner.token, productId, 1.25, 160);

  assert.equal(sale.total_amount, 200);
  assert.equal(await getProductStock(db.promise(), productId), 8.75);
});

test("service-only item can be sold without stock deduction", async () => {
  const owner = await loginOwnerA();
  const productId = await createProduct(owner.token, {
    product_name: "Screen replacement labour",
    product_code: "A-SERVICE-LABOUR",
    category_id: seed.shopA.categoryId,
    unit: "HOUR",
    default_selling_unit: "HOUR",
    default_purchase_unit: "HOUR",
    base_unit: "HOUR",
    item_type: "service",
    allow_decimal_qty: true,
    quantity_precision: 2,
    tracking_method: "SERVICE_ONLY",
    buying_price: 0,
    wholesale_price: 0,
    selling_price: 500,
    stock_quantity: 0,
    low_stock_limit: 0,
  });

  const sale = await createSale(owner.token, productId, 1.5, 500);

  assert.equal(sale.total_amount, 750);
  assert.equal(await getProductStock(db.promise(), productId), 0);
});

test("existing product sale still works", async () => {
  const owner = await loginOwnerA();

  const sale = await createSale(owner.token, seed.shopA.productId, 1);

  assert.equal(sale.total_amount, 130);
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 19);
});
