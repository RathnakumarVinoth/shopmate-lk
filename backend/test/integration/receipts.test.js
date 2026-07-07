require("../helpers/loadTestEnv");

const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");

const {
  ensureTestDatabase,
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

const request = async (method, requestPath, { body, token } = {}) => {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${requestPath}`, {
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
  return response.body.shop_token;
};

const loginShopUser = async (shop, user) => {
  const shopToken = await shopLogin(shop);
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

const loginAdmin = async () => {
  const response = await request("POST", "/api/auth/login", {
    body: {
      email: seed.admin.email,
      password: seed.admin.password,
    },
  });
  expectStatus(response, 200);
  return response.body;
};

const createSale = async (token, shop, overrides = {}) => {
  const response = await request("POST", "/api/sales", {
    token,
    body: {
      payment_type: "cash",
      paid_amount: overrides.paid_amount || 130,
      tax_percentage: overrides.tax_percentage || 0,
      bill_discount: overrides.bill_discount || 0,
      items: [
        {
          product_id: shop.productId,
          quantity: 1,
          item_discount: overrides.item_discount || 0,
        },
      ],
    },
  });
  expectStatus(response, 201);
  return response.body;
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
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await closeDatabase();
});

test("admin updates receipt settings and owner reads only own shop settings", async () => {
  const admin = await loginAdmin();
  const update = await request("PUT", "/api/settings", {
    token: admin.token,
    body: {
      shop_id: seed.shopA.id,
      shop_name: "Shop A",
      phone: "0710000001",
      email: "owner-a@test.lk",
      address: "Colombo",
      receipt_footer: "Thank you from Shop A",
      currency: "LKR",
      default_low_stock_limit: 5,
      tax_percentage: 8,
      logo_url: "https://example.com/shop-a-logo.png",
      default_receipt_size: "58mm",
      receipt_show_logo: true,
      receipt_show_tax: false,
      receipt_show_discounts: false,
      receipt_show_cashier: false,
      open_cash_drawer_after_print: true,
      language: "en",
    },
  });
  expectStatus(update, 200);

  const ownerA = await loginShopUser(seed.shopA, seed.shopA.owner);
  const settingsA = await request("GET", "/api/settings", {
    token: ownerA.token,
  });
  expectStatus(settingsA, 200);
  assert.equal(settingsA.body.default_receipt_size, "58mm");
  assert.equal(settingsA.body.receipt_show_logo, true);
  assert.equal(settingsA.body.receipt_show_tax, false);
  assert.equal(settingsA.body.receipt_show_discounts, false);
  assert.equal(settingsA.body.receipt_show_cashier, false);
  assert.equal(settingsA.body.open_cash_drawer_after_print, true);

  const ownerUpdate = await request("PUT", "/api/settings/printer", {
    token: ownerA.token,
    body: {
      open_cash_drawer_after_print: false,
    },
  });
  expectStatus(ownerUpdate, 200);
  assert.equal(ownerUpdate.body.settings.open_cash_drawer_after_print, false);

  const updatedSettingsA = await request("GET", "/api/settings", {
    token: ownerA.token,
  });
  expectStatus(updatedSettingsA, 200);
  assert.equal(updatedSettingsA.body.open_cash_drawer_after_print, false);

  const ownerB = await loginShopUser(seed.shopB, seed.shopB.owner);
  const settingsB = await request("GET", "/api/settings", {
    token: ownerB.token,
  });
  expectStatus(settingsB, 200);
  assert.equal(settingsB.body.shop_name, "Shop B");
  assert.equal(settingsB.body.default_receipt_size, "80mm");
  assert.equal(settingsB.body.receipt_show_tax, true);
  assert.equal(settingsB.body.open_cash_drawer_after_print, false);
});

test("admin shop create and edit preserve receipt display preferences", async () => {
  const admin = await loginAdmin();
  const created = await request("POST", "/api/admin/shops", {
    token: admin.token,
    body: {
      shop_name: "Receipt Test Shop",
      owner_name: "Receipt Owner",
      login_email: "receipt-shop@test.lk",
      login_password: "ShopCreate#123",
      owner_username: "receipt_owner",
      owner_password: "OwnerCreate#123",
      email: "receipt-owner@test.lk",
      default_receipt_size: "58mm",
      receipt_show_logo: false,
      receipt_show_tax: false,
      receipt_show_discounts: true,
      receipt_show_cashier: true,
      open_cash_drawer_after_print: true,
    },
  });
  expectStatus(created, 201);
  assert.equal(created.body.shop.receipt_show_logo, false);
  assert.equal(created.body.shop.receipt_show_tax, false);
  assert.equal(created.body.shop.open_cash_drawer_after_print, true);

  const shop = created.body.shop;
  const updated = await request("PUT", `/api/admin/shops/${shop.id}`, {
    token: admin.token,
    body: {
      ...shop,
      owner_name: "Receipt Owner",
      login_email: "receipt-shop@test.lk",
      receipt_show_logo: true,
      receipt_show_tax: true,
      receipt_show_discounts: false,
      receipt_show_cashier: false,
      open_cash_drawer_after_print: false,
      is_enabled: true,
    },
  });
  expectStatus(updated, 200);
  assert.equal(updated.body.shop.receipt_show_logo, true);
  assert.equal(updated.body.shop.receipt_show_tax, true);
  assert.equal(updated.body.shop.receipt_show_discounts, false);
  assert.equal(updated.body.shop.receipt_show_cashier, false);
  assert.equal(updated.body.shop.open_cash_drawer_after_print, false);
});

test("sale detail returns complete shop-scoped receipt data", async () => {
  const owner = await loginShopUser(seed.shopA, seed.shopA.owner);
  const created = await createSale(owner.token, seed.shopA, {
    paid_amount: 132,
    item_discount: 10,
    tax_percentage: 10,
  });
  const response = await request(
    "GET",
    `/api/sales/${created.sale.id}`,
    { token: owner.token }
  );

  expectStatus(response, 200);
  const receipt = response.body.receipt;
  assert.equal(receipt.sale_id, created.sale.id);
  assert.ok(receipt.invoice_no);
  assert.equal(receipt.shop_name, "Shop A");
  assert.equal(receipt.billed_by, "Owner A");
  assert.equal(receipt.items.length, 1);
  assert.equal(receipt.items[0].product_name, "Shop A Rice");
  assert.equal(receipt.items[0].item_discount, 10);
  assert.equal(receipt.payment_type, "cash");
  assert.equal(receipt.open_cash_drawer_after_print, false);
  assert.ok(receipt.created_at);
  assert.equal(Object.hasOwn(receipt.items[0], "buying_price"), false);
  assert.equal(Object.hasOwn(receipt.items[0], "profit"), false);
});

test("staff sale responses do not expose buying price or profit", async () => {
  const staff = await loginShopUser(seed.shopA, seed.shopA.staff);
  const created = await createSale(staff.token, seed.shopA);

  assert.equal(Object.hasOwn(created.sale, "total_profit"), false);
  assert.equal(Object.hasOwn(created.sale.items[0], "buying_price"), false);
  assert.equal(Object.hasOwn(created.sale.items[0], "profit"), false);

  const detail = await request("GET", `/api/sales/${created.sale.id}`, {
    token: staff.token,
  });
  expectStatus(detail, 200);
  assert.equal(Object.hasOwn(detail.body.sale, "total_profit"), false);
  assert.equal(Object.hasOwn(detail.body.sale.items[0], "buying_price"), false);
  assert.equal(Object.hasOwn(detail.body.sale.items[0], "profit"), false);
});

test("Shop A cannot access Shop B receipt", async () => {
  const ownerB = await loginShopUser(seed.shopB, seed.shopB.owner);
  const shopBSale = await createSale(ownerB.token, seed.shopB, {
    paid_amount: 120,
  });
  const ownerA = await loginShopUser(seed.shopA, seed.shopA.owner);
  const response = await request(
    "GET",
    `/api/sales/${shopBSale.sale.id}`,
    { token: ownerA.token }
  );

  expectStatus(response, 404);
});
