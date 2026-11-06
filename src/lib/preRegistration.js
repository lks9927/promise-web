import { supabase } from './supabase';

export const getCouponPublic = (code) => supabase.rpc('get_coupon_public', {
    p_code: code?.toUpperCase()
});

export const getFamilyBenefit = () => supabase.rpc('get_family_benefit_public');

export const submitPreRegistration = ({ code, name, phone, relationship, consent }) => supabase.rpc('submit_pre_registration', {
    p_code: code?.toUpperCase(),
    p_name: name,
    p_phone: phone,
    p_relationship: relationship,
    p_consent: consent
});

export const getMyCardCoupon = () => supabase.rpc('get_my_card_coupon');

export const getMyPreRegistrations = () => supabase.rpc('get_my_pre_registrations');
