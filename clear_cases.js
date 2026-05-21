import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve('.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Supabase URL or Key not found in .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function main() {
    console.log("Starting cleanup of funeral cases and related data...");
    
    const tablesToClear = [
        'settlements',
        'bidding_history',
        'bidding_requests',
        'bidding_logs',
        'toss_payouts',
        'financial_ledgers',
        'funeral_progress_reports',
        'notifications',
        'flower_orders'
    ];

    for (const table of tablesToClear) {
        console.log(`Clearing ${table}...`);
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) console.log(`Warning clearing ${table}:`, error.message);
    }

    console.log("Clearing funeral_cases...");
    const { error: casesError } = await supabase.from('funeral_cases').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (casesError) {
        console.error("Error clearing funeral_cases:", casesError);
    } else {
        console.log("SUCCESS: All funeral cases test data has been deleted.");
    }
}

main().catch(console.error);
