CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NULL,
  user_id INT NULL,
  user_name VARCHAR(100) NULL,
  user_role VARCHAR(50) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NULL,
  entity_id INT NULL,
  description TEXT NULL,
  ip_address VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_logs_shop_created (shop_id, created_at),
  INDEX idx_audit_logs_action (action),
  INDEX idx_audit_logs_entity_type (entity_type),
  INDEX idx_audit_logs_user_id (user_id)
);
