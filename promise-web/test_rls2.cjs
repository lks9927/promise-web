require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
    console.log("Fetching orders policies...");
    const { data: policies, error: polErr } = await supabase.rpc('get_policies', { table_name: 'orders' }).catch(() => ({}));
    if (policies) console.log("Policies via RPC:", policies);
    const { data, error } = await supabase.from('orders').select('*').limit(5);
    console.log("Data:", data);
}
test();
