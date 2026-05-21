-- Insert Admin and Manager users
-- Password: '1234' for both
-- IDs are random UUIDs
-- Phone column is used as ID for login

INSERT INTO profiles (id, name, phone, password, role, email)
VALUES
  (gen_random_uuid(), '최고관리자', 'admin', '1234', 'admin', 'admin@promise.com'),
  (gen_random_uuid(), '운영자', 'manager', '1234', 'operating', 'manager@promise.com')
ON CONFLICT (phone) DO UPDATE 
SET 
  password = EXCLUDED.password,
  role = EXCLUDED.role;
