/* global process */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const authorization = req.headers.authorization;
    const bearerMatch = typeof authorization === 'string'
        ? authorization.match(/^Bearer\s+(\S+)$/i)
        : null;

    if (!bearerMatch) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseSecret) {
        console.error('Supabase Auth password reset failed: missing server configuration');
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseSecret, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    try {
        const token = bearerMatch[1];
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !authData?.user?.id) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, role, admin_level')
            .eq('id', authData.user.id)
            .maybeSingle();

        if (profileError) throw profileError;

        if (profile?.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { userId, newPassword } = req.body || {};
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (
            typeof userId !== 'string'
            || !uuidPattern.test(userId)
            || typeof newPassword !== 'string'
            || newPassword.length < 6
            || newPassword.length > 72
        ) {
            return res.status(400).json({ success: false, message: 'Invalid request' });
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: newPassword
        });

        if (error) throw error;

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Supabase Auth password reset failed:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
