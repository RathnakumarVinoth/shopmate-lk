import { expect, test } from '@playwright/test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

require('../../backend/test/helpers/loadTestEnv')

const {
  ensureTestDatabase,
  resetAndSeed,
} = require('../../backend/test/helpers/testDatabase')

let db
let seed

const closeDatabase = () =>
  new Promise((resolve, reject) => {
    if (!db) return resolve()
    db.end((error) => (error ? reject(error) : resolve()))
  })

const loginThroughUi = async (page, user, expectedPath = '/dashboard') => {
  await page.goto('/shop-login')
  await page.getByLabel('Shop Email').fill(seed.shopA.email)
  await page.getByLabel('Shop Password').fill(seed.shopA.password)
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page).toHaveURL(/\/role-login$/)
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Login' }).click()

  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`))
}

test.beforeAll(async () => {
  await ensureTestDatabase()
  db = require('../../backend/config/db')
})

test.beforeEach(async ({ page }) => {
  seed = await resetAndSeed(db.promise())
  await page.context().clearCookies()
})

test.afterAll(async () => {
  await closeDatabase()
})

test('shop login, role login, and dashboard load', async ({ page }) => {
  await loginThroughUi(page, seed.shopA.owner)

  await expect(page.getByText('Your shop at a glance')).toBeVisible()
  await expect(page.getByText('Today Sales')).toBeVisible()
})

test('owner can create a product from the browser', async ({ page }) => {
  await loginThroughUi(page, seed.shopA.owner)
  await page.goto('/products')

  await expect(page.getByRole('heading', { name: 'Add Product' })).toBeVisible()
  await page.getByLabel('Product Name').fill('E2E Tea')
  await page.getByLabel('Product Code / SKU').fill('E2E-TEA')
  await page.getByLabel('Barcode').fill('E2E0001')
  await page.getByLabel('Wholesale Price').fill('50')
  await page.getByLabel('Retail Price').fill('75')
  await page.getByLabel('Stock Quantity').fill('12')
  await page.getByLabel('Default Low Stock Limit').fill('2')
  await page.getByRole('button', { name: 'Add Product' }).click()

  await expect(page.getByText('Product added successfully')).toBeVisible()
  await expect(page.getByText('E2E Tea')).toBeVisible()
})

test('staff can complete a cash POS sale', async ({ page }) => {
  await loginThroughUi(page, seed.shopA.staff)
  await page.goto('/pos')

  await page.getByRole('button', { name: /Shop A Rice/ }).first().click()
  await page.getByLabel('Paid Amount').fill('130')
  await page.getByRole('button', { name: 'Complete Sale' }).click()

  await expect(page.getByText('Sale completed successfully')).toBeVisible()
  await expect(page.getByText(/INV-/)).toBeVisible()
})

test('staff sees permission block on restricted pages', async ({ page }) => {
  await loginThroughUi(page, seed.shopA.staff)
  await page.goto('/reports')

  await expect(
    page.getByText('You do not have permission to access this page.'),
  ).toBeVisible()
})
