import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
        return res.status(400).json({ message: 'Missing userId or newPassword' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseSecret) {
        return res.status(500).json({ message: 'Server configuration error: missing secret key' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseSecret, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    try {
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: newPassword
        });

        if (error) throw error;

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error("Supabase Auth password reset failed:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
}
