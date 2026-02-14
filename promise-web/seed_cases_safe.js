
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
// Use Anon Key (usually fine for insert if RLS allows)
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedDataSafe() {
    console.log('🌱 Starting SAFE database seed...');

    // 1. Clear existing transactional data (Best Effort)
    console.log('🗑️ Clearing existing data...');

    // Attempt deletions (might fail if RLS blocks, but worth a try)
    await supabase.from('settlements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('funeral_cases').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('coupons').delete().neq('code', 'dummy');

    // 2. Fetch existing profiles to link
    const { data: profiles } = await supabase.from('profiles').select('id, name, run_role:role').limit(10);
    const admin = profiles?.find(p => p.run_role === 'admin') || profiles?.[0]; // Fallback

    if (!admin) {
        console.error('❌ No users found in profiles. Please create a user first.');
        return;
    }

    console.log(`👤 Using user ${admin.name} for linking...`);

    // 3. Create Sample Cases for Each Status (Using ONLY existing allowed statuses)
    // Allowed: requested, assigned, in_progress, team_settling, hq_check, completed
    const statuses = [
        { status: 'requested', location: '서울대병원 장례식장', package: '기본형' },
        { status: 'assigned', location: '삼성서울병원', package: '고급형' },
        // 'consulting' is not allowed yet -> map to 'assigned'
        { status: 'assigned', location: '아산병원 (상담중)', package: '프리미엄' },
        { status: 'in_progress', location: '세브란스병원', package: 'VIP' },
        // 'settling' is not allowed yet -> map to 'team_settling'
        { status: 'team_settling', location: '성모병원', package: '기본형' },
        { status: 'completed', location: '이대목동병원', package: '고급형' }
    ];

    const newCases = statuses.map((s, i) => ({
        customer_id: admin.id, // Current user is the requester
        location: s.location,
        package_name: s.package,
        status: s.status,
        created_at: new Date(Date.now() - i * 86400000).toISOString() // Different dates
    }));

    const { data: insertedCases, error: insertErr } = await supabase
        .from('funeral_cases')
        .insert(newCases)
        .select();

    if (insertErr) {
        console.error('❌ Error inserting cases:', insertErr);
    } else {
        console.log(`✅ Successfully inserted ${insertedCases.length} mock cases.`);
        console.table(insertedCases.map(c => ({
            id: c.id.substring(0, 8),
            status: c.status,
            location: c.location
        })));
    }

    // 4. Create Sample Coupons
    const newCoupons = [
        { code: 'SAFE-1000', amount: 100000, status: 'active', created_at: new Date().toISOString() },
        { code: 'SAFE-2000', amount: 200000, status: 'used', used_at: new Date().toISOString() }
    ];

    const { error: coupInsertErr } = await supabase.from('coupons').insert(newCoupons);
    if (coupInsertErr) console.error('Error inserting coupons:', coupInsertErr);
    else console.log('✅ Inserted sample coupons.');

    console.log('🎉 Seed completed!');
}

seedDataSafe();
