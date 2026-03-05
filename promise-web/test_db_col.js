import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkSchema() {
    console.log("Testing insert to notifications table...");

    // We try to insert a dummy record (it might fail due to RLS, but if sender_id is missing, it will complain about the column first)
    const { data, error } = await supabase.from('notifications').insert([{
        user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', // Dummy admin
        sender_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        title: 'Test',
        message: 'Test Message',
        type: 'info'
    }]);

    if (error) {
        console.error("Insert Error:", error.message);
        if (error.message.includes('schema cache')) {
            console.log("\\nSchema cache error detected! The database needs to reload its API schema cache.");
        }
    } else {
        console.log("Insert successful! Column exists and schema cache is updated.");
    }
}

checkSchema();
