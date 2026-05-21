SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles' AND column_name IN ('has_business', 'business_number');
