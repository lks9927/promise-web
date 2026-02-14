
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const mockPartners = [
    { name: '김마스터', phone: '010-1111-1111', role: 'leader', grade: 'Master', region: '서울', bank: '국민은행', account: '111-111-111111' },
    { name: '이성실', phone: '010-2222-2222', role: 'leader', grade: 'A', region: '경기', bank: '신한은행', account: '222-222-222222' },
    { name: '박초보', phone: '010-3333-3333', role: 'leader', grade: 'B', region: '인천', bank: '우리은행', account: '333-333-333333' },
    { name: '최대박', phone: '010-4444-4444', role: 'dealer', grade: 'Master', region: '서울', bank: '하나은행', account: '444-444-444444' },
    { name: '정일반', phone: '010-5555-5555', role: 'dealer', grade: 'A', region: '부산', bank: '농협', account: '555-555-555555' },
    { name: '홍길동', phone: '010-9999-9999', role: 'customer', grade: null, region: '서울', bank: null, account: null }
];

async function seedPartners() {
    console.log('🚀 Seeding partners...');

    for (const p of mockPartners) {
        // 1. Check if profile exists
        const { data: existingUser } = await supabase
            .from('profiles')
            .select('id')
            .eq('phone', p.phone)
            .single();

        let userId = existingUser?.id;

        if (!userId) {
            // Create Profile
            userId = crypto.randomUUID();
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: userId,
                    name: p.name,
                    phone: p.phone,
                    password: '1234', // Default password
                    role: p.role,
                    email: `${p.phone}@test.com` // Dummy email
                });

            if (profileError) {
                console.error(`❌ Failed to create profile for ${p.name}:`, profileError.message);
                continue;
            }
            console.log(`✅ Created profile: ${p.name} (${p.role})`);
        } else {
            console.log(`ℹ️ Profile exists: ${p.name}`);
        }

        // 2. If it's a partner (leader/dealer), create partner entry
        if (p.role !== 'customer') {
            const { error: partnerError } = await supabase
                .from('partners')
                .upsert({
                    user_id: userId,
                    grade: p.grade,
                    region: p.region,
                    status: 'approved' // Auto-approve for testing
                }, { onConflict: 'user_id' });

            if (partnerError) {
                console.error(`❌ Failed to create partner entry for ${p.name}:`, partnerError.message);
            } else {
                console.log(`   Linked partner info: ${p.grade} / ${p.region}`);
            }
        }
    }

    console.log('🎉 Partner seeding completed!');
}

seedPartners();
