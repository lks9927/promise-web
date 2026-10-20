/* global process */
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_PUSH_HOSTS = [
    'fcm.googleapis.com',
    'push.services.mozilla.com',
    'notify.windows.com',
    'push.apple.com',
];

function isAllowedEndpoint(endpoint) {
    try {
        const url = new URL(endpoint);
        if (url.protocol !== 'https:') return false;
        return ALLOWED_PUSH_HOSTS.some(host => url.hostname === host || url.hostname.endsWith('.' + host));
    } catch {
        return false;
    }
}

function validateSubscription(sub) {
    if (sub == null || typeof sub !== 'object') return false;
    if (typeof sub.endpoint !== 'string' || sub.endpoint.length === 0 || sub.endpoint.length > 500) return false;
    if (!isAllowedEndpoint(sub.endpoint)) return false;
    if (sub.keys == null || typeof sub.keys !== 'object') return false;
    if (typeof sub.keys.p256dh !== 'string' || sub.keys.p256dh.length === 0) return false;
    if (typeof sub.keys.auth !== 'string' || sub.keys.auth.length === 0) return false;
    return true;
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // --- Auth ---
    const authorization = req.headers.authorization;
    const bearerMatch = typeof authorization === 'string'
        ? authorization.match(/^Bearer\s+(\S+)$/i)
        : null;

    if (!bearerMatch) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseSecret) {
        console.error('Send push failed: missing Supabase configuration');
        return res.status(500).json({ error: 'Server configuration error' });
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
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, role')
            .eq('id', authData.user.id)
            .maybeSingle();

        if (profileError) throw profileError;

        if (profile?.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // --- VAPID ---
        const vapidPublic = process.env.VAPID_PUBLIC_KEY;
        const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

        if (!vapidPublic || !vapidPrivate) {
            console.error('Send push failed: missing VAPID configuration');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        webpush.setVapidDetails(
            process.env.VAPID_SUBJECT || 'mailto:admin@10promise.co.kr',
            vapidPublic,
            vapidPrivate
        );

        // --- Validate body ---
        const { subscriptions, title, body, url } = req.body || {};

        if (!Array.isArray(subscriptions) || subscriptions.length === 0 || subscriptions.length > 100) {
            return res.status(400).json({ error: 'Invalid subscriptions' });
        }

        const validSubs = subscriptions.filter(validateSubscription);
        if (validSubs.length === 0) {
            return res.status(400).json({ error: 'Invalid subscriptions' });
        }

        const safeTitle = typeof title === 'string' ? title.trim().slice(0, 100) : '10년의 약속';
        const safeBody = typeof body === 'string' ? body.trim().slice(0, 500) : '새 알림이 도착했습니다.';
        // 사이트 안의 경로만 허용한다. '//evil.com', '/\evil.com' 같은 외부 주소로 가는 형태는 막는다.
        const safeUrl = (typeof url === 'string' && /^\/(?![/\\])[^\s]*$/.test(url) && url.length <= 300) ? url : '/';

        const payload = JSON.stringify({
            title: safeTitle || '10년의 약속',
            body: safeBody || '새 알림이 도착했습니다.',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            url: safeUrl,
            tag: 'promise-notification',
        });

        // --- Send ---
        const results = await Promise.allSettled(
            validSubs.map((subscription) =>
                webpush.sendNotification(subscription, payload)
            )
        );

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        console.log(`[Push] 발송 완료: 성공 ${succeeded}, 실패 ${failed}`);

        return res.status(200).json({ succeeded, failed });
    } catch (error) {
        console.error('Send push failed:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
