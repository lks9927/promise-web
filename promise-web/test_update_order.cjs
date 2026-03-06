require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
    const { data, error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', '00000000-0000-0000-0000-000000000000').select();
    console.log("Update check:", error || "Ok");
}
test();
