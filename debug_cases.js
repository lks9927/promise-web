
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCases() {
    const { data: users, error: uErr } = await supabase.from('profiles').select('id, name').eq('name', '이병헌');
    if (uErr) { console.error(uErr); return; }
    console.log("Users found for '이병헌':", users);

    if (users.length > 0) {
        const userId = users[0].id;
        const { data: cases, error: cErr } = await supabase
            .from('funeral_cases')
            .select('id, team_leader_id, status, location')
            .eq('team_leader_id', userId);

        if (cErr) { console.error(cErr); return; }
        console.log("Cases assigned to '이병헌':", cases);
    }

    const { data: allAssigned } = await supabase
        .from('funeral_cases')
        .select('id, team_leader_id, status, location')
        .not('team_leader_id', 'is', null);
    console.log("All assigned cases:", allAssigned);
}

checkCases();
