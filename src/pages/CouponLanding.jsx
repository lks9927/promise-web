import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Phone, Leaf, MapPin, CheckCircle, AlertTriangle, Gift } from 'lucide-react';
import { matchHangul } from '../lib/hangul';
import { FUNERAL_HOMES_FULL } from '../data/funeralHomes';
import { formatPhoneNumber } from '../utils/formatters';

export default function CouponLanding() {
    const { code } = useParams();
    const [coupon, setCoupon] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [step, setStep] = useState('view'); // 'view' | 'form' | 'success'
    const [submitting, setSubmitting] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [packages, setPackages] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        location: '',
        packageName: ''
    });

    useEffect(() => {
        fetchCoupon();
        fetchPackages();
    }, [code]);

    const fetchCoupon = async () => {
        setLoading(true);
        try {
            const { data, error: fetchError } = await supabase
                .from('coupons')
                .select('*')
                .eq('code', code?.toUpperCase())
                .single();

            if (fetchError || !data) {
                setError('invalid');
                return;
            }

            if (data.status === 'used') {
                setError('used');
                return;
            }

            setCoupon(data);

            // 예비상주 정보가 이미 있으면 자동 채움
            setFormData(prev => ({
                ...prev,
                name: data.recipient_name || '',
                phone: data.recipient_phone ? formatPhoneNumber(data.recipient_phone) : ''
            }));
        } catch (err) {
            console.error(err);
            setError('invalid');
        } finally {
            setLoading(false);
        }
    };

    const fetchPackages = async () => {
        const { data } = await supabase.from('system_config').select('value').eq('key', 'funeral_packages').single();
        if (data?.value) {
            const parsed = JSON.parse(data.value);
            const activePackages = parsed.filter(p => p.active !== false);
            if (activePackages.length > 0) {
                setPackages(activePackages);
                setFormData(prev => ({ ...prev, packageName: prev.packageName || activePackages[0].value }));
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim() || !formData.phone.trim()) {
            alert('이름과 연락처를 입력해주세요.');
            return;
        }
        if (!confirm('장례 접수를 진행하시겠습니까?\n접수 즉시 전문 장례지도사가 연락드립니다.')) return;

        setSubmitting(true);
        try {
            const { data: caseId, error: submitError } = await supabase.rpc('submit_emergency_case', {
                p_name: formData.name,
                p_phone: formData.phone,
                p_location: formData.location || '미정',
                p_package_name: formData.packageName,
                p_coupon_code: code.toUpperCase()
            });

            if (submitError) throw submitError;

            setStep('success');
        } catch (err) {
            console.error(err);
            alert('접수 중 오류가 발생했습니다. 대표번호로 연락주세요.');
        } finally {
            setSubmitting(false);
        }
    };

    // --- 로딩 화면 ---
    if (loading) {
        return (
            <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-[#8E806A] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-[#8E806A] font-medium">쿠폰 정보를 확인하는 중...</p>
                </div>
            </div>
        );
    }

    // --- 에러 화면 ---
    if (error) {
        return (
            <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6">
                <div className="bg-white rounded-3xl shadow-xl border border-[#EAE5D9] p-8 max-w-sm w-full text-center">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold text-[#433831] mb-2">
                        {error === 'used' ? '이미 사용된 쿠폰입니다' : '유효하지 않은 쿠폰입니다'}
                    </h2>
                    <p className="text-[#8E806A] text-sm mb-6">
                        {error === 'used'
                            ? '해당 쿠폰은 이미 장례 접수에 사용되었습니다.'
                            : '쿠폰 코드를 다시 확인해 주세요.'}
                    </p>
                    <Link
                        to="/"
                        className="inline-block bg-[#433831] text-[#FDFBF7] px-6 py-3 rounded-xl font-bold hover:bg-[#322A25] transition-colors"
                    >
                        홈으로 이동
                    </Link>
                </div>
            </div>
        );
    }

    // --- 접수 완료 화면 ---
    if (step === 'success') {
        return (
            <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6">
                <div className="bg-white rounded-3xl shadow-xl border border-[#EAE5D9] p-8 max-w-sm w-full text-center">
                    <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-serif font-bold text-[#433831] mb-2">접수가 완료되었습니다</h2>
                    <p className="text-[#8E806A] leading-relaxed mb-6">
                        {formData.name}님, 접수해주셔서 감사합니다.<br />
                        전문 장례지도사가 곧 연락드리겠습니다.
                    </p>
                    <div className="bg-[#F9F7F2] rounded-xl p-4 mb-6 border border-[#EAE5D9]">
                        <p className="text-sm text-[#8E806A]">
                            <strong>캐시백 금액:</strong> ₩{coupon?.amount?.toLocaleString()}<br />
                            <strong>쿠폰 코드:</strong> {code?.toUpperCase()}
                        </p>
                        <p className="text-xs text-[#A69986] mt-2">
                            * 캐시백은 장례 완료 후 정산 시 적용됩니다.
                        </p>
                    </div>
                    <Link
                        to="/"
                        className="inline-block bg-[#433831] text-[#FDFBF7] px-8 py-3 rounded-xl font-bold hover:bg-[#322A25] transition-colors"
                    >
                        홈으로 이동
                    </Link>
                </div>
            </div>
        );
    }

    // --- 메인: 쿠폰 뷰 + 접수 폼 ---
    return (
        <div className="min-h-screen bg-[#FDFBF7]">
            {/* 헤더 */}
            <header className="bg-[#FDFBF7]/80 backdrop-blur-md border-b border-[#EAE5D9] px-6 py-4 sticky top-0 z-30">
                <div className="max-w-lg mx-auto flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-lg font-bold text-[#433831] font-serif">
                        <img src="/promise_logo_transparent.png" alt="로고" className="w-6 h-6 object-contain" />
                        10년의 약속
                    </Link>
                    <span className="text-xs text-[#8E806A] bg-[#EAE5D9] px-3 py-1 rounded-full font-bold">
                        캐시백 쿠폰
                    </span>
                </div>
            </header>

            <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
                {/* 프리미엄 쿠폰 카드 */}
                <div className="relative overflow-hidden rounded-2xl shadow-xl">
                    {/* 골드 외곽 */}
                    <div style={{
                        background: 'linear-gradient(to right, #cfad6f, #f5deb3, #cfad6f)',
                        padding: '4px'
                    }}>
                        <div className="bg-[#fcfbf9] relative overflow-hidden" style={{ minHeight: 200 }}>
                            {/* 안쪽 테두리 */}
                            <div className="absolute inset-3 border border-[#b89758] rounded-lg pointer-events-none"></div>

                            <div className="flex h-full" style={{ minHeight: 200 }}>
                                {/* 좌측: 브랜드 + 코드 */}
                                <div className="flex-1 flex flex-col justify-center px-6 py-6 relative z-10">
                                    <div className="flex items-center gap-2 mb-3">
                                        <img src="/promise_logo_transparent.png" alt="logo" className="w-5 h-5 object-contain" />
                                        <span className="text-[#2E4A3D] text-xs font-bold tracking-[3px]">10년의 약속</span>
                                    </div>
                                    <div className="text-[#333] text-2xl font-black tracking-[4px] mb-2" style={{ fontFamily: '"Noto Sans KR", sans-serif' }}>
                                        캐시백 쿠폰
                                    </div>
                                    <div className="text-[#888] text-xs mb-3">프리미엄 장례지원 캐시백</div>
                                    <div className="flex items-center gap-2">
                                        <span className="bg-[#2E4A3D] text-[#fcfbf9] text-[10px] px-2 py-0.5 font-bold tracking-[2px]">CODE</span>
                                        <span className="text-[#2E4A3D] font-mono font-bold text-base tracking-[3px]">{code?.toUpperCase()}</span>
                                    </div>
                                </div>

                                {/* 우측: 금액 */}
                                <div className="w-36 flex flex-col items-center justify-center border-l border-[#d4c39e] relative z-10">
                                    <div className="text-[#8c6f37] text-[10px] tracking-[2px] mb-1 font-semibold">CASHBACK</div>
                                    <div className="flex items-baseline">
                                        <span className="text-[#333] text-sm mr-1">₩</span>
                                        <span className="text-[#333] text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>
                                            {coupon?.amount?.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="text-[#999] text-xs mt-3 font-medium">10promise.co.kr</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 안내 메시지 */}
                {coupon?.recipient_name && (
                    <div className="bg-[#F0EDE6] rounded-xl px-5 py-4 border border-[#D4C5A9]">
                        <p className="text-[#433831] font-bold text-sm">
                            {coupon.recipient_name}님을 위한 캐시백 쿠폰입니다.
                        </p>
                        <p className="text-[#8E806A] text-xs mt-1">
                            아래 버튼을 누르면 장례 접수가 즉시 진행됩니다.
                        </p>
                    </div>
                )}

                {/* 접수 폼 */}
                {step === 'view' && (
                    <div className="bg-white rounded-2xl shadow-lg border border-[#EAE5D9] overflow-hidden">
                        <div className="bg-red-50 px-6 py-4 border-b border-red-100">
                            <h3 className="font-bold text-red-700 flex items-center gap-2 text-lg">
                                🚨 긴급 장례 접수
                            </h3>
                            <p className="text-red-600 text-xs mt-1">접수 즉시 전문 장례지도사가 연락드립니다.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-black text-gray-900 mb-2">상주님 성함</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-4 py-3.5 text-lg font-bold rounded-xl border-2 border-[#D4C5A9] bg-[#FDFBF7] focus:ring-4 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-gray-300"
                                    placeholder="상주 성함을 입력하세요"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-black text-gray-900 mb-2">연락처</label>
                                <input
                                    required
                                    type="tel"
                                    className="w-full px-4 py-3.5 text-lg font-bold tracking-wider rounded-xl border-2 border-[#D4C5A9] bg-[#FDFBF7] focus:ring-4 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-gray-300"
                                    placeholder="010-1234-5678"
                                    value={formData.phone}
                                    maxLength={13}
                                    onChange={e => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
                                />
                            </div>

                            <div className="relative">
                                <label className="block text-sm font-black text-gray-900 mb-2">장례식장 위치 (선택)</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-400" />
                                    <input
                                        type="text"
                                        className="w-full pl-11 pr-4 py-3.5 text-lg font-bold rounded-xl border-2 border-[#D4C5A9] bg-[#FDFBF7] focus:ring-4 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-gray-300"
                                        placeholder="예: 서울대병원 장례식장"
                                        value={formData.location}
                                        onChange={e => {
                                            const value = e.target.value;
                                            setFormData({ ...formData, location: value });
                                            if (value.trim().length > 0) {
                                                const filtered = FUNERAL_HOMES_FULL.filter(home =>
                                                    matchHangul(home.name, value) || matchHangul(home.address, value)
                                                );
                                                setSuggestions(filtered.slice(0, 5));
                                            } else {
                                                setSuggestions([]);
                                            }
                                        }}
                                        onBlur={() => setTimeout(() => setSuggestions([]), 200)}
                                    />
                                </div>
                                {suggestions.length > 0 && (
                                    <ul className="absolute z-50 w-full bg-white border border-[#EAE5D9] rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                                        {suggestions.map((home, index) => (
                                            <li
                                                key={index}
                                                className="px-4 py-3 hover:bg-[#F9F7F2] cursor-pointer text-[#5D5C61] border-b border-[#EAE5D9]/30 last:border-none"
                                                onClick={() => {
                                                    setFormData({ ...formData, location: home.name });
                                                    setSuggestions([]);
                                                }}
                                            >
                                                <span className="font-bold">{home.name}</span>
                                                <div className="text-[10px] text-gray-400 mt-0.5">{home.address}</div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-black text-gray-900 mb-2">희망 상품</label>
                                <select
                                    className="w-full px-4 py-3.5 text-lg font-bold rounded-xl border-2 border-[#D4C5A9] bg-[#FDFBF7] focus:ring-4 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
                                    value={formData.packageName}
                                    onChange={e => setFormData({ ...formData, packageName: e.target.value })}
                                >
                                    {packages.length > 0 ? (
                                        packages.map((pkg, idx) => (
                                            <option key={idx} value={pkg.value}>{pkg.label}</option>
                                        ))
                                    ) : (
                                        <option value="">상품 로딩 중...</option>
                                    )}
                                </select>
                            </div>

                            {/* 쿠폰 적용 안내 */}
                            <div className="bg-green-50 rounded-xl px-4 py-3 border border-green-200 flex items-start gap-3">
                                <Gift className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-green-800 font-bold text-sm">
                                        ₩{coupon?.amount?.toLocaleString()} 캐시백 쿠폰이 자동 적용됩니다
                                    </p>
                                    <p className="text-green-600 text-xs mt-0.5">
                                        장례 완료 후 정산 시 캐시백 금액이 차감됩니다.
                                    </p>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-5 rounded-2xl shadow-xl border-b-4 border-red-800 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-xl flex items-center justify-center gap-2"
                            >
                                {submitting ? (
                                    '접수 처리 중...'
                                ) : (
                                    <>
                                        <Phone className="w-5 h-5" />
                                        즉시 장례 접수하기
                                    </>
                                )}
                            </button>

                            <p className="text-center text-xs text-[#8E806A] font-medium">
                                접수 즉시 전문 장례지도사가 연락드립니다.
                            </p>
                        </form>
                    </div>
                )}

                {/* 하단 정보 */}
                <div className="text-center text-xs text-[#A69986] space-y-1 pb-8">
                    <p>© 2026 10년의 약속. All rights reserved.</p>
                    <p>
                        <a href="https://10promise.com" className="underline hover:text-[#433831]">10promise.com</a>
                        {' | '}
                        24시간 연중무휴
                    </p>
                </div>
            </main>
        </div>
    );
}
