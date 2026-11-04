import { supabase } from './supabase';

// UI wiring is intentionally deferred; this only calls the restricted RPC.
export const fetchSDownlineOverview = () => supabase.rpc('s_downline_overview');
