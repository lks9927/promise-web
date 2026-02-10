
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedAdmin() {
    const users = [
        {
            id: crypto.randomUUID(),
            name: '최고관리자',
            phone: 'admin',
            password: '1234',
            role: 'admin',
            email: 'admin@promise.com'
        },
        {
            id: crypto.randomUUID(),
            name: '운영자',
            phone: 'manager',
            password: '1234',
            role: 'admin',
            email: 'manager@promise.com'
        }
    ];

    for (const user of users) {
        // Check if user exists
        const { data: existingUser } = await supabase
            .from('profiles')
            .select('id')
            .eq('phone', user.phone)
            .single();

        if (existingUser) {
            // Update
            const { error } = await supabase
                .from('profiles')
                .update({
                    password: user.password,
                    role: user.role,
                    name: user.name
                })
                .eq('phone', user.phone);

            if (error) console.error(`Error updating ${user.name}:`, error);
            else console.log(`Updated ${user.name} (${user.phone})`);
        } else {
            // Insert
            const { error } = await supabase
                .from('profiles')
                .insert(user);

            if (error) console.error(`Error inserting ${user.name}:`, error);
            else console.log(`Inserted ${user.name} (${user.phone})`);
        }
    }
}

seedAdmin();
