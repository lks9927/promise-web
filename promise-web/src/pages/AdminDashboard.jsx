import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
    BarChart3,
    Users,
    FileText,
    Settings,
    Bell,
    Search,
    CheckCircle,
    AlertCircle,
    Clock,
    ChevronRight,
    DollarSign,
    LogOut,
    Lock
} from 'lucide-react';

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('settlement'); // 'dashboard', 'settlement', 'cases', 'partners', 'settings'
    const [settlements, setSettlements] = useState([]);
    const [cases, setCases] = useState([]);
    const [partners, setPartners] = useState([]);
    const [partnerFilter, setPartnerFilter] = useState('all'); // 'all', 'leader', 'dealer'
    const [passwordRequests, setPasswordRequests] = useState([]); // New: Password Reset Requests
    const [config, setConfig] = useState({});
    const [loading, setLoading] = useState(true);

    const [searchParams] = useSearchParams();
    // Mock Admin Level (Dynamic for Demo)
    const CURRENT_ADMIN_LEVEL = searchParams.get('role') === 'operating' ? 'operating' : 'super';

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);

            // 1. Fetch Settlements
            const { data: settlementData } = await supabase
                .from('settlements')
                .select(`
                    *,
                    funeral_cases (id, status, final_price, package_name),
                    profiles:recipient_id (name, role)
                `);
            if (settlementData) setSettlements(settlementData);

            // 2. Fetch Funeral Cases
            const { data: caseData } = await supabase
                .from('funeral_cases')
                .select(`
                    *,
                    profiles:customer_id (name, phone)
                `)
                .order('created_at', { ascending: false });
            if (caseData) setCases(caseData);

            // 3. Fetch Partners
            const { data: partnerData, error: partnerError } = await supabase
                .from('partners')
                .select(`
                    *,
                    profiles:user_id (name, phone, role, email)
                `);
            if (partnerData) setPartners(partnerData);

            // 4. Fetch System Config
            const { data: configData } = await supabase.from('system_config').select('*');
            if (configData) {
                const configMap = configData.reduce((acc, cur) => ({ ...acc, [cur.key]: cur.value }), {});
                setConfig(configMap);
            }

            // 5. Fetch Password Reset Requests
            const { data: requestData } = await supabase
                .from('profiles')
                .select('*')
                .eq('password_reset_requested', true);
            if (requestData) setPasswordRequests(requestData);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const togglePartnerStatus = async (partnerId, currentStatus, role) => {
        // If suspended or pending, approve them. If approved, suspend them.
        const newStatus = (currentStatus === 'suspended' || currentStatus === 'pending') ? 'approved' : 'suspended';

        // SAFETY LOCK: Prevent suspending 'leader' if they have active cases
        if (role === 'leader' && newStatus === 'suspended') {
            const { count, error } = await supabase
                .from('funeral_cases')
                .select('*', { count: 'exact', head: true })
                .eq('team_leader_id', partnerId)
                .in('status', ['assigned', 'in_progress', 'team_settling']);

            if (count > 0) {
                alert(`⚠️ 진행 중인 장례 건(${count}건)이 있어 정지할 수 없습니다.\n모든 장례가 종료된 후 다시 시도해주세요.`);
                return;
            }
        }

        if (confirm(`해당 파트너를 ${newStatus === 'approved' ? '승인' : '정지'} 처리하시겠습니까?`)) {
            const { error } = await supabase
                .from('partners')
                .update({ status: newStatus })
                .eq('user_id', partnerId);

            if (error) {
                console.error(error);
                alert('처리 중 오류가 발생했습니다.');
            } else {
                fetchData();
            }
        }
    };

    const handleApproveReset = async (userId, phone, name, role) => {
        const isAdmin = role === 'admin';
        const msg = isAdmin
            ? `${name}님(관리자)의 비밀번호를 초기화하시겠습니까?\n(랜덤 임시 비밀번호가 생성됩니다)`
            : `${name}님의 비밀번호를 초기화하시겠습니까?\n(연락처 끝 4자리로 변경됩니다)`;

        if (!confirm(msg)) return;

        let newPassword;
        if (isAdmin) {
            // Generate Random 6-char Password for Admins
            newPassword = Math.random().toString(36).slice(-6).toUpperCase();
        } else {
            // Use Last 4 Digits of Phone for everyone else
            newPassword = phone.slice(-4);
        }

        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    password: newPassword,
                    password_reset_requested: false
                })
                .eq('id', userId);

            if (error) throw error;

            if (isAdmin) {
                alert(`✅ 초기화 완료!\n\n임시 비밀번호: [ ${newPassword} ]\n\n이 비밀번호를 ${name} 관리자님께 전달해주세요.`);
            } else {
                alert('비밀번호가 초기화되었습니다.\n(연락처 끝 4자리)');
            }
            fetchData();
        } catch (error) {
            console.error(error);
            alert('초기화 중 오류가 발생했습니다.');
        }
    };

    // 🔹 New: Admin triggers reset manually for a partner
    const handlePasswordReset = async (userId, name) => {
        // Need to fetch phone number first since it's not passed directly in the onClick
        // Or we can just fetch it from the partners list state
        const partner = partners.find(p => p.user_id === userId);
        if (!partner || !partner.profiles?.phone) {
            alert('사용자 정보를 찾을 수 없습니다.');
            return;
        }

        handleApproveReset(userId, partner.profiles.phone, name, partner.profiles.role);
    };

    const getRoleDisplayName = (role, grade) => {
        if (role === 'leader') {
            return (grade === 'S' || grade === 'Master') ? '마스터팀장' : '팀장';
        }
        if (['dealer', 'morning', 'meal', '아침', '식사'].includes(role)) {
            return (grade === 'S' || grade === 'Master') ? '마스터딜러' : '딜러';
        }
        if (role === 'master') return '마스터딜러';
        return role === 'assistant' ? '상례사' : role;
    };

    return (
        <div className="min-h-screen bg-[#FCFBF9] flex font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-[#1B2B48] text-white hidden md:block flex-shrink-0">
                <div className="p-6 border-b border-[#2C3E5D]">
                    <Link to="/" className="cursor-pointer hover:opacity-80 transition-opacity">
                        <h1 className="text-xl font-bold tracking-tight font-serif">10년의 약속 <span className="text-[#C5A065] font-sans text-sm align-top">Admin</span></h1>
                    </Link>
                </div>
                <nav className="p-4 space-y-2">
                    <NavItem
                        icon={<FileText />}
                        label="장례 접수 현황"
                        active={activeTab === 'cases'}
                        onClick={() => setActiveTab('cases')}
                        badge={cases.filter(c => c.status === 'requested').length}
                    />
                    {passwordRequests.length > 0 && (
                        <div
                            onClick={() => {
                                setActiveTab('settings');
                                setTimeout(() => document.getElementById('pw-requests')?.scrollIntoView({ behavior: 'smooth' }), 100);
                            }}
                            className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg cursor-pointer hover:bg-red-500/20 transition-colors flex items-center gap-3 mb-2 mx-4"
                        >
                            <AlertCircle className="w-5 h-5 animate-pulse" />
                            <span className="font-bold text-sm">비밀번호 재설정 {passwordRequests.length}건</span>
                        </div>
                    )}
                    {CURRENT_ADMIN_LEVEL === 'super' && (
                        <NavItem
                            icon={<DollarSign />}
                            label="정산 관리"
                            active={activeTab === 'settlement'}
                            onClick={() => setActiveTab('settlement')}
                            badge={settlements.filter(s => s.status === 'pending').length}
                        />
                    )}
                    <NavItem
                        icon={<Users />}
                        label="파트너 관리"
                        active={activeTab === 'partners'}
                        onClick={() => setActiveTab('partners')}
                    />
                    <NavItem
                        icon={<Settings />}
                        label="환경 설정"
                        active={activeTab === 'settings'}
                        onClick={() => setActiveTab('settings')}
                    />
                </nav>
                <div className="p-4 border-t border-[#2C3E5D]">
                    <button
                        onClick={() => {
                            if (confirm('로그아웃 하시겠습니까?')) {
                                localStorage.removeItem('user');
                                window.location.href = '/login';
                            }
                        }}
                        className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white hover:bg-[#253550] rounded-lg transition-colors w-full"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className="font-medium">로그아웃</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0">
                <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 sticky top-0 z-30">
                    <div className="flex items-center gap-3">
                        {/* Mobile Menu Button - Placeholder/Simple toggle could go here */}
                        <h2 className="text-lg font-semibold text-gray-800">
                            {activeTab === 'cases' ? '📋 접수 현황' : activeTab === 'settlement' ? '💰 정산' : activeTab === 'settings' ? '⚙️ 설정' : '👥 파트너'}
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-bold text-gray-900">{JSON.parse(localStorage.getItem('user') || '{}').name || '관리자'}님</div>
                            <div className="text-xs text-gray-500">{CURRENT_ADMIN_LEVEL === 'super' ? '슈퍼 관리자' : '운영 관리자'}</div>
                        </div>
                        <div className="relative">
                            <Bell className="w-5 h-5 text-gray-500 hover:text-gray-700 cursor-pointer" />
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                        </div>
                        <div
                            className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs cursor-pointer"
                            onClick={() => {
                                if (confirm('로그아웃 하시겠습니까?')) {
                                    localStorage.removeItem('user');
                                    window.location.href = '/login';
                                }
                            }}
                        >
                            {JSON.parse(localStorage.getItem('user') || '{}').name?.[0] || 'A'}
                        </div>
                    </div>
                </header>

                <div className="p-6 overflow-y-auto">
                    {/* Stats Cards - Shared */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <StatCard label="오늘 접수 건" value={cases.filter(c => new Date(c.created_at).getDate() === new Date().getDate()).length} icon={<FileText className="text-blue-600" />} />
                        <StatCard label="진행 중" value={cases.filter(c => c.status === 'in_progress').length} icon={<Clock className="text-orange-600" />} />
                        <StatCard label="정산 대기" value={`₩ ${settlements.filter(s => s.status === 'pending').reduce((acc, cur) => acc + cur.amount, 0).toLocaleString()}`} icon={<DollarSign className="text-green-600" />} highlight />
                        <StatCard label="등록 파트너" value={partners.length} icon={<Users className="text-purple-600" />} />
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 text-lg">
                                {activeTab === 'cases' ? '접수 목록' : activeTab === 'settlement' ? '정산 목록' : activeTab === 'settings' ? '설정 패널' : '파트너 리스트'}
                            </h3>
                            <button onClick={fetchData} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">새로고침</button>
                            <button onClick={fetchData} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">새로고침</button>
                        </div>

                        {/* Partner Filter Tabs */}
                        {activeTab === 'partners' && (
                            <div className="px-6 pt-4 flex gap-2">
                                <button onClick={() => setPartnerFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${partnerFilter === 'all' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>전체</button>
                                <button onClick={() => setPartnerFilter('leader')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${partnerFilter === 'leader' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>팀장</button>
                                <button onClick={() => setPartnerFilter('dealer')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${partnerFilter === 'dealer' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}>딜러</button>
                            </div>
                        )}

                        {activeTab === 'settings' ? (
                            <SettingsPanel
                                config={config}
                                onUpdate={fetchData}
                                passwordRequests={passwordRequests}
                                onApproveReset={handleApproveReset}
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-medium">
                                        <tr>
                                            {activeTab === 'cases' ? (
                                                <>
                                                    <th className="px-6 py-4">접수번호</th>
                                                    <th className="px-6 py-4">상주 성함 (연락처)</th>
                                                    <th className="px-6 py-4">장소</th>
                                                    <th className="px-6 py-4">상품</th>
                                                    <th className="px-6 py-4 text-center">상태</th>
                                                </>
                                            ) : activeTab === 'settlement' ? (
                                                <>
                                                    <th className="px-6 py-4">접수번호</th>
                                                    <th className="px-6 py-4">대상자 (역할)</th>
                                                    <th className="px-6 py-4">금액</th>
                                                    <th className="px-6 py-4">유형</th>
                                                    <th className="px-6 py-4 text-center">상태</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="px-6 py-4">이름 (역할)</th>
                                                    <th className="px-6 py-4">연락처</th>
                                                    <th className="px-6 py-4">활동 지역</th>
                                                    <th className="px-6 py-4">등급</th>
                                                    <th className="px-6 py-4">상태 관리</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {loading ? (
                                            <tr><td colSpan="5" className="px-6 py-4 text-center">데이터를 불러오는 중...</td></tr>
                                        ) : activeTab === 'cases' ? (
                                            cases.map(item => (
                                                <tr key={item.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 font-mono text-gray-500 text-xs">{item.id.substring(0, 8)}...</td>
                                                    <td className="px-6 py-4 font-bold text-gray-900">
                                                        {item.profiles?.name} <span className="text-gray-400 font-normal">({item.profiles?.phone})</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-600">{item.location}</td>
                                                    <td className="px-6 py-4 text-gray-600">{item.package_name}</td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${item.status === 'requested' ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-600'}`}>
                                                            {item.status === 'requested' ? '🚨 긴급 접수' : item.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : activeTab === 'settlement' ? (
                                            settlements.map((item) => (
                                                <TableRow
                                                    key={item.id}
                                                    id={item.funeral_cases?.id?.substring(0, 8)}
                                                    names={`${item.profiles?.name} (${item.profiles?.role})`}
                                                    amount={item.amount.toLocaleString()}
                                                    type={item.type === 'dealer_commission' ? '딜러 수수료' : '고객 캐시백'}
                                                    status={item.status}
                                                    isPrePaid={item.is_pre_paid}
                                                />
                                            ))
                                        ) : (
                                            partners
                                                .filter(p => partnerFilter === 'all' || p.profiles?.role === partnerFilter)
                                                // If filter is 'dealer', include 'master' as well if needed, but for now strict match.
                                                // Actually let's refine: if filter is 'dealer', show dealers. If 'leader', show leaders.
                                                .filter(p => {
                                                    if (partnerFilter === 'all') return true;
                                                    if (partnerFilter === 'leader') return p.profiles?.role === 'leader';
                                                    if (partnerFilter === 'dealer') return ['dealer', 'master', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role);
                                                    return true;
                                                })
                                                .map((partner) => (
                                                    <tr key={partner.user_id} className={`hover:bg-gray-50 transition-colors ${partner.status === 'suspended' ? 'bg-red-50' : ''}`}>
                                                        <td className="px-6 py-4">
                                                            <span className={`font-bold ${partner.status === 'suspended' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{partner.profiles?.name}</span>
                                                            <span className="ml-2 bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full border border-indigo-100">
                                                                {getRoleDisplayName(partner.profiles?.role, partner.grade)}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-gray-600">{partner.profiles?.phone}</td>
                                                        <td className="px-6 py-4 text-gray-600">{partner.region}</td>
                                                        <td className="px-6 py-4">
                                                            <span className="bg-purple-100 text-purple-700 font-bold px-2 py-1 rounded text-xs">{partner.grade}</span>
                                                        </td>
                                                        <td className="px-6 py-4 font-mono text-gray-500 text-xs flex items-center gap-2">
                                                            <button
                                                                onClick={() => togglePartnerStatus(partner.user_id, partner.status, partner.profiles?.role)}
                                                                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${partner.status === 'approved' ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700' : 'bg-gray-200 text-gray-500 hover:bg-green-100 hover:text-green-700'}`}
                                                            >
                                                                {partner.status === 'approved' ? '정상 승인' : partner.status === 'suspended' ? '활동 정지' : partner.status}
                                                            </button>
                                                            <button
                                                                onClick={() => handlePasswordReset(partner.user_id, partner.profiles?.name)}
                                                                className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                                                                title="비밀번호 변경"
                                                            >
                                                                <Lock className="w-4 h-4" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                    </div>
                </div>
            </main>
        </div>
    );
}

// Helper Components
function NavItem({ icon, label, active, badge, onClick }) {
    return (
        <div
            onClick={onClick}
            className={`flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer transition-colors ${active ? 'bg-[#2C3E5D] text-[#C5A065] border-r-4 border-[#C5A065]' : 'text-gray-400 hover:bg-[#253550] hover:text-white'}`}
        >
            <div className="flex items-center gap-3">
                {icon}
                <span className={`font-medium ${active ? 'font-bold' : ''}`}>{label}</span>
            </div>
            {badge ? <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{badge}</span> : null}
        </div>
    );
}

function StatCard({ label, value, icon, change, highlight }) {
    return (
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <p className="text-gray-500 text-sm font-medium">{label}</p>
                    <h4 className={`text-2xl font-bold mt-1 ${highlight ? 'text-indigo-600' : 'text-gray-900'}`}>{value}</h4>
                </div>
                <div className={`p-2 rounded-lg ${highlight ? 'bg-green-50' : 'bg-gray-50'}`}>
                    {icon}
                </div>
            </div>
            {change && <div className="text-xs text-green-600 font-medium flex items-center gap-1">↑ {change} 전일 대비</div>}
        </div>
    );
}

function TableRow({ id, names, amount, type, status, isPrePaid }) {
    const getStatusBadge = (s, paid) => {
        if (s === 'paid') return <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-bold">지급 완료</span>;
        if (paid) return <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold">선지급 완료</span>;
        return <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold">지급 대기</span>;
    };

    return (
        <tr className="hover:bg-gray-50 transition-colors">
            <td className="px-6 py-4 font-mono text-gray-500 text-xs">{id}...</td>
            <td className="px-6 py-4 font-medium text-gray-900">{names}</td>
            <td className="px-6 py-4 font-bold text-gray-900">₩ {amount}</td>
            <td className="px-6 py-4 text-gray-600">{type}</td>
            <td className="px-6 py-4 text-center">{getStatusBadge(status, isPrePaid)}</td>
        </tr>
    );
}

function SettingsPanel({ config, onUpdate, passwordRequests, onApproveReset }) {
    const toggleConfig = async (key, currentValue) => {
        // Handle null/undefined values by defaulting to 'false'
        const safeValue = currentValue || 'false';
        const newValue = safeValue === 'true' ? 'false' : 'true';

        await supabase.from('system_config').upsert({ key, value: newValue });
        alert('설정이 변경되었습니다.');
        onUpdate();
    };

    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h3 className="text-xl font-bold mb-6">시스템 운영 설정</h3>

            {/* Password Reset Requests Section */}
            {passwordRequests && passwordRequests.length > 0 && (
                <div id="pw-requests" className="mb-8 bg-red-50 border border-red-200 rounded-xl p-6">
                    <h4 className="font-bold text-red-800 flex items-center gap-2 mb-4">
                        <AlertCircle className="w-5 h-5" /> 비밀번호 초기화 요청 ({passwordRequests.length})
                    </h4>
                    <div className="space-y-3">
                        {passwordRequests.map(req => (
                            <div key={req.id} className="bg-white p-4 rounded-lg border border-red-100 flex items-center justify-between shadow-sm">
                                <div>
                                    <span className="font-bold text-gray-900">{req.name}</span>
                                    <span className="text-gray-500 text-sm ml-2">({req.phone})</span>
                                    <span className="block text-xs text-gray-400 mt-1">{req.role}</span>
                                </div>
                                <button
                                    onClick={() => onApproveReset(req.id, req.phone, req.name, req.role)}
                                    className="px-3 py-1.5 bg-red-600 text-white text-sm font-bold rounded hover:bg-red-700 transition-colors"
                                >
                                    초기화 승인
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-6">
                {/* New: Real-time Bidding Switch */}
                <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm flex items-center justify-between ring-1 ring-indigo-50">
                    <div>
                        <h4 className="font-bold text-indigo-900 mb-1 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-600" /> 팀장 실시간 입찰 허용
                        </h4>
                        <p className="text-sm text-gray-500">팀장(상례사)이 대기 중인 장례 건에 직접 입찰할 수 있도록 허용합니다.</p>
                    </div>
                    <button
                        onClick={() => toggleConfig('bidding_enabled', config.bidding_enabled)}
                        className={`w-14 h-8 rounded-full transition-colors relative ${config.bidding_enabled === 'true' ? 'bg-indigo-600' : 'bg-gray-200'}`}
                    >
                        <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.bidding_enabled === 'true' ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <h4 className="font-bold text-gray-900 mb-1">하늘꽃(입관꽃) 필수 발주</h4>
                        <p className="text-sm text-gray-500">팀장 화면에서 '하늘꽃 발주' 버튼을 노출시킬지 설정합니다.</p>
                    </div>
                    <button
                        onClick={() => toggleConfig('flower_order_required', config.flower_order_required)}
                        className={`w-14 h-8 rounded-full transition-colors relative ${config.flower_order_required === 'true' ? 'bg-indigo-600' : 'bg-gray-200'}`}
                    >
                        <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.flower_order_required === 'true' ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>

                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <h4 className="font-bold text-gray-900 mb-1">전체 정산 기능 활성화</h4>
                        <p className="text-sm text-gray-500">딜러 및 마스터의 '정산 신청' 버튼을 활성화합니다. (마감 시 OFF 권장)</p>
                    </div>
                    <button
                        onClick={() => toggleConfig('global_settlement_enabled', config.global_settlement_enabled)}
                        className={`w-14 h-8 rounded-full transition-colors relative ${config.global_settlement_enabled === 'true' ? 'bg-green-600' : 'bg-gray-200'}`}
                    >
                        <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.global_settlement_enabled === 'true' ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>

                {/* New: Admin Password Change */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-gray-600" /> 관리자 비밀번호 변경
                    </h4>
                    <form
                        onSubmit={async (e) => {
                            e.preventDefault();
                            const newPw = e.target.newPw.value;
                            const confirmPw = e.target.confirmPw.value;

                            if (newPw !== confirmPw) {
                                alert('비밀번호가 일치하지 않습니다.');
                                return;
                            }
                            if (newPw.length < 4) {
                                alert('비밀번호는 4자리 이상이어야 합니다.');
                                return;
                            }

                            const user = JSON.parse(localStorage.getItem('user'));
                            if (!user) return;

                            if (confirm('비밀번호를 변경하시겠습니까?')) {
                                const { error } = await supabase
                                    .from('profiles')
                                    .update({ password: newPw })
                                    .eq('id', user.id);

                                if (error) {
                                    alert('변경 중 오류가 발생했습니다.');
                                } else {
                                    alert('비밀번호가 변경되었습니다. 다시 로그인해주세요.');
                                    localStorage.removeItem('user');
                                    window.location.href = '/login';
                                }
                            }
                        }}
                        className="flex gap-2"
                    >
                        <input
                            name="newPw"
                            type="password"
                            placeholder="새 비밀번호"
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        />
                        <input
                            name="confirmPw"
                            type="password"
                            placeholder="비밀번호 확인"
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        />
                        <button
                            type="submit"
                            className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-black transition-colors"
                        >
                            변경
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
