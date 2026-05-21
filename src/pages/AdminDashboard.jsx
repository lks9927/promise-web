import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import bcrypt from 'bcryptjs';
import { translateError } from '../lib/errorHandler';
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
    Download,
    Send,
    Package,
    XCircle,
    Building,
    ListOrdered,
    Monitor,
    Key,
    Leaf
} from 'lucide-react';
import SettlementManager from '../components/admin/SettlementManager';
import CommissionSettings from '../components/admin/CommissionSettings';
import AdminMessageTab from '../components/admin/AdminMessageTab';
import { useNotification } from '../contexts/NotificationContext';
import MessageInbox from '../components/common/MessageInbox';
import { useMultiRealtimeSubscription } from '../hooks/useRealtimeSubscription';

// Imported Tab Components
import CaseTab from '../components/admin/tabs/CaseTab';
import PartnerTab from '../components/admin/tabs/PartnerTab';
import CouponPanel from '../components/admin/tabs/CouponPanel';
import VendorPanel from '../components/admin/tabs/VendorPanel';
import SettingsPanel from '../components/admin/tabs/SettingsPanel';
import DashboardSummaryBar from '../components/admin/tabs/StatCard';
import PackagePanel from '../components/admin/tabs/PackagePanel';
import ApiKeyPanel from '../components/admin/tabs/ApiKeyPanel';

export default function AdminDashboard() {
    const { showToast, sendNotification, unreadCount } = useNotification();
    const [activeTab, setActiveTab] = useState('settlement');
    const [settlements, setSettlements] = useState([]);
    const [cases, setCases] = useState([]);
    const [partners, setPartners] = useState([]);
    const [passwordRequests, setPasswordRequests] = useState([]);
    const [coupons, setCoupons] = useState([]);
    const [config, setConfig] = useState({});
    const [loading, setLoading] = useState(true);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [vendors, setVendors] = useState([]);

    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const CURRENT_ADMIN_LEVEL = searchParams.get('role') === 'operating' ? 'operating' : 'super';
    const isReadonly = CURRENT_ADMIN_LEVEL === 'operating';

    useEffect(() => {
        fetchData();
        fetchVendors();
    }, []);

    // 🔄 실시간 자동 갱신
    const handleRealtimeChange = useCallback((payload) => {
        const { table, eventType } = payload;
        console.log(`[Admin Realtime] ${table} ${eventType} 감지`);

        switch (table) {
            case 'funeral_cases':
                supabase.from('funeral_cases').select(`*, profiles!funeral_cases_customer_id_fkey (name, phone), team_leader:profiles!funeral_cases_team_leader_id_fkey (name, phone), dealer:profiles!funeral_cases_dealer_id_fkey (name, phone)`).order('created_at', { ascending: false }).then(({ data }) => { if (data) setCases(data); });
                if (eventType === 'INSERT') showToast('info', '새 접수', '🚨 새로운 장례 접수가 도착했습니다!');
                break;
            case 'settlements':
                supabase.from('settlements').select(`*, funeral_cases (id, status, final_price, package_name), profiles!settlements_recipient_id_fkey (name, role)`).then(({ data }) => { if (data) setSettlements(data); });
                if (eventType === 'INSERT') showToast('info', '정산 요청', '💰 새로운 정산 요청이 등록되었습니다.');
                break;
            case 'partners':
                supabase.from('partners').select(`*, profiles:user_id (name, phone, role, email)`).then(({ data }) => { if (data) setPartners(data); });
                break;
            case 'coupons':
                supabase.from('coupons').select('*, profiles:issued_by(name)').order('created_at', { ascending: false }).then(({ data }) => { if (data) setCoupons(data); });
                break;
            case 'vendors':
                fetchVendors();
                if (eventType === 'INSERT') showToast('info', '외주업체', '🏢 새로운 외주업체 승인 요청이 있습니다.');
                break;
            default:
                break;
        }
    }, [showToast]);

    useMultiRealtimeSubscription(
        [
            { table: 'funeral_cases', events: ['INSERT', 'UPDATE'] },
            { table: 'settlements', events: ['INSERT', 'UPDATE'] },
            { table: 'partners', events: ['INSERT', 'UPDATE'] },
            { table: 'coupons', events: ['INSERT', 'UPDATE', 'DELETE'] },
            { table: 'vendors', events: ['INSERT', 'UPDATE'] },
        ],
        handleRealtimeChange,
        true
    );

    const fetchVendors = async () => {
        const { data } = await supabase
            .from('vendors')
            .select('*, profiles:user_id ( name, phone )')
            .order('created_at', { ascending: false });
        setVendors(data || []);
    };

    const fetchData = async () => {
        try {
            setLoading(true);

            const results = await Promise.allSettled([
                supabase.from('settlements').select('*, funeral_cases (id, status, final_price, package_name), profiles:recipient_id (name, role)'),
                supabase.from('funeral_cases').select('*, profiles!funeral_cases_customer_id_fkey (name, phone), team_leader:profiles!funeral_cases_team_leader_id_fkey (name, phone), dealer:profiles!funeral_cases_dealer_id_fkey (name, phone)').order('created_at', { ascending: false }),
                supabase.from('partners').select('*, profiles:user_id (name, phone, role, email)'),
                supabase.from('system_config').select('*'),
                supabase.from('profiles').select('*').eq('password_reset_requested', true),
                supabase.from('coupons').select('*, profiles:issued_by(name)').order('created_at', { ascending: false })
            ]);

            const [settlementRes, caseRes, partnerRes, configRes, requestRes, couponRes] = results.map(r => r.status === 'fulfilled' ? r.value : { data: null });

            if (settlementRes.data) setSettlements(settlementRes.data);
            if (caseRes.data) setCases(caseRes.data);
            if (partnerRes.data) setPartners(partnerRes.data);
            if (configRes.data) {
                const configMap = configRes.data.reduce((acc, cur) => ({ ...acc, [cur.key]: cur.value }), {});
                setConfig(configMap);
            }
            if (requestRes.data) setPasswordRequests(requestRes.data);
            if (couponRes.data) setCoupons(couponRes.data);

        } catch (error) {
            console.error('Error fetching data:', error);
            showToast('error', '데이터 로드 실패', translateError(error));
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateMaxSubordinates = async (userId, newVal) => {
        try {
            const { error } = await supabase
                .from('partners')
                .update({ max_subordinates: newVal })
                .eq('user_id', userId);
            
            if (error) throw error;
            showToast('success', '변경 완료', '식구 제한 수가 성공적으로 변경되었습니다.');
            fetchData();
        } catch (error) {
            console.error('Update Error:', error);
            showToast('error', '변경 실패', translateError(error));
        }
    };

    const handleApproveReset = async (userId, phone, name, role) => {
        const isAdmin = role === 'admin';
        const msg = isAdmin
            ? `${name}님(관리자)의 비밀번호를 초기화하시겠습니까?\n(랜덤 임시 비밀번호가 생성됩니다)`
            : `${name}님의 비밀번호를 초기화하시겠습니까?\n(연락처 끝 6자리로 변경됩니다)`;

        if (!confirm(msg)) return;

        let newPassword;
        if (isAdmin) {
            newPassword = Math.random().toString(36).slice(-6).toUpperCase();
        } else {
            newPassword = phone.replace(/[^0-9]/g, '').slice(-6);
        }

        // Hash the new password before saving to DB
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(newPassword, salt);

        try {
            // 1. profiles 테이블 임시/폴백 비밀번호 업데이트
            const { error } = await supabase
                .from('profiles')
                .update({
                    password: hashedPassword,
                    password_reset_requested: false
                })
                .eq('id', userId);

            if (error) throw error;

            // 2. Supabase 공식 Auth (auth.users) 비밀번호 업데이트 API 호출
            const response = await fetch('/api/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, newPassword }) // 평문 비밀번호 전달 (API에서 처리)
            });

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.message || 'Supabase Auth 비밀번호 동기화에 실패했습니다.');
            }

            if (isAdmin) {
                alert(`✅ 초기화 완료!\n\n임시 비밀번호: [ ${newPassword} ]\n\n이 비밀번호를 ${name} 관리자님께 전달해주세요.`);
            } else {
                showToast('success', '초기화 완료', '비밀번호가 연락처 끝 6자리로 초기화되었고 Auth에도 반영되었습니다.');
            }
            fetchData();
        } catch (error) {
            console.error(error);
            showToast('error', '초기화 실패', translateError(error));
        }
    };

    return (
        <div className="min-h-screen bg-[#FCFBF9] flex font-sans">
            <aside className="w-64 bg-[#1B2B48] text-white hidden md:block flex-shrink-0 sticky top-0 h-screen overflow-y-auto custom-scrollbar">
                <div className="p-6 border-b border-[#2C3E5D]">
                    <Link to="/" className="cursor-pointer hover:opacity-80 transition-opacity">
                        <h1 className="text-xl font-bold tracking-tight font-serif flex items-center gap-2"><img src="/promise_logo_transparent.png" alt="로고" className="w-7 h-7 object-contain" />10년의 약속 <span className="text-[#C5A065] font-sans text-sm align-top">Admin</span></h1>
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
                        icon={<Package />}
                        label="상품 승인"
                        active={activeTab === 'packages'}
                        onClick={() => setActiveTab('packages')}
                    />
                    <NavItem
                        icon={<Send />}
                        label="메시지 발송"
                        active={activeTab === 'messages'}
                        onClick={() => setActiveTab('messages')}
                    />
                    {CURRENT_ADMIN_LEVEL === 'super' && (
                        <NavItem
                            icon={<DollarSign />}
                            label="상품/수수료 설정"
                            active={activeTab === 'commissions'}
                            onClick={() => setActiveTab('commissions')}
                        />
                    )}
                    <NavItem
                        icon={<Key />}
                        label="API 키 관리"
                        active={activeTab === 'apikeys'}
                        onClick={() => setActiveTab('apikeys')}
                    />
                    <NavItem
                        icon={<Settings />}
                        label="환경 설정"
                        active={activeTab === 'settings'}
                        onClick={() => setActiveTab('settings')}
                    />
                    <NavItem
                        icon={<Building />}
                        label="외주업체 승인"
                        active={activeTab === 'vendors'}
                        onClick={() => setActiveTab('vendors')}
                        badge={vendors.filter(v => v.status === 'pending').length || null}
                    />
                    <NavItem
                        icon={<Monitor />}
                        label="화면 미리보기"
                        active={activeTab === 'preview'}
                        onClick={() => setActiveTab('preview')}
                    />
                </nav>
                <div className="p-4 border-t border-[#2C3E5D]">
                    <button
                        onClick={() => {
                            localStorage.removeItem('user');
                            window.location.href = '/login';
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
                            {activeTab === 'cases' ? '📋 접수 현황' : activeTab === 'settlement' ? '💰 정산' : activeTab === 'settings' ? '⚙️ 설정' : activeTab === 'commissions' ? '🧮 수수료 설정' : activeTab === 'coupons' ? '🎟️ 쿠폰 발급' : activeTab === 'vendors' ? '🏢 외주업체 승인' : activeTab === 'packages' ? '📦 상품 승인' : activeTab === 'apikeys' ? '🔑 API 키 관리' : '👥 파트너'}
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        {isReadonly && (
                            <span className="hidden sm:flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-full">
                                🔒 열람 전용 모드
                            </span>
                        )}
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
                            <MessageInbox isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} user={JSON.parse(localStorage.getItem('user') || '{}')} />
                        </div>
                        <button
                            onClick={() => {
                                localStorage.removeItem('user');
                                window.location.href = '/login';
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
                    <DashboardSummaryBar cases={cases} settlements={settlements} partners={partners} />

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 text-lg">
                        {activeTab === 'preview' ? (
                        <span>👁️ 화면 미리보기</span>
                    ) : activeTab === 'cases' ? '접수 목록' : activeTab === 'settlement' ? '정산 목록' : activeTab === 'settings' ? '설정 패널' : activeTab === 'commissions' ? '상품 및 수수료 설정' : activeTab === 'coupons' ? '쿠폰 발급 및 내역' : activeTab === 'vendors' ? '외주업체 승인 관리' : activeTab === 'packages' ? '커스텀 상품 제안 승인' : activeTab === 'apikeys' ? 'API 키 관리' : '파트너 리스트'}
                            </h3>
                            <button onClick={fetchData} className="text-sm text-indigo-600 font-medium hover:text-indigo-800">새로고침</button>
                        </div>

                        {activeTab === 'settings' ? (
                            <SettingsPanel
                                config={config}
                                onUpdate={fetchData}
                                passwordRequests={passwordRequests}
                                onApproveReset={handleApproveReset}
                                partners={partners}
                                isReadonly={isReadonly}
                            />
                        ) : activeTab === 'commissions' ? (
                            <CommissionSettings supabase={supabase} />
                        ) : activeTab === 'coupons' ? (
                            <CouponPanel coupons={coupons} onUpdate={fetchData} supabase={supabase} isReadonly={isReadonly} />
                        ) : activeTab === 'packages' ? (
                            <PackagePanel supabase={supabase} isReadonly={isReadonly} />
                        ) : activeTab === 'messages' ? (
                            <AdminMessageTab partners={partners} isReadonly={isReadonly} />
                        ) : activeTab === 'vendors' ? (
                            <VendorPanel vendors={vendors} onRefresh={fetchVendors} supabase={supabase} showToast={showToast} isReadonly={isReadonly} />
                        ) : activeTab === 'apikeys' ? (
                            <ApiKeyPanel isReadonly={isReadonly} />
                        ) : activeTab === 'preview' ? (
                            <PreviewPanel partners={partners} />
                        ) : activeTab === 'cases' ? (
                            <CaseTab cases={cases} partners={partners} coupons={coupons} loading={loading} isReadonly={isReadonly} />
                        ) : activeTab === 'partners' ? (
                            <PartnerTab partners={partners} loading={loading} onRefresh={fetchData} onApproveReset={handleApproveReset} isReadonly={isReadonly} onUpdateMaxSubordinates={handleUpdateMaxSubordinates} />
                        ) : activeTab === 'settlement' ? (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden m-6">
                                <SettlementManager />
                            </div>
                        ) : null}
                    </div>
                </div>
            </main>
        </div>
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

function PreviewPanel({ partners }) {
    const navigate = useNavigate();
    const [roleFilter, setRoleFilter] = useState('all');

    const roleMap = { 
        all: '전체',
        master_dealer: '마스터 딜러', 
        dealer: '딜러', 
        master_leader: '마스터 팀장', 
        leader: '팀장' 
    };

    const filtered = partners.filter(p => {
        if (roleFilter === 'all') return true;
        if (roleFilter === 'master_dealer') {
            return p.profiles?.role === 'master' || (['dealer', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role) && ['Master', 'S'].includes(p.grade));
        }
        if (roleFilter === 'dealer') {
            return ['dealer', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role) && !['Master', 'S'].includes(p.grade);
        }
        if (roleFilter === 'master_leader') {
            return p.profiles?.role === 'leader' && ['Master', 'S'].includes(p.grade);
        }
        if (roleFilter === 'leader') {
            return p.profiles?.role === 'leader' && !['Master', 'S'].includes(p.grade);
        }
        return false;
    });

    const handlePreview = (partner) => {
        const currentAdmin = localStorage.getItem('user');
        localStorage.setItem('admin_preview_backup', currentAdmin);

        const previewUser = {
            id: partner.user_id,
            name: partner.profiles?.name || '미리보기 사용자',
            phone: partner.profiles?.phone || '',
            role: partner.profiles?.role,
            grade: partner.grade,
            partner_status: partner.status,
            _preview_mode: true
        };
        localStorage.setItem('user', JSON.stringify(previewUser));
        
        const pRole = partner.profiles?.role;
        const targetRoute = pRole === 'leader' ? '/leader' : 
                          pRole === 'master' ? '/dealer' : '/dealer';
        navigate(targetRoute);
    };

    return (
        <div className="p-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                <Monitor className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                    <p className="text-sm font-bold text-amber-800">미리보기 모드 안내</p>
                    <p className="text-xs text-amber-700 mt-1">
                        파트너를 선택하면 해당 유저의 화면으로 전환됩니다.<br />
                        화면 상단의 <strong>🔴 관리자 복귀</strong> 버튼을 누르면 돌아옵니다.
                    </p>
                </div>
            </div>

            {/* 역할 필터 */}
            <div className="flex gap-2 mb-5">
                {Object.entries(roleMap).map(([role, label]) => (
                    <button key={role}
                        onClick={() => setRoleFilter(role)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors
                            ${roleFilter === role ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    >
                        {label} ({partners.filter(p => {
                            if (role === 'all') return true;
                            if (role === 'master_dealer') return p.profiles?.role === 'master' || (['dealer', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role) && ['Master', 'S'].includes(p.grade));
                            if (role === 'dealer') return ['dealer', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role) && !['Master', 'S'].includes(p.grade);
                            if (role === 'master_leader') return p.profiles?.role === 'leader' && ['Master', 'S'].includes(p.grade);
                            if (role === 'leader') return p.profiles?.role === 'leader' && !['Master', 'S'].includes(p.grade);
                            return false;
                        }).length}명)
                    </button>
                ))}
            </div>

            {/* 유저 리스트 */}
            <div className="space-y-2">
                {filtered.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-sm">등록된 {roleMap[roleFilter]}가 없습니다</div>
                ) : (
                    filtered.map(partner => (
                        <div key={partner.user_id}
                            className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-indigo-200 hover:shadow-sm transition-all">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-sm">
                                    {partner.profiles?.name?.[0] || '?'}
                                </div>
                                <div>
                                    <div className="font-bold text-gray-800">{partner.profiles?.name}</div>
                                    <div className="text-xs text-gray-400">{partner.profiles?.phone} · {partner.grade || '일반'} · {partner.status === 'approved' ? '활성' : '비활성'}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => handlePreview(partner)}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors">
                                <Monitor className="w-4 h-4" />
                                이 화면으로 보기
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
