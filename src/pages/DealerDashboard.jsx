import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { translateError } from '../lib/errorHandler';
import {
    TrendingUp,
    Users,
    DollarSign,
    Calendar,
    ChevronRight,
    PieChart,
    LogOut,
    PlusCircle,
    List,
    Home,
    MapPin,
    Package,
    Bell,
    User,
    Download,
    Tag,
    Phone
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import MySettlements from '../components/dealer/MySettlements';
import FuneralCaseInfo from '../components/common/FuneralCaseInfo';
import BranchManagement from '../components/dealer/BranchManagement';
import Profile from '../components/common/Profile';
import { useNotification } from '../contexts/NotificationContext';
import MessageInbox from '../components/common/MessageInbox';
import TeamLeaderProfileModal from '../components/common/TeamLeaderProfileModal';
import TimelineView from '../components/common/TimelineView';
import { matchHangul } from '../lib/hangul';
import { FUNERAL_HOMES } from '../data/funeralHomes';
import useRealtimeSubscription from '../hooks/useRealtimeSubscription';
import PackageBottomSheet from '../components/common/PackageBottomSheet';
import { formatPhoneNumber } from '../utils/formatters';

const SITE_URL = 'https://10promise.com';

export default function DealerDashboard() {
    const { showToast, unreadCount } = useNotification();
    const [activeTab, setActiveTab] = useState('home'); // 'home', 'register', 'status', 'settlement', 'branch'
    const [user, setUser] = useState(null);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [realtimeKey, setRealtimeKey] = useState(0);
    const navigate = useNavigate();

    // 탭 4종류: 실시간 자동 갱신 - funeral_cases 변경 감지 - 상위 - 리렌더링
    useRealtimeSubscription('funeral_cases', useCallback(() => {
        setRealtimeKey(prev => prev + 1);
    }, []), { events: ['INSERT', 'UPDATE'] });

    useEffect(() => {
        const loadUser = async () => {
            const storedUser = localStorage.getItem('user');
            if (storedUser) {
                const parsedUser = JSON.parse(storedUser);

                // Fetch latest grade to ensure UI displays correctly (Master dealer features)
                try {
                    const { data: partnerData } = await supabase
                        .from('partners')
                        .select('grade, status')
                        .eq('user_id', parsedUser.id)
                        .single();

                    if (partnerData) {
                        parsedUser.grade = partnerData.grade;
                        parsedUser.partner_status = partnerData.status;
                        localStorage.setItem('user', JSON.stringify(parsedUser)); // Update local storage cache
                    }
                } catch (error) {
                    console.error('Error fetching partner grade:', error);
                }

                setUser(parsedUser);
                setIsPreviewMode(!!parsedUser._preview_mode);
            } else {
                navigate('/login');
            }
        };
        loadUser();
    }, [navigate]);

    const handleAdminReturn = () => {
        const backup = localStorage.getItem('admin_preview_backup');
        if (backup) {
            localStorage.setItem('user', backup);
            localStorage.removeItem('admin_preview_backup');
        }
        navigate('/admin');
    };

    if (!user) return <div className="p-4 text-center">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* 관리자 미리보기 배너 */}
            {isPreviewMode && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] bg-red-600/95 backdrop-blur-sm text-white px-4 py-2 flex items-center gap-4 rounded-full shadow-lg border border-red-500">
                    <span className="text-xs font-bold whitespace-nowrap">딜러 미리보기: {user.name}</span>
                    <button
                        onClick={handleAdminReturn}
                        className="text-[10px] bg-white text-red-600 font-black px-3 py-1.5 rounded-full hover:bg-red-50 whitespace-nowrap shadow-sm"
                    >
                        돌아가기
                    </button>
                </div>
            )}
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 flex justify-between items-center shadow-sm">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">
                        {activeTab === 'home' && '홈 대시보드'}
                        {activeTab === 'register' && '상담 간편 접수'}
                        {activeTab === 'status' && '내 접수 현황'}
                        {activeTab === 'settlement' && '정산 및 수익'}
                        {activeTab === 'branch' && '지점 관리'}
                        {activeTab === 'profile' && '내 기본 정보'}
                    </h1>
                    <p className="text-sm text-gray-500">
                        {user.name} 님
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Notification Bell */}
                    <div className="relative">
                        <button onClick={() => setIsNotifOpen(!isNotifOpen)} className="relative p-1 rounded-full hover:bg-gray-100 transition-colors">
                            <Bell className={`w-6 h-6 ${unreadCount > 0 ? 'text-indigo-600 animate-pulse' : 'text-gray-400'}`} />
                            {unreadCount > 0 && (
                                <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                                    {unreadCount}
                                </span>
                            )}
                        </button>
                        <MessageInbox isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} user={user} />
                    </div>

                    <button
                        onClick={() => {
                            localStorage.removeItem('user');
                            navigate('/login');
                        }}
                        className="flex items-center gap-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                        <LogOut className="w-6 h-6" />
                    </button>
                </div>
            </header>

            <main className="p-4 max-w-lg mx-auto space-y-6">
                {activeTab === 'home' && <HomeTab user={user} />}
                {activeTab === 'register' && <RegisterTab user={user} onSuccess={() => setActiveTab('status')} />}
                {activeTab === 'status' && <StatusTab key={realtimeKey} user={user} />}
                {activeTab === 'settlement' && <MySettlements user={user} />}
                {activeTab === 'branch' && <BranchManagement user={user} />}
                {activeTab === 'profile' && <Profile user={user} onUpdate={setUser} />}
            </main>

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-3 pb-safe z-50">
                <NavButton icon={Home} label="홈" active={activeTab === 'home'} onClick={() => setActiveTab('home')} />
                <NavButton icon={PlusCircle} label="접수하기" active={activeTab === 'register'} onClick={() => setActiveTab('register')} />
                <NavButton icon={List} label="접수현황" active={activeTab === 'status'} onClick={() => setActiveTab('status')} />
                <NavButton icon={DollarSign} label="정산관리" active={activeTab === 'settlement'} onClick={() => setActiveTab('settlement')} />
                {(user?.role === 'master' || user?.grade === 'Master' || user?.role === 'leader') && (
                    <NavButton icon={Users} label="지점관리" active={activeTab === 'branch'} onClick={() => setActiveTab('branch')} />
                )}
                <NavButton icon={User} label="프로필" active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
            </nav>
        </div>
    );
}

function NavButton({ icon: Icon, label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 flex flex-col items-center justify-center gap-1 min-w-0 px-1 ${active ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
            <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'fill-current' : ''}`} />
            <span className="text-[10px] sm:text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">{label}</span>
        </button>
    );
}

function CouponImageTemplate({ coupon }) {
    if (!coupon) return null;
    return (
        <div id={`coupon-card-${coupon.code}`} style={{ position: 'fixed', left: '-9999px', top: 0, width: 450, height: 220, background: 'linear-gradient(to right, #cfad6f, #f5deb3, #cfad6f)', padding: 4, zIndex: -10 }}>
            <div style={{ width: '100%', height: '100%', background: '#fcfbf9', position: 'relative', display: 'flex', overflow: 'hidden' }}>
                {/* 안쪽 라운드 테두리 */}
                <div style={{ position: 'absolute', top: 10, left: 10, right: 10, bottom: 10, border: '1px solid #b89758', borderRadius: 8, pointerEvents: 'none' }}></div>
                
                {/* 좌측: 브랜드 + 코드 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 30, paddingRight: 16, position: 'relative', zIndex: 10 }}>
                    {/* 로고 + 브랜드명 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <img src="/promise_logo_transparent.png" alt="logo" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                        <span style={{ color: '#2E4A3D', fontSize: 11, fontWeight: 700, letterSpacing: 3 }}>10년의 약속</span>
                    </div>
                    {/* 캐시백 쿠폰 타이틀 */}
                    <div style={{ color: '#333333', fontSize: 24, fontWeight: 900, letterSpacing: 4, fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif', marginBottom: 12 }}>캐시백 쿠폰</div>
                    {/* 설명 */}
                    <div style={{ color: '#888888', fontSize: 10, marginBottom: 8 }}>프리미엄 장례지원 캐시백</div>
                    {/* 코드 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ background: '#2E4A3D', color: '#fcfbf9', fontSize: 9, padding: '2px 8px', fontWeight: 700, letterSpacing: 2 }}>CODE</div>
                        <div style={{ color: '#2E4A3D', fontSize: 16, fontFamily: 'Consolas, monospace', fontWeight: 700, letterSpacing: 3 }}>
                            {coupon.code}
                        </div>
                    </div>
                </div>
                
                {/* 우측: 금액 + 날짜 */}
                <div style={{ width: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid #d4c39e', position: 'relative', zIndex: 10 }}>
                    <div style={{ color: '#8c6f37', fontSize: 10, letterSpacing: 2, marginBottom: 6, fontWeight: 600 }}>CASHBACK</div>
                    <div style={{ display: 'flex', alignItems: 'baseline' }}>
                        <span style={{ color: '#333333', fontSize: 13, marginRight: 2 }}>₩</span>
                        <span style={{ color: '#333333', fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif' }}>
                            {Number(coupon.amount).toLocaleString()}
                        </span>
                    </div>
                    <div style={{ color: '#999999', fontSize: 11, marginTop: 14, fontWeight: 500 }}>
                        {new Date(coupon.created_at).toLocaleDateString()}
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Tabs ---

function HomeTab({ user }) {
    const { showToast } = useNotification();
    const [earnings, setEarnings] = useState([]);
    const [team, setTeam] = useState([]);
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showIssueModal, setShowIssueModal] = useState(false);
    const [issueAmount, setIssueAmount] = useState('30000');
    const [issueQty, setIssueQty] = useState(1);
    const [maxQty, setMaxQty] = useState(10);
    const [maxAmount, setMaxAmount] = useState(100000);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkAmount, setLinkAmount] = useState('30000');
    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [sendingLink, setSendingLink] = useState(false);
    const [issuing, setIssuing] = useState(false);

    useEffect(() => {
        fetchData();
    }, [user.id]);

    const fetchData = async () => {
        setLoading(true);
        
        const results = await Promise.allSettled([
            supabase.from('settlements').select('*, funeral_cases (id, location, deceased_name, package_name, profiles!funeral_cases_customer_id_fkey (name))').eq('recipient_id', user.id).order('created_at', { ascending: false }),
            supabase.from('partners').select('*, profiles!partners_user_id_fkey(name)').eq('master_id', user.id),
            supabase.from('coupons').select('*').eq('issued_by', user.id).order('created_at', { ascending: false }),
            supabase.from('system_config').select('value').eq('key', 'max_coupon_per_batch').single(),
            supabase.from('system_config').select('value').eq('key', 'max_coupon_amount').single()
        ]);

        const [earningRes, teamRes, couponRes, configRes, amountRes] = results.map(r => r.status === 'fulfilled' ? r.value : { data: null });

        if (earningRes.data) setEarnings(earningRes.data);
        if (teamRes.data) setTeam(teamRes.data);
        if (couponRes.data) setCoupons(couponRes.data);
        if (configRes.data) setMaxQty(parseInt(configRes.data.value) || 10);
        if (amountRes.data) {
            const m = parseInt(amountRes.data.value) || 200000;
            setMaxAmount(m);
            if (parseInt(issueAmount) > m) {
                setIssueAmount(m.toString());
            }
        }

        setLoading(false);
    };

    const totalRevenue = earnings.reduce((acc, curr) => acc + curr.amount, 0);

    const handleIssueCoupons = async () => {
        if (issueQty > maxQty) {
            showToast('error', '한도 초과', `한번에 최대 ${maxQty}개까지만 발행 가능합니다.`);
            return;
        }

        if (parseInt(issueAmount) > maxAmount) {
            showToast('error', '금액 초과', `최대 ${maxAmount.toLocaleString()}원까지만 발행 가능합니다.`);
            return;
        }

        if (!confirm(`${Number(issueAmount).toLocaleString()}원 쿠폰 ${issueQty}개를 발행하시겠습니까?`)) return;

        setIssuing(true);
        try {
            const newCoupons = [];
            for (let i = 0; i < issueQty; i++) {
                newCoupons.push({
                    code: Math.random().toString(36).substring(2, 10).toUpperCase(),
                    amount: parseInt(issueAmount),
                    status: 'issued',
                    issued_by: user.id,
                    batch_name: '딜러직접발행'
                });
            }

            const { error } = await supabase.from('coupons').insert(newCoupons);
            if (error) throw error;

            showToast('success', '발행 완료', `${issueQty}개의 쿠폰이 발행되었습니다.`);
            setShowIssueModal(false);
            fetchData();
        } catch (error) {
            console.error(error);
            showToast('error', '실패', '쿠폰 발행 중 오류가 발생했습니다.');
        } finally {
            setIssuing(false);
        }
    };

    const handleDownloadImage = async (coupon) => {
        const element = document.getElementById(`coupon-card-${coupon.code}`);
        if (!element) return;

        // Temporarily adjust position for perfect capture
        const originalLeft = element.style.left;
        element.style.left = '0px';
        
        try {
            await document.fonts.ready; // Ensure fonts are loaded
            await new Promise(resolve => setTimeout(resolve, 100)); // Wait for reflow

            const canvas = await html2canvas(element, {
                scale: 3,
                useCORS: true,
                backgroundColor: null,
                scrollX: 0,
                scrollY: 0,
                x: 0,
                y: 0,
                width: 450,
                height: 220
            });
            const link = document.createElement('a');
            link.download = `10년의약속_쿠폰_${coupon.code}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.95);
            link.click();
            showToast('success', '다운로드 성공', '쿠폰 이미지가 갤러리에 저장되었습니다.');
        } catch (err) {
            console.error('Coupon Image Gen Error', err);
            showToast('error', '다운로드 실패', '이미지 생성 중 오류가 발생했습니다.');
        } finally {
            element.style.left = originalLeft;
        }
    };

    if (showIssueModal) {
        return (
            <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-indigo-600 text-white p-5 flex justify-between items-center shrink-0">
                        <h4 className="font-bold flex items-center gap-2">
                            <PlusCircle className="w-5 h-5" /> 쿠폰 직접 발행
                        </h4>
                        <button onClick={() => setShowIssueModal(false)} className="text-indigo-200 hover:text-white text-3xl leading-none">&times;</button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">발행 금액</label>
                            <select
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold"
                                value={issueAmount}
                                onChange={e => setIssueAmount(e.target.value)}
                            >
                                {[30000, 50000, 70000, 100000].filter(amt => amt <= maxAmount).map(amt => (
                                    <option key={amt} value={amt}>{amt.toLocaleString()}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">발행 수량 (최대 {maxQty}개)</label>
                            <input
                                type="number"
                                min="1"
                                max={maxQty}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold"
                                value={issueQty}
                                onChange={e => setIssueQty(Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)))}
                            />
                        </div>
                        <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                            <p className="text-xs text-indigo-700 leading-relaxed font-medium">
                                * 발행된 쿠폰은 취소가 불가능합니다.<br />
                                * 발행 내역은 관리자가 모니터링할 수 있습니다.<br />
                                * 고객에게 쿠폰 번호를 직접 전달해주세요.
                            </p>
                        </div>
                        <button
                            onClick={handleIssueCoupons}
                            disabled={issuing}
                            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                        >
                            {issuing ? '발행 중..' : '캐시백 쿠폰 즉시 발행'}
                        </button>
                    </div>
                </div>
                {/* 키보드와 하단 네비게이션에 가려지는 것을 방지하기 위한 강제 여백 */}
                <div className="h-48 w-full" />
            </div>
        );
    }

    if (showLinkModal) {
        return (
            <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="bg-emerald-600 text-white p-5 flex justify-between items-center shrink-0">
                        <h4 className="font-bold flex items-center gap-2">
                            <Phone className="w-5 h-5" /> 쿠폰 링크 발송
                        </h4>
                        <button onClick={() => setShowLinkModal(false)} className="text-emerald-200 hover:text-white text-3xl leading-none">&times;</button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                            <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                                → 예비상주에게 쿠폰 링크가 포함된 문자가 발송됩니다.<br />
                                링크를 클릭하면 <strong>원클릭 장례 접수</strong>가 가능합니다.
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">예비상주 성함</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-bold text-lg"
                                placeholder="성함을 입력하세요"
                                value={recipientName}
                                onChange={e => setRecipientName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">예비상주 연락처</label>
                            <input
                                type="tel"
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-bold text-lg tracking-wider"
                                placeholder="010-1234-5678"
                                maxLength={13}
                                value={recipientPhone}
                                onChange={e => setRecipientPhone(formatPhoneNumber(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">캐시백 금액</label>
                            <select
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold text-lg"
                                value={linkAmount}
                                onChange={e => setLinkAmount(e.target.value)}
                            >
                                {[30000, 50000, 70000, 100000].filter(amt => amt <= maxAmount).map(amt => (
                                    <option key={amt} value={amt}>{amt.toLocaleString()}원</option>
                                ))}
                            </select>
                        </div>

                        {/* 미리보기 */}
                        {recipientName && recipientPhone && (
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <p className="text-xs text-gray-500 mb-1 font-bold">📋 발송될 문자 미리보기</p>
                                <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                                    {`[10년의약속] ${recipientName}님, 캐시백 ${Number(linkAmount).toLocaleString()}원 쿠폰이 도착했습니다.\n\n급한 일이 생기면 아래 링크를 눌러 바로 접수하세요.\n${SITE_URL}/coupon/XXXXXXXX`}
                                </p>
                            </div>
                        )}

                        <button
                            onClick={async () => {
                                if (!recipientName.trim() || !recipientPhone.trim()) {
                                    showToast('error', '입력 오류', '예비상주 이름과 연락처를 입력해주세요.');
                                    return;
                                }
                                if (!confirm(`${recipientName}님(${recipientPhone})에게\n${Number(linkAmount).toLocaleString()}원 쿠폰 링크를 발송하시겠습니까?`)) return;

                                setSendingLink(true);
                                try {
                                    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
                                    const { error } = await supabase.from('coupons').insert([{
                                        code,
                                        amount: parseInt(linkAmount),
                                        status: 'issued',
                                        issued_by: user.id,
                                        batch_name: '링크발송',
                                        recipient_name: recipientName.trim(),
                                        recipient_phone: recipientPhone.trim(),
                                        link_sent_at: new Date().toISOString()
                                    }]);
                                    if (error) throw error;

                                    // SMS 자동 발송 (send-coupon-sms Edge Function)
                                    try {
                                        const smsRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-coupon-sms`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
                                            body: JSON.stringify({ phone: recipientPhone.trim(), name: recipientName.trim(), couponCode: code, amount: parseInt(linkAmount) })
                                        });
                                        console.log('SMS result:', await smsRes.json());
                                    } catch (smsErr) { console.error('SMS 발송 실패:', smsErr); }

                                    showToast('success', '발송 완료', `${recipientName}님에게 쿠폰 링크 문자가 발송되었습니다.`);
                                    setShowLinkModal(false);
                                    setRecipientName('');
                                    setRecipientPhone('');
                                    setLinkAmount('30000');
                                    fetchData();
                                } catch (err) {
                                    console.error('링크 생성 에러:', err);
                                    showToast('error', '실패', '쿠폰 링크 발송 중 오류가 발생했습니다.');
                                } finally {
                                    setSendingLink(false);
                                }
                            }}
                            disabled={sendingLink}
                            className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50"
                        >
                            {sendingLink ? '발송 중..' : '📩 쿠폰 링크 발송하기'}
                        </button>
                    </div>
                </div>
                {/* 하단 네비게이션과 키보드 가림을 방지하기 위한 강제 여백 */}
                <div className="h-48 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Revenue Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-indigo-100 font-medium">총 누적 수익금</span>
                    <TrendingUp className="w-5 h-5 text-indigo-200" />
                </div>
                <h2 className="text-4xl font-bold">₩{totalRevenue.toLocaleString()}</h2>
                <div className="mt-4 flex gap-2">
                    <span className="text-xs bg-white/20 px-2 py-1 rounded">이번 달 ₩{(earnings.filter(e => {
                        const date = new Date(e.created_at);
                        const now = new Date();
                        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                    }).reduce((acc, curr) => acc + curr.amount, 0)).toLocaleString()} (예상)</span>
                </div>
            </div>

            {/* Coupons Section */}
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-indigo-600" />
                        나의 발행한 쿠폰
                    </h3>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowLinkModal(true)}
                            className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-700 transition-all flex items-center gap-1"
                        >
                            <Phone className="w-3 h-3" /> 링크 발송
                        </button>
                        <button
                            onClick={() => setShowIssueModal(true)}
                            className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-700 transition-all flex items-center gap-1"
                        >
                            <PlusCircle className="w-3 h-3" /> 쿠폰 발행
                        </button>
                    </div>
                </div>
                {loading ? <p>로딩 중..</p> : (
                    <div className="space-y-3">
                        {coupons.length === 0 ? <p className="text-gray-400 text-sm">보유한 쿠폰이 없습니다.</p> : coupons.map(coupon => (
                            <div key={coupon.code} className={`p-4 rounded-xl border flex justify-between items-center ${coupon.batch_name === '링크발송' ? 'bg-emerald-50 border-emerald-200' : 'bg-indigo-50 border-indigo-100'}`}>
                                <div>
                                    <div className="font-bold text-indigo-900 text-lg">₩{coupon.amount.toLocaleString()}</div>
                                    <div className="text-xs text-indigo-600 font-mono mt-1">{coupon.code}</div>
                                    {coupon.recipient_name && (
                                        <div className="text-xs text-emerald-700 mt-1 font-bold flex items-center gap-1">
                                            → {coupon.recipient_name} ({coupon.recipient_phone})
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${coupon.status === 'active' || coupon.status === 'issued' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                        {coupon.status === 'active' || coupon.status === 'issued' ? '사용 가능' : '사용 완료'}
                                    </span>
                                    <div className="flex gap-3">
                                        {coupon.batch_name === '링크발송' && (coupon.status === 'issued' || coupon.status === 'active') && (
                                            <button
                                                onClick={() => {
                                                    const linkUrl = `${SITE_URL}/coupon/${coupon.code}`;
                                                    navigator.clipboard.writeText(linkUrl);
                                                    showToast('success', '링크 복사', '쿠폰 링크가 복사되었습니다.');
                                                }}
                                                className="text-xs text-emerald-600 font-bold flex items-center gap-1"
                                            >
                                                🔗 링크 복사
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDownloadImage(coupon)}
                                            className="text-xs text-indigo-600 font-bold flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" /> 이미지
                                        </button>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(coupon.code);
                                                showToast('success', '복사 완료', '쿠폰 코드가 복사되었습니다.');
                                            }}
                                            className="text-xs text-gray-500"
                                        >
                                            코드 복사
                                        </button>
                                    </div>
                                </div>
                                <CouponImageTemplate coupon={coupon} />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* My Team */}
            {team.length > 0 && (
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-600" />
                        내 하위 팀원 ({team.length}명)
                    </h3>
                    <div className="space-y-2">
                        {team.map(member => (
                            <div key={member.id} className="flex justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                                <span className="font-medium">{member.profiles?.name}</span>
                                <span className="text-gray-500">{member.region} · {member.grade}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Activity List (Simplified) */}
            <div>
                <h3 className="font-bold text-gray-800 mb-3">최근 수익 내역</h3>
                {loading ? <p>로딩 중..</p> : (
                    <div className="space-y-3">
                        {earnings.length === 0 ? <p className="text-gray-400 text-center py-4">내역이 없습니다.</p> : earnings.map(item => {
                            const isPaid = item.status === 'paid' || item.status === 'completed';
                            let typeInfo = { text: item.type, color: 'text-gray-600 bg-gray-50' };
                            if (item.type === 'dealer_commission') typeInfo = { text: '담당 수수료', color: 'text-blue-600 bg-blue-50' };
                            else if (item.type === 'dealer_override') typeInfo = { text: '관리수당료', color: 'text-purple-600 bg-purple-50' };
                            else if (item.type === 'leader_override') typeInfo = { text: '관리수당료', color: 'text-green-600 bg-green-50' };

                            return (
                                <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                                    {isPaid && (
                                        <div className="absolute right-0 top-0 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                                            지급완료
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${typeInfo.color}`}>
                                                {typeInfo.text}
                                            </span>
                                        </div>
                                        <span className={`font-bold text-lg ${isPaid ? 'text-gray-400' : 'text-indigo-600'}`}>
                                            + {item.amount.toLocaleString()}
                                        </span>
                                    </div>

                                    <FuneralCaseInfo
                                        caseId={item.funeral_cases?.id || item.case_id}
                                        deceasedName={item.funeral_cases?.deceased_name}
                                        chiefMournerName={item.funeral_cases?.profiles?.name}
                                        location={item.funeral_cases?.location}
                                        variant="dealer"
                                        compact={true}
                                        createdAt={item.created_at}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function RegisterTab({ user, onSuccess }) {
    const { showToast } = useNotification();
    const [formData, setFormData] = useState({
        customerName: '',
        customerPhone: '',
        location: '',
        packageName: '',
        memo: '',
        couponCode: ''
    });
    const [packages, setPackages] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sheetPkg, setSheetPkg] = useState(null);

    useEffect(() => {
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
        fetchPackages();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!confirm('정말 접수하시겠습니까?')) return;
        setLoading(true);

        try {
            let linkedCoupon = null;
            if (formData.couponCode.trim()) {
                const { data: coupon, error: couponError } = await supabase
                    .from('coupons')
                    .select('*')
                    .eq('code', formData.couponCode.trim().toUpperCase())
                    .single();

                if (couponError || !coupon) {
                    throw new Error('유효하지 않은 쿠폰 번호입니다.');
                }
                // 수정: 'issued' 또는 'active' 상태만 사용 가능
                if (coupon.status !== 'issued' && coupon.status !== 'active') {
                    throw new Error('이미 사용했거나 유효하지 않은 쿠폰입니다.');
                }
                if (coupon.case_id) {
                    throw new Error('이미 다른 접수에 사용된 쿠폰입니다.');
                }
                linkedCoupon = coupon;
            }

            // RPC 호출을 통한 안전한 접수 (프로필 생성, 중복문 체크, 접수 건 생성, 쿠폰 연결 통합 처리)
            const { data: caseId, error: submitError } = await supabase.rpc('submit_emergency_case', {
                p_name: formData.customerName,
                p_phone: formData.customerPhone,
                p_location: formData.location || '미정',
                p_package_name: formData.packageName,
                p_coupon_code: formData.couponCode ? formData.couponCode.trim().toUpperCase() : null,
                p_dealer_id: user.id
            });

            if (submitError) throw submitError;

            showToast('success', '접수 완료', '장례 접수가 완료되었습니다. 디스패치를 기다려주세요.');
            onSuccess();
        } catch (error) {
            console.error(error);
            showToast('error', '접수 실패', translateError(error));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white px-5 py-8 rounded-2xl shadow-md border border-gray-200 mb-32">
            <h2 className="text-2xl font-black text-red-600 mb-2 flex items-center gap-2">🚨 긴급 장례 접수</h2>
            <p className="text-base text-gray-700 mb-8 font-medium leading-relaxed bg-red-50 p-4 rounded-xl border border-red-100">
                상주님의 정보를 입력하고 <strong className="text-red-600 text-lg">접수하기</strong> 버튼을 누르면, 본사 상황실로 <strong className="text-red-600">즉시 전송</strong>되어 10년 경력의 마스터가 배정됩니다.
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-base font-bold text-gray-900 mb-2">고객명 (상주)</label>
                    <input
                        type="text"
                        required
                        className="w-full px-5 py-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-red-500/20 focus:border-red-500 bg-gray-50 font-bold text-gray-900"
                        placeholder="이름을 입력하세요"
                        value={formData.customerName}
                        onChange={e => setFormData({ ...formData, customerName: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-base font-bold text-gray-900 mb-2">연락처</label>
                    <input
                        type="tel"
                        required
                        className="w-full px-5 py-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-red-500/20 focus:border-red-500 bg-gray-50 font-bold text-gray-900 tracking-wider"
                        placeholder="010-1234-5678"
                        value={formData.customerPhone}
                        onChange={e => {
                            // Auto-format phone
                            let val = e.target.value.replace(/[^0-9]/g, '');
                            if (val.length > 3 && val.length <= 7) val = val.replace(/(\d{3})(\d+)/, '$1-$2');
                            else if (val.length > 7) val = val.replace(/(\d{3})(\d{4})(\d+)/, '$1-$2-$3');
                            setFormData({ ...formData, customerPhone: val.slice(0, 13) });
                        }}
                    />
                </div>
                <div>
                    <label className="block text-base font-bold text-gray-900 mb-2">장례식장 위치 (선택)</label>
                    <div className="relative">
                        <MapPin className="absolute left-4 top-4 w-6 h-6 text-gray-400" />
                        <input
                            type="text"
                            className="w-full pl-14 pr-5 py-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-red-500/20 focus:border-red-500 bg-gray-50 font-bold text-gray-900"
                            placeholder="예) 서울시 병원 장례식장"
                            value={formData.location}
                            onChange={e => {
                                const value = e.target.value;
                                setFormData({ ...formData, location: value });
                                if (value.trim().length > 0) {
                                    const filtered = FUNERAL_HOMES.filter(home => matchHangul(home, value));
                                    setSuggestions(filtered.slice(0, 5));
                                } else {
                                    setSuggestions([]);
                                }
                            }}
                            onBlur={() => setTimeout(() => setSuggestions([]), 200)}
                        />
                        {suggestions.length > 0 && (
                            <ul className="absolute z-50 w-full bg-white border border-gray-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto animate-fadeIn">
                                {suggestions.map((home, index) => (
                                    <li
                                        key={index}
                                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer text-gray-700 border-b border-gray-100 last:border-none flex items-center justify-between group"
                                        onClick={() => {
                                            setFormData({ ...formData, location: home });
                                            setSuggestions([]);
                                        }}
                                    >
                                        <span className="font-bold">{home}</span>
                                        <span className="text-xs text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">선택</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
                <div>
                    <label className="block text-base font-bold text-gray-900 mb-2">장례 상품 (선택)</label>
                    <div className="relative">
                        <Package className="absolute left-4 top-4 w-6 h-6 text-gray-400" />
                        <select
                            className="w-full pl-14 pr-10 py-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-red-500/20 focus:border-red-500 appearance-none bg-gray-50 font-bold text-gray-900"
                            value={formData.packageName}
                            onChange={e => setFormData({ ...formData, packageName: e.target.value })}
                        >
                            {packages.filter(p => p.active !== false).length > 0 ? (
                                packages.filter(p => p.active !== false).map((pkg, idx) => (
                                    <option key={idx} value={pkg.value}>{pkg.label}</option>
                                ))
                            ) : (
                                <option value="">상품 로딩 중..</option>
                            )}
                        </select>
                    </div>
                    {/* 상품 구성 보기 버튼 */}
                    {packages.length > 0 && (() => {
                        const selected = packages.find(p => p.value === formData.packageName);
                        return selected?.items?.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => setSheetPkg(selected)}
                                className="mt-2 w-full py-3 bg-slate-50 border border-slate-200 text-slate-600 font-bold text-sm rounded-xl hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
                            >
                                📦 상품 구성 상세 보기
                            </button>
                        ) : null;
                    })()}
                </div>

                {/* 바텀시트 */}
                <PackageBottomSheet
                    isOpen={!!sheetPkg}
                    onClose={() => setSheetPkg(null)}
                    pkg={sheetPkg}
                />

                <div>
                    <label className="block text-base font-bold text-gray-900 mb-2">쿠폰 번호 (선택)</label>
                    <div className="relative">
                        <Tag className="absolute left-4 top-4 w-6 h-6 text-gray-400" />
                        <input
                            type="text"
                            className="w-full pl-14 pr-5 py-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 bg-gray-50 font-bold text-gray-900"
                            placeholder="쿠폰 코드를 입력하세요"
                            value={formData.couponCode}
                            onChange={e => setFormData({ ...formData, couponCode: e.target.value.toUpperCase() })}
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-red-600 text-white font-black text-2xl py-6 rounded-2xl shadow-xl hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50 mt-4 border-b-4 border-red-800"
                >
                    {loading ? '접수 처리 중..' : '🚨 긴급 접수하기'}
                </button>
                {/* 모바일 키보드 가림 방지용 스크롤 여백 추가 */}
                <div className="h-80 w-full" aria-hidden="true"></div>
            </form>
        </div>
    );
}

const SimpleProgress = ({ status }) => {
    const steps = [
        { key: 'step1', label: '접수', activeStatus: ['requested', 'assigned', 'consulting', 'in_progress', 'team_settling', 'settling', 'hq_check', 'completed'] },
        { key: 'step2', label: '배정', activeStatus: ['assigned', 'consulting', 'in_progress', 'team_settling', 'settling', 'hq_check', 'completed'] },
        { key: 'step3', label: '진행중', activeStatus: ['in_progress', 'team_settling', 'settling', 'hq_check', 'completed'] },
        { key: 'step4', label: '정산대기', activeStatus: ['team_settling', 'settling', 'hq_check', 'completed'] },
        { key: 'step5', label: '완료', activeStatus: ['completed'] }
    ];

    const currentStepIndex = steps.findLastIndex(s => s.activeStatus.includes(status));

    return (
        <div className="mt-4 pt-4 border-t border-gray-50">
            <div className="flex items-center justify-between relative px-2">
                <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-0.5 bg-gray-100 z-0"></div>
                {steps.map((step, idx) => {
                    const isActive = step.activeStatus.includes(status);
                    const isCurrent = currentStepIndex === idx;
                    return (
                        <div key={step.key} className="relative z-10 flex flex-col items-center gap-1.5">
                            <div className={`w-3.5 h-3.5 rounded-full border-2 ${isActive ? (isCurrent ? 'bg-indigo-600 border-indigo-600 ring-4 ring-indigo-50' : 'bg-indigo-600 border-indigo-600') : 'bg-white border-gray-200'}`}></div>
                            <span className={`text-[11px] font-bold ${isActive ? 'text-indigo-600' : 'text-gray-400'}`}>{step.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

function StatusTab({ user }) {
    const [myCases, setMyCases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [profileModalOpen, setProfileModalOpen] = useState(false);
    const [selectedLeader, setSelectedLeader] = useState(null);

    useEffect(() => {
        fetchMyCases();
    }, [user.id]);

    const fetchMyCases = async () => {
        setLoading(true);
        let targetIds = [user.id];

        // If user is a Master Dealer, fetch cases for their sub-dealers as well
        if (user.grade === 'Master' || user.grade === 'S') {
            const { data: subDealers } = await supabase
                .from('partners')
                .select('user_id')
                .eq('master_id', user.id);

            if (subDealers) {
                targetIds = [...targetIds, ...subDealers.map(d => d.user_id)];
            }
        }

        const selectQuery = `
                *,
                profiles:customer_id (name, phone),
                team_leader:profiles!funeral_cases_team_leader_id_fkey (
                    name,
                    phone,
                    role,
                    avatar_url,
                    experience_years,
                    introduction
                )
            `;

        const { data: myCoupons } = await supabase.from('coupons').select('code').in('issued_by', targetIds);
        const couponCodes = myCoupons ? myCoupons.map(c => c.code) : [];

        const promises = [
            supabase.from('funeral_cases').select(selectQuery).in('dealer_id', targetIds).order('created_at', { ascending: false }),
            supabase.from('funeral_cases').select(selectQuery).in('customer_id', targetIds).order('created_at', { ascending: false })
        ];

        if (couponCodes.length > 0) {
            promises.push(supabase.from('funeral_cases').select(selectQuery).in('coupon_code', couponCodes).order('created_at', { ascending: false }));
        }

        const results = await Promise.allSettled(promises);

        const allCases = results
            .filter(r => r.status === 'fulfilled' && r.value.data)
            .flatMap(r => r.value.data);

        // 중복 제거
        const uniqueCases = allCases.filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i);
        uniqueCases.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        setMyCases(uniqueCases);
        setLoading(false);
    };

    const maskName = (n) => n ? (n.length <= 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1]) : '';

    const statusMap = {
        'requested': { label: '긴급 접수 대기', color: 'bg-red-100 text-red-700' },
        'assigned': { label: '담당 팀장 배정', color: 'bg-yellow-100 text-yellow-700' },
        'consulting': { label: '전문 상담 중', color: 'bg-orange-100 text-orange-700' },
        'in_progress': { label: '장례 절차 진행', color: 'bg-blue-100 text-blue-700' },
        'team_settling': { label: '내부 정산 대기', color: 'bg-green-100 text-green-700' },
        'settling': { label: '내부 정산 대기', color: 'bg-green-100 text-green-700' }, // Fallback
        'hq_check': { label: '내부 정산 검토 중', color: 'bg-green-100 text-green-700' },
        'completed': { label: '전체 완료됨', color: 'bg-gray-100 text-gray-600' }
    };

    const [expandedCaseId, setExpandedCaseId] = useState(null);

    return (
        <div className="space-y-4">
            <h2 className="font-bold text-gray-800 px-1">접수 현황 ({myCases.length}건)</h2>
            {loading ? <div className="text-center py-10">로딩 중..</div> : myCases.length === 0 ? (
                <div className="bg-white p-10 rounded-2xl text-center text-gray-400 border border-gray-100">
                    접수된 내역이 없습니다.
                </div>
            ) : (
                myCases.map(item => {
                    const status = statusMap[item.status] || { label: item.status, color: 'bg-gray-100 text-gray-500' };
                    return (
                        <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-3 hover:border-indigo-100 transition-colors">
                            <FuneralCaseInfo
                                caseId={item.id}
                                deceasedName={item.deceased_name}
                                chiefMournerName={item.profiles?.name}
                                clientPhone={item.profiles?.phone}
                                location={item.location}
                                roomNumber={item.room_number}
                                variant="dealer"
                                statusBadge={
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${status.color}`}>
                                        {status.label}
                                    </span>
                                }
                                createdAt={item.created_at}
                            />

                            <SimpleProgress status={item.status} />
                        </div>
                    );
                })
            )}

            {/* Modal */}
            <TeamLeaderProfileModal
                isOpen={profileModalOpen}
                onClose={() => {
                    setProfileModalOpen(false);
                    setSelectedLeader(null);
                }}
                leaderProfile={selectedLeader}
                isMasked={true}
            />
        </div>
    );
}
