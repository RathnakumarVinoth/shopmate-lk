ALTER TABLE shops ADD COLUMN IF NOT EXISTS shop_type VARCHAR(50) NOT NULL DEFAULT 'custom';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS enabled_modules TEXT NULL;

UPDATE shops
SET shop_type = COALESCE(NULLIF(shop_type, ''), 'custom'),
    enabled_modules = COALESCE(NULLIF(enabled_modules, ''), '["pos","products","stock","barcode","customers","credit_book","suppliers","purchasing","grn","expenses","reports","backup","staff","notifications","receipt_printing","low_stock","returns_exchange"]')
WHERE shop_type IS NULL
   OR shop_type = ''
   OR enabled_modules IS NULL
   OR enabled_modules = '';
