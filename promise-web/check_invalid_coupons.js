
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkInvalidCoupons() {
    const { data: cases } = await supabase.from('funeral_cases').select('coupon_code').not('coupon_code', 'is', null);
    const codesInCases = cases.map(c => c.coupon_code);

    const { data: coupons } = await supabase.from('coupons').select('code');
    const validCodes = coupons.map(c => c.code);

    const invalidCodes = codesInCases.filter(c => !validCodes.includes(c));
    console.log("Invalid codes in funeral_cases:", invalidCodes);
}

checkInvalidCoupons();
