-- 2FA columns for admin_users
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS totp_secret  VARCHAR(100);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
