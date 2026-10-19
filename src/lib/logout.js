import { supabase } from './supabase';

export async function logout() {
    try {
        await supabase.auth.signOut();
    } catch {
        // Logout must still clear the local user when remote sign-out fails.
    }

    try {
        localStorage.removeItem('user');
    } catch {
        // Logout must never throw, including when storage is unavailable.
    }
}
