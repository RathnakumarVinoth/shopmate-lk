require("../helpers/loadTestEnv");

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");

const {
  ensureTestDatabase,
  getBatchRemaining,
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

const request = async (method, path, { body, token, headers = {} } = {}) => {
  const requestHeaders = { Accept: "application/json", ...headers };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  return { status: response.status, body: json };
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

const loginOwnerB = async () => {
  const shopSession = await shopLogin(seed.shopB);
  return roleLogin(shopSession.shop_token, seed.shopB.owner);
};

const loginStaffA = async () => {
  const shopSession = await shopLogin(seed.shopA);
  return roleLogin(shopSession.shop_token, seed.shopA.staff);
};

const seedBatch = async ({
  id = 9001,
  shopId = seed.shopA.id,
  productId = seed.shopA.productId,
  supplierId = seed.shopA.supplierId,
  quantity = 5,
  batchCode = "ADJ-BATCH-001",
} = {}) => {
  await db.promise().query(
    `INSERT INTO stock_batches
     (id, shop_id, product_id, supplier_id, purchase_order_id, grn_id,
      batch_code, buying_price, selling_price, quantity_received,
      quantity_remaining, expiry_date, supplier_invoice_number, received_date, status)
     VALUES (?, ?, ?, ?, 1, 1, ?, 95, 130, ?, ?, '2027-01-01', 'TEST-INV', '2026-07-05', 'active')`,
    [id, shopId, productId, supplierId, batchCode, quantity, quantity]
  );

  return id;
};

const createAdjustment = async (token, overrides = {}) => {
  const response = await request("POST", "/api/stock/adjustments", {
    token,
    body: {
      product_id: seed.shopA.productId,
      adjustment_type: "damaged",
      quantity: 2,
      reason: "Damaged during shelf handling",
      ...overrides,
    },
  });
  expectStatus(response, 201);
  return response.body.adjustment;
};

const createReconciliation = async (token, overrides = {}) => {
  const response = await request("POST", "/api/stock/reconciliations", {
    token,
    body: {
      reason: "Monthly physical count",
      items: [
        {
          product_id: seed.shopA.productId,
          physical_quantity: 18,
        },
      ],
      ...overrides,
    },
  });
  expectStatus(response, 201);
  return response.body.reconciliation;
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

test("owner creates damaged stock adjustment and movement", async () => {
  const owner = await loginOwnerA();
  const adjustment = await createAdjustment(owner.token);

  assert.equal(adjustment.adjustment_type, "damaged");
  assert.equal(adjustment.quantity, 2);
  assert.equal(adjustment.previous_stock, 20);
  assert.equal(adjustment.new_stock, 18);
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 18);

  const [movementRows] = await db.promise().query(
    `SELECT * FROM stock_movements
     WHERE shop_id = ? AND product_id = ? AND reference_type = 'stock_adjustment'
       AND reference_id = ?`,
    [seed.shopA.id, seed.shopA.productId, adjustment.id]
  );
  assert.equal(movementRows.length, 1);
  assert.equal(movementRows[0].movement_type, "stock_adjustment_damaged");
  assert.equal(Number(movementRows[0].quantity), 2);
});

test("batch adjustment reduces batch quantity and product stock", async () => {
  const owner = await loginOwnerA();
  const batchId = await seedBatch();
  const adjustment = await createAdjustment(owner.token, {
    batch_id: batchId,
    quantity: 2,
    reason: "Expired packets removed",
    adjustment_type: "expired",
  });

  assert.equal(adjustment.batch_id, batchId);
  assert.equal(adjustment.previous_batch_quantity, 5);
  assert.equal(adjustment.new_batch_quantity, 3);
  assert.equal(await getBatchRemaining(db.promise(), batchId), 3);
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 18);
});

test("adjustment cannot reduce stock below zero", async () => {
  const owner = await loginOwnerA();

  const response = await request("POST", "/api/stock/adjustments", {
    token: owner.token,
    body: {
      product_id: seed.shopA.productId,
      adjustment_type: "lost",
      quantity: 99,
      reason: "Inventory loss check",
    },
  });

  expectStatus(response, 400);
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 20);
});

test("owner creates and posts stock reconciliation", async () => {
  const owner = await loginOwnerA();
  const reconciliation = await createReconciliation(owner.token);

  assert.equal(reconciliation.status, "draft");
  assert.equal(reconciliation.items.length, 1);
  assert.equal(reconciliation.items[0].system_quantity, 20);
  assert.equal(reconciliation.items[0].physical_quantity, 18);
  assert.equal(reconciliation.items[0].variance, -2);
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 20);

  const posted = await request(
    "POST",
    `/api/stock/reconciliations/${reconciliation.id}/post`,
    { token: owner.token }
  );
  expectStatus(posted, 200);

  assert.equal(posted.body.reconciliation.status, "posted");
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 18);

  const [movementRows] = await db.promise().query(
    `SELECT * FROM stock_movements
     WHERE shop_id = ? AND product_id = ? AND reference_type = 'stock_reconciliation'
       AND reference_id = ?`,
    [seed.shopA.id, seed.shopA.productId, reconciliation.id]
  );
  assert.equal(movementRows.length, 1);
  assert.equal(movementRows[0].movement_type, "stock_reconciliation_decrease");
  assert.equal(Number(movementRows[0].quantity), 2);
});

test("reconciliation cannot be posted twice", async () => {
  const owner = await loginOwnerA();
  const reconciliation = await createReconciliation(owner.token);

  const firstPost = await request(
    "POST",
    `/api/stock/reconciliations/${reconciliation.id}/post`,
    { token: owner.token }
  );
  expectStatus(firstPost, 200);

  const secondPost = await request(
    "POST",
    `/api/stock/reconciliations/${reconciliation.id}/post`,
    { token: owner.token }
  );
  expectStatus(secondPost, 409);
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 18);
});

test("shop A cannot access shop B adjustments or reconciliations", async () => {
  const ownerA = await loginOwnerA();
  const ownerB = await loginOwnerB();
  const shopBAdjustment = await request("POST", "/api/stock/adjustments", {
    token: ownerB.token,
    body: {
      product_id: seed.shopB.productId,
      adjustment_type: "damaged",
      quantity: 1,
      reason: "Shop B damaged item",
    },
  });
  expectStatus(shopBAdjustment, 201);

  const shopBReconciliation = await request("POST", "/api/stock/reconciliations", {
    token: ownerB.token,
    body: {
      reason: "Shop B count",
      items: [
        {
          product_id: seed.shopB.productId,
          physical_quantity: 29,
        },
      ],
    },
  });
  expectStatus(shopBReconciliation, 201);

  const shopAAdjustments = await request("GET", "/api/stock/adjustments", {
    token: ownerA.token,
  });
  expectStatus(shopAAdjustments, 200);
  assert.ok(
    !shopAAdjustments.body.adjustments.some(
      (adjustment) => adjustment.id === shopBAdjustment.body.adjustment.id
    )
  );

  const shopAReconciliationAccess = await request(
    "GET",
    `/api/stock/reconciliations/${shopBReconciliation.body.reconciliation.id}`,
    { token: ownerA.token }
  );
  expectStatus(shopAReconciliationAccess, 404);
});

test("staff without stock control permissions is blocked", async () => {
  const staff = await loginStaffA();

  const adjustmentResponse = await request("POST", "/api/stock/adjustments", {
    token: staff.token,
    body: {
      product_id: seed.shopA.productId,
      adjustment_type: "damaged",
      quantity: 1,
      reason: "No permission adjustment",
    },
  });
  expectStatus(adjustmentResponse, 403);

  const reconciliationResponse = await request("POST", "/api/stock/reconciliations", {
    token: staff.token,
    body: {
      reason: "No permission count",
      items: [{ product_id: seed.shopA.productId, physical_quantity: 19 }],
    },
  });
  expectStatus(reconciliationResponse, 403);
});

test("staff with stock control permissions can create adjustment and reconciliation", async () => {
  await db.promise().query("UPDATE users SET permissions = ? WHERE id = ?", [
    JSON.stringify(["stock_adjustments_manage", "stock_reconciliation_manage"]),
    seed.shopA.staff.id,
  ]);

  const staff = await loginStaffA();
  const adjustment = await createAdjustment(staff.token, {
    quantity: 1,
    reason: "Staff managed damaged item",
  });
  assert.equal(adjustment.quantity, 1);

  const reconciliation = await createReconciliation(staff.token, {
    reason: "Staff managed count",
    items: [{ product_id: seed.shopA.productId, physical_quantity: 18 }],
  });
  assert.equal(reconciliation.status, "draft");
});
