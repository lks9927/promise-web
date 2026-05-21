import React, { useState } from 'react';
import { supabase } from '../lib/supabase'; // Ensure consistent import
import { formatPhoneNumber } from '../utils/formatters';
import { useNavigate } from 'react-router-dom';
import { UserPlus, CheckCircle, Store, Briefcase, User, Truck } from 'lucide-react';
import bcrypt from 'bcryptjs';
import DaumPostcodeEmbed from 'react-daum-postcode';

export default function PartnerApply() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [isAddressOpen, setIsAddressOpen] = useState(false);
    const [phoneChecked, setPhoneChecked] = useState(false);
    const [phoneAvailable, setPhoneAvailable] = useState(false);
    const [phoneChecking, setPhoneChecking] = useState(false);
    const [agreements, setAgreements] = useState({
        terms: false,
        privacy: false,
        marketing: false
    });
    const [modalContent, setModalContent] = useState(null); // 'terms' or 'privacy'
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        password: '',
        confirmPassword: '',
        role: 'customer',
        region: '',
        address: '',
        detailAddress: '',
        // Vendor fields
        companyName: '',
        businessType: '',
        bankName: '',
        bankAccount: '',
        // Business registration fields
        has_business: false,
        business_number: '',
        business_name: '',
        ceo_name: '',
        business_type_biz: '',
        business_item: '',
        tax_email: '',
        business_address: ''
    });

    // 전화번호 중복확인
    const checkDuplicate = async () => {
        if (!formData.phone || formData.phone.length < 13) {
            alert('전화번호를 정확히 입력해주세요. (예: 010-1234-5678)');
            return;
        }
        setPhoneChecking(true);
        try {
            // profiles 테이블에서 동일 전화번호 확인
            const { data: existing, error } = await supabase
                .from('profiles')
                .select('id')
                .eq('phone', formData.phone)
                .limit(1);

            if (error) {
                alert('중복확인 중 오류가 발생했습니다. 다시 시도해주세요.');
                return;
            }

            if (existing && existing.length > 0) {
                setPhoneAvailable(false);
                setPhoneChecked(true);
                alert('이미 등록된 전화번호입니다. 다른 번호를 사용해주세요.');
            } else {
                setPhoneAvailable(true);
                setPhoneChecked(true);
                alert('✅ 사용 가능한 전화번호입니다.');
            }
        } catch (e) {
            alert('중복확인 중 오류: ' + e.message);
        } finally {
            setPhoneChecking(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!agreements.terms || !agreements.privacy) {
            alert('필수 약관 및 개인정보 처리방침에 동의해 주세요.');
            return;
        }

        if (!phoneChecked || !phoneAvailable) {
            alert('전화번호 중복확인을 먼저 해주세요.');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            alert('비밀번호가 일치하지 않습니다.');
            return;
        }

        if (formData.password.length < 6) {
            alert('비밀번호는 최소 6자 이상이어야 합니다.');
            return;
        }

        if (!window.confirm('입력하신 정보로 가입하시겠습니까?')) return;

        setLoading(true);
        let newUserId = null;
        try {
            // Hash the password for the profiles table backup
            const salt = bcrypt.genSaltSync(10);
            const hashedPassword = bcrypt.hashSync(formData.password, salt);
            
            const signupEmail = `${formData.phone.replace(/[^0-9a-zA-Z]/g, '')}@promise10.com`;

            // 1. Create User in Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: signupEmail,
                password: formData.password,
            });

            if (authError) {
                console.error("Auth Signup Error:", authError);
                throw new Error(`인증 서버 등록 실패: ${authError.message}`);
            }

            newUserId = authData.user?.id || crypto.randomUUID();

            const userAgent = navigator.userAgent.toLowerCase();
            let osType = 'web';
            if (/android/i.test(userAgent)) {
                osType = 'android';
            } else if (/iphone|ipad|ipod/i.test(userAgent)) {
                osType = 'ios';
            }

            // 2. Create Profile (with agreement records for legal compliance)
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    {
                        id: newUserId,
                        email: signupEmail,
                        name: formData.name,
                        phone: formData.phone,
                        password: hashedPassword, // bcrypt hashed password
                        role: formData.role,
                        os_type: osType,
                        agreed_terms: agreements.terms,
                        agreed_privacy: agreements.privacy,
                        agreed_marketing: agreements.marketing,
                        agreed_at: new Date().toISOString()
                    }
                ]);

            if (profileError) {
                if (profileError.code !== '23505') {
                    throw profileError;
                }
            }

            // 3-a. Save business registration info if provided
            if (formData.role === 'leader' || (formData.role === 'dealer' && formData.has_business)) {
                const bizUpdate = {
                    has_business: true,
                    business_number: formData.business_number,
                    business_name: formData.business_name,
                    ceo_name: formData.ceo_name,
                    business_type: formData.business_type_biz,
                    business_item: formData.business_item,
                    tax_email: formData.tax_email,
                    business_address: formData.business_address,
                };
                await supabase.from('profiles').update(bizUpdate).eq('id', newUserId);
            }

            // 3. Create Partner Record (Only for Leader/Dealer)
            if (formData.role === 'leader' || formData.role === 'dealer') {
                const { error: partnerError } = await supabase
                    .from('partners')
                    .insert([
                        {
                            user_id: newUserId,
                            region: formData.region || '지역 미정',
                            address: formData.address,
                            detail_address: formData.detailAddress,
                            grade: 'C',
                            status: 'pending'
                        }
                    ]);

                if (partnerError) throw partnerError;
                // alert handled below after all inserts
            } else if (formData.role === 'vendor') {
                // Create Vendor Record
                const { error: vendorError } = await supabase
                    .from('vendors')
                    .insert([
                        {
                            user_id: newUserId,
                            company_name: formData.companyName || formData.name,
                            business_type: formData.businessType || 'other',
                            phone: formData.phone,
                            address: formData.address + (formData.detailAddress ? ' ' + formData.detailAddress : ''),
                            bank_name: formData.bankName,
                            bank_account: formData.bankAccount,
                            status: 'pending'
                        }
                    ]);

                if (vendorError) throw vendorError;
            }

            // Unified success message
            const roleLabels = { leader: '팀장', dealer: '딜러', vendor: '외주업체', customer: '일반고객' };
            const roleLabel = roleLabels[formData.role] || '회원';
            const needsApproval = ['leader', 'dealer', 'vendor'].includes(formData.role);
            alert(
                `🎉 ${formData.name}님, ${roleLabel} 가입이 완료되었습니다!` +
                (needsApproval ? '\n\n관리자 승인 후 활동이 가능합니다.\n승인 완료 시 알림을 보내드립니다.' : '') +
                '\n\n로그인 페이지로 이동합니다.'
            );
            navigate('/');

        } catch (error) {
            console.error('Application Error:', error);

            // auth.signUp 이후 실패 시 고아 계정 방지 — auth 계정 자동 삭제
            if (newUserId) {
                try {
                    await supabase.rpc('cleanup_orphan_auth', { target_user_id: newUserId });
                    console.log('Orphan auth user cleaned up:', newUserId);
                } catch (cleanupErr) {
                    console.error('Orphan cleanup failed:', cleanupErr);
                }
            }

            if (error.code === '23505') {
                alert('이미 등록된 전화번호입니다. 다른 번호로 시도해 주세요.');
            } else {
                alert(`가입 중 오류가 발생했습니다: ${error.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-[#1a1f37] p-8 text-center">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                        <UserPlus className="w-8 h-8 text-amber-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">10년의 약속 가입하기</h1>
                    <p className="text-gray-400 text-sm">함께해주셔서 감사합니다</p>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {/* Role Selection */}
                    <div className="grid grid-cols-4 gap-2">
                        {[
                            { id: 'leader', label: '팀장', icon: Briefcase },
                            { id: 'dealer', label: '딜러', icon: Store },
                            { id: 'vendor', label: '외주업체', icon: Truck },
                            { id: 'customer', label: '일반고객', icon: User }
                        ].map(role => (
                            <button
                                type="button"
                                key={role.id}
                                onClick={() => setFormData({ ...formData, role: role.id })}
                                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${formData.role === role.id
                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                    : 'border-gray-100 hover:border-gray-200 text-gray-500'
                                    }`}
                            >
                                <role.icon className={`w-6 h-6 mb-1 ${formData.role === role.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                                <span className="text-xs font-bold">{role.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                            <input
                                type="text"
                                required
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                placeholder="이름"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
                            <div className="flex gap-2">
                                <input
                                    type="tel"
                                    required
                                    className={`flex-1 px-4 py-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all ${phoneChecked ? (phoneAvailable ? 'border-green-400' : 'border-red-400') : 'border-gray-200'}`}
                                    placeholder="010-1234-5678"
                                    value={formData.phone}
                                    onChange={e => {
                                        setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) });
                                        setPhoneChecked(false);
                                        setPhoneAvailable(false);
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={checkDuplicate}
                                    disabled={phoneChecking || (phoneChecked && phoneAvailable)}
                                    className={`px-4 py-3 rounded-lg font-bold text-sm whitespace-nowrap transition-all ${
                                        phoneChecked && phoneAvailable
                                            ? 'bg-green-500 text-white cursor-default'
                                            : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
                                    } disabled:opacity-60`}
                                >
                                    {phoneChecking ? '확인중...' : phoneChecked && phoneAvailable ? '확인완료 ✓' : '중복확인'}
                                </button>
                            </div>
                            {phoneChecked && !phoneAvailable && (
                                <p className="text-xs text-red-500 mt-1">이미 등록된 전화번호입니다</p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
                                <input
                                    type="password"
                                    required
                                    className={`w-full px-4 py-3 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all ${formData.password.length > 0 && formData.password.length < 6 ? 'border-red-400' : 'border-gray-200'}`}
                                    placeholder="6자 이상"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                />
                                {formData.password.length > 0 && formData.password.length < 6 && (
                                    <p className="text-xs text-red-500 mt-1">6자 이상 입력해주세요</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        required
                                        className={`w-full px-4 py-3 pr-10 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all ${formData.confirmPassword.length > 0 ? (formData.password === formData.confirmPassword ? 'border-green-400' : 'border-red-400') : 'border-gray-200'}`}
                                        placeholder="한 번 더 입력"
                                        value={formData.confirmPassword}
                                        onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                    />
                                    {formData.confirmPassword.length > 0 && (
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lg">
                                            {formData.password === formData.confirmPassword ? '✅' : '❌'}
                                        </span>
                                    )}
                                </div>
                                {formData.confirmPassword.length > 0 && formData.password !== formData.confirmPassword && (
                                    <p className="text-xs text-red-500 mt-1">비밀번호가 일치하지 않습니다</p>
                                )}
                            </div>
                        </div>

                        {/* Business Registration for Leader (required) */}
                        {formData.role === 'leader' && (
                            <div className="space-y-3 bg-purple-50 p-4 border border-purple-200 rounded-xl">
                                <p className="text-xs font-bold text-purple-700 flex items-center gap-1">
                                    <Briefcase className="w-3.5 h-3.5" /> 사업자 정보 (필수 — 팀장은 사업자 등록 필수)
                                </p>
                                {[
                                    { key: 'business_number', label: '사업자등록번호', placeholder: '000-00-00000', required: true },
                                    { key: 'business_name', label: '상호(사업자명)', placeholder: '주식회사 10년', required: true },
                                    { key: 'ceo_name', label: '대표자명', placeholder: '홍길동', required: true },
                                    { key: 'business_type_biz', label: '업태', placeholder: '서비스업' },
                                    { key: 'business_item', label: '종목', placeholder: '장례서비스' },
                                    { key: 'tax_email', label: '세금계산서 이메일', placeholder: 'tax@company.com' },
                                    { key: 'business_address', label: '사업장 주소', placeholder: '서울시 강남구 ...' },
                                ].map(f => (
                                    <div key={f.key}>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}</label>
                                        <input
                                            type="text"
                                            required={f.required}
                                            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                            placeholder={f.placeholder}
                                            value={formData[f.key]}
                                            onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Business Registration for Dealer (optional) - temporarily hidden */}
                        {false && formData.role === 'dealer' && (
                            <div className="space-y-3 bg-purple-50 p-4 border border-purple-100 rounded-xl">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 accent-purple-600"
                                        checked={formData.has_business}
                                        onChange={e => setFormData({ ...formData, has_business: e.target.checked })}
                                    />
                                    <span className="text-xs font-bold text-purple-700">사업자 있음 (체크 시 3.3% 원천징수 미적용)</span>
                                </label>
                                {formData.has_business && [
                                    { key: 'business_number', label: '사업자등록번호', placeholder: '000-00-00000', required: true },
                                    { key: 'business_name', label: '상호(사업자명)', placeholder: '주식회사 10년', required: true },
                                    { key: 'ceo_name', label: '대표자명', placeholder: '홍길동', required: true },
                                    { key: 'business_type_biz', label: '업태', placeholder: '서비스업' },
                                    { key: 'business_item', label: '종목', placeholder: '장례서비스' },
                                    { key: 'tax_email', label: '세금계산서 이메일', placeholder: 'tax@company.com' },
                                    { key: 'business_address', label: '사업장 주소', placeholder: '서울시 강남구 ...' },
                                ].map(f => (
                                    <div key={f.key}>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}</label>
                                        <input
                                            type="text"
                                            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                                            placeholder={f.placeholder}
                                            value={formData[f.key]}
                                            onChange={e => setFormData({ ...formData, [f.key]: e.target.value })}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Activity Region for Leader/Dealer */}
                        {(formData.role === 'leader' || formData.role === 'dealer') && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">활동 지역</label>
                                <select
                                    required
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    value={formData.region}
                                    onChange={e => setFormData({ ...formData, region: e.target.value })}
                                >
                                    <option value="">활동 지역 선택</option>
                                    <option value="서울">서울</option>
                                    <option value="경기 북부">경기 북부</option>
                                    <option value="경기 남부">경기 남부</option>
                                    <option value="인천">인천</option>
                                </select>
                            </div>
                        )}

                        {/* Vendor Detail Fields */}
                        {formData.role === 'vendor' && (
                            <div className="space-y-4 bg-gray-50 p-4 border rounded-xl">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">업체명 (상호명)</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        placeholder="주식회사 10년"
                                        value={formData.companyName}
                                        onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">제공 서비스 (업종)</label>
                                    <select
                                        required
                                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                        value={formData.businessType}
                                        onChange={e => setFormData({ ...formData, businessType: e.target.value })}
                                    >
                                        <option value="">선택하세요</option>
                                        <option value="all">종합 (장례용품/입관꽃/화환)</option>
                                        <option value="flowers">입관꽃 (하늘꽃)</option>
                                        <option value="wreaths">근조화환</option>
                                        <option value="goods">장례 용품</option>
                                        <option value="burial">장지 업체 (납골당 등)</option>
                                        <option value="other">기타</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">은행명</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            placeholder="예: 신한은행"
                                            value={formData.bankName}
                                            onChange={e => setFormData({ ...formData, bankName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">계좌번호</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                            placeholder="숫자만 입력"
                                            value={formData.bankAccount}
                                            onChange={e => setFormData({ ...formData, bankAccount: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">자택 주소</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    className="flex-1 px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-gray-600 focus:outline-none cursor-not-allowed"
                                    placeholder="주소 검색을 진행해주세요"
                                    value={formData.address || ''}
                                />
                                <button
                                    type="button"
                                    onClick={() => setIsAddressOpen(true)}
                                    className="px-4 py-3 bg-[#433831] text-white font-bold rounded-lg hover:bg-[#2C241E] transition-colors whitespace-nowrap"
                                >
                                    주소 검색
                                </button>
                            </div>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                placeholder="상세 주소 (선택)"
                                value={formData.detailAddress || ''}
                                onChange={e => setFormData({ ...formData, detailAddress: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* 약관 동의 */}
                    <div className="space-y-3 bg-gray-50 p-5 rounded-xl border border-gray-200">
                        <label className="flex items-center gap-3 cursor-pointer pb-3 border-b border-gray-200">
                            <input 
                                type="checkbox" 
                                className="w-5 h-5 accent-indigo-600 rounded"
                                checked={agreements.terms && agreements.privacy && agreements.marketing}
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setAgreements({ terms: checked, privacy: checked, marketing: checked });
                                }}
                            />
                            <span className="font-bold text-gray-800">전체 약관에 동의합니다.</span>
                        </label>
                        
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="w-4 h-4 accent-indigo-600 rounded" checked={agreements.terms} onChange={e => setAgreements({...agreements, terms: e.target.checked})} />
                                <span className="text-sm text-gray-700">[필수] 서비스 이용약관 동의</span>
                            </label>
                            <button type="button" onClick={() => setModalContent('terms')} className="text-xs text-gray-500 underline">내용보기</button>
                        </div>
                        
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="w-4 h-4 accent-indigo-600 rounded" checked={agreements.privacy} onChange={e => setAgreements({...agreements, privacy: e.target.checked})} />
                                <span className="text-sm text-gray-700">[필수] 개인정보 수집 및 이용 동의</span>
                            </label>
                            <button type="button" onClick={() => setModalContent('privacy')} className="text-xs text-gray-500 underline">내용보기</button>
                        </div>
                        
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" className="w-4 h-4 accent-indigo-600 rounded" checked={agreements.marketing} onChange={e => setAgreements({...agreements, marketing: e.target.checked})} />
                                <span className="text-sm text-gray-700">[선택] 알림 및 마케팅 정보 수신 동의</span>
                            </label>
                            <button type="button" onClick={() => setModalContent('marketing')} className="text-xs text-gray-500 underline">내용보기</button>
                        </div>
                    </div>

                    {/* Address Search Modal */}
                    {isAddressOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative">
                                <div className="p-4 border-b flex justify-between items-center">
                                    <h3 className="font-bold text-lg">주소 검색</h3>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddressOpen(false)}
                                        className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
                                    >
                                        &times;
                                    </button>
                                </div>
                                <div className="h-[400px]">
                                    <DaumPostcodeEmbed
                                        onComplete={(data) => {
                                            let fullAddress = data.address;
                                            let extraAddress = '';

                                            if (data.addressType === 'R') {
                                                if (data.bname !== '') {
                                                    extraAddress += data.bname;
                                                }
                                                if (data.buildingName !== '') {
                                                    extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName);
                                                }
                                                fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '');
                                            }

                                            setFormData({
                                                ...formData,
                                                address: fullAddress,
                                                // Removed region overwriting since we have a dedicated input for it
                                            });
                                            setIsAddressOpen(false);
                                        }}
                                        style={{ width: '100%', height: '100%' }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? '처리 중...' : '가입하기'}
                    </button>
                </form>
            </div>
            {/* Terms/Privacy Modal */}
            {modalContent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-lg">
                                {modalContent === 'terms' ? '서비스 이용약관' : modalContent === 'privacy' ? '개인정보 처리방침' : '알림 및 마케팅 정보 수신'}
                            </h3>
                            <button type="button" onClick={() => setModalContent(null)} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">&times;</button>
                        </div>
                        <div className="p-6 overflow-y-auto text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                            {modalContent === 'terms' ? `제1조 (목적)
본 약관은 "10년의 약속"(이하 "회사")이 제공하는 플랫폼 서비스의 이용과 관련하여 회사와 파트너(팀장, 딜러, 외주업체 등) 및 회원의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.

제2조 (플랫폼의 성격 및 면책)
1. 회사는 장례 서비스 수요자와 공급자(파트너)를 연결해주는 통신판매중개자이며, 실제 장례 서비스의 제공 및 이행은 배정된 파트너의 책임하에 이루어집니다.
2. 파트너가 제공하는 서비스 품질, 세금계산서 발행, 현장 분쟁 등에 대해 회사는 플랫폼 제공자로서의 책임 외에 직접적인 책임을 지지 않습니다.

제3조 (파트너의 의무)
1. 파트너는 고객에게 최선의 서비스를 제공해야 하며, 회사의 브랜드 이미지를 훼손하는 행위를 해서는 안 됩니다.
2. 파트너는 정산 및 세무 처리를 위해 정확한 계좌번호 및 사업자 정보를 회사에 제공해야 합니다.
3. 파트너는 배정받은 행사를 임의로 타인에게 양도하거나 재하청할 수 없습니다.

제4조 (정산 및 세금)
1. 회사는 파트너가 수행한 업무에 대해 사전에 고지된 수수료율에 따라 대금을 정산하여 파트너가 등록한 계좌로 지급합니다.
2. 개인사업자/법인사업자는 정산 대금에 대한 세금계산서를 발행해야 하며, 미등록 개인(프리랜서)의 경우 회사는 3.3% 원천징수 후 대금을 지급합니다.

제5조 (계약 해지 및 자격 정지)
1. 파트너가 본 약관을 위반하거나 고객 클레임이 누적되는 경우, 회사는 사전 통보 후 파트너 자격을 정지하거나 계약을 해지할 수 있습니다.
2. 부정 배정, 연락 두절, 과도한 추가 요금 요구 등 중대한 위반 시 즉각 자격이 박탈될 수 있습니다.` 
                            : modalContent === 'privacy' ? `1. 수집하는 개인정보 항목
- 필수항목: 이름, 연락처, 비밀번호, 주소
- 선택항목: 상세주소
- 파트너(팀장/딜러/외주) 필수항목: 사업자등록번호, 상호, 대표자명, 업태/종목, 세금계산서 이메일, 은행명, 계좌번호

2. 개인정보 수집 및 이용 목적
- 서비스 가입 및 회원 인증
- 장례 행사 배정, 알림톡/SMS 발송 및 진행 상태 안내
- 파트너 정산 대금 지급 및 원천징수/세무 신고 처리
- 고객 클레임 대응 및 서비스 부정 이용 방지

3. 개인정보 보유 및 이용 기간
- 원칙적으로 회원 탈퇴 시 지체 없이 파기합니다.
- 단, 관련 법령(전자상거래법, 국세기본법 등)에 의거하여 보존할 필요가 있는 경우(예: 대금 결제 및 재화의 공급에 관한 기록 5년, 세무 증빙 자료 5년 등) 해당 기간 동안 안전하게 보관합니다.

4. 개인정보의 제3자 제공
회사는 원활한 서비스 제공을 위해 아래와 같이 개인정보를 제공할 수 있습니다.
- 제공받는 자: 해당 행사에 배정된 파트너(팀장/딜러/외주업체), 결제 대행사, 세무 대리인
- 제공 목적: 행사 진행 및 연락, 대금 결제, 세무 신고
- 제공 항목: 이름, 연락처, 주소 등 서비스 수행에 필요한 최소한의 정보

5. 동의 거부권
이용자는 본 필수 개인정보 수집에 대한 동의를 거부할 권리가 있습니다. 단, 동의를 거부할 경우 회원가입 및 서비스(배정, 정산 등) 이용이 제한됩니다.`
                            : `알림 및 마케팅 정보 수신 동의 (선택)

1. 수신 목적
- 새로운 행사 배정 알림, 정산 완료 안내, 긴급 공지사항 등 서비스 관련 정보 전달
- 프로모션, 이벤트, 신규 기능 안내 등 마케팅 정보 제공

2. 수신 채널
- 카카오 알림톡, SMS/LMS, 앱 푸시 알림

3. 수신 주기
- 서비스 알림: 실시간 (행사 배정, 정산 등 발생 시 즉시)
- 마케팅 정보: 월 최대 4회 이내

4. 수신 거부 방법
- 마이페이지 > 알림 설정에서 언제든지 수신 거부 가능
- 고객센터 연락을 통한 수신 거부 처리
- 수신 거부 시에도 서비스 이용에는 제한이 없습니다.

5. 기타
- 본 동의는 선택사항이며, 동의하지 않으셔도 서비스 이용에 불이익은 없습니다.
- 단, 긴급 공지(시스템 점검 등)는 수신 거부와 관계없이 발송될 수 있습니다.`}
                        </div>
                        <div className="p-4 border-t bg-gray-50 text-right">
                            <button type="button" onClick={() => setModalContent(null)} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700">확인</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
