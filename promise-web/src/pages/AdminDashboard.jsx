import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
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
    Lock,
    Download
} from 'lucide-react';
import html2canvas from 'html2canvas';
import SettlementManager from '../components/admin/SettlementManager';
import { useNotification } from '../contexts/NotificationContext';
import NotificationCenter from '../components/common/NotificationCenter';

export default function AdminDashboard() {
    const { showToast, sendNotification, unreadCount } = useNotification();
    const [activeTab, setActiveTab] = useState('settlement');
    const [settlements, setSettlements] = useState([]);
    const [cases, setCases] = useState([]);
    const [partners, setPartners] = useState([]);
    const [partnerFilter, setPartnerFilter] = useState('all');
    const [passwordRequests, setPasswordRequests] = useState([]);
    const [coupons, setCoupons] = useState([]);
    const [config, setConfig] = useState({});
    const [loading, setLoading] = useState(true);
    const [isNotifOpen, setIsNotifOpen] = useState(false);

    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
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
            const { data: partnerData } = await supabase
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

            // 6. Fetch Coupons
            const { data: couponData } = await supabase
                .from('coupons')
                .select('*')
                .order('created_at', { ascending: false });
            if (couponData) setCoupons(couponData);

        } catch (error) {
            console.error('Error fetching data:', error);
            showToast('error', '데이터 로드 실패', error.message);
        } finally {
            setLoading(false);
        }
    };

    const togglePartnerStatus = async (partnerId, currentStatus, role) => {
        const newStatus = (currentStatus === 'suspended' || currentStatus === 'pending') ? 'approved' : 'suspended';

        if (role === 'leader' && newStatus === 'suspended') {
            const { count } = await supabase
                .from('funeral_cases')
                .select('*', { count: 'exact', head: true })
                .eq('team_leader_id', partnerId)
                .in('status', ['assigned', 'consulting', 'in_progress', 'team_settling']);

            if (count > 0) {
                showToast('error', '정지 불가', `진행 중인 장례 건(${count}건)이 있어 정지할 수 없습니다.`);
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
                showToast('error', '처리 실패', '상태 변경 중 오류가 발생했습니다.');
            } else {
                showToast('success', '처리 완료', `파트너가 ${newStatus === 'approved' ? '승인' : '정지'}되었습니다.`);
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
            newPassword = Math.random().toString(36).slice(-6).toUpperCase();
        } else {
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
                showToast('success', '초기화 완료', '비밀번호가 연락처 끝 4자리로 초기화되었습니다.');
            }
            fetchData();
        } catch (error) {
            console.error(error);
            showToast('error', '초기화 실패', error.message);
        }
    };

    const handlePasswordReset = async (userId, name) => {
        const partner = partners.find(p => p.user_id === userId);
        if (!partner || !partner.profiles?.phone) {
            showToast('error', '오류', '사용자 정보를 찾을 수 없습니다.');
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

    const [gradeModal, setGradeModal] = useState({ isOpen: false, partnerId: null, currentGrade: '', name: '' });

    const openGradeModal = (partnerId, currentGrade, name) => {
        setGradeModal({ isOpen: true, partnerId, currentGrade, name });
    };

    const confirmGradeChange = async (newGrade) => {
        if (!gradeModal.partnerId) return;

        if (confirm(`${gradeModal.name}님의 등급을 '${gradeModal.currentGrade}' → '${newGrade}'(으)로 변경하시겠습니까?`)) {
            const { error } = await supabase
                .from('partners')
                .update({ grade: newGrade })
                .eq('user_id', gradeModal.partnerId);

            if (error) {
                console.error('Grade Update Error:', error);
                showToast('error', '변경 실패', error.message);
            } else {
                showToast('success', '변경 완료', '등급이 변경되었습니다.');
                fetchData();
            }
        }
        setGradeModal({ isOpen: false, partnerId: null, currentGrade: '', name: '' });
    };

    return (
        <div className="min-h-screen bg-[#FCFBF9] flex font-sans">
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
                        icon={<DollarSign />}
                        label="쿠폰 관리"
                        active={activeTab === 'coupons'}
                        onClick={() => setActiveTab('coupons')}
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

            <main className="flex-1 flex flex-col min-w-0">
                <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 sticky top-0 z-30">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-gray-800">
                            {activeTab === 'cases' ? '📋 접수 현황' : activeTab === 'settlement' ? '💰 정산' : activeTab === 'settings' ? '⚙️ 설정' : activeTab === 'coupons' ? '🎟️ 쿠폰 발급' : '👥 파트너'}
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-bold text-gray-900">{JSON.parse(localStorage.getItem('user') || '{}').name || '관리자'}님</div>
                            <div className="text-xs text-gray-500">{CURRENT_ADMIN_LEVEL === 'super' ? '슈퍼 관리자' : '운영 관리자'}</div>
                        </div>
                        <div className="relative">
                            <button onClick={() => setIsNotifOpen(!isNotifOpen)} className="relative p-1 rounded-full hover:bg-gray-100 transition-colors">
                                <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-red-500 animate-pulse' : 'text-gray-500'}`} />
                                {unreadCount > 0 && (
                                    <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                                )}
                            </button>
                            {isNotifOpen && <NotificationCenter onClose={() => setIsNotifOpen(false)} />}
                        </div>
                        <button
                            onClick={() => {
                                if (confirm('로그아웃 하시겠습니까?')) {
                                    localStorage.removeItem('user');
                                    window.location.href = '/login';
                                }
                            }}
                            className="flex items-center gap-1 text-gray-500 hover:text-red-500 transition-colors text-sm font-medium"
                        >
                            로그아웃
                            <LogOut className="w-4 h-4" />
                        </button>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                            {JSON.parse(localStorage.getItem('user') || '{}').name?.[0] || 'A'}
                        </div>
                    </div>
                </header>

                <div className="p-6 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                        <StatCard label="오늘 접수 건" value={cases.filter(c => new Date(c.created_at).getDate() === new Date().getDate()).length} icon={<FileText className="text-blue-600" />} />
                        <StatCard label="진행 중" value={cases.filter(c => c.status === 'in_progress').length} icon={<Clock className="text-orange-600" />} />
                        <StatCard label="정산 대기" value={`₩ ${settlements.filter(s => s.status === 'pending').reduce((acc, cur) => acc + cur.amount, 0).toLocaleString()}`} icon={<DollarSign className="text-green-600" />} highlight />
                        <StatCard label="등록 파트너" value={partners.length} icon={<Users className="text-purple-600" />} />
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 text-lg">
                                {activeTab === 'cases' ? '접수 목록' : activeTab === 'settlement' ? '정산 목록' : activeTab === 'settings' ? '설정 패널' : activeTab === 'coupons' ? '쿠폰 발급 및 내역' : '파트너 리스트'}
                            </h3>
                            <button onClick={fetchData} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">새로고침</button>
                        </div>

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
                        ) : activeTab === 'coupons' ? (
                            <CouponPanel coupons={coupons} onUpdate={fetchData} supabase={supabase} />
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
                                                    <th className="px-6 py-4">담당 팀장</th>
                                                    <th className="px-6 py-4">소속 마스터</th>
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
                                                    <th className="px-6 py-4 text-center">상태 관리</th>
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
                                                    <td className="px-6 py-4">
                                                        {(() => {
                                                            if (!item.team_leader_id) return <span className="text-gray-400 text-xs">-</span>;
                                                            const p = partners.find(p => p.user_id === item.team_leader_id);
                                                            return p ? (
                                                                <div>
                                                                    <div className="font-bold text-gray-900">{p.profiles?.name}</div>
                                                                    <div className="text-xs text-indigo-500">{p.grade}</div>
                                                                </div>
                                                            ) : <span className="text-gray-400">정보 없음</span>;
                                                        })()}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {(() => {
                                                            if (!item.team_leader_id) return <span className="text-gray-400 text-xs">-</span>;
                                                            const p = partners.find(p => p.user_id === item.team_leader_id);
                                                            if (!p) return '-';
                                                            if (p.grade === 'Master') return <span className="text-xs  bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">본인 (Master)</span>;
                                                            if (p.master_id) {
                                                                const m = partners.find(mp => mp.user_id === p.master_id);
                                                                return m ? <span className="font-medium text-gray-700">{m.profiles?.name}</span> : <span className="text-red-400 text-xs">마스터 정보 없음</span>;
                                                            }
                                                            return <span className="text-gray-400 text-xs">-</span>;
                                                        })()}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {(() => {
                                                            const statusMap = {
                                                                'requested': { label: '🚨 접수 대기', class: 'bg-red-100 text-red-700 animate-pulse' },
                                                                'assigned': { label: '🟡 팀장 배정', class: 'bg-yellow-100 text-yellow-700' },
                                                                'consulting': { label: '🗣️ 상담 중', class: 'bg-orange-100 text-orange-700' },
                                                                'in_progress': { label: '🔵 서비스 진행', class: 'bg-blue-100 text-blue-700' },
                                                                'team_settling': { label: '🟢 정산 대기', class: 'bg-green-100 text-green-700' },
                                                                'hq_check': { label: '🟢 정산 검토 중', class: 'bg-green-100 text-green-700' },
                                                                'completed': { label: '⚪ 완료됨', class: 'bg-gray-100 text-gray-600' }
                                                            };
                                                            const status = statusMap[item.status] || { label: item.status, class: 'bg-gray-100 text-gray-600' };
                                                            return (
                                                                <span className={`px-3 py-1 rounded-full text-xs font-bold ${status.class}`}>
                                                                    {status.label}
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : activeTab === 'settlement' ? (
                                            <tr>
                                                <td colSpan="5" className="p-0">
                                                    <div className="p-6">
                                                        <SettlementManager />
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            partners
                                                .filter(p => partnerFilter === 'all' || p.profiles?.role === partnerFilter)
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
                                                            <button
                                                                onClick={() => openGradeModal(partner.user_id, partner.grade, partner.profiles?.name)}
                                                                className="bg-purple-100 text-purple-700 font-bold px-2 py-1 rounded text-xs hover:bg-purple-200 transition-colors cursor-pointer border border-purple-200"
                                                                title="클릭하여 등급 변경"
                                                            >
                                                                {partner.grade || 'N/A'} ✏️
                                                            </button>
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
                                </table >
                            </div>
                        )}
                    </div>
                </div>
            </main >

            {
                gradeModal.isOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
                        <div className="bg-white rounded-xl shadow-2xl p-6 w-80 max-w-full transform transition-all scale-100">
                            <h3 className="text-lg font-bold text-gray-800 mb-2">등급 변경</h3>
                            <p className="text-sm text-gray-500 mb-6">
                                <span className="font-bold text-indigo-600">{gradeModal.name}</span> 님의 새로운 등급을 선택하세요.
                            </p>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                                {['Master', 'A', 'B', 'C'].map((grade) => (
                                    <button
                                        key={grade}
                                        onClick={() => confirmGradeChange(grade)}
                                        className={`py-3 rounded-lg font-bold border transition-all 
                                        ${gradeModal.currentGrade === grade ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-200' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'}
                                    `}
                                    >
                                        {grade}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => setGradeModal({ ...gradeModal, isOpen: false })}
                                className="w-full py-2.5 text-gray-500 font-medium hover:bg-gray-100 rounded-lg transition-colors text-sm"
                            >
                                취소
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

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

function SettingsPanel({ config, onUpdate, passwordRequests, onApproveReset }) {
    const { showToast } = useNotification();
    const toggleConfig = async (key, currentValue) => {
        const safeValue = currentValue || 'false';
        const newValue = safeValue === 'true' ? 'false' : 'true';

        await supabase.from('system_config').upsert({ key, value: newValue });
        showToast('success', '설정 변경', '설정이 변경되었습니다.');
        onUpdate();
    };

    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h3 className="text-xl font-bold mb-6">시스템 운영 설정</h3>

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
                                showToast('error', '오류', '비밀번호가 일치하지 않습니다.');
                                return;
                            }
                            if (newPw.length < 4) {
                                showToast('error', '오류', '비밀번호는 4자리 이상이어야 합니다.');
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
                                    showToast('error', '오류', '변경 중 오류가 발생했습니다.');
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

function CouponPanel({ coupons, onUpdate, supabase }) {
    const { showToast } = useNotification();
    const [amount, setAmount] = useState('200000');
    const [debugMsg, setDebugMsg] = useState('');

    useEffect(() => {
        setDebugMsg(`Loaded Coupons: ${coupons ? coupons.length : 'null'}`);
    }, [coupons]);
    const [phone, setPhone] = useState('');
    const [generatedCoupon, setGeneratedCoupon] = useState(null);
    const [mode, setMode] = useState('single');
    const [quantity, setQuantity] = useState(1);
    const [memo, setMemo] = useState('');
    const [generatedBatch, setGeneratedBatch] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await onUpdate();
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const filteredCoupons = coupons ? coupons.filter(c =>
        c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.issued_to && c.issued_to.includes(searchTerm)) ||
        (c.batch_name && c.batch_name.toLowerCase().includes(searchTerm.toLowerCase()))
    ) : [];

    const handleIssue = async (e) => {
        e.preventDefault();

        if (mode === 'single') {
            if (!confirm(`${phone}님께 ${Number(amount).toLocaleString()}원 쿠폰을 발행하시겠습니까?`)) return;
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            try {
                const { error } = await supabase.from('coupons').insert([{
                    code: code,
                    amount: parseInt(amount),
                    status: 'issued',
                    issued_to: phone,
                    batch_name: '개별발행'
                }]);
                if (error) throw error;
                setGeneratedCoupon({ code, amount, phone });
                onUpdate();
                setPhone('');
                showToast('success', '발급 완료', '쿠폰이 발급되었습니다.');
            } catch (error) {
                console.error(error);
                showToast('error', '오류', '쿠폰 발행 중 오류가 발생했습니다.');
            }
        } else {
            if (!confirm(`${Number(amount).toLocaleString()}원 쿠폰 ${quantity}장을 대량 발행하시겠습니까?`)) return;

            const newCoupons = [];
            const batchName = memo || `대량발행_${new Date().toLocaleDateString()}`;

            for (let i = 0; i < quantity; i++) {
                newCoupons.push({
                    code: Math.random().toString(36).substring(2, 10).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase(),
                    amount: parseInt(amount),
                    status: 'issued',
                    issued_to: null,
                    batch_name: batchName
                });
            }

            try {
                const { error } = await supabase.from('coupons').insert(newCoupons);
                if (error) throw error;

                const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
                    + "쿠폰번호,금액,발행일\n"
                    + newCoupons.map(c => `${c.code},${c.amount},${new Date().toLocaleDateString()}`).join("\n");

                const encodedUri = encodeURI(csvContent);
                setGeneratedBatch({ count: quantity, amount, csvUrl: encodedUri });

                onUpdate();
                setMemo('');
                showToast('success', '대량 발급 완료', `${quantity}장의 쿠폰이 발급되었습니다.`);
            } catch (error) {
                console.error(error);
                showToast('error', '오류', '대량 발행 중 오류가 발생했습니다.');
            }
        }
    };

    return (
        <div className="p-6">
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-xl border border-indigo-100 mb-8 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-indigo-900 flex items-center gap-2">
                        <DollarSign className="w-5 h-5" /> 쿠폰 발행 (v2.0)
                    </h4>
                    <div className="flex bg-white rounded-lg p-1 border border-indigo-100">
                        <button
                            onClick={() => setMode('single')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${mode === 'single' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            개별 발송 (문자)
                        </button>
                        <button
                            onClick={() => setMode('bulk')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${mode === 'bulk' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            대량 발행 (파일)
                        </button>
                    </div>
                </div>

                <form onSubmit={handleIssue} className="flex gap-4 items-end flex-wrap">
                    {mode === 'single' ? (
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-gray-500 mb-1">고객 연락처</label>
                            <input
                                type="tel"
                                placeholder="010-0000-0000"
                                className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                required
                            />
                        </div>
                    ) : (
                        <>
                            <div className="w-32">
                                <label className="block text-xs font-bold text-gray-500 mb-1">발행 수량 (장)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs font-bold text-gray-500 mb-1">발행 메모 (예: 제휴 행사용)</label>
                                <input
                                    type="text"
                                    placeholder="식별용 메모 입력"
                                    className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                    value={memo}
                                    onChange={e => setMemo(e.target.value)}
                                />
                            </div>
                        </>
                    )}
                    <div className="w-40">
                        <label className="block text-xs font-bold text-gray-500 mb-1">금액 (원)</label>
                        <select
                            className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                        >
                            <option value="10000">10,000</option>
                            <option value="50000">50,000</option>
                            <option value="100000">100,000</option>
                            <option value="200000">200,000</option>
                            <option value="300000">300,000</option>
                            <option value="500000">500,000</option>
                        </select>
                    </div>
                    <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95 h-10">
                        발행하기
                    </button>
                </form>
            </div>

            {generatedCoupon && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-bounce-in">
                        <div className="bg-gray-900 text-white p-4 flex justify-between items-center">
                            <span className="font-bold">문자 발송 시뮬레이션</span>
                            <button onClick={() => setGeneratedCoupon(null)} className="text-gray-400 hover:text-white">&times;</button>
                        </div>
                        <div className="p-6">
                            <div className="bg-gray-100 p-4 rounded-lg mb-4 text-sm whitespace-pre-line border border-gray-200">
                                <p className="font-bold text-indigo-600 mb-2">[10년의 약속] 쿠폰 도착 🎁</p>
                                <p>{generatedCoupon.phone} 고객님, 감사합니다.</p>
                                <p>{Number(generatedCoupon.amount).toLocaleString()}원 캐시백 쿠폰이 발급되었습니다.</p>
                                <br />
                                <p className="bg-white p-2 rounded border border-dashed border-gray-300 font-mono text-center font-bold text-lg select-all">
                                    {generatedCoupon.code}
                                </p>
                                <br />
                                <p className="text-gray-500 text-xs">
                                    * 사용방법: 로그인 {'>'} 마이페이지 {'>'} 쿠폰 등록<br />
                                    * 문의: 1544-1234
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    const msg = `[10년의 약속] ${Number(generatedCoupon.amount).toLocaleString()}원 쿠폰코드: ${generatedCoupon.code}`;
                                    navigator.clipboard.writeText(msg);
                                    showToast('success', '복사 완료', '문자 내용이 복사되었습니다!');
                                }}
                                className="w-full py-3 bg-gray-900 text-white rounded-lg font-bold hover:bg-black transition-colors"
                            >
                                문자 내용 복사하기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {generatedBatch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-bounce-in">
                        <div className="bg-indigo-900 text-white p-4 flex justify-between items-center">
                            <span className="font-bold">대량 발행 완료</span>
                            <button onClick={() => setGeneratedBatch(null)} className="text-indigo-200 hover:text-white">&times;</button>
                        </div>
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <DollarSign className="w-8 h-8" />
                            </div>
                            <h3 className="font-bold text-gray-900 text-lg mb-2">{generatedBatch.count}장 발행 성공!</h3>
                            <p className="text-gray-500 text-sm mb-6">
                                총 {Number(generatedBatch.amount * generatedBatch.count).toLocaleString()}원 규모의 쿠폰이 생성되었습니다.<br />
                                아래 버튼을 눌러 엑셀(CSV) 파일을 다운로드하세요.
                            </p>

                            <a
                                href={generatedBatch.csvUrl}
                                download={`coupons_${new Date().toISOString().slice(0, 10)}.csv`}
                                className="block w-full py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                            >
                                📥 쿠폰 파일 다운로드
                            </a>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <h4 className="font-bold text-gray-800">발행 내역</h4>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="쿠폰번호, 연락처, 메모 검색..."
                            className="pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 transition-all"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <button
                    onClick={handleRefresh}
                    className={`text-xs text-indigo-500 underline flex items-center gap-1 ${isRefreshing ? 'opacity-50 cursor-not-allowed' : 'hover:text-indigo-700'}`}
                    disabled={isRefreshing}
                >
                    {isRefreshing ? '불러오는 중...' : '새로고침'}
                </button>
            </div>

            <div id="coupon-template" className="hidden relative w-[400px] h-[200px] bg-gradient-to-br from-indigo-600 to-purple-800 text-white p-6 rounded-xl overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-20">
                    <DollarSign className="w-32 h-32" />
                </div>
                <div className="relative z-10 h-full flex flex-col justify-between">
                    <div>
                        <h3 className="text-sm font-medium text-indigo-200 mb-1">10년의 약속 캐시백 쿠폰</h3>
                        <h1 className="text-4xl font-bold">₩ <span id="coupon-amount"></span></h1>
                    </div>
                    <div>
                        <div className="text-2xl font-mono font-bold tracking-wider mb-2" id="coupon-code"></div>
                        <div className="text-xs text-indigo-200">발행일: <span id="coupon-date"></span></div>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium">
                        <tr>
                            <th className="px-6 py-4">쿠폰 코드</th>
                            <th className="px-6 py-4">대상 연락처</th>
                            <th className="px-6 py-4">금액</th>
                            <th className="px-6 py-4 text-center">상태</th>
                            <th className="px-6 py-4">발행일</th>
                            <th className="px-6 py-4 text-right">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredCoupons.length === 0 && (
                            <tr>
                                <td colSpan="6" className="px-6 py-8 text-center text-gray-400">
                                    {searchTerm ? '검색 결과가 없습니다.' : '발행된 쿠폰이 없습니다.'}
                                </td>
                            </tr>
                        )}
                        {filteredCoupons.map(coupon => (
                            <tr key={coupon.code} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-mono font-bold text-indigo-600">{coupon.code}</td>
                                <td className="px-6 py-4 text-gray-900">
                                    {coupon.issued_to ? (
                                        coupon.issued_to
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                            {coupon.batch_name || '대량발행'}
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 font-bold">₩ {coupon.amount.toLocaleString()}</td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${coupon.status === 'used' ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                                        {coupon.status === 'used' ? '사용 완료' : '발급됨'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-500 text-xs">{new Date(coupon.created_at).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={async () => {
                                            const template = document.getElementById('coupon-template');
                                            const amountEl = document.getElementById('coupon-amount');
                                            const codeEl = document.getElementById('coupon-code');
                                            const dateEl = document.getElementById('coupon-date');

                                            if (template && amountEl && codeEl && dateEl) {
                                                amountEl.innerText = coupon.amount.toLocaleString();
                                                codeEl.innerText = coupon.code;
                                                dateEl.innerText = new Date(coupon.created_at).toLocaleDateString();
                                                template.classList.remove('hidden');

                                                try {
                                                    const canvas = await html2canvas(template, { scale: 2 });
                                                    template.classList.add('hidden');
                                                    const link = document.createElement('a');
                                                    link.download = `coupon_${coupon.code}.jpg`;
                                                    link.href = canvas.toDataURL('image/jpeg', 0.9);
                                                    link.click();
                                                    showToast('success', '다운로드 완료', '쿠폰 이미지가 저장되었습니다.');
                                                } catch (err) {
                                                    console.error('Image Gen Error', err);
                                                    template.classList.add('hidden');
                                                    showToast('error', '오류', '이미지 생성 실패');
                                                }
                                            }
                                        }}
                                        className="text-gray-400 hover:text-indigo-600 transition-colors p-2"
                                        title="이미지로 다운로드"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
