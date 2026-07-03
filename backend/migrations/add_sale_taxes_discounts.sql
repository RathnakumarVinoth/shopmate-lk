ALTER TABLE sales
  ADD COLUMN subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN item_discount_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN bill_discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN tax_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN total_before_tax DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE sale_items
  ADD COLUMN unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN item_discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN item_discount_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  ADD COLUMN tax_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN line_total_before_tax DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN line_total DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE sale_items
SET unit_price = CASE WHEN unit_price = 0 THEN selling_price ELSE unit_price END,
    line_total_before_tax = CASE
      WHEN line_total_before_tax = 0 THEN subtotal
      ELSE line_total_before_tax
    END,
    line_total = CASE WHEN line_total = 0 THEN subtotal ELSE line_total END;

UPDATE sales
SET subtotal = CASE
      WHEN subtotal = 0 THEN total_amount + COALESCE(discount_amount, 0)
      ELSE subtotal
    END,
    bill_discount = CASE
      WHEN bill_discount = 0 THEN COALESCE(discount_amount, 0)
      ELSE bill_discount
    END,
    total_before_tax = CASE
      WHEN total_before_tax = 0 THEN total_amount
      ELSE total_before_tax
    END;
