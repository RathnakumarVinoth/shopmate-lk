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

const createPurchaseOrder = async (token, overrides = {}) => {
  const response = await request("POST", "/api/purchasing/purchase-orders", {
    token,
    body: {
      supplier_id: overrides.supplier_id || seed.shopA.supplierId,
      expected_date: "2026-07-10",
      notes: "Test purchase order",
      items: [
        {
          product_id: overrides.product_id || seed.shopA.productId,
          ordered_quantity: overrides.ordered_quantity || 5,
          buying_price: overrides.buying_price || 95,
          selling_price: overrides.selling_price || 130,
        },
      ],
      ...overrides.body,
    },
  });
  expectStatus(response, 201);
  return response.body.purchase_order;
};

const submitPurchaseOrder = async (token, purchaseOrderId) => {
  const response = await request(
    "POST",
    `/api/purchasing/purchase-orders/${purchaseOrderId}/submit`,
    { token }
  );
  expectStatus(response, 200);
  return response.body.purchase_order;
};

const createGrn = async (token, purchaseOrder, overrides = {}) => {
  const response = await request("POST", "/api/purchasing/grns", {
    token,
    body: {
      purchase_order_id: purchaseOrder.id,
      supplier_invoice_number: overrides.supplier_invoice_number || "SUP-INV-001",
      received_date: "2026-07-05",
      notes: "Test GRN",
      items: [
        {
          purchase_order_item_id:
            overrides.purchase_order_item_id || purchaseOrder.items[0].id,
          received_quantity: overrides.received_quantity || 3,
          buying_price: overrides.buying_price || 96,
          selling_price: overrides.selling_price || 130,
          expiry_date: "2027-01-01",
          batch_code: overrides.batch_code || "A-BATCH-001",
        },
      ],
      ...overrides.body,
    },
  });
  expectStatus(response, 201);
  return response.body.grn;
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

test("owner creates and submits a purchase order", async () => {
  const owner = await loginOwnerA();
  const purchaseOrder = await createPurchaseOrder(owner.token);

  assert.equal(purchaseOrder.status, "draft");
  assert.match(purchaseOrder.po_number, /^PO-/);
  assert.equal(purchaseOrder.items.length, 1);
  assert.equal(purchaseOrder.items[0].ordered_quantity, 5);

  const submitted = await submitPurchaseOrder(owner.token, purchaseOrder.id);
  assert.equal(submitted.status, "ordered");
  assert.ok(submitted.submitted_at);
});

test("owner creates and posts GRN with stock batch and buying price history", async () => {
  const owner = await loginOwnerA();
  const purchaseOrder = await submitPurchaseOrder(
    owner.token,
    (await createPurchaseOrder(owner.token)).id
  );
  const grn = await createGrn(owner.token, purchaseOrder);

  assert.equal(grn.status, "draft");
  assert.equal(grn.supplier_invoice_number, "SUP-INV-001");
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 20);

  const posted = await request("POST", `/api/purchasing/grns/${grn.id}/post`, {
    token: owner.token,
  });
  expectStatus(posted, 200);

  assert.equal(posted.body.grn.status, "posted");
  assert.equal(posted.body.purchase_order_status, "partially_received");
  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 23);
  assert.equal(posted.body.batches.length, 1);
  assert.equal(posted.body.batches[0].quantity_remaining, 3);

  const [batches] = await db.promise().query(
    `SELECT * FROM stock_batches
     WHERE shop_id = ? AND product_id = ? AND grn_id = ?`,
    [seed.shopA.id, seed.shopA.productId, grn.id]
  );
  assert.equal(batches.length, 1);
  assert.equal(batches[0].batch_code, "A-BATCH-001");
  assert.equal(Number(batches[0].quantity_received), 3);
  assert.equal(Number(batches[0].quantity_remaining), 3);

  const [historyRows] = await db.promise().query(
    `SELECT * FROM buying_price_history
     WHERE shop_id = ? AND product_id = ? AND grn_id = ?`,
    [seed.shopA.id, seed.shopA.productId, grn.id]
  );
  assert.equal(historyRows.length, 1);
  assert.equal(Number(historyRows[0].new_buying_price), 96);
  assert.equal(Number(historyRows[0].quantity_received), 3);

  const [movementRows] = await db.promise().query(
    `SELECT * FROM stock_movements
     WHERE shop_id = ? AND product_id = ? AND reference_type = 'grn' AND reference_id = ?`,
    [seed.shopA.id, seed.shopA.productId, grn.id]
  );
  assert.equal(movementRows.length, 1);
  assert.equal(movementRows[0].movement_type, "grn_receive");
});

test("GRN cannot be posted twice", async () => {
  const owner = await loginOwnerA();
  const purchaseOrder = await submitPurchaseOrder(
    owner.token,
    (await createPurchaseOrder(owner.token)).id
  );
  const grn = await createGrn(owner.token, purchaseOrder);

  const firstPost = await request("POST", `/api/purchasing/grns/${grn.id}/post`, {
    token: owner.token,
  });
  expectStatus(firstPost, 200);

  const secondPost = await request("POST", `/api/purchasing/grns/${grn.id}/post`, {
    token: owner.token,
  });
  expectStatus(secondPost, 409);

  assert.equal(await getProductStock(db.promise(), seed.shopA.productId), 23);
});

test("shop A cannot access shop B purchase orders, GRNs, or batches", async () => {
  const ownerA = await loginOwnerA();
  const ownerB = await loginOwnerB();
  const shopBPurchaseOrder = await submitPurchaseOrder(
    ownerB.token,
    (
      await createPurchaseOrder(ownerB.token, {
        supplier_id: seed.shopB.supplierId,
        product_id: seed.shopB.productId,
        batch_code: "B-BATCH-001",
      })
    ).id
  );
  const shopBGrn = await createGrn(ownerB.token, shopBPurchaseOrder, {
    supplier_invoice_number: "SUP-B-INV-001",
    batch_code: "B-BATCH-001",
  });

  const shopAPurchaseOrderAccess = await request(
    "GET",
    `/api/purchasing/purchase-orders/${shopBPurchaseOrder.id}`,
    { token: ownerA.token }
  );
  expectStatus(shopAPurchaseOrderAccess, 404);

  const shopAGrnAccess = await request(
    "GET",
    `/api/purchasing/grns/${shopBGrn.id}`,
    { token: ownerA.token }
  );
  expectStatus(shopAGrnAccess, 404);

  const shopABatchAccess = await request(
    "GET",
    `/api/purchasing/products/${seed.shopB.productId}/batches`,
    { token: ownerA.token }
  );
  expectStatus(shopABatchAccess, 404);
});

test("staff without purchasing permission is blocked", async () => {
  const staff = await loginStaffA();

  const response = await request("GET", "/api/purchasing/purchase-orders", {
    token: staff.token,
  });

  expectStatus(response, 403);
});

test("staff with purchasing access can read purchasing routes but not manage routes", async () => {
  await db.promise().query("UPDATE users SET permissions = ? WHERE id = ?", [
    JSON.stringify(["purchasing_access"]),
    seed.shopA.staff.id,
  ]);

  const staff = await loginStaffA();

  const readResponse = await request("GET", "/api/purchasing/purchase-orders", {
    token: staff.token,
  });
  expectStatus(readResponse, 200);

  const grnReadResponse = await request("GET", "/api/purchasing/grns", {
    token: staff.token,
  });
  expectStatus(grnReadResponse, 200);

  const batchReadResponse = await request(
    "GET",
    `/api/purchasing/products/${seed.shopA.productId}/batches`,
    { token: staff.token }
  );
  expectStatus(batchReadResponse, 200);

  const manageResponse = await request("POST", "/api/purchasing/purchase-orders", {
    token: staff.token,
    body: {
      supplier_id: seed.shopA.supplierId,
      items: [
        {
          product_id: seed.shopA.productId,
          ordered_quantity: 1,
          buying_price: 95,
        },
      ],
    },
  });
  expectStatus(manageResponse, 403);
});

test("staff with purchasing manage permission can create purchase orders", async () => {
  await db.promise().query("UPDATE users SET permissions = ? WHERE id = ?", [
    JSON.stringify(["purchasing_access", "purchasing_manage"]),
    seed.shopA.staff.id,
  ]);

  const staff = await loginStaffA();
  const purchaseOrder = await createPurchaseOrder(staff.token);

  assert.equal(purchaseOrder.status, "draft");
  assert.equal(purchaseOrder.supplier_id, seed.shopA.supplierId);
});
