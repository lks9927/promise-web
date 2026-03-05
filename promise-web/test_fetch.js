
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testFetchCases() {
    const userId = '21000000-0000-0000-0000-000000000003'; // 이병헌 팀장
    const targetTeamIds = [userId];

    const { data: myAssigned, error: myError } = await supabase
        .from('funeral_cases')
        .select('*, profiles:customer_id(name, phone), coupons(id, code, amount, status, used_for)')
        .in('status', ['assigned', 'consulting', 'in_progress', 'team_settling', 'hq_check', 'completed'])
        .in('team_leader_id', targetTeamIds)
        .order('created_at', { ascending: false });

    if (myError) {
        console.error("Fetch failed with error:", myError);
    } else {
        console.log("Fetch success! Data length:", myAssigned.length);
        console.log("First item:", myAssigned[0]);
    }
}

testFetchCases();
