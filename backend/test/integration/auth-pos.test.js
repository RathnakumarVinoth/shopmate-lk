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
  assert.ok(response.body.shop_token);
  return response.body;
};

const roleLogin = async (shopToken, user, extraBody = {}) => {
  const response = await request("POST", "/api/auth/role-login", {
    body: {
      username: user.username,
      password: user.password,
      shop_token: shopToken,
      ...extraBody,
    },
  });
  expectStatus(response, 200);
  assert.ok(response.body.token);
  return response.body;
};

const loginOwnerA = async () => {
  const shopSession = await shopLogin(seed.shopA);
  return roleLogin(shopSession.shop_token, seed.shopA.owner);
};

const loginStaffA = async () => {
  const shopSession = await shopLogin(seed.shopA);
  return roleLogin(shopSession.shop_token, seed.shopA.staff);
};

const loginOwnerB = async () => {
  const shopSession = await shopLogin(seed.shopB);
  return roleLogin(shopSession.shop_token, seed.shopB.owner);
};

const createSale = async (token, overrides = {}) => {
  const quantity = overrides.quantity || 1;
  const total = 130 * quantity;
  const paymentType = overrides.payment_type || "cash";
  const body = {
    payment_type: paymentType,
    paid_amount: overrides.paid_amount ?? total,
    items: [
      {
        product_id: overrides.product_id || seed.shopA.productId,
        quantity,
      },
    ],
    ...overrides.body,
  };

  if (paymentType === "card") {
    body.card_last_four = overrides.card_last_four || "1234";
  }

  if (paymentType === "bank_transfer" || paymentType === "qr") {
    body.payment_reference = overrides.payment_reference || "REF-123";
  }

  const response = await request("POST", "/api/sales", { token, body });
  expectStatus(response, 201);
  assert.ok(response.body.sale.id);
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

test("shop login succeeds and rejects wrong passwords", async () => {
  const success = await shopLogin(seed.shopA);

  assert.equal(success.shop.shop_id, seed.shopA.id);
  assert.equal(success.shop.shop_name, "Shop A");

  const failure = await request("POST", "/api/shop-auth/login", {
    body: {
      login_email: seed.shopA.email,
      password: "wrong-password",
    },
  });

  expectStatus(failure, 401);
});

test("role login requires a valid shop token", async () => {
  const { shop_token } = await shopLogin(seed.shopA);
  const success = await roleLogin(shop_token, seed.shopA.owner);

  assert.equal(success.user.shop_id, seed.shopA.id);
  assert.equal(success.user.role, "owner");

  const missing = await request("POST", "/api/auth/role-login", {
    body: {
      username: seed.shopA.owner.username,
      password: seed.shopA.owner.password,
    },
  });
  expectStatus(missing, 400);

  const invalid = await request("POST", "/api/auth/role-login", {
    body: {
      username: seed.shopA.owner.username,
      password: seed.shopA.owner.password,
      shop_token: "not-a-real-token",
    },
  });
  expectStatus(invalid, 401);
});

test("role login cannot use a tampered shop_id to switch shops", async () => {
  const { shop_token } = await shopLogin(seed.shopA);

  const switchedShop = await request("POST", "/api/auth/role-login", {
    body: {
      username: seed.shopB.owner.username,
      password: seed.shopB.owner.password,
      shop_token,
      shop_id: seed.shopB.id,
    },
  });

  assert.notEqual(switchedShop.status, 200);
});

test("owner routes are available to owners and blocked for staff", async () => {
  const owner = await loginOwnerA();
  const staff = await loginStaffA();

  const ownerResponse = await request("GET", "/api/payments/pending", {
    token: owner.token,
  });
  expectStatus(ownerResponse, 200);

  const staffResponse = await request("GET", "/api/payments/pending", {
    token: staff.token,
  });
  expectStatus(staffResponse, 403);
});

test("product CRUD is scoped to the authenticated shop", async () => {
  const ownerA = await loginOwnerA();
  const ownerB = await loginOwnerB();

  const createResponse = await request("POST", "/api/products", {
    token: ownerA.token,
    body: {
      product_name: "Shop A Test Tea",
      product_code: "A-TEA",
      barcode: "A0002",
      category_id: seed.shopA.categoryId,
      unit: "pcs",
      buying_price: 50,
      wholesale_price: 50,
      selling_price: 75,
      stock_quantity: 10,
      low_stock_limit: 2,
    },
  });
  expectStatus(createResponse, 201);

  const productId = createResponse.body.product_id;

  const ownerAProducts = await request("GET", "/api/products", {
    token: ownerA.token,
  });
  expectStatus(ownerAProducts, 200);
  assert.ok(ownerAProducts.body.some((product) => product.id === productId));

  const ownerBProducts = await request("GET", "/api/products", {
    token: ownerB.token,
  });
  expectStatus(ownerBProducts, 200);
  assert.ok(!ownerBProducts.body.some((product) => product.id === productId));
  assert.ok(
    !ownerBProducts.body.some((product) => product.product_code === "A-RICE")
  );

  const ownerBUpdate = await request("PUT", `/api/products/${productId}`, {
    token: ownerB.token,
    body: {
      product_name: "Shop B Should Not Update",
      product_code: "B-NOPE",
      category_id: seed.shopB.categoryId,
      unit: "pcs",
      buying_price: 55,
      wholesale_price: 55,
      selling_price: 80,
      stock_quantity: 5,
      low_stock_limit: 2,
    },
  });
  expectStatus(ownerBUpdate, 404);

  const ownerAUpdate = await request("PUT", `/api/products/${productId}`, {
    token: ownerA.token,
    body: {
      product_name: "Shop A Updated Tea",
      product_code: "A-TEA",
      barcode: "A0002",
      category_id: seed.shopA.categoryId,
      unit: "pcs",
      buying_price: 55,
      wholesale_price: 55,
      selling_price: 80,
      stock_quantity: 12,
      low_stock_limit: 2,
    },
  });
  expectStatus(ownerAUpdate, 200);

  const ownerADelete = await request("DELETE", `/api/products/${productId}`, {
    token: ownerA.token,
  });
  expectStatus(ownerADelete, 200);
});

test("cash POS sale reduces stock and is immediately verified", async () => {
  const staff = await loginStaffA();

  const sale = await createSale(staff.token, { quantity: 2 });

  assert.equal(sale.payment_status, "verified");
  assert.equal(sale.total_amount, 260);
  assert.equal(
    await getProductStock(db.promise(), seed.shopA.productId),
    18
  );
});

test("failed payment restores stock once", async () => {
  const owner = await loginOwnerA();

  const sale = await createSale(owner.token, {
    payment_type: "card",
    quantity: 3,
  });

  assert.equal(sale.payment_status, "pending");
  assert.equal(
    await getProductStock(db.promise(), seed.shopA.productId),
    17
  );

  const firstFail = await request("PUT", `/api/payments/${sale.id}/fail`, {
    token: owner.token,
  });
  expectStatus(firstFail, 200);
  assert.equal(firstFail.body.stock_restored, true);
  assert.equal(
    await getProductStock(db.promise(), seed.shopA.productId),
    20
  );

  const secondFail = await request("PUT", `/api/payments/${sale.id}/fail`, {
    token: owner.token,
  });
  expectStatus(secondFail, 200);
  assert.equal(secondFail.body.stock_restored, false);
  assert.equal(
    await getProductStock(db.promise(), seed.shopA.productId),
    20
  );

  const [movementRows] = await db.promise().query(
    `SELECT COUNT(*) AS movement_count, COALESCE(SUM(quantity), 0) AS restored_quantity
     FROM stock_movements
     WHERE shop_id = ? AND product_id = ? AND movement_type = 'payment_failed_restore'`,
    [seed.shopA.id, seed.shopA.productId]
  );

  assert.equal(Number(movementRows[0].movement_count), 1);
  assert.equal(Number(movementRows[0].restored_quantity), 3);
});

test("dashboard and reports exclude pending and failed payment revenue", async () => {
  const owner = await loginOwnerA();

  const failedSale = await createSale(owner.token, {
    payment_type: "card",
    quantity: 1,
  });
  await request("PUT", `/api/payments/${failedSale.id}/fail`, {
    token: owner.token,
  });

  await createSale(owner.token, { quantity: 2 });

  const dashboard = await request("GET", "/api/dashboard", {
    token: owner.token,
  });
  expectStatus(dashboard, 200);
  assert.equal(dashboard.body.dashboard.today_sales_total, 260);
  assert.equal(dashboard.body.dashboard.today_bill_count, 1);

  const report = await request("GET", "/api/reports/summary", {
    token: owner.token,
  });
  expectStatus(report, 200);
  assert.equal(report.body.total_sales, 260);
  assert.equal(report.body.total_bills, 1);
  assert.equal(report.body.verified_payment_total, 260);
});

test("deactivated users and disabled shops block existing tokens", async () => {
  const owner = await loginOwnerA();

  const beforeUserChange = await request("GET", "/api/dashboard", {
    token: owner.token,
  });
  expectStatus(beforeUserChange, 200);

  await db
    .promise()
    .query("UPDATE users SET is_active = 0 WHERE id = ?", [seed.shopA.owner.id]);

  const deactivatedUser = await request("GET", "/api/dashboard", {
    token: owner.token,
  });
  expectStatus(deactivatedUser, 403);

  await db
    .promise()
    .query("UPDATE users SET is_active = 1 WHERE id = ?", [seed.shopA.owner.id]);
  const freshOwner = await loginOwnerA();

  await db
    .promise()
    .query("UPDATE shops SET is_enabled = 0 WHERE id = ?", [seed.shopA.id]);

  const disabledShop = await request("GET", "/api/dashboard", {
    token: freshOwner.token,
  });
  expectStatus(disabledShop, 403);
});

test("removed staff permissions affect existing tokens", async () => {
  const staff = await loginStaffA();

  const beforePermissionChange = await request("GET", "/api/dashboard", {
    token: staff.token,
  });
  expectStatus(beforePermissionChange, 200);

  await db
    .promise()
    .query("UPDATE users SET permissions = ? WHERE id = ?", [
      JSON.stringify([]),
      seed.shopA.staff.id,
    ]);

  const afterPermissionChange = await request("GET", "/api/dashboard", {
    token: staff.token,
  });
  expectStatus(afterPermissionChange, 403);
});

test("admin routes continue to work separately", async () => {
  const login = await request("POST", "/api/auth/login", {
    body: {
      email: seed.admin.email,
      password: seed.admin.password,
    },
  });
  expectStatus(login, 200);
  assert.equal(login.body.user.role, "admin");

  const summary = await request("GET", "/api/admin/summary", {
    token: login.body.token,
  });
  expectStatus(summary, 200);
  assert.equal(summary.body.summary.total_shops, 2);
});
