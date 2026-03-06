require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function test() {
    const { data, error } = await supabase.from('funeral_cases').select('id, orders(*, vendors(company_name), deliveries(*))').limit(10);
    console.log("Data:", JSON.stringify(data, null, 2));
    if (error) console.error("Error:", JSON.stringify(error, null, 2));
}
test();
