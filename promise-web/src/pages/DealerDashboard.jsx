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
    Bell
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MySettlements from '../components/dealer/MySettlements';
import BranchManagement from '../components/dealer/BranchManagement';
import { useNotification } from '../contexts/NotificationContext';
import NotificationCenter from '../components/common/NotificationCenter';

export default function DealerDashboard() {
    const { showToast, unreadCount } = useNotification();
    const [activeTab, setActiveTab] = useState('home'); // 'home', 'register', 'status', 'settlement', 'branch'
    const [user, setUser] = useState(null);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            navigate('/login');
        }
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
                    </h1>
                    <p className="text-sm text-gray-500">{user.name} {user.role === 'dealer' ? '딜러' : '파트너'}님 ({user.role === 'dealer' && 'Master'})</p>
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
                        {isNotifOpen && <NotificationCenter onClose={() => setIsNotifOpen(false)} />}
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

// --- Tabs ---

function HomeTab({ user }) {
    const { showToast } = useNotification();
    const [earnings, setEarnings] = useState([]);
    const [team, setTeam] = useState([]);
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(true);

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
            .select('*, profiles:user_id(name)')
            .eq('master_id', user.id);
        if (teamData) setTeam(teamData);

        // 3. Fetch Coupons
        const { data: couponData } = await supabase
            .from('coupons')
            .select('*')
            .order('created_at', { ascending: false });

        if (couponData) setCoupons(couponData);

        setLoading(false);
    };

    const totalRevenue = earnings.reduce((acc, curr) => acc + curr.amount, 0);

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
                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-indigo-600" />
                    보유 쿠폰
                </h3>
                {loading ? <p>로딩 중...</p> : (
                    <div className="space-y-3">
                        {coupons.length === 0 ? <p className="text-gray-400 text-sm">보유한 쿠폰이 없습니다.</p> : coupons.map(coupon => (
                            <div key={coupon.code} className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-indigo-900 text-lg">₩ {coupon.amount.toLocaleString()}</div>
                                    <div className="text-xs text-indigo-600 font-mono mt-1">{coupon.code}</div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${coupon.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                        {coupon.status === 'active' ? '사용 가능' : '사용 완료'}
                                    </span>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(coupon.code);
                                            showToast('success', '복사 완료', '쿠폰 코드가 복사되었습니다.');
                                        }}
                                        className="text-xs text-gray-500 underline"
                                    >
                                        코드 복사
                                    </button>
                                </div>
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
        packageName: '기본형',
        memo: ''
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!confirm('정말 접수하시겠습니까?')) return;
        setLoading(true);

        try {
            const { error } = await supabase.from('funeral_cases').insert({
                customer_id: user.id, // The dealer is the requester
                location: formData.location || '미정',
                package_name: formData.packageName,
                status: 'requested' // 🚨 긴급 접수
            });

            if (error) throw error;

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
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-1">장례 긴급 접수</h2>
            <p className="text-sm text-gray-500 mb-6">고객님의 정보를 입력해주시면 상황실로 즉시 전송됩니다.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">고객명 (상주)</label>
                    <input
                        type="text"
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="홍길동"
                        value={formData.customerName}
                        onChange={e => setFormData({ ...formData, customerName: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
                    <input
                        type="tel"
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">장례식장 (선택)</label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="서울대병원 장례식장"
                            value={formData.location}
                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">희망 상품 (선택)</label>
                    <div className="relative">
                        <Package className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                        <select
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none bg-white"
                            value={formData.packageName}
                            onChange={e => setFormData({ ...formData, packageName: e.target.value })}
                        >
                            <option value="기본형">기본형 (390만원)</option>
                            <option value="고급형">고급형 (490만원)</option>
                            <option value="프리미엄">프리미엄 (590만원)</option>
                            <option value="VIP">VIP (790만원)</option>
                        </select>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
                >
                    {loading ? '접수 중...' : '접수 완료'}
                </button>
            </form>
        </div>
    );
}

function StatusTab({ user }) {
    const [myCases, setMyCases] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchMyCases();
    }, [user.id]);

    const fetchMyCases = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('funeral_cases')
            .select('*')
            .eq('customer_id', user.id) // Fetch cases requested by ME
            .order('created_at', { ascending: false });
        if (data) setMyCases(data);
        setLoading(false);
    };

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
                        <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
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
                            <ChevronRight className="w-5 h-5 text-gray-300" />
                        </div>
                    );
                })
            )}
        </div>
    );
}
