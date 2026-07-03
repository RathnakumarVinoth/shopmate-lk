ALTER TABLE shops ADD COLUMN idle_timeout_minutes INT NOT NULL DEFAULT 15;
ALTER TABLE shops ADD COLUMN background_logout_minutes INT NOT NULL DEFAULT 3;
ALTER TABLE login_activity ADD COLUMN message VARCHAR(255) NULL AFTER status;
