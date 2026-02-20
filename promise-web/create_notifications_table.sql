-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'info', 'success', 'warning', 'error'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    link VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own notifications" 
ON notifications FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications (mark as read)" 
ON notifications FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "System/Admin can insert notifications" 
ON notifications FOR INSERT 
WITH CHECK (true); -- Ideally restrict to service roles or specific triggers

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
