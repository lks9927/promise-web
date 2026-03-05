
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSpecificCase() {
    const { data: caseItem, error } = await supabase
        .from('funeral_cases')
        .select('*, profiles:customer_id(name, phone)')
        .eq('id', 'b3dbc358-dd3f-4fe3-8da3-ed02571921d3')
        .single();

    if (error) { console.error("Fetch error:", error); }
    console.log("Case Item with Join:", caseItem);
}

checkSpecificCase();
