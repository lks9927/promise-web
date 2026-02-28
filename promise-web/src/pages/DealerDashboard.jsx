import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
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
    Tag
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import MySettlements from '../components/dealer/MySettlements';
import BranchManagement from '../components/dealer/BranchManagement';
import Profile from '../components/common/Profile';
import { useNotification } from '../contexts/NotificationContext';
import MessageInbox from '../components/common/MessageInbox';
import TeamLeaderProfileModal from '../components/common/TeamLeaderProfileModal';
import TimelineView from '../components/common/TimelineView';
import { matchHangul } from '../lib/hangul';
import { FUNERAL_HOMES } from '../data/funeralHomes';

export default function DealerDashboard() {
    const { showToast, unreadCount } = useNotification();
    const [activeTab, setActiveTab] = useState('home'); // 'home', 'register', 'status', 'settlement', 'branch'
    const [user, setUser] = useState(null);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const navigate = useNavigate();

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
            } else {
                navigate('/login');
            }
        };
        loadUser();
    }, [navigate]);

    if (!user) return <div className="p-4 text-center">Loading...</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 flex justify-between items-center shadow-sm">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">
                        {activeTab === 'home' && '파트너 센터'}
                        {activeTab === 'register' && '장례 간편 접수'}
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
                            if (confirm('로그아웃 하시겠습니까?')) {
                                localStorage.removeItem('user');
                                navigate('/login');
                            }
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
                {activeTab === 'status' && <StatusTab user={user} />}
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
                {(user?.role === 'master' || user?.grade === 'Master') && (
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
            className={`flex flex-col items-center gap-1 ${active ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
            <Icon className={`w-6 h-6 ${active ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">{label}</span>
        </button>
    );
}

function CouponImageTemplate({ coupon }) {
    if (!coupon) return null;
    return (
        <div id={`coupon-card-${coupon.code}`} className="fixed left-[-9999px] w-[400px] h-[220px] bg-gradient-to-br from-indigo-600 to-purple-800 text-white p-7 rounded-2xl overflow-hidden shadow-2xl">
            {/* Background Pattern */}
            <div className="absolute top-[-20%] right-[-10%] opacity-10">
                <DollarSign className="w-56 h-56" />
            </div>

            <div className="relative z-10 h-full flex flex-col justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                            <DollarSign className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-xs font-black tracking-widest text-indigo-100 uppercase">Cashback Voucher</span>
                    </div>
                    <h3 className="text-sm font-bold text-white/80">10년의 약속 캐시백 쿠폰</h3>
                </div>

                <div className="flex flex-col gap-1">
                    <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold">₩</span>
                        <span className="text-4xl font-black tabular-nums tracking-tight">
                            {Number(coupon.amount).toLocaleString()}
                        </span>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/20">
                        <div className="font-mono text-lg font-black tracking-widest bg-white/10 px-3 py-1 rounded">
                            {coupon.code}
                        </div>
                        <div className="text-[10px] text-white/50 text-right">
                            발행일: {new Date(coupon.created_at).toLocaleDateString()}<br />
                            10promise.com
                        </div>
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
    const [issueAmount, setIssueAmount] = useState('200000');
    const [issueQty, setIssueQty] = useState(1);
    const [maxQty, setMaxQty] = useState(10);
    const [maxAmount, setMaxAmount] = useState(200000);
    const [issuing, setIssuing] = useState(false);

    useEffect(() => {
        fetchData();
    }, [user.id]);

    const fetchData = async () => {
        setLoading(true);
        // 1. Fetch Earnings
        const { data: earningData } = await supabase
            .from('settlements')
            .select(`*, funeral_cases (location, package_name, profiles:customer_id (name))`)
            .eq('recipient_id', user.id)
            .order('created_at', { ascending: false });
        if (earningData) setEarnings(earningData);

        // 2. Fetch Team (if Master)
        const { data: teamData } = await supabase
            .from('partners')
            .select('*, profiles!partners_user_id_fkey(name)')
            .eq('master_id', user.id);
        if (teamData) setTeam(teamData);

        // 3. Fetch Coupons
        const { data: couponData } = await supabase
            .from('coupons')
            .select('*')
            .eq('issued_by', user.id)
            .order('created_at', { ascending: false });

        if (couponData) setCoupons(couponData);

        // 4. Fetch Config for Max Qty
        const { data: configData } = await supabase
            .from('system_config')
            .select('value')
            .eq('key', 'max_coupon_per_batch')
            .single();
        if (configData) setMaxQty(parseInt(configData.value) || 10);

        // 5. Fetch Max Amount
        const { data: amountData } = await supabase
            .from('system_config')
            .select('value')
            .eq('key', 'max_coupon_amount')
            .single();
        if (amountData) {
            const m = parseInt(amountData.value) || 200000;
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
            showToast('error', '제한 초과', `한 번에 최대 ${maxQty}장까지만 발행 가능합니다.`);
            return;
        }

        if (parseInt(issueAmount) > maxAmount) {
            showToast('error', '금액 초과', `최대 ${maxAmount.toLocaleString()}원까지만 발행 가능합니다.`);
            return;
        }

        if (!confirm(`${Number(issueAmount).toLocaleString()}원 쿠폰 ${issueQty}장을 발행하시겠습니까?`)) return;

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

            showToast('success', '발행 완료', `${issueQty}장의 쿠폰이 발행되었습니다.`);
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

        try {
            const canvas = await html2canvas(element, {
                scale: 3,
                useCORS: true,
                backgroundColor: null,
            });
            const link = document.createElement('a');
            link.download = `10년의약속_쿠폰_${coupon.code}.jpg`;
            link.href = canvas.toDataURL('image/jpeg', 0.95);
            link.click();
            showToast('success', '다운로드 성공', '쿠폰 이미지가 갤러리에 저장되었습니다.');
        } catch (err) {
            console.error('Coupon Image Gen Error', err);
            showToast('error', '다운로드 실패', '이미지 생성 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="space-y-6">
            {/* Revenue Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-indigo-100 font-medium">총 누적 수익금</span>
                    <TrendingUp className="w-5 h-5 text-indigo-200" />
                </div>
                <h2 className="text-4xl font-bold">₩ {totalRevenue.toLocaleString()}</h2>
                <div className="mt-4 flex gap-2">
                    <span className="text-xs bg-white/20 px-2 py-1 rounded">이번 달: ₩ {(totalRevenue * 0.8).toLocaleString()} (예상)</span>
                </div>
            </div>

            {/* Coupons Section */}
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-indigo-600" />
                        내가 발행한 쿠폰
                    </h3>
                    <button
                        onClick={() => setShowIssueModal(true)}
                        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-700 transition-all flex items-center gap-1"
                    >
                        <PlusCircle className="w-3 h-3" /> 쿠폰 발행
                    </button>
                </div>
                {loading ? <p>로딩 중...</p> : (
                    <div className="space-y-3">
                        {coupons.length === 0 ? <p className="text-gray-400 text-sm">보유한 쿠폰이 없습니다.</p> : coupons.map(coupon => (
                            <div key={coupon.code} className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-indigo-900 text-lg">₩ {coupon.amount.toLocaleString()}</div>
                                    <div className="text-xs text-indigo-600 font-mono mt-1">{coupon.code}</div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${coupon.status === 'active' || coupon.status === 'issued' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                        {coupon.status === 'active' || coupon.status === 'issued' ? '사용 가능' : '사용 완료'}
                                    </span>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => handleDownloadImage(coupon)}
                                            className="text-xs text-indigo-600 font-bold flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" /> 이미지 저장
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

            {/* Issuance Modal */}
            {showIssueModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="bg-indigo-600 text-white p-5 flex justify-between items-center">
                            <h4 className="font-bold flex items-center gap-2">
                                <PlusCircle className="w-5 h-5" /> 쿠폰 직접 발행
                            </h4>
                            <button onClick={() => setShowIssueModal(false)} className="text-indigo-200 hover:text-white">&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">발행 금액</label>
                                <select
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-bold"
                                    value={issueAmount}
                                    onChange={e => setIssueAmount(e.target.value)}
                                >
                                    {[10000, 50000, 100000, 200000, 300000, 500000].filter(amt => amt <= maxAmount).map(amt => (
                                        <option key={amt} value={amt}>{amt.toLocaleString()}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">발행 수량 (최대 {maxQty}장)</label>
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
                                {issuing ? '발행 중...' : '🎟️ 쿠폰 즉시 발행'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* My Team */}
            {team.length > 0 && (
                <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                    <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <Users className="w-5 h-5 text-indigo-600" />
                        내 하위 파트너 ({team.length}명)
                    </h3>
                    <div className="space-y-2">
                        {team.map(member => (
                            <div key={member.id} className="flex justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                                <span className="font-medium">{member.profiles?.name}</span>
                                <span className="text-gray-500">{member.region} • {member.grade}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Activity List (Simplified) */}
            <div>
                <h3 className="font-bold text-gray-800 mb-3">최근 수익 내역</h3>
                {loading ? <p>로딩 중...</p> : (
                    <div className="space-y-3">
                        {earnings.length === 0 ? <p className="text-gray-400 text-center py-4">내역이 없습니다.</p> : earnings.map(item => (
                            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-gray-800">{item.funeral_cases?.profiles?.name || '고객'} 장례</div>
                                    <div className="text-xs text-gray-500">{item.type === 'dealer_commission' ? '판매 수수료' : '오버라이딩'}</div>
                                </div>
                                <div className="text-indigo-600 font-bold">+ {item.amount.toLocaleString()}</div>
                            </div>
                        ))}
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

    useEffect(() => {
        const fetchPackages = async () => {
            const { data } = await supabase.from('system_config').select('value').eq('key', 'funeral_packages').single();
            if (data && data.value) {
                try {
                    const parsed = JSON.parse(data.value);
                    setPackages(parsed);
                    if (parsed.length > 0) {
                        setFormData(prev => ({ ...prev, packageName: parsed[0].value }));
                    }
                } catch (e) { console.error('Failed to parse packages'); }
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
                    .eq('code', formData.couponCode.trim())
                    .single();

                if (couponError || !coupon) {
                    throw new Error('유효하지 않은 쿠폰 번호입니다.');
                }
                if (coupon.status === 'used') {
                    throw new Error('이미 사용된 쿠폰입니다.');
                }
                linkedCoupon = coupon;
            }

            const { data: newCase, error: caseError } = await supabase
                .from('funeral_cases')
                .insert({
                    customer_id: user.id, // The dealer is the requester
                    location: formData.location || '미정',
                    package_name: formData.packageName,
                    status: 'requested' // 🚨 긴급 접수
                })
                .select()
                .single();

            if (caseError) throw caseError;

            // Link coupon if exists
            if (linkedCoupon) {
                await supabase
                    .from('coupons')
                    .update({ case_id: newCase.id })
                    .eq('id', linkedCoupon.id);
            }

            showToast('success', '접수 완료', '장례 접수가 완료되었습니다. 해피콜을 기다려주세요.');
            onSuccess();
        } catch (error) {
            console.error(error);
            showToast('error', '접수 실패', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white px-5 py-8 rounded-2xl shadow-md border border-gray-200">
            <h2 className="text-2xl font-black text-red-600 mb-2 flex items-center gap-2">🚨 긴급 장례 접수</h2>
            <p className="text-base text-gray-700 mb-8 font-medium leading-relaxed bg-red-50 p-4 rounded-xl border border-red-100">
                상주님의 정보를 입력하고 <strong className="text-red-600 text-lg">접수하기</strong> 버튼을 누르시면, 본사 상황실로 <strong className="text-red-600">즉시 전송</strong>되어 10년 경력의 마스터가 배정됩니다.
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
                            placeholder="예: 서울대병원 장례식장"
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
                    <label className="block text-base font-bold text-gray-900 mb-2">희망 상품 (선택)</label>
                    <div className="relative">
                        <Package className="absolute left-4 top-4 w-6 h-6 text-gray-400" />
                        <select
                            className="w-full pl-14 pr-10 py-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-red-500/20 focus:border-red-500 appearance-none bg-gray-50 font-bold text-gray-900"
                            value={formData.packageName}
                            onChange={e => setFormData({ ...formData, packageName: e.target.value })}
                        >
                            {packages.length > 0 ? (
                                packages.map((pkg, idx) => (
                                    <option key={idx} value={pkg.value}>{pkg.label}</option>
                                ))
                            ) : (
                                <>
                                    <option value="기본형">기본형 (390만원)</option>
                                    <option value="고급형">고급형 (490만원)</option>
                                    <option value="프리미엄">프리미엄 (590만원)</option>
                                    <option value="VIP">VIP (790만원)</option>
                                </>
                            )}
                        </select>
                    </div>
                </div>

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
                    {loading ? '접수 처리 중...' : '🔴 긴급 접수하기'}
                </button>
            </form>
        </div>
    );
}

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

        const { data } = await supabase
            .from('funeral_cases')
            .select(`
                *,
                team_leader:team_leader_id (
                    name,
                    phone,
                    role,
                    avatar_url,
                    experience_years,
                    introduction
                )
            `)
            .in('customer_id', targetIds)
            .order('created_at', { ascending: false });

        if (data) setMyCases(data);
        setLoading(false);
    };

    const maskName = (n) => n ? (n.length <= 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1]) : '';

    const statusMap = {
        'requested': { label: '🚨 접수 대기', color: 'bg-red-100 text-red-700' },
        'assigned': { label: '🟡 팀장 배정', color: 'bg-yellow-100 text-yellow-700' },
        'consulting': { label: '🗣️ 상담 중', color: 'bg-orange-100 text-orange-700' },
        'in_progress': { label: '🔵 서비스 진행', color: 'bg-blue-100 text-blue-700' },
        'team_settling': { label: '🟢 정산 대기', color: 'bg-green-100 text-green-700' },
        'settling': { label: '🟢 정산 대기', color: 'bg-green-100 text-green-700' }, // Fallback
        'hq_check': { label: '🟢 정산 검토 중', color: 'bg-green-100 text-green-700' },
        'completed': { label: '⚪ 완료됨', color: 'bg-gray-100 text-gray-600' }
    };

    const [expandedCaseId, setExpandedCaseId] = useState(null);

    return (
        <div className="space-y-4">
            <h2 className="font-bold text-gray-800 px-1">접수 현황 ({myCases.length}건)</h2>
            {loading ? <div className="text-center py-10">로딩 중...</div> : myCases.length === 0 ? (
                <div className="bg-white p-10 rounded-2xl text-center text-gray-400 border border-gray-100">
                    접수한 내역이 없습니다.
                </div>
            ) : (
                myCases.map(item => {
                    const status = statusMap[item.status] || { label: item.status, color: 'bg-gray-100 text-gray-500' };
                    return (
                        <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-3 hover:border-indigo-100 transition-colors">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${status.color}`}>
                                            {status.label}
                                        </span>
                                        <span className="text-xs text-gray-400">{new Date(item.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div className="font-bold text-gray-800 text-lg">{item.location}</div>
                                    <div className="text-sm text-gray-500">{item.package_name}</div>
                                </div>
                            </div>

                            {/* Team Leader Info */}
                            {item.team_leader && (
                                <div
                                    onClick={() => {
                                        setSelectedLeader(item.team_leader.profiles);
                                        setProfileModalOpen(true);
                                    }}
                                    className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between cursor-pointer group"
                                >
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                                            {item.team_leader.profiles?.avatar_url ? (
                                                <img src={item.team_leader.profiles.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-4 h-4 text-gray-400" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-400">담당 팀장</div>
                                            <div className="text-sm font-bold text-gray-800 group-hover:text-indigo-600 transition-colors">
                                                {maskName(item.team_leader.profiles?.name)}
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400" />
                                </div>
                            )}

                            {/* View Progress Button */}
                            <button
                                onClick={() => setExpandedCaseId(expandedCaseId === item.id ? null : item.id)}
                                className="w-full mt-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-sm font-bold rounded-xl transition-colors"
                            >
                                {expandedCaseId === item.id ? '진행 상황 닫기' : '실시간 장례 진행 상황 보기'}
                            </button>

                            {/* Expanded Timeline */}
                            {expandedCaseId === item.id && (
                                <div className="mt-4 border-t border-gray-100 pt-4 animate-fadeIn">
                                    <TimelineView caseId={item.id} />
                                </div>
                            )}
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
