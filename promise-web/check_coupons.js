import { createClient } from '@supabase/supabase-js';

// Hardcoded for testing
const url = 'https://pfwiaaxkgwhdjpdjlwjd.supabase.co';
const key = 'sb_publishable_pBXfo41MN6BCpBX1TGf3lg_bobhhOfH';

async function check() {
    console.log('--- Checking Coupons ---');
    const supabase = createClient(url, key);

    // 1. Check Count
    const { count, error } = await supabase.from('coupons').select('*', { count: 'exact', head: true });
    if (error) console.log('Error counting:', error);
    else console.log('Total Coupons:', count);

    // 2. Read latest 5 coupons
    const { data: coupons, error: readError } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (readError) console.log('Error reading:', readError);
    else {
        console.log('Latest 5 coupons:', JSON.stringify(coupons, null, 2));
    }
}

check();
