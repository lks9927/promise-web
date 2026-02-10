import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
    Phone,
    Heart,
    Shield,
    Clock,
    CheckCircle2,
    ArrowRight,
    Sparkles,
    Calendar,
    Users,
    Activity // New Icon
} from 'lucide-react';
import { matchHangul } from '../lib/hangul';
import { FUNERAL_HOMES } from '../data/funeralHomes';

export default function Home() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({ name: '', phone: '', location: '' });
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState([]);

    const [user, setUser] = useState(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Mobile Menu State

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Simple success alert for now (or implement actual submission logic)
        try {
            // 1. Create Funeral Case
            const { data: caseData, error: caseError } = await supabase
                .from('funeral_cases')
                .insert([
                    {
                        customer_id: user?.id, // If logged in
                        location: formData.location,
                        status: 'requested'
                    }
                ])
                .select()
                .single();

            if (caseError) throw caseError;

            alert('긴급 접수가 완료되었습니다.\n마스터가 곧 연락드리겠습니다.');
            setIsModalOpen(false);
            setFormData({ name: '', phone: '', location: '' });
        } catch (error) {
            console.error(error);
            alert('접수 중 오류가 발생했습니다. 대표번호로 연락주세요.');
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
    }, []);

    // Helper to get dashboard link based on role
    const getDashboardLink = (role) => {
        switch (role) {
            case 'admin': return '/admin?role=super';
            case 'master': return '/master';
            case 'leader': return '/leader';
            case 'dealer': return '/dealer';
            case 'assistant': return '/leader';
            case 'customer': return '/mypage';
            default: return '/';
        }
    };

    return (
        <div className="min-h-screen font-sans text-[#5D5C61] bg-[#FDFBF7]">
            {/* Navigation (Transparent Warm) */}
            <nav className="fixed w-full z-50 transition-all duration-300 bg-[#FDFBF7]/80 backdrop-blur-md border-b border-[#EAE5D9]">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <Link to="/" className="text-2xl font-bold text-[#433831] font-serif tracking-tight cursor-pointer hover:opacity-80 transition-opacity">
                        10년의 약속
                    </Link>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex gap-8 items-center">
                        <a href="#story" className="text-[#8E806A] hover:text-[#433831] font-medium transition-colors">Brand Story</a>
                        <a href="#process" className="text-[#8E806A] hover:text-[#433831] font-medium transition-colors">Process</a>

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
                            <Link to="/login" className="text-[#8E806A] hover:text-[#433831] font-medium transition-colors">Login</Link>
                        )}

                        <a href="/apply" className="text-[#8E806A] hover:text-[#433831] font-medium transition-colors">Partners</a>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="bg-[#433831] text-[#FDFBF7] px-6 py-2.5 rounded-full font-bold hover:bg-[#322A25] transition-all shadow-md hover:shadow-lg"
                        >
                            Contact
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
                            Brand Story
                        </a>
                        <a
                            href="#process"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="text-[#8E806A] hover:text-[#433831] font-medium p-2"
                        >
                            Process
                        </a>
                        <a
                            href="/apply"
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="text-[#8E806A] hover:text-[#433831] font-medium p-2"
                        >
                            Partners
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
                                Login
                            </Link>
                        )}

                        <button
                            onClick={() => {
                                setIsMobileMenuOpen(false);
                                setIsModalOpen(true);
                            }}
                            className="bg-[#433831] text-[#FDFBF7] px-6 py-3 rounded-xl font-bold hover:bg-[#322A25] transition-all shadow-md w-full"
                        >
                            Contact
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
                        <h1 className="text-4xl md:text-6xl font-serif font-bold text-[#433831] leading-tight mb-8">
                            슬픔을 덜어드리는<br />
                            <span className="text-[#A69076]">따뜻한 약속</span>입니다.
                        </h1>
                        <p className="text-lg md:text-xl text-[#7A7267] leading-relaxed mb-10 max-w-lg mx-auto lg:mx-0">
                            예고 없이 찾아온 이별 앞에서도<br className="hidden md:block" />
                            가족분들이 온전히 추모에만 집중하실 수 있도록<br className="hidden md:block" />
                            10년 경력의 마스터가 처음부터 끝까지 곁을 지킵니다.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="bg-[#8E806A] hover:bg-[#7A6C56] text-white px-8 py-4 rounded-xl font-bold text-lg shadow-xl shadow-[#8E806A]/20 flex items-center justify-center gap-3 transition-all transform hover:-translate-y-1"
                            >
                                <Phone className="w-5 h-5" />
                                긴급 장례 접수하기
                            </button>
                            <button className="bg-white hover:bg-[#FAF9F5] text-[#8E806A] border border-[#D4C5A9] px-8 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-colors">
                                상품 안내 보기
                            </button>
                        </div>
                    </div>
                    {/* Placeholder for Hero Image - If generation failed, use elegant soft gradient shape */}
                    <div className="order-1 lg:order-2 relative mx-auto w-full max-w-[500px] aspect-[4/5] bg-gray-100 rounded-t-full rounded-b-[200px] overflow-hidden shadow-2xl ring-8 ring-white">
                        <div className="absolute inset-0 bg-gradient-to-b from-[#EAE5D9] to-[#C9BCAB] opacity-50"></div>
                        <img
                            src="/hero_warm_light.png"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.style.display = 'none';
                                e.target.parentElement.classList.add('bg-gradient-to-br', 'from-[#dcd3c2]', 'to-[#b0a088]');
                            }}
                            className="w-full h-full object-cover opacity-90 hover:scale-105 transition-transform duration-1000"
                            alt="따뜻한 위로의 이미지"
                        />
                        {/* Decorative Circle */}
                        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-[#FDFBF7] rounded-full opacity-30 blur-2xl"></div>
                    </div>
                </div>

                {/* Abstract Background Elements */}
                <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#F5F0E6] rounded-full blur-3xl opacity-60 -z-10 translate-x-1/2 -translate-y-1/4"></div>
            </section>

            {/* Story Section (Zig-zag) */}
            <section id="story" className="py-24 bg-white relative">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid md:grid-cols-2 gap-16 items-center mb-24">
                        <div className="relative rounded-2xl overflow-hidden aspect-video shadow-lg order-2 md:order-1">
                            <img
                                src="/comfort_hands.png"
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.parentElement.classList.add('bg-[#EAE5D9]');
                                }}
                                className="w-full h-full object-cover"
                                alt="맞잡은 손"
                            />
                            {/* Fallback Text if image fails */}
                            <div className="absolute inset-0 flex items-center justify-center text-[#8E806A] opacity-20 font-serif text-4xl">
                                Comfort
                            </div>
                        </div>
                        <div className="order-1 md:order-2">
                            <h3 className="text-[#8E806A] font-bold mb-4 tracking-widest text-sm uppercase">Sincerity</h3>
                            <h2 className="text-3xl md:text-4xl font-serif font-bold text-[#433831] mb-6 leading-snug">
                                가격보다는<br />
                                <span className="text-black/80 underline decoration-[#D4C5A9]/50 underline-offset-4">진심</span>을 더했습니다.
                            </h2>
                            <p className="text-[#6E6D74] leading-loose mb-6">
                                기존 상조 회사의 복잡한 가입 절차와 불투명한 추가 비용에 지치셨나요?
                                10년의 약속은 거품을 걷어내고, 오직 고인과 유가족만을 생각합니다.
                                노잣돈, 수고비를 절대 요구하지 않는 <strong>100% 투명 정산제</strong>를 약속드립니다.
                            </p>
                            <div className="flex gap-4">
                                <div className="flex flex-col items-center p-4 bg-[#F9F7F2] rounded-xl min-w-[100px]">
                                    <span className="text-2xl font-bold text-[#8E806A]">0원</span>
                                    <span className="text-xs text-gray-500 mt-1">가입비/월 납입금</span>
                                </div>
                                <div className="flex flex-col items-center p-4 bg-[#F9F7F2] rounded-xl min-w-[100px]">
                                    <span className="text-2xl font-bold text-[#8E806A]">100%</span>
                                    <span className="text-xs text-gray-500 mt-1">현금영수증 발행</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Rolling Ticker Section */}
            <RollingTicker />

            {/* Service Features (Soft Cards) */}
            <section className="py-24 bg-[#FDFBF7]">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-serif font-bold text-[#433831] mb-4">지킬 수 있는 약속만 드립니다</h2>
                        <p className="text-[#8E806A]">본사가 직접 검증한 3가지 원칙</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <FeatureCard
                            icon={<Users className="w-10 h-10 text-[#8E806A]" />}
                            title="전담 마스터 실명제"
                            desc="하청업체의 아르바이트생이 아닙니다. 국가 공인 자격증을 보유한 베테랑 팀장이 실명을 걸고 책임집니다."
                        />
                        <FeatureCard
                            icon={<Shield className="w-10 h-10 text-[#8E806A]" />}
                            title="투명한 정산 리포트"
                            desc="장례 종료 후, 10원 단위까지 상세하게 기재된 정산 리포트를 제공합니다. 부당한 요구 시 100% 환불해드립니다."
                        />
                        <FeatureCard
                            icon={<Clock className="w-10 h-10 text-[#8E806A]" />}
                            title="24시간 전국 출동"
                            desc="서울부터 제주까지, 임종 즉시 연락주시면 가장 가까운 곳에 있는 마스터가 1시간 이내에 도착합니다."
                        />
                    </div>
                </div>
            </section>

            {/* Process Section */}
            <section id="process" className="py-24 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-serif font-bold text-[#433831]">복잡한 절차, 걱정하지 마세요</h2>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <ProcessStep number="01" title="긴급 장례 접수" desc="24시간 언제든 전화 또는 웹으로 접수해주세요." />
                        <ProcessStep number="02" title="마스터 출동" desc="1시간 내로 전담 팀장이 장례식장으로 이동합니다." />
                        <ProcessStep number="03" title="장례 진행" desc="입관부터 발인까지 3일간 정성을 다해 모십니다." />
                        <ProcessStep number="04" title="투명한 정산" desc="모든 절차 종료 후 꼼꼼하게 정산 내역을 확인합니다." />
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-[#EAE5D9]/50 pt-16 pb-8 border-t border-[#D4C5A9]/30">
                <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12 mb-12">
                    <div className="col-span-1 md:col-span-2">
                        <div className="text-2xl font-bold text-[#433831] font-serif mb-6">10년의 약속</div>
                        <p className="text-[#6E6D74] leading-relaxed mb-6">
                            가장 슬픈 날, 가장 든든한 가족이 되어드리겠습니다.<br />
                            진심을 담은 서비스로 마지막 가시는 길을 평온하게 지킵니다.
                        </p>
                        <div className="flex gap-4">
                            <span className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#8E806A] shadow-sm"><Phone size={18} /></span>
                            <span className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#8E806A] shadow-sm"><Heart size={18} /></span>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-bold text-[#433831] mb-6">고객 센터</h4>
                        <ul className="space-y-4 text-[#6E6D74] text-sm">
                            <li><strong>대표전화:</strong> 1588-0000</li>
                            <li><strong>운영시간:</strong> 24시간 연중무휴</li>
                            <li><strong>이메일:</strong> help@promise10.com</li>
                        </ul>
                    </div>

                </div>
                <div className="border-t border-[#D4C5A9]/30 pt-8 text-center text-[#8C8174] text-xs">
                    © 2026 Promise of 10 Years. All rights reserved.
                </div>
            </footer>

            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#433831]/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-[#FDFBF7] w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white/50">
                        <div className="px-8 py-6 border-b border-[#EAE5D9] flex justify-between items-center bg-white/50">
                            <h3 className="font-serif font-bold text-xl text-[#433831]">긴급 장례 접수</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-[#8E806A] hover:text-[#433831] text-2xl leading-none">&times;</button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-8 space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-[#5D5C61] mb-2">상주님 성함</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-4 py-3.5 rounded-xl border border-[#D4C5A9]/50 bg-white focus:ring-2 focus:ring-[#8E806A] focus:border-[#8E806A] outline-none transition-all placeholder:text-gray-300"
                                    placeholder="홍길동"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-[#5D5C61] mb-2">연락처</label>
                                <input
                                    required
                                    type="tel"
                                    className="w-full px-4 py-3.5 rounded-xl border border-[#D4C5A9]/50 bg-white focus:ring-2 focus:ring-[#8E806A] focus:border-[#8E806A] outline-none transition-all placeholder:text-gray-300"
                                    placeholder="010-1234-5678"
                                    value={formData.phone}
                                    maxLength={13}
                                    onChange={e => {
                                        const value = e.target.value.replace(/[^0-9]/g, '');
                                        let formatted = value;
                                        if (value.length < 4) {
                                            formatted = value;
                                        } else if (value.length < 7) {
                                            formatted = `${value.slice(0, 3)}-${value.slice(3)}`;
                                        } else if (value.length < 11) {
                                            formatted = `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`;
                                        } else {
                                            formatted = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
                                        }
                                        setFormData({ ...formData, phone: formatted });
                                    }}
                                />
                            </div>

                            <div className="relative">
                                <label className="block text-sm font-bold text-[#5D5C61] mb-2">현재 위치 (장례식장)</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-4 py-3.5 rounded-xl border border-[#D4C5A9]/50 bg-white focus:ring-2 focus:ring-[#8E806A] focus:border-[#8E806A] outline-none transition-all placeholder:text-gray-300"
                                    placeholder="장례식장 이름 (초성 검색 가능, 예: ㅅㅇㅅㅁ)"
                                    value={formData.location}
                                    onChange={e => {
                                        const value = e.target.value;
                                        setFormData({ ...formData, location: value });

                                        if (value.trim().length > 0) {
                                            const filtered = FUNERAL_HOMES.filter(home => matchHangul(home, value));
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
                                                className="px-4 py-3 hover:bg-[#F9F7F2] cursor-pointer text-[#5D5C61] border-b border-[#EAE5D9]/30 last:border-none flex items-center justify-between group"
                                                onClick={() => {
                                                    setFormData({ ...formData, location: home });
                                                    setSuggestions([]);
                                                }}
                                            >
                                                <span>{home}</span>
                                                <span className="text-xs text-[#8E806A] opacity-0 group-hover:opacity-100 transition-opacity">선택</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-[#433831] hover:bg-[#2C241E] text-[#FDFBF7] font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                                >
                                    {loading ? '접수 중...' : '상담 신청하기'}
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

function RollingTicker() {
    const [cases, setCases] = useState([]);

    useEffect(() => {
        const fetchCases = async () => {
            const { data } = await supabase
                .from('funeral_cases')
                .select(`
                    id,
                    location,
                    created_at,
                    profiles:customer_id (name)
                `)
                .eq('status', 'in_progress')
                .order('created_at', { ascending: false })
                .limit(10);

            if (data) setCases(data);
        };
        fetchCases();

        // Refresh every 5 minutes
        const interval = setInterval(fetchCases, 300000);
        return () => clearInterval(interval);
    }, []);

    if (cases.length === 0) return null;

    // Mask name helper
    const maskName = (name) => {
        if (!name) return '익명';
        if (name.length <= 2) return name[0] + '*';
        return name[0] + '*' + name[name.length - 1];
    };

    return (
        <div className="bg-[#433831] h-32 overflow-hidden relative flex flex-col justify-center">
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
                {[...cases, ...cases, ...cases, ...cases].map((item, index) => (
                    <div key={`${item.id}-${index}`} className="flex items-center gap-3 py-2 text-[#EAE5D9]/80 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
                        <span className="font-bold text-[#FDFBF7] w-16 text-right">{maskName(item.profiles?.name)}님</span>
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
