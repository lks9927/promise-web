const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const defaultPackages = JSON.stringify([
    { value: '기본형', label: '기본형 (390만원)' },
    { value: '고급형', label: '고급형 (490만원)' },
    { value: '프리미엄', label: '프리미엄 (590만원)' },
    { value: 'VIP', label: 'VIP (790만원)' }
]);

async function initPackages() {
    const { data, error } = await supabase
        .from('system_config')
        .insert([{ key: 'funeral_packages', value: defaultPackages, description: '장례 희망 상품 목록 (JSON)' }]);

    if (error) {
        if (error.code === '23505') {
            console.log('funeral_packages config already exists.');
        } else {
            console.error('Error inserting packages config:', error);
        }
    } else {
        console.log('Successfully inserted funeral_packages config.');
    }
}
initPackages();
