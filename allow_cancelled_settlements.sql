ALTER TABLE settlements DROP CONSTRAINT IF EXISTS settlements_status_check;

ALTER TABLE settlements ADD CONSTRAINT settlements_status_check
    CHECK (status IN ('pending', 'paid', 'cancelled'));
