const DB_NAME = 'shopmate-pos-lite'
const DB_VERSION = 1
const CACHE_STORE = 'cache'
const SALES_STORE = 'offlineSales'

const openDb = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' })
      }

      if (!db.objectStoreNames.contains(SALES_STORE)) {
        const store = db.createObjectStore(SALES_STORE, { keyPath: 'local_offline_id' })
        store.createIndex('sync_status', 'sync_status', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const runStore = async (storeName, mode, action) => {
  const db = await openDb()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = action(store)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

export const cachePosData = async ({ products, customers, settings, user, shop }) => {
  const payload = {
    key: 'pos-data',
    products: products || [],
    customers: customers || [],
    settings: settings || {},
    user: user
      ? {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          shop_id: user.shop_id,
          permissions: user.permissions || [],
        }
      : null,
    shop: shop || null,
    cached_at: new Date().toISOString(),
  }

  await runStore(CACHE_STORE, 'readwrite', (store) => store.put(payload))
  return payload
}

export const getCachedPosData = async () => {
  try {
    return await runStore(CACHE_STORE, 'readonly', (store) => store.get('pos-data'))
  } catch {
    return null
  }
}

export const saveOfflineSale = async (sale) => {
  await runStore(SALES_STORE, 'readwrite', (store) => store.put(sale))
  return sale
}

export const getOfflineSales = async () => {
  try {
    const sales = await runStore(SALES_STORE, 'readonly', (store) => store.getAll())
    return sales.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } catch {
    return []
  }
}

export const updateOfflineSale = async (localOfflineId, changes) => {
  const current = await runStore(SALES_STORE, 'readonly', (store) => store.get(localOfflineId))
  if (!current) return null

  const next = {
    ...current,
    ...changes,
    updated_at: new Date().toISOString(),
  }
  await saveOfflineSale(next)
  return next
}

export const syncPendingOfflineSales = async (apiClient) => {
  const sales = await getOfflineSales()
  const pendingSales = sales.filter((sale) => ['pending', 'failed'].includes(sale.sync_status))

  if (pendingSales.length === 0) {
    return []
  }

  await Promise.all(
    pendingSales.map((sale) =>
      updateOfflineSale(sale.local_offline_id, {
        sync_status: 'syncing',
        sync_error: '',
      }),
    ),
  )

  try {
    const response = await apiClient.post('/sales/sync-offline', { sales: pendingSales })
    const results = response.data.results || []

    await Promise.all(
      results.map((result) =>
        updateOfflineSale(result.local_offline_id, {
          sync_status: result.sync_status,
          real_sale_id: result.real_sale_id || null,
          real_invoice_no: result.real_invoice_no || null,
          sync_error: result.sync_status === 'failed' ? result.message || 'Sync failed' : '',
          synced_at: result.sync_status === 'synced' ? new Date().toISOString() : null,
        }),
      ),
    )

    const resultIds = new Set(results.map((result) => result.local_offline_id))
    await Promise.all(
      pendingSales
        .filter((sale) => !resultIds.has(sale.local_offline_id))
        .map((sale) =>
          updateOfflineSale(sale.local_offline_id, {
            sync_status: 'failed',
            sync_error: 'No sync response received',
          }),
        ),
    )

    return results
  } catch (error) {
    await Promise.all(
      pendingSales.map((sale) =>
        updateOfflineSale(sale.local_offline_id, {
          sync_status: 'failed',
          sync_error: error.response?.data?.message || error.message || 'Sync failed',
        }),
      ),
    )
    throw error
  }
}
