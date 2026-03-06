require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
    const { data, error } = await supabase.rpc('get_table_info', { table_name: 'orders' }).catch(() => ({}));
    console.log("Cols:", data);
}
test();
