import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
    Phone, Leaf,
    PhoneCall, HeartHandshake, ShieldCheck, Activity, UserPlus,
    Users, Shield, Clock, Heart, Mail
} from 'lucide-react';
import { matchHangul } from '../lib/hangul';
import { FUNERAL_HOMES_FULL } from '../data/funeralHomes';
import { formatPhoneNumber } from '../utils/formatters';
import { RegionSelect } from '../components/common/RegionSelect';

// 대표전화·회사명은 화면 표기를 코드에서 고정한다 (운영 DB 푸터 값과 무관하게 일관되게 표시)
const REP_PHONE = '031-514-1338';
const COMPANY_NAME = '누어텍';

export default function Home() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', phone: '', location: '', packageName: '', couponCode: '', regionId: null });
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [packages, setPackages] = useState([]);
    const [footerInfo, setFooterInfo] = useState({
        phone: REP_PHONE,
        hours: '24시간 연중무휴',
        email: 'help@promise10.com',
        company_name: COMPANY_NAME,
        ceo_name: '',
        business_number: '',
        address: ''
    });

    const [user, setUser] = useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Mobile Menu State

    // 히어로 이미지 슬라이드쇼
    const HERO_IMAGES = ['/landing/story_memorial.webp'];
    const HERO_ALTS = ['햇살 드는 추모공원에서 고인을 기억하는 가족 (연출 이미지)'];
    const [heroIndex, setHeroIndex] = useState(0);
    useEffect(() => {
        if (HERO_IMAGES.length < 2) return undefined;
        const t = setInterval(() => setHeroIndex(p => (p + 1) % HERO_IMAGES.length), 4000);
        return () => clearInterval(t);
    }, []);

    // 스토리 이미지 슬라이드쇼
    const STORY_IMAGES = ['/landing/story_widow.webp', '/landing/story_remember.webp', '/landing/hero_balin.webp'];
    const STORY_ALTS = [
        '홀로 남으신 어머니 곁에서 따뜻한 물을 건네는 장례지도사 (연출 이미지)',
        '고인을 기억하며 함께 시간을 보내는 가족 (연출 이미지)',
        '영정 사진을 든 상주와 가족이 장례식장을 나서는 모습 (연출 이미지)',
    ];
    const [storyIndex, setStoryIndex] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setStoryIndex(p => (p + 1) % STORY_IMAGES.length), 5000);
        return () => clearInterval(t);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Simple success alert for now (or implement actual submission logic)
        try {
            let linkedCoupon = null;
            if (formData.couponCode && formData.couponCode.trim()) {
                const { data: coupon, error: couponError } = await supabase.rpc('get_coupon_public', {
                    p_code: formData.couponCode.trim().toUpperCase()
                });

                if (couponError || !coupon) {
                    throw new Error('유효하지 않은 쿠폰 번호입니다.');
                }
                if (coupon.status === 'used') {
                    throw new Error('이미 사용된 쿠폰입니다.');
                }
                linkedCoupon = coupon;
            }

            // 1. RPC 호출을 통한 안전한 긴급 접수 (백엔드에서 재방문 체크, 프로필 생성, 접수 및 쿠폰 연결 일괄 처리)
            const { data: caseId, error: submitError } = await supabase.rpc('submit_emergency_case', {
                p_name: formData.name,
                p_phone: formData.phone,
                p_location: formData.location,
                p_package_name: formData.packageName,
                p_coupon_code: formData.couponCode ? formData.couponCode.trim().toUpperCase() : null,
                p_region_id: formData.regionId || null
            });

            if (submitError) throw submitError;

            alert('긴급 접수가 완료되었습니다.\n팀장이 곧 연락드리겠습니다.');
            setIsModalOpen(false);
            setFormData({ name: '', phone: '', location: '', packageName: packages.length > 0 ? packages[0].value : '', couponCode: '', regionId: null });
        } catch (error) {
            console.error(error);
            alert('접수 중 오류가 발생했습니다.\n대표번호 ' + REP_PHONE + '로 전화 주세요.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Check for logged in user
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }

        const fetchPackages = async () => {
            const { data } = await supabase.from('system_config').select('value').eq('key', 'funeral_packages').single();
            if (data?.value) {
                const parsed = JSON.parse(data.value);
                const activePackages = parsed.filter(p => p.active !== false);
                if (activePackages.length > 0) {
                    setPackages(activePackages);
                    setFormData(prev => ({ ...prev, packageName: activePackages[0].value }));
                }
            }
        };
        const fetchFooterInfo = async () => {
            const { data } = await supabase.from('system_config').select('*').in('key', [
                'footer_phone', 'footer_hours', 'footer_email',
                'footer_company_name', 'footer_ceo_name', 'footer_business_number', 'footer_address', 'footer_mail_order'
            ]);
            if (data && data.length > 0) {
                const info = { phone: REP_PHONE, hours: '24시간 연중무휴', email: 'help@promise10.com', company_name: COMPANY_NAME, ceo_name: '', business_number: '', address: '', mail_order: '' };
                data.forEach(item => {
                    if (item.key === 'footer_hours') info.hours = item.value;
                    if (item.key === 'footer_email') info.email = item.value;
                    if (item.key === 'footer_ceo_name') info.ceo_name = item.value;
                    if (item.key === 'footer_business_number') info.business_number = item.value;
                    if (item.key === 'footer_address') info.address = item.value;
                    if (item.key === 'footer_mail_order') info.mail_order = item.value;
                });
                setFooterInfo(info);
            }
        };

        fetchPackages();
        fetchFooterInfo();
    }, []);

    // Helper to get dashboard link based on role
    const getDashboardLink = (role) => {
        switch (role) {
            case 'admin': return '/admin?role=super';
            case 'master': return '/master';
            case 'leader': return '/leader';
            case 'dealer': return '/dealer';
            case 'customer': return '/mypage';
            default: return '/';
        }
    };

    return (
        <div className="min-h-screen font-sans text-[#5D5C61] bg-[#FDFBF7]">
            {/* Navigation (Transparent Warm) */}
            <nav className="fixed w-full z-50 transition-all duration-300 bg-[#FDFBF7]/80 backdrop-blur-md border-b border-[#EAE5D9]">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-2xl font-bold text-[#433831] font-serif tracking-tight cursor-pointer hover:opacity-80 transition-opacity">
                        <img src="/promise_logo_transparent.png" alt="10년의 약속 로고" className="w-8 h-8 object-contain" />
                        10년의 약속
                    </Link>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex gap-8 items-center">
                        <a href="#story" className="text-[#8E806A] hover:text-[#433831] font-medium transition-colors">브랜드 스토리</a>
                        <a href="#process" className="text-[#8E806A] hover:text-[#433831] font-medium transition-colors">진행 절차</a>

                        {/* Login Status Indicator */}
                        {user ? (
                            <Link
                                to={getDashboardLink(user.role)}
                                className="flex items-center gap-2 bg-[#EAE5D9]/50 px-4 py-2 rounded-full hover:bg-[#EAE5D9] transition-colors"
                            >
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                <span className="text-[#433831] font-bold text-sm">{user.name}님</span>
                                <span className="text-[#8E806A] text-xs">({user.role === 'leader' ? '팀장' : user.role === 'dealer' ? '딜러' : '고객'})</span>
                            </Link>
                        ) : (
                            <Link to="/login" className="text-[#8E806A] hover:text-[#433831] font-medium transition-colors">로그인</Link>
                        )}

                        <a href="/apply" className="text-[#8E806A] hover:text-[#433831] font-medium transition-colors">파트너 제휴</a>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="bg-[#433831] text-[#FDFBF7] px-6 py-2.5 rounded-full font-bold hover:bg-[#322A25] transition-all shadow-md hover:shadow-lg"
                        >
                            긴급 접수
                        </button>
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        className="md:hidden p-2 text-[#433831]"
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    >
                        {isMobileMenuOpen ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 18 18" /></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
                        )}
                    </button>
                </div>

                {/* Mobile Menu Dropdown */}
                {isMobileMenuOpen && (
                    <div className="md:hidden absolute top-20 left-0 w-full bg-[#FDFBF7] border-b border-[#EAE5D9] shadow-lg flex flex-col p-6 gap-4 animate-in slide-in-from-top-2">
                        <a
                            href="#story"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="text-[#8E806A] hover:text-[#433831] font-medium p-2"
                        >
                            브랜드 스토리
                        </a>
                        <a
                            href="#process"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="text-[#8E806A] hover:text-[#433831] font-medium p-2"
                        >
                            진행 절차
                        </a>
                        <a
                            href="/apply"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="text-[#8E806A] hover:text-[#433831] font-medium p-2"
                        >
                            파트너 제휴
                        </a>

                        {user ? (
                            <Link
                                to={getDashboardLink(user.role)}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="flex items-center gap-2 bg-[#EAE5D9]/50 px-4 py-3 rounded-xl hover:bg-[#EAE5D9] transition-colors"
                            >
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                <span className="text-[#433831] font-bold text-sm">{user.name}님</span>
                                <span className="text-[#8E806A] text-xs">({user.role === 'leader' ? '팀장' : user.role === 'dealer' ? '딜러' : '고객'})</span>
                            </Link>
                        ) : (
                            <Link
                                to="/login"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="text-[#8E806A] hover:text-[#433831] font-medium p-2"
                            >
                                로그인
                            </Link>
                        )}

                        <button
                            onClick={() => {
                                setIsMobileMenuOpen(false);
                                setIsModalOpen(true);
                            }}
                            className="bg-[#433831] text-[#FDFBF7] px-6 py-3 rounded-xl font-bold hover:bg-[#322A25] transition-all shadow-md w-full"
                        >
                            긴급 접수
                        </button>
                    </div>
                )}
            </nav>

            {/* Hero Section (Emotional & Warm) */}
            <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 px-6 overflow-hidden">
                <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
                    <div className="relative z-10 order-2 lg:order-1 text-center lg:text-left">
                        <div className="inline-block px-4 py-1.5 rounded-full bg-[#EAE5D9] text-[#8E806A] font-bold text-sm mb-6 tracking-wide">
                            <span className="mr-2">🌿</span> 국가 공인 장례지도사 실명제
                        </div>
                        <h1 className="text-3xl sm:text-4xl md:text-6xl font-serif font-bold text-[#433831] leading-tight mb-8 break-keep">
                            절차 없이,<br />
                            <span className="text-[#A69076]">바로 곁에</span> 서겠습니다
                        </h1>
                        <p className="text-lg md:text-xl text-[#7A7267] leading-relaxed mb-3 max-w-lg mx-auto lg:mx-0">
                            이름과 연락처만 남기시면{' '}<br className="hidden md:block" />
                            장례지도사 팀장이 직접 전화드립니다.
                        </p>
                        <p className="text-sm text-[#A69986] mb-10 max-w-lg mx-auto lg:mx-0">
                            가입 없이, 필요할 때만 이용하는 후불 장례
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="bg-[#8E806A] hover:bg-[#7A6C56] text-white px-8 py-4 rounded-xl font-bold text-lg shadow-xl shadow-[#8E806A]/20 flex items-center justify-center gap-3 transition-all transform hover:-translate-y-1"
                            >
                                <Phone className="w-5 h-5" />
                                긴급 상담 요청
                            </button>
                            <a href="#pricing" className="bg-white hover:bg-[#FAF9F5] text-[#8E806A] border border-[#D4C5A9] px-8 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-colors">
                                상품 안내 보기
                            </a>
                        </div>
                    </div>
                    {/* 히어로 이미지 — 3장 크로스페이드 슬라이드쇼 */}
                    <div className="order-1 lg:order-2 relative mx-auto w-full max-w-[500px] aspect-[4/5] bg-gradient-to-br from-[#dcd3c2] to-[#b0a088] rounded-t-full rounded-b-[200px] overflow-hidden shadow-2xl ring-8 ring-white">
                        {HERO_IMAGES.map((src, idx) => (
                            <img
                                key={src}
                                src={src}
                                alt={HERO_ALTS[idx] || '연출 이미지'}
                                className={`absolute inset-0 w-full h-full object-cover object-[48%_50%] transition-opacity duration-[1500ms] ease-in-out ${
                                    idx === heroIndex ? 'opacity-100' : 'opacity-0'
                                }`}
                            />
                        ))}
                        {/* 디밍 오버레이 */}
                        <div className="absolute inset-0 bg-gradient-to-b from-[#EAE5D9]/20 via-transparent to-[#C9BCAB]/50 pointer-events-none z-10"></div>
                        {/* 슬라이드 인디케이터 */}
                        <span className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 text-[11px] leading-none text-white bg-black/40 px-2 py-1 rounded-full whitespace-nowrap">연출 이미지</span>
                        {HERO_IMAGES.length > 1 && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
                            {HERO_IMAGES.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setHeroIndex(idx)}
                                    className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                                        idx === heroIndex ? 'bg-white w-4' : 'bg-white/50'
                                    }`}
                                />
                            ))}
                        </div>}
                        {/* Decorative Circle */}
                        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-[#FDFBF7] rounded-full opacity-30 blur-2xl z-0"></div>
                    </div>
                </div>

                {/* Abstract Background Elements */}
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#F5F0E6] rounded-full blur-3xl opacity-60 -z-10 translate-x-1/2 -translate-y-1/4"></div>
            </section>

            {/* Story Section (Zig-zag) */}
            <section id="story" className="py-24 bg-white relative">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid md:grid-cols-2 gap-16 items-center mb-24">
                        {/* 스토리 이미지 — 3장 크로스페이드 슬라이드쇼 */}
                        <div className="relative rounded-2xl overflow-hidden aspect-video shadow-lg order-2 md:order-1 bg-[#EAE5D9]">
                            {STORY_IMAGES.map((src, idx) => (
                                <img
                                    key={src}
                                    src={src}
                                    alt={STORY_ALTS[idx] || '연출 이미지'}
                                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[1500ms] ease-in-out ${
                                        idx === storyIndex ? 'opacity-100' : 'opacity-0'
                                    }`}
                                />
                            ))}
                            {/* 디밍 오버레이 */}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#433831]/40 to-transparent pointer-events-none z-10"></div>
                            <span className="absolute top-3 right-3 z-20 text-[11px] leading-none text-white bg-black/40 px-2 py-1 rounded-full">연출 이미지</span>
                            {/* 슬라이드 인디케이터 */}
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
                                {STORY_IMAGES.map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setStoryIndex(idx)}
                                        className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                                            idx === storyIndex ? 'bg-white w-4' : 'bg-white/50'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="order-1 md:order-2">
                            <h3 className="text-[#8E806A] font-bold mb-4 tracking-widest text-sm uppercase">Sincerity</h3>
                            <h2 className="text-3xl md:text-4xl font-serif font-bold text-[#433831] mb-6 leading-snug">
                                가격보다는<br />
                                <span className="text-black/80 underline decoration-[#D4C5A9]/50 underline-offset-4">진심</span>을 더했습니다.
                            </h2>
                            <p className="text-[#6E6D74] leading-loose mb-6">
                                중간 과정을 줄인 만큼, 부담도 줄었습니다.
                            </p>
                            <div className="flex gap-4">
                                <div className="flex flex-col items-center p-4 bg-[#F9F7F2] rounded-xl min-w-[100px]">
                                    <span className="text-2xl font-bold text-[#8E806A]">0원</span>
                                    <span className="text-xs text-gray-500 mt-1">가입비/월 납입금</span>
                                </div>
                                <div className="flex flex-col items-center p-4 bg-[#F9F7F2] rounded-xl min-w-[100px]">
                                    <span className="text-lg font-bold text-[#8E806A] leading-8">현금영수증</span>
                                    <span className="text-xs text-gray-500 mt-1">발행 가능</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>




            {/* 대표 소개 */}
            <section id="about" className="py-24 bg-[#FDFBF7]">
                <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 md:gap-16 items-center">
                    <div className="rounded-2xl overflow-hidden shadow-lg ring-1 ring-[#EAE5D9] bg-[#EAE5D9]">
                        <img
                            src="/flowers/flower_bouquet.webp"
                            alt="흰 포장지에 감싼 꽃다발"
                            loading="lazy"
                            width="1200"
                            height="675"
                            className="w-full h-auto object-cover"
                        />
                    </div>
                    <div className="relative rounded-2xl overflow-hidden bg-[#F5F0E6]">
                        <img
                            src="/flowers/flower_arrangement_2.webp"
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            width="1200"
                            height="670"
                            className="absolute inset-0 w-full h-full object-cover opacity-60"
                        />
                        <div className="relative px-8 py-12 sm:px-12 sm:py-16 bg-white/60">
                            <h3 className="text-[#8E806A] font-bold mb-4 tracking-widest text-sm uppercase">About</h3>
                            <h2 className="text-3xl md:text-4xl font-serif font-bold text-[#433831] mb-6 leading-snug">
                                곁에서 지켜본 사람이<br />연결합니다
                            </h2>
                            <p className="text-[#5D5C61] leading-loose mb-4 break-keep">
                                입관식에 쓰이는 꽃을 다년간 납품하며 장례지도사 팀장님들과 현장에서 함께 일해 왔습니다.
                            </p>
                            <p className="text-sm text-[#7A7267] leading-relaxed mb-8 break-keep">
                                필요한 구성은 가족이 직접 선택하시고, 결정을 서두르게 하지 않습니다.
                            </p>
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="bg-[#433831] hover:bg-[#322A25] text-[#FDFBF7] px-8 py-3.5 rounded-xl font-bold shadow-md transition-all"
                            >
                                긴급 상담 요청
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Service Features (Soft Cards) */}
            <section className="py-24 bg-[#FDFBF7]">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-serif font-bold text-[#433831] mb-4">지킬 수 있는 약속만 드립니다</h2>
                        <p className="text-[#8E806A]">지키는 3가지 원칙</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <FeatureCard
                            icon={<Users className="w-10 h-10 text-[#8E806A]" />}
                            title="전담 팀장 실명제"
                            desc="국가 공인 자격을 갖춘 장례지도사 팀장이 실명으로 안내하고 끝까지 함께합니다."
                        />
                        <FeatureCard
                            icon={<Shield className="w-10 h-10 text-[#8E806A]" />}
                            title="투명한 정산 리포트"
                            desc="장례 종료 후 항목별로 상세히 기재된 정산 내역을 제공합니다. 부당하다고 느껴지는 요구는 언제든 본사에 알려 주세요."
                        />
                        <FeatureCard
                            icon={<Clock className="w-10 h-10 text-[#8E806A]" />}
                            title="24시간 전국 연결"
                            desc="전국 어디서든 연락 주시면 가까운 지역의 팀장을 신속하게 연결해 드립니다."
                        />
                    </div>
                </div>
            </section>

            {/* Pricing Section */}
            <PricingSection packagesData={packages} onConsult={() => setIsModalOpen(true)} />

            {/* Rolling Ticker Section — 페이지 중간 */}
            <RollingTicker />

            {/* Process Section */}
            <section id="process" className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-serif font-bold text-[#433831]">복잡한 절차, 걱정하지 마세요</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <ProcessStep number="01" title="긴급 장례 접수" desc="전화 또는 웹으로 이름과 연락처를 남겨 주세요." />
                        <ProcessStep number="02" title="팀장 연결" desc="전담 팀장이 직접 전화드리고 장례식장으로 이동합니다." />
                        <ProcessStep number="03" title="장례 진행" desc="입관부터 발인까지 3일간 정성을 다해 모십니다." />
                        <ProcessStep number="04" title="투명한 정산" desc="모든 절차 종료 후 꼼꼼하게 정산 내역을 확인합니다." />
                    </div>
                </div>
            </section>

        {/* Footer */}
            <footer className="bg-[#EAE5D9]/50 pt-16 pb-8 border-t border-[#D4C5A9]/30">
                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-6 mb-12">
                    <div className="md:col-span-2">
                        <div className="text-3xl font-bold text-[#433831] font-serif mb-4 flex items-center gap-3"><img src="/promise_logo_transparent.png" alt="로고" className="w-10 h-10 object-contain" />10년의 약속</div>
                        <p className="text-[#8E806A] text-sm leading-relaxed">
                            가장 슬픈 날, 가장 든든한 가족이 되어드리겠습니다.<br />
                            진심을 담은 서비스로 마지막 가시는 길을 평온하게 지킵니다.
                        </p>
                    </div>
                    <div className="md:col-span-2 flex flex-col md:items-end">
                        <div className="w-full md:w-auto">
                            <h4 className="font-bold text-[#433831] mb-6 text-left">고객 센터</h4>
                            <ul className="space-y-3 text-[#8E806A] text-sm text-left">
                                <li className="flex items-center justify-start gap-2"><Phone className="w-4 h-4 opacity-70"/> <strong>대표전화:</strong> <a href={`tel:${footerInfo.phone.replace(/[^0-9]/g, '')}`} className="hover:text-[#433831] underline-offset-2 hover:underline">{footerInfo.phone}</a></li>
                                <li className="flex items-center justify-start gap-2"><Clock className="w-4 h-4 opacity-70"/> <strong>운영시간:</strong> {footerInfo.hours}</li>
                                <li className="flex items-center justify-start gap-2"><Mail className="w-4 h-4 opacity-70"/> <strong>이메일:</strong> {footerInfo.email}</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-6 border-t border-[#D4C5A9]/30 pt-8 flex flex-col lg:flex-row justify-between items-start gap-6">
                    <div className="text-xs text-[#A69986] leading-relaxed space-y-2">
                         <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                            {footerInfo.company_name && <span><strong>상호:</strong> {footerInfo.company_name}</span>}
                            {footerInfo.company_name && <span className="opacity-40">|</span>}
                            {footerInfo.ceo_name && <span><strong>대표:</strong> {footerInfo.ceo_name}</span>}
                            {footerInfo.ceo_name && <span className="opacity-40">|</span>}
                            {footerInfo.business_number && <span><strong>사업자등록번호:</strong> {footerInfo.business_number}</span>}
                            {footerInfo.mail_order && <span className="opacity-40">|</span>}
                            {footerInfo.mail_order && <span><strong>통신판매업신고:</strong> {footerInfo.mail_order}</span>}
                         </div>
                         {footerInfo.address && <div><strong>주소:</strong> {footerInfo.address}</div>}
                         {(!footerInfo.company_name && !footerInfo.business_number) && <div>사업자 정보 설정 전</div>}
                         {footerInfo.company_name && <div className="mt-3 text-[#8E806A] font-medium">본 사이트는 {footerInfo.company_name}에서 운영하는 통신판매중개 플랫폼입니다.</div>}
                    </div>
                    <div className="text-[#A69986] text-xs text-left lg:text-right shrink-0 pb-4">
                        <p>© 2026 {footerInfo.company_name || 'Promise of 10 Years'}. All rights reserved.</p>
                    </div>
                </div>
            </footer>

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#433831]/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-[#FDFBF7] w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/50">
                        <div className="px-8 py-4 sm:py-6 border-b border-[#EAE5D9] flex justify-between items-center bg-red-50 shrink-0">
                            <h3 className="font-serif font-black text-2xl text-red-600 flex items-center gap-2">🚨 긴급 장례 접수</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-[#8E806A] hover:text-[#433831] text-3xl leading-none px-2 shrink-0">&times;</button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-4 sm:space-y-5 overflow-y-auto">
                            <div>
                                <label className="block text-base font-black text-gray-900 mb-2">상주님 성함</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-5 py-4 text-xl font-bold rounded-xl border-2 border-[#D4C5A9] bg-white focus:ring-4 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-gray-300"
                                    placeholder="상주 성함을 입력하세요"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-base font-black text-gray-900 mb-2">연락처</label>
                                <input
                                    required
                                    type="tel"
                                    className="w-full px-5 py-4 text-xl font-bold tracking-wider rounded-xl border-2 border-[#D4C5A9] bg-white focus:ring-4 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-gray-300"
                                    placeholder="010-1234-5678"
                                    value={formData.phone}
                                    maxLength={13}
                                    onChange={e => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
                                />
                            </div>

                            <div className="relative">
                                <label className="block text-base font-black text-gray-900 mb-2">현재 위치 (장례식장)</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-5 py-4 text-xl font-bold rounded-xl border-2 border-[#D4C5A9] bg-white focus:ring-4 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-gray-300"
                                    placeholder="예: 서울대병원 장례식장"
                                    value={formData.location}
                                    onChange={e => {
                                        const value = e.target.value;
                                        setFormData({ ...formData, location: value });

                                        if (value.trim().length > 0) {
                                            const filtered = FUNERAL_HOMES_FULL.filter(home =>
                                                matchHangul(home.name, value) ||
                                                matchHangul(home.address, value)
                                            );
                                            setSuggestions(filtered.slice(0, 5)); // Limit to 5 suggestions
                                        } else {
                                            setSuggestions([]);
                                        }
                                    }}
                                    onBlur={() => setTimeout(() => setSuggestions([]), 200)} // Delay to allow click
                                />
                                {suggestions.length > 0 && (
                                    <ul className="absolute z-50 w-full bg-white border border-[#EAE5D9] rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                                        {suggestions.map((home, index) => (
                                            <li
                                                key={index}
                                                className="px-4 py-3 hover:bg-[#F9F7F2] cursor-pointer text-[#5D5C61] border-b border-[#EAE5D9]/30 last:border-none group"
                                                onClick={() => {
                                                    setFormData({ ...formData, location: home.name });
                                                    setSuggestions([]);
                                                }}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold">{home.name}</span>
                                                    <span className="text-xs text-[#8E806A] opacity-0 group-hover:opacity-100 transition-opacity">선택</span>
                                                </div>
                                                <div className="text-[10px] text-gray-400 mt-0.5">{home.address}</div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div className="mt-3"><label className="block text-sm font-bold text-gray-700 mb-1">장례식장 지역 <span className="text-xs font-normal text-gray-500">(선택, 장례식장이 있는 곳 기준)</span></label><RegionSelect value={formData.regionId} onChange={regionId => setFormData({ ...formData, regionId })} /></div>
                            </div>
                            <div className="relative">
                                <label className="block text-base font-black text-gray-900 mb-2">희망 상품</label>
                                <select
                                    className="w-full px-5 py-4 text-xl font-bold rounded-xl border-2 border-[#D4C5A9] bg-white focus:ring-4 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all"
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

                            <div>
                                <label className="block text-base font-black text-gray-900 mb-2">쿠폰 번호 (선택)</label>
                                <input
                                    type="text"
                                    className="w-full px-5 py-4 text-xl font-bold rounded-xl border-2 border-[#D4C5A9] bg-white focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-300"
                                    placeholder="쿠폰 코드를 입력하세요"
                                    value={formData.couponCode}
                                    onChange={e => setFormData({ ...formData, couponCode: e.target.value.toUpperCase() })}
                                />
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-5 rounded-2xl shadow-xl border-b-4 border-red-800 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-2xl flex items-center justify-center"
                                >
                                    {loading ? '접수 처리 중...' : '🔴 즉시 출동 요청하기'}
                                </button>
                                <p className="text-center text-xs text-[#8E806A] mt-4 font-medium">
                                    접수 즉시 전문 장례지도사가 연락드립니다.
                                </p>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function FeatureCard({ icon, title, desc }) {
    return (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-[#EAE5D9]/50 hover:shadow-md transition-all hover:-translate-y-1">
            <div className="w-16 h-16 rounded-2xl bg-[#FDFBF7] flex items-center justify-center mb-6">
                {icon}
            </div>
            <h3 className="text-xl font-serif font-bold text-[#433831] mb-3">{title}</h3>
            <p className="text-[#6E6D74] leading-relaxed text-sm">{desc}</p>
        </div>
    );
}

function ProcessStep({ number, title, desc }) {
    return (
        <div className="relative p-6 rounded-2xl border border-[#EAE5D9] hover:bg-[#FDFBF7] transition-colors text-center group">
            <div className="text-4xl font-serif font-black text-[#EAE5D9] group-hover:text-[#D4C5A9] mb-4 transition-colors">
                {number}
            </div>
            <h4 className="font-bold text-[#433831] mb-2">{title}</h4>
            <p className="text-xs text-[#8E806A]">{desc}</p>
        </div>
    );
}

// 이름 마스킹 함수 — 개인정보 보호 (프런트엔드 이중 처리)
function maskKoreanName(name) {
    if (!name || name === '익명') return '익명';
    const str = String(name).trim();
    if (str.length <= 1) return str;
    if (str.length === 2) return str[0] + '*';
    return str[0] + '*'.repeat(str.length - 2) + str[str.length - 1];
}

function RollingTicker() {
    const [cases, setCases] = useState([]);

    useEffect(() => {
        const fetchCases = async () => {
            const { data, error } = await supabase.rpc('get_public_rolling_cases');
            if (error) console.error("RollingTicker Error:", error);
            if (data) setCases(data);
        };
        fetchCases();

        // Refresh every 5 minutes
        const interval = setInterval(fetchCases, 300000);
        return () => clearInterval(interval);
    }, []);

    // 실제 진행 건이 없으면 영역 전체를 숨긴다 (가짜 샘플 표시 금지)
    const displayCases = cases;
    if (displayCases.length === 0) return null;

    return (
        <div className="bg-[#433831] h-32 overflow-hidden relative flex flex-col justify-center">
            {/* 좌우 프라이버시 디밍 오버레이 — 복원 */}
            <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-[#433831] to-transparent z-20 pointer-events-none"></div>
            <div className="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-[#433831] to-transparent z-20 pointer-events-none"></div>
            {/* Gradients for vertical fade */}
            <div className="absolute left-0 right-0 top-0 h-8 bg-gradient-to-b from-[#433831] to-transparent z-10"></div>
            <div className="absolute left-0 right-0 bottom-0 h-8 bg-gradient-to-t from-[#433831] to-transparent z-10"></div>

            <div className="absolute top-4 left-6 z-20 bg-[#C5A065]/10 px-3 py-1 rounded-full border border-[#C5A065]/30">
                <span className="flex items-center gap-2 text-[#C5A065] font-bold text-xs whitespace-nowrap animate-pulse">
                    <Activity className="w-3 h-3" /> 실시간 장례 진행
                </span>
            </div>

            <div className="flex flex-col animate-marquee-vertical items-center pt-10">
                {/* Duplicate content for seamless loop */}
                {[...displayCases, ...displayCases, ...displayCases, ...displayCases].map((item, index) => (
                    <div key={`${item.id}-${index}`} className="flex items-center gap-3 py-2 text-[#EAE5D9]/80 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                        <span className="font-bold text-[#FDFBF7] w-16 text-right">{maskKoreanName(item.masked_name)}님</span>
                        <span className="text-[#8E806A] text-xs">|</span>
                        <span className="w-40 truncate text-center">{item.location}</span>
                        <span className="text-[#8E806A] text-xs">|</span>
                        <span className="text-xs text-[#C5A065] font-medium border border-[#C5A065]/30 px-2 rounded-full">현재 진행 중</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function PricingSection({ packagesData, onConsult }) {
    // DB에서 불러온 패키지가 있으면 사용, 없으면 상세 폴백
    const displayPackages = (packagesData && packagesData.length > 0 && packagesData[0].items) 
        ? packagesData 
        : [
            {
                value: "무빈소",
                label: "무빈소 (179만원)",
                price: 1790000,
                desc: "빈소 없이 간소하게 가족끼리 보내드리는 상품",
                icon: "🕊️",
                items: [
                    { name: "입관캐어 및 발인동행서비스 제공" },
                    { name: "입관보조 장례지도사 1인제공" },
                    { name: "관 (화장용 오동관/매장시 상담)" },
                    { name: "수의 (화장용 저마수의)" },
                    { name: "입관용품일체" },
                    { name: "초도용품일체" },
                    { name: "우등버스 1대 / 리무진 1대  택일 (왕복200km)" },
                    { name: "상복 남3세트(타이/셔츠포함), 여5벌" },
                    { name: "기본유골함(기본함/목함)" },
                    { name: "운구이송차량(관내10km제공)" }
                ]
            },
            {
                value: "고급형",
                label: "고급형 (250만원)",
                price: 2500000,
                desc: "3일장 기준의 표준 구성 상품",
                icon: "✨",
                isPopular: true,
                items: [
                    { name: "장례기간동안 3일장 기준 캐어 " },
                    { name: "입관보조 장례지도사 1인제공" },
                    { name: "관 (화장용 오동관/매장시 상담)" },
                    { name: "수의 (화장용 저마수의)" },
                    { name: "입관용품일체" },
                    { name: "초도용품일체" },
                    { name: "도우미 3인 X 8시간 제공" },
                    { name: "우등버스 1대 / 리무진 1대 (왕복200km)_택일" },
                    { name: "상복 남3세트(타이/셔츠포함), 여5벌" },
                    { name: "헌화용 국화 30송이" },
                    { name: "기본유골함(기본함/목함)" },
                    { name: "운구이송차량 (관내10km제공)" }
                ]
            },
            {
                value: "프리미엄",
                label: "프리미엄(350만원)",
                price: 3500000,
                desc: "폭넓게 갖춘 프리미엄 구성 상품",
                icon: "👑",
                items: [
                    { name: "장례기간동안 3일장 기준 캐어 " },
                    { name: "입관보조 장례지도사 1인제공" },
                    { name: "관 (화장용 오동관/매장시 상담)" },
                    { name: "수의 (화장용 저마/한복/한지수의)" },
                    { name: "입관용품일체" },
                    { name: "초도용품일체" },
                    { name: "도우미 5인 X 8시간 제공" },
                    { name: "우등버스 1대 / 리무진 1대 (왕복200km)" },
                    { name: "상복 남5세트(타이/셔츠포함), 여7벌" },
                    { name: "근조바구니 1조(2개)" },
                    { name: "헌화용 국화 50송이" },
                    { name: "기본유골함(기본함/목함)" },
                    { name: "운구이송차량 (관내10km제공)" }
                ]
            }
        ];

    const getPackageMeta = (value) => {
        if (value.includes('무빈소')) return { icon: "🕊️", desc: "빈소 없이 간소하게 가족끼리 보내드리는 상품" };
        if (value.includes('고급')) return { icon: "✨", desc: "3일장 기준의 표준 구성 상품", isPopular: true };
        if (value.includes('프리미엄')) return { icon: "👑", desc: "폭넓게 갖춘 프리미엄 구성 상품" };
        return { icon: "📦", desc: "10년의 약속 정직한 장례 상품" };
    };

    return (
        <section id="pricing" className="py-24 bg-[#FDFBF7] border-t border-[#EAE5D9]/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-16">
                    <div className="inline-block px-4 py-1.5 rounded-full bg-[#EAE5D9] text-[#8E806A] font-bold text-sm mb-4 tracking-wide">
                        투명한 가격 정책
                    </div>
                    <h2 className="text-3xl md:text-4xl font-serif font-bold text-[#433831] mb-6">상품 구성 상세 안내</h2>
                    <p className="text-[#6E6D74] max-w-2xl mx-auto leading-relaxed">
                        상품 구성을 항목별로 있는 그대로 안내해 드립니다.<br className="hidden md:block" />
                        기재된 항목 외 수고비, 노잣돈 등은 요구하지 않습니다.
                    </p>
                </div>

                <div className="grid lg:grid-cols-3 gap-8 items-start">
                    {displayPackages.map((pkg, idx) => {
                        const meta = getPackageMeta(pkg.value);
                        return (
                            <div key={idx} className={`relative flex flex-col p-6 sm:p-8 rounded-3xl border ${meta.isPopular ? 'border-[#8E806A] shadow-2xl shadow-[#8E806A]/15 scale-100 lg:scale-105 z-10 bg-white' : 'border-[#EAE5D9] shadow-sm bg-white'}`}>
                                {meta.isPopular && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#433831] text-[#FDFBF7] px-4 py-1.5 rounded-full text-sm font-bold shadow-md whitespace-nowrap">
                                        많이 찾는 상품
                                    </div>
                                )}
                                
                                <div className="text-4xl mb-4">{meta.icon}</div>
                                <h3 className="text-2xl font-serif font-bold text-[#433831] mb-2">{pkg.label.split('(')[0].trim()}</h3>
                                <p className="text-[#8E806A] text-sm mb-6 h-10">{meta.desc}</p>
                                
                                <div className="mb-6 pb-6 border-b border-[#EAE5D9]/50">
                                    <span className="text-3xl font-black text-[#433831]">{(pkg.price / 10000).toLocaleString()}</span>
                                    <span className="text-[#6E6D74] font-medium ml-1">만원</span>
                                </div>

                                <div className="flex-1 mb-8">
                                    <div className="font-bold text-[#433831] mb-4 flex items-center gap-2">
                                        <ShieldCheck className="w-5 h-5 text-[#8E806A]" /> 
                                        제공 내역 상세
                                    </div>
                                    <ul className="space-y-3 bg-[#FDFBF7] p-5 rounded-2xl border border-[#EAE5D9]/30 h-[420px] overflow-y-auto custom-scrollbar">
                                        {pkg.items && pkg.items.map((item, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-[#5D5C61] leading-snug">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#D4C5A9] shrink-0 mt-1.5"></div>
                                                <span className="break-keep">{item.name || item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <button
                                    onClick={onConsult}
                                    className={`w-full py-4 rounded-xl font-bold transition-all ${meta.isPopular ? 'bg-[#8E806A] hover:bg-[#7A6C56] text-white shadow-lg' : 'bg-[#F5F0E6] hover:bg-[#EAE5D9] text-[#433831]'}`}
                                >
                                    이 상품으로 상담하기
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #D4C5A9; border-radius: 4px; }
            `}</style>
        </section>
    );
}
