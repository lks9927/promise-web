-- Add password_reset_requested column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS password_reset_requested BOOLEAN DEFAULT FALSE;

-- Verify changes
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles';
