ALTER TABLE users ADD COLUMN reset_token_hash VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN reset_token_expires_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS login_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  shop_id INT NULL,
  email VARCHAR(255) NULL,
  role VARCHAR(50) NULL,
  status VARCHAR(50) NOT NULL,
  ip_address VARCHAR(100) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_login_activity_shop_created (shop_id, created_at),
  INDEX idx_login_activity_user_created (user_id, created_at),
  INDEX idx_login_activity_status (status)
);
