import { supabase } from './supabase';

export const DEFAULT_ELDER_LABEL = '어르신';
export const getElderLabel = (value) => value?.trim() || DEFAULT_ELDER_LABEL;

export const getCouponPublic = (code) => supabase.rpc('get_coupon_public', {
    p_code: code?.toUpperCase()
});

export const getFamilyBenefit = () => supabase.rpc('get_family_benefit_public');

export const submitPreRegistration = ({ code, name, phone, relationship, consent, elderName, regionId }) => supabase.rpc('submit_pre_registration', {
    p_code: code?.toUpperCase(),
    p_name: name,
    p_phone: phone,
    p_relationship: relationship,
    p_consent: consent,
    p_elder_name: elderName || null,
    p_region_id: regionId || null
});

export const getMyCardCoupon = (dealerId) => supabase.rpc('get_my_card_coupon', dealerId ? { p_dealer: dealerId } : {});

export const getMyPreRegistrations = (dealerId) => supabase.rpc('get_my_pre_registrations', dealerId ? { p_dealer: dealerId } : {});
