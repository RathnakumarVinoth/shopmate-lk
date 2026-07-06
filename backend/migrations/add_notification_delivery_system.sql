CREATE TABLE IF NOT EXISTS notification_templates (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_key VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  title_template VARCHAR(255) NOT NULL,
  message_template TEXT NOT NULL,
  default_channels TEXT NOT NULL,
  default_priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_notification_template_key (template_key),
  INDEX idx_notification_templates_active (is_active)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NULL,
  user_id INT NULL,
  audience_type VARCHAR(30) NOT NULL,
  preference_scope VARCHAR(191) NOT NULL,
  template_key VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  destination VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_notification_preference
    (preference_scope, template_key, channel),
  INDEX idx_notification_preferences_shop (shop_id, user_id),
  INDEX idx_notification_preferences_template (template_key, channel)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shop_id INT NULL,
  recipient_user_id INT NULL,
  audience_type VARCHAR(30) NOT NULL,
  template_key VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  payload LONGTEXT NULL,
  link VARCHAR(500) NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  notification_count INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'unread',
  read_at DATETIME NULL,
  dedupe_key VARCHAR(191) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_notification_dedupe (dedupe_key),
  INDEX idx_notifications_shop_status (shop_id, status, created_at),
  INDEX idx_notifications_recipient_status
    (recipient_user_id, status, created_at),
  INDEX idx_notifications_audience_created (audience_type, created_at)
);

CREATE TABLE IF NOT EXISTS notification_delivery_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  notification_id BIGINT NULL,
  shop_id INT NULL,
  recipient_user_id INT NULL,
  template_key VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  destination VARCHAR(255) NULL,
  provider VARCHAR(100) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payload LONGTEXT NULL,
  error_message TEXT NULL,
  attempt_count INT NOT NULL DEFAULT 1,
  attempted_at DATETIME NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_notification_logs_status_created (status, created_at),
  INDEX idx_notification_logs_shop_created (shop_id, created_at),
  INDEX idx_notification_logs_template_channel (template_key, channel),
  INDEX idx_notification_logs_notification (notification_id)
);

INSERT IGNORE INTO notification_templates
  (template_key, name, title_template, message_template, default_channels,
   default_priority)
VALUES
  ('backup_success', 'Backup success', 'Backup completed',
   'The backup for {{shop_name}} completed successfully.',
   '["in_app","email","sms","whatsapp"]', 'low'),
  ('backup_failure', 'Backup failure', 'Backup failed',
   'The backup for {{shop_name}} failed. {{error}}',
   '["in_app","email","sms","whatsapp"]', 'high'),
  ('restore_success', 'Restore success', 'Restore completed',
   'The backup for {{shop_name}} was restored successfully.',
   '["in_app","email","sms","whatsapp"]', 'medium'),
  ('restore_failure', 'Restore failure', 'Restore failed',
   'The restore for {{shop_name}} failed. {{error}}',
   '["in_app","email","sms","whatsapp"]', 'high'),
  ('low_stock', 'Low stock alert', 'Low stock items',
   '{{count}} product(s) are at or below the low stock limit.',
   '["in_app","email","sms","whatsapp"]', 'medium'),
  ('expired_stock', 'Expired stock alert', 'Expired stock requires attention',
   '{{count}} batch(es) with remaining stock have expired.',
   '["in_app","email","sms","whatsapp"]', 'high'),
  ('credit_due_reminder', 'Credit due reminder', 'Credit payment reminder',
   'A balance of {{amount}} is due to {{shop_name}}. {{due_date}}',
   '["sms","whatsapp","email"]', 'medium'),
  ('system_error', 'System error alert', 'System alert', '{{message}}',
   '["in_app","email","sms","whatsapp"]', 'high'),
  ('subscription_expiry', 'Subscription expiry reminder',
   'Subscription expiring soon', '{{message}}',
   '["in_app","email","sms","whatsapp"]', 'high'),
  ('test_notification', 'Test notification', 'ShopMate notification test',
   'Notification delivery test requested by {{requested_by}}.',
   '["in_app","email","sms","whatsapp"]', 'low');
