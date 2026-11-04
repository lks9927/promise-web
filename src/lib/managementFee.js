import { supabase } from './supabase';

// The RPC intentionally returns aggregates only; no case or customer data is exposed.
export const fetchMyManagementFeeSummary = (month) =>
    supabase.rpc('my_management_fee_summary', month ? { p_month: month } : {});
