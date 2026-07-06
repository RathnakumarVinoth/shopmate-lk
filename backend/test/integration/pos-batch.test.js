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

const createSale = async (token, overrides = {}) => {
  const quantity = overrides.quantity || 1;
  const unitPrice = overrides.unit_price || 130;
  const total = unitPrice * quantity;
  const paymentType = overrides.payment_type || "cash";
  const body = {
    payment_type: paymentType,
    paid_amount: overrides.paid_amount ?? total,
    items: overrides.items || [
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

  const response = await request("POST", "/api/sales", { token, body });

  if (overrides.expectStatus) {
    expectStatus(response, overrides.expectStatus);
    return response;
  }

  expectStatus(response, 201);
  assert.ok(response.body.sale.id);
  return response.body.sale;
};

const seedBatch = async ({
  id,
  shopId = seed.shopA.id,
  productId = seed.shopA.productId,
  supplierId = seed.shopA.supplierId,
  quantity,
  batchCode,
  expiryDate = null,
  receivedDate = "2026-07-05",
} = {}) => {
  await db.promise().query(
    `INSERT INTO stock_batches
     (id, shop_id, product_id, supplier_id, purchase_order_id, grn_id,
      batch_code, buying_price, selling_price, quantity_received,
      quantity_remaining, expiry_date, supplier_invoice_number, received_date, status)
     VALUES (?, ?, ?, ?, 1, 1, ?, 95, 130, ?, ?, ?, 'TEST-INV', ?, 'active')`,
    [
      id,
      shopId,
      productId,
      supplierId,
      batchCode || `POS-BATCH-${id}`,
      quantity,
      quantity,
      expiryDate,
      receivedDate,
    ]
  );

  return id;
};

const getSaleItemId = async (saleId) => {
  const [rows] = await db.promise().query(
    "SELECT id FROM sale_items WHERE sale_id = ? ORDER BY id ASC LIMIT 1",
    [saleId]
  );
  return rows[0]?.id;
};

const getSaleItemBatchRows = async (saleId) => {
  const [rows] = await db.promise().query(
    `SELECT *
     FROM sale_item_batches
     WHERE sale_id = ?
     ORDER BY id ASC`,
    [saleId]
  );
  return rows;
};

const getMovementSummary = async (movementType) => {
  const [rows] = await db.promise().query(
    `SELECT COUNT(*) AS movement_count, COALESCE(SUM(quantity), 0) AS quantity
     FROM stock_movements
     WHERE shop_id = ? AND movement_type = ?`,
    [seed.shopA.id, movementType]
  );
  return {
    movement_count: Number(rows[0]?.movement_count || 0),
    quantity: Number(rows[0]?.quantity || 0),
  };
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

test("sale deducts from earliest expiry batch first", async () => {
  const owner = await loginOwnerA();
  const earlyBatch = await seedBatch({
    id: 9101,
    quantity: 5,
    expiryDate: "2026-08-01",
  });
  const laterBatch = await seedBatch({
    id: 9102,
    quantity: 10,
    expiryDate: "2026-12-01",
  });

  const sale = await createSale(owner.token, { quantity: 3 });
  const allocations = await getSaleItemBatchRows(sale.id);

  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].batch_id, earlyBatch);
  assert.equal(Number(allocations[0].quantity_deducted), 3);
  assert.equal(await getBatchRemaining(db.promise(), earlyBatch), 2);
  assert.equal(await getBatchRemaining(db.promise(), laterBatch), 10);
});

test("sale can deduct across multiple batches", async () => {
  const owner = await loginOwnerA();
  const earlyBatch = await seedBatch({
    id: 9201,
    quantity: 5,
    expiryDate: "2026-08-01",
  });
  const laterBatch = await seedBatch({
    id: 9202,
    quantity: 10,
    expiryDate: "2026-12-01",
  });

  const sale = await createSale(owner.token, { quantity: 7 });
  const allocations = await getSaleItemBatchRows(sale.id);

  assert.equal(allocations.length, 2);
  assert.equal(allocations[0].batch_id, earlyBatch);
  assert.equal(Number(allocations[0].quantity_deducted), 5);
  assert.equal(allocations[1].batch_id, laterBatch);
  assert.equal(Number(allocations[1].quantity_deducted), 2);
  assert.equal(await getBatchRemaining(db.promise(), earlyBatch), 0);
  assert.equal(await getBatchRemaining(db.promise(), laterBatch), 8);
});

test("sale reduces product stock while deducting batch stock", async () => {
  const owner = await loginOwnerA();
  await seedBatch({
    id: 9301,
    quantity: 10,
    expiryDate: "2026-08-01",
  });

  await createSale(owner.token, { quantity: 4 });

  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 16);
  assert.equal(await getBatchRemaining(db.promise(), 9301), 6);
});

test("sale fails if tracked batch stock is insufficient", async () => {
  const owner = await loginOwnerA();
  await seedBatch({
    id: 9401,
    quantity: 2,
    expiryDate: "2026-08-01",
  });

  const response = await createSale(owner.token, {
    quantity: 3,
    expectStatus: 400,
  });

  assert.match(response.body.message, /Not enough batch stock/);
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 20);
  assert.equal(await getBatchRemaining(db.promise(), 9401), 2);
});

test("failed payment restores product stock and batch stock", async () => {
  const owner = await loginOwnerA();
  await seedBatch({
    id: 9501,
    quantity: 10,
    expiryDate: "2026-08-01",
  });

  const sale = await createSale(owner.token, {
    payment_type: "card",
    quantity: 4,
  });
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 16);
  assert.equal(await getBatchRemaining(db.promise(), 9501), 6);

  const failResponse = await request("PUT", `/api/payments/${sale.id}/fail`, {
    token: owner.token,
  });
  expectStatus(failResponse, 200);

  assert.equal(failResponse.body.stock_restored, true);
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 20);
  assert.equal(await getBatchRemaining(db.promise(), 9501), 10);

  const allocations = await getSaleItemBatchRows(sale.id);
  assert.equal(Number(allocations[0].quantity_restored), 4);

  const movementSummary = await getMovementSummary("payment_failed_batch_restore");
  assert.equal(movementSummary.movement_count, 1);
  assert.equal(movementSummary.quantity, 4);
});

test("failed payment cannot double restore batch stock", async () => {
  const owner = await loginOwnerA();
  await seedBatch({
    id: 9601,
    quantity: 10,
    expiryDate: "2026-08-01",
  });

  const sale = await createSale(owner.token, {
    payment_type: "card",
    quantity: 4,
  });

  const firstFail = await request("PUT", `/api/payments/${sale.id}/fail`, {
    token: owner.token,
  });
  expectStatus(firstFail, 200);

  const secondFail = await request("PUT", `/api/payments/${sale.id}/fail`, {
    token: owner.token,
  });
  expectStatus(secondFail, 200);

  assert.equal(secondFail.body.stock_restored, false);
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 20);
  assert.equal(await getBatchRemaining(db.promise(), 9601), 10);

  const movementSummary = await getMovementSummary("payment_failed_batch_restore");
  assert.equal(movementSummary.movement_count, 1);
  assert.equal(movementSummary.quantity, 4);
});

test("return restores correct batch stock", async () => {
  const owner = await loginOwnerA();
  await seedBatch({
    id: 9701,
    quantity: 10,
    expiryDate: "2026-08-01",
  });
  const sale = await createSale(owner.token, { quantity: 4 });
  const saleItemId = await getSaleItemId(sale.id);

  const returnResponse = await request("POST", "/api/returns", {
    token: owner.token,
    body: {
      sale_id: sale.id,
      reason: "Customer returned sealed pack",
      items: [
        {
          sale_item_id: saleItemId,
          quantity: 2,
        },
      ],
    },
  });
  expectStatus(returnResponse, 201);

  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 18);
  assert.equal(await getBatchRemaining(db.promise(), 9701), 8);

  const allocations = await getSaleItemBatchRows(sale.id);
  assert.equal(Number(allocations[0].quantity_restored), 2);

  const movementSummary = await getMovementSummary("return_batch_restore");
  assert.equal(movementSummary.movement_count, 1);
  assert.equal(movementSummary.quantity, 2);
});

test("return cannot restore more than sold quantity", async () => {
  const owner = await loginOwnerA();
  await seedBatch({
    id: 9801,
    quantity: 10,
    expiryDate: "2026-08-01",
  });
  const sale = await createSale(owner.token, { quantity: 3 });
  const saleItemId = await getSaleItemId(sale.id);

  const returnResponse = await request("POST", "/api/returns", {
    token: owner.token,
    body: {
      sale_id: sale.id,
      reason: "Invalid excessive return",
      items: [
        {
          sale_item_id: saleItemId,
          quantity: 4,
        },
      ],
    },
  });
  expectStatus(returnResponse, 400);

  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 17);
  assert.equal(await getBatchRemaining(db.promise(), 9801), 7);
});

test("shop A cannot affect shop B batches", async () => {
  const ownerA = await loginOwnerA();
  await seedBatch({
    id: 9901,
    shopId: seed.shopB.id,
    productId: seed.shopB.productId,
    supplierId: seed.shopB.supplierId,
    quantity: 10,
    batchCode: "SHOP-B-POS-BATCH",
    expiryDate: "2026-08-01",
  });

  const response = await createSale(ownerA.token, {
    product_id: seed.shopB.productId,
    quantity: 1,
    expectStatus: 404,
  });

  assert.match(response.body.message, /not found/i);
  assert.equal(await getBatchRemaining(db.promise(), 9901), 10);
  assert.equal(await getProductStock(db.promise(), seed.shopB.productId), 30);
});

test("offline sync creates batch allocations and stock movements", async () => {
  const owner = await loginOwnerA();
  await seedBatch({
    id: 10001,
    quantity: 10,
    expiryDate: "2026-08-01",
  });

  const response = await request("POST", "/api/sales/sync-offline", {
    token: owner.token,
    body: {
      sales: [
        {
          local_offline_id: "OFFLINE-POS-BATCH-1",
          total_amount: 260,
          paid_amount: 260,
          items: [
            {
              product_id: seed.shopA.productId,
              quantity: 2,
            },
          ],
        },
      ],
    },
  });
  expectStatus(response, 200);
  assert.equal(response.body.results[0].sync_status, "synced");

  const saleId = response.body.results[0].real_sale_id;
  const allocations = await getSaleItemBatchRows(saleId);
  assert.equal(allocations.length, 1);
  assert.equal(Number(allocations[0].quantity_deducted), 2);
  assert.equal(await getBatchRemaining(db.promise(), 10001), 8);

  const movementSummary = await getMovementSummary("sale_batch_deduct");
  assert.equal(movementSummary.movement_count, 1);
  assert.equal(movementSummary.quantity, 2);
});
