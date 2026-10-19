/* global process */
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { compareSync } from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const PHONE_FAILURE_LIMIT = 8;
const IP_FAILURE_LIMIT = 40;
const MAX_RATE_LIMIT_ENTRIES = 10000;
const DUMMY_BCRYPT_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';

// Serverless instances do not share memory, so these rate limits are best-effort only.
const phoneFailures = new Map();
const ipFailures = new Map();

function pruneExpiredEntries(map, now) {
    for (const [key, entry] of map) {
        if (entry.expiresAt <= now) map.delete(key);
    }

    while (map.size > MAX_RATE_LIMIT_ENTRIES) {
        map.delete(map.keys().next().value);
    }
}

function isLimited(map, key, limit, now) {
    const entry = map.get(key);
    return Boolean(entry && entry.expiresAt > now && entry.count >= limit);
}

function recordFailure(map, key, now) {
    const entry = map.get(key);

    if (!entry || entry.expiresAt <= now) {
        map.set(key, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW_MS });
    } else {
        entry.count += 1;
    }

    while (map.size > MAX_RATE_LIMIT_ENTRIES) {
        map.delete(map.keys().next().value);
    }
}

function getClientIp(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;

    if (typeof forwardedValue === 'string' && forwardedValue.trim()) {
        return forwardedValue.split(',')[0].trim();
    }

    return req.socket?.remoteAddress || 'unknown';
}

function safeErrorDetails(error) {
    return {
        message: typeof error?.message === 'string' ? error.message : 'Unknown error',
        code: error?.code,
        status: error?.status
    };
}

function isUserNotFoundError(error) {
    return error?.status === 404
        || error?.code === 'user_not_found'
        || /user\s+not\s+found/i.test(error?.message || '');
}

function isEmailConflictError(error) {
    return error?.code === 'email_exists'
        || error?.code === 'email_address_already_exists'
        || /email.*(already|registered|exists)/i.test(error?.message || '');
}

async function findProfileByPhone(supabaseAdmin, phone, sanitizedPhone) {
    const findExact = async (candidate) => {
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('id, phone, role, password')
            .eq('phone', candidate)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return data;
    };

    const exactProfile = await findExact(phone);
    if (exactProfile || !sanitizedPhone || sanitizedPhone === phone) return exactProfile;

    return findExact(sanitizedPhone);
}

export function verifyLegacyPassword(stored, supplied) {
    if (typeof supplied !== 'string') return false;

    if (typeof stored !== 'string' || stored.length === 0) {
        compareSync(supplied, DUMMY_BCRYPT_HASH);
        return false;
    }

    if (/^\$2[aby]\$/.test(stored)) {
        try {
            return compareSync(supplied, stored);
        } catch {
            return false;
        }
    }

    const storedBuffer = Buffer.from(stored, 'utf8');
    const suppliedBuffer = Buffer.from(supplied, 'utf8');
    const comparisonLength = Math.max(storedBuffer.length, suppliedBuffer.length, 1);
    const storedPadded = Buffer.alloc(comparisonLength);
    const suppliedPadded = Buffer.alloc(comparisonLength);

    storedBuffer.copy(storedPadded);
    suppliedBuffer.copy(suppliedPadded);

    const equal = timingSafeEqual(storedPadded, suppliedPadded);
    return storedBuffer.length === suppliedBuffer.length && equal;
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { phone, password } = req.body || {};

    if (
        typeof phone !== 'string'
        || phone.length < 3
        || phone.length > 40
        || typeof password !== 'string'
        || password.length < 1
        || password.length > 72
    ) {
        return res.status(400).json({ success: false, message: 'Invalid request' });
    }

    const sanitizedPhone = phone.replace(/[^0-9a-zA-Z]/g, '');
    const phoneKey = sanitizedPhone || phone;
    const clientIp = getClientIp(req);
    const now = Date.now();

    pruneExpiredEntries(phoneFailures, now);
    pruneExpiredEntries(ipFailures, now);

    if (
        isLimited(phoneFailures, phoneKey, PHONE_FAILURE_LIMIT, now)
        || isLimited(ipFailures, clientIp, IP_FAILURE_LIMIT, now)
    ) {
        return res.status(429).json({ success: false, message: 'Too many attempts' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseSecret) {
        console.error('Legacy login migration failed: missing server configuration');
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseSecret, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    try {
        const profile = await findProfileByPhone(supabaseAdmin, phone, sanitizedPhone);

        if (!verifyLegacyPassword(profile?.password, password)) {
            recordFailure(phoneFailures, phoneKey, now);
            recordFailure(ipFailures, clientIp, now);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        phoneFailures.delete(phoneKey);

        const email = `${sanitizedPhone}@promise10.com`;
        const { data: existingAuthData, error: getUserError } = await supabaseAdmin.auth.admin
            .getUserById(profile.id);

        if (!getUserError && existingAuthData?.user) {
            const updates = { password };
            if (!existingAuthData.user.email) updates.email = email;

            const { error: updateError } = await supabaseAdmin.auth.admin
                .updateUserById(profile.id, updates);

            if (updateError) throw updateError;
        } else if (getUserError && !isUserNotFoundError(getUserError)) {
            throw getUserError;
        } else {
            const { data: createdAuthData, error: createError } = await supabaseAdmin.auth.admin
                .createUser({
                    id: profile.id,
                    email,
                    password,
                    email_confirm: true
                });

            if (createError && isEmailConflictError(createError)) {
                console.error('Legacy login migration account conflict:', {
                    profileId: profile.id,
                    code: createError.code,
                    status: createError.status
                });
                return res.status(409).json({ success: false, message: 'Account conflict' });
            }

            if (createError) throw createError;

            if (createdAuthData?.user?.id !== profile.id) {
                console.error('Legacy login migration account conflict:', {
                    profileId: profile.id,
                    createdUserId: createdAuthData?.user?.id
                });
                return res.status(409).json({ success: false, message: 'Account conflict' });
            }
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Legacy login migration failed:', safeErrorDetails(error));
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
