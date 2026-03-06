require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
    const { data: user } = await supabase.from('users').select('*').limit(1); // just to check
    const { data, error } = await supabase.from('deliveries').select('*').limit(5);
    console.log("Deliveries DB Check - Data:", data?.length);
    if (error) console.error("Error:", error);
}
test();
