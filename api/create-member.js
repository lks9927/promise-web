/* global process */
import { createClient } from '@supabase/supabase-js';

const VALID_KINDS = new Set(['dealer', 'leader']);
const VALID_GRADES = new Set(['A', 'B', 'C']);

function safeErrorDetails(error) {
    return {
        message: typeof error?.message === 'string' ? error.message : 'Unknown error',
        code: error?.code,
        status: error?.status
    };
}

async function rollbackCreatedUser(supabaseAdmin, userId) {
    const rollbackSteps = [
        () => supabaseAdmin.from('partners').delete().eq('user_id', userId),
        () => supabaseAdmin.from('profiles').delete().eq('id', userId),
        () => supabaseAdmin.auth.admin.deleteUser(userId)
    ];

    for (const rollbackStep of rollbackSteps) {
        try {
            const { error } = await rollbackStep();
            if (error) {
                console.error('Create member rollback failed:', safeErrorDetails(error));
            }
        } catch (error) {
            console.error('Create member rollback failed:', safeErrorDetails(error));
        }
    }
}

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
        console.error('Create member failed: missing server configuration');
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseSecret, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    let createdUserId = null;

    try {
        const token = bearerMatch[1];
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

        if (authError || !authData?.user?.id) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { data: callerProfile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, role')
            .eq('id', authData.user.id)
            .maybeSingle();

        if (profileError) throw profileError;
        if (!callerProfile) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { data: callerPartner, error: partnerError } = await supabaseAdmin
            .from('partners')
            .select('grade, max_subordinates')
            .eq('user_id', callerProfile.id)
            .maybeSingle();

        if (partnerError) throw partnerError;

        const { kind, name, phone, region, grade } = req.body || {};
        const phoneDigits = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
        const isValidRequest = VALID_KINDS.has(kind)
            && typeof name === 'string'
            && name.trim().length >= 1
            && name.length <= 50
            && typeof phone === 'string'
            && /^[0-9-]+$/.test(phone)
            && phoneDigits.length >= 9
            && phoneDigits.length <= 13
            && typeof region === 'string'
            && region.length <= 40
            && VALID_GRADES.has(grade);

        if (!isValidRequest) {
            return res.status(400).json({ success: false, message: 'Invalid request' });
        }

        const isAdmin = callerProfile.role === 'admin';
        const isMasterGrade = callerPartner?.grade === 'Master';
        const canCreateDealer = isAdmin
            || callerProfile.role === 'master'
            || callerProfile.role === 'leader'
            || isMasterGrade;
        const canCreateLeader = isAdmin || isMasterGrade;

        if ((kind === 'dealer' && !canCreateDealer) || (kind === 'leader' && !canCreateLeader)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        // 하이픈 유무가 달라도 같은 번호로 취급한다 (Auth 이메일은 숫자만 사용하기 때문)
        const { data: existing, error: duplicateError } = await supabaseAdmin
            .from('profiles')
            .select('id, name')
            .in('phone', [...new Set([phone, phoneDigits])])
            .limit(1)
            .maybeSingle();

        if (duplicateError) throw duplicateError;
        if (existing) {
            return res.status(409).json({
                success: false,
                message: `이미 등록된 전화번호입니다. (${existing.name})`
            });
        }

        if (kind === 'leader') {
            const maxSubordinates = callerPartner?.max_subordinates ?? 10;
            const { count, error: countError } = await supabaseAdmin
                .from('partners')
                .select('*', { count: 'exact', head: true })
                .eq('master_id', callerProfile.id);

            if (countError) throw countError;
            if ((count ?? 0) >= maxSubordinates) {
                return res.status(400).json({
                    success: false,
                    message: `허용된 식구 수(${maxSubordinates}명)를 초과하여 추가할 수 없습니다.`
                });
            }
        }

        const email = `${phone.replace(/[^0-9a-zA-Z]/g, '')}@promise10.com`;
        const password = phoneDigits.slice(-6);
        const { data: createdAuthData, error: createAuthError } = await supabaseAdmin.auth.admin
            .createUser({
                email,
                password,
                email_confirm: true
            });

        if (createAuthError) {
            if (createAuthError.code === 'email_exists' || /already|registered|exists/i.test(createAuthError.message || '')) {
                return res.status(409).json({ success: false, message: '이미 등록된 전화번호입니다.' });
            }
            throw createAuthError;
        }
        createdUserId = createdAuthData?.user?.id;
        if (!createdUserId) throw new Error('Auth user was not created');

        const { error: insertProfileError } = await supabaseAdmin
            .from('profiles')
            .insert({
                id: createdUserId,
                role: kind === 'dealer' ? 'dealer' : 'leader',
                name,
                phone,
                email
            });

        if (insertProfileError) throw insertProfileError;

        const { error: insertPartnerError } = await supabaseAdmin
            .from('partners')
            .insert({
                user_id: createdUserId,
                master_id: callerProfile.id,
                region,
                grade,
                status: kind === 'dealer' ? 'approved' : 'pending'
            });

        if (insertPartnerError) throw insertPartnerError;

        return res.status(200).json({ success: true, userId: createdUserId });
    } catch (error) {
        console.error('Create member failed:', safeErrorDetails(error));

        if (createdUserId) {
            await rollbackCreatedUser(supabaseAdmin, createdUserId);
        }

        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
