import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    User,
    MapPin,
    Calendar,
    CheckCircle,
    DollarSign,
    ChevronRight,
    AlertTriangle,
    LogOut,
    Bell,
    Clock,
    Briefcase,
    Crown,
    Users,
    Power,
    XCircle,
    MoreVertical,
    Activity,
    Phone,
    Tag,
    ExternalLink,
    Package
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MyWallet from '../components/team/MyWallet';
import TeamManagement from '../components/team/TeamManagement';
import Profile from '../components/common/Profile';
import { useNotification } from '../contexts/NotificationContext';
import MessageInbox from '../components/common/MessageInbox';
import { matchHangul } from '../lib/hangul';
import { FUNERAL_HOMES_FULL } from '../data/funeralHomes';
import ProgressReportModal from '../components/teamleader/ProgressReportModal';
import OrderModal from '../components/teamleader/OrderModal';

export default function TeamLeaderDashboard() {
    const { showToast, sendNotification, unreadCount } = useNotification();
    const [activeTab, setActiveTab] = useState('available');
    const [availableCases, setAvailableCases] = useState([]);
    const [myCases, setMyCases] = useState([]);
    const [myTeam, setMyTeam] = useState([]);
    const [isFlowerOrderRequired, setIsFlowerOrderRequired] = useState(false);
    const [showTopMenu, setShowTopMenu] = useState(true);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [myStatus, setMyStatus] = useState('waiting');
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const [assignModal, setAssignModal] = useState({ isOpen: false, caseId: null });
    const [reportModal, setReportModal] = useState({ isOpen: false, caseItem: null });
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [couponModal, setCouponModal] = useState({ isOpen: false, coupon: null, caseId: null });
    const [consultModal, setConsultModal] = useState({
        isOpen: false,
        caseId: null,
        deceased_name: '',
        room_number: '',
        encoffinment_time: '',
        funeral_end_time: '',
        location: '',
        suggestions: []
    });
    const [orderModal, setOrderModal] = useState({ isOpen: false, caseData: null });
    const navigate = useNavigate();

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            if (!parsedUser.id) {
                alert('로그인 정보 오류: ID가 없습니다. 다시 로그인해주세요.');
                navigate('/login');
                return;
            }
            setUser(parsedUser);
        } else {
            navigate('/login');
        }
    }, [navigate]);

    useEffect(() => {
        if (user) {
            fetchData();
            fetchSystemConfig();
            fetchMyStatus();
        }
    }, [user, activeTab]);

    const fetchSystemConfig = async () => {
        const { data } = await supabase.from('system_config').select('*').in('key', ['flower_order_required', 'show_top_menu']);
        if (data) {
            const flowerConfig = data.find(c => c.key === 'flower_order_required');
            setIsFlowerOrderRequired(flowerConfig?.value === 'true');
            const topMenuConfig = data.find(c => c.key === 'show_top_menu');
            setShowTopMenu(topMenuConfig?.value !== 'false');
        }
    };

    const fetchMyStatus = async () => {
        if (!user) return;
        const { data } = await supabase.from('partners').select('current_status, is_working').eq('user_id', user.id).single();
        if (data) {
            if (data.current_status) {
                setMyStatus(data.current_status);
            } else {
                setMyStatus(data.is_working ? 'waiting' : 'off');
                handleStatusChange(data.is_working ? 'waiting' : 'off', false);
            }
        }
    };

    const handleStatusChange = async (newStatus, showAlert = true) => {
        let msg = '';
        if (newStatus === 'waiting') msg = '🟢 [출동 대기] 상태로 전환되었습니다.\n언제든 배정을 받을 수 있습니다.';
        else if (newStatus === 'working') msg = '🔵 [상담/장례 진행 중] 상태로 전환되었습니다.\n현재 업무에 집중합니다.';
        else if (newStatus === 'off') msg = '⚪ [휴식] 상태로 전환되었습니다.\n배정 알림을 받지 않습니다.';

        const updates = {
            current_status: newStatus,
            is_working: newStatus !== 'off'
        };

        const { error } = await supabase.from('partners').update(updates).eq('user_id', user.id);

        if (!error) {
            setMyStatus(newStatus);
            setStatusMenuOpen(false);
            if (showAlert) showToast('success', '상태 변경 완료', msg);
        } else {
            showToast('error', '상태 변경 실패', error.message);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Available Cases
            const { data: requestedData } = await supabase
                .from('funeral_cases')
                .select('*, profiles:customer_id(name, phone)')
                .eq('status', 'requested')
                .order('created_at', { ascending: false });

            if (requestedData) setAvailableCases(requestedData);

            // 2. Fetch My Assigned Cases (Global Case Management Logic)
            let targetTeamIds = [user.id];

            // If user is a Master Team Leader, fetch cases for their sub-members as well
            if (user.grade === 'Master' || user.grade === 'S') {
                const { data: subMembers } = await supabase
                    .from('partners')
                    .select('user_id')
                    .eq('master_id', user.id);

                if (subMembers) {
                    targetTeamIds = [...targetTeamIds, ...subMembers.map(m => m.user_id)];
                }
            }

            const { data: myAssigned, error: myError } = await supabase
                .from('funeral_cases')
                .select('*, profiles:customer_id(name, phone), funeral_progress_reports(id), orders(*, vendors(company_name), deliveries(*))')
                .in('status', ['assigned', 'consulting', 'in_progress', 'team_settling', 'hq_check', 'completed'])
                .in('team_leader_id', targetTeamIds) // The core visibility rule
                .order('created_at', { ascending: false });

            if (myError) console.error("My Cases fetch error:", myError);
            if (myAssigned) setMyCases(myAssigned);

            // 3. If Master, fetch team
            if (user.grade === 'Master') {
                const { data: teamData } = await supabase
                    .from('partners')
                    .select('*, profiles:user_id(name, phone)')
                    .eq('master_id', user.id);
                if (teamData) setMyTeam(teamData);
            }

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleBid = async (caseId, assigneeId = null, assigneeName = null) => {
        const isSelfAssign = !assigneeId || assigneeId === user.id;

        if (isSelfAssign && myStatus === 'off') {
            if (!confirm('현재 [휴식 중] 상태입니다.\n그래도 이 장례를 배정받으시겠습니까? (상태가 [진행 중]으로 변경됩니다)')) return;
            await handleStatusChange('working', false);
        }

        const confirmMsg = isSelfAssign
            ? '이 장례를 본인이 직접 배정받으시겠습니까?'
            : `${assigneeName} 팀장에게 이 장례를 배정하시겠습니까?`;

        if (!confirm(confirmMsg)) return;

        try {
            const { data: check } = await supabase.from('funeral_cases').select('status').eq('id', caseId).single();
            if (check.status !== 'requested') {
                showToast('error', '배정 실패', '이미 다른 팀장님이 배정받으셨습니다.');
                fetchData();
                return;
            }

            const newLeaderId = assigneeId || user.id;

            const { data, error } = await supabase
                .from('funeral_cases')
                .update({ status: 'assigned', team_leader_id: newLeaderId })
                .eq('id', caseId)
                .select();

            if (error || !data || data.length === 0) {
                console.error("Update failed:", error);
                showToast('error', '배정 실패', "데이터베이스 권한 문제로 저장이 안 되었습니다.");
                return;
            }

            if (isSelfAssign) {
                await handleStatusChange('working', false);
                showToast('success', '배정 완료', '상담/장례 진행 중 상태로 변경되었습니다.');

                // Notify Customer (Optional/Future)
                // sendNotification(customerId, 'info', '팀장 배정 완료', `${user.name} 팀장이 배정되었습니다.`);

                setActiveTab('my_cases');
                setTimeout(() => {
                    fetchData(); // Fetch fresh data for the new tab
                }, 100);
            } else {
                showToast('success', '배정 완료', `${assigneeName} 팀장에게 배정되었습니다.`);
                // Notify the assignee
                sendNotification(assigneeId, 'assignment', '새로운 장례 배정', `${user.name} 마스터가 장례를 배정했습니다.`, '/leader');
                fetchData();
            }
        } catch (error) {
            console.error(error);
            showToast('error', '배정 실패', error.message);
        }
    };
    const handleStatusUpdate = async (caseId, newStatus, extraData = {}) => {
        try {
            const { error } = await supabase
                .from('funeral_cases')
                .update({ status: newStatus, ...extraData })
                .eq('id', caseId);
            if (error) throw error;
            fetchData();
            showToast('success', '상태 업데이트', '장례 진행 단계가 변경되었습니다.');

            if (newStatus === 'hq_check' || newStatus === 'completed') {
                if (confirm('장례가 종료되었습니다. 상태를 [출동 대기]로 변경하시겠습니까?')) {
                    handleStatusChange('waiting');
                }
            }
        } catch (error) {
            showToast('error', '업데이트 실패', error.message);
        }
    };

    const handleConfirmDelivery = async (orderId) => {
        if (!confirm('물품의 도착 및 상태를 확인하셨습니까?\n(인수 확인을 완료해야 외주업체와 정산이 진행됩니다)')) return;
        try {
            const { error } = await supabase
                .from('orders')
                .update({ status: 'completed' })
                .eq('id', orderId);
            if (error) throw error;
            showToast('success', '인수 확인 완료', '정상적으로 인수 처리가 완료되었습니다.');
            fetchData();
        } catch (error) {
            showToast('error', '처리 실패', error.message);
        }
    };

    const handleCouponUsage = async (couponId, usedFor, caseId) => {
        try {
            const { error } = await supabase
                .from('coupons')
                .update({ status: 'used', used_for: usedFor })
                .eq('id', couponId);
            if (error) throw error;

            showToast('success', '쿠폰 사용 처리', '쿠폰이 성공적으로 사용 처리되었습니다.');
            setCouponModal({ isOpen: false, coupon: null, caseId: null });

            // After coupon usage, open the consultation detail modal to complete the transition to in_progress
            const caseItem = myCases.find(c => c.id === caseId);
            setConsultModal({
                isOpen: true,
                caseId: caseId,
                deceased_name: caseItem?.deceased_name || '',
                room_number: caseItem?.room_number || '',
                location: caseItem?.location || '',
                encoffinment_time: caseItem?.encoffinment_time ? new Date(caseItem.encoffinment_time).toISOString().slice(0, 16) : '',
                funeral_end_time: caseItem?.funeral_end_time ? new Date(caseItem.funeral_end_time).toISOString().slice(0, 16) : '',
                suggestions: []
            });

        } catch (error) {
            showToast('error', '처리 실패', error.message);
        }
    };

    const handleSaveConsultation = async (e) => {
        e.preventDefault();
        try {
            const { error } = await supabase
                .from('funeral_cases')
                .update({
                    deceased_name: consultModal.deceased_name,
                    room_number: consultModal.room_number,
                    location: consultModal.location,
                    encoffinment_time: consultModal.encoffinment_time || null,
                    funeral_end_time: consultModal.funeral_end_time || null,
                    status: 'in_progress'
                })
                .eq('id', consultModal.caseId);

            if (error) throw error;

            showToast('success', '상담 상세 정보 저장', '정보가 성공적으로 반영되어 실시간 진행 상태로 전환되었습니다.');
            setConsultModal({ isOpen: false, caseId: null, deceased_name: '', room_number: '', location: '', encoffinment_time: '', funeral_end_time: '', suggestions: [] });
            fetchData();
        } catch (error) {
            showToast('error', '저장 실패', error.message);
        }
    };

    const handleOrderFlower = async (caseId) => {
        if (!window.confirm('하늘꽃(입관꽃)을 발주하시겠습니까? (150,000원)')) return;
        try {
            const { error } = await supabase.from('flower_orders').insert([{
                case_id: caseId, team_leader_id: user.id, status: 'ordered', amount: 150000
            }]);
            if (error) throw error;
            showToast('success', '발주 완료', '하늘꽃 발주가 접수되었습니다.');
            fetchData();
        } catch (error) {
            showToast('error', '발주 실패', error.message);
        }
    };

    if (!user) return <div className="p-4 text-center">Loading...</div>;
    const isMaster = user.grade === 'Master';
    const getStatusInfo = (status) => {
        switch (status) {
            case 'waiting': return { label: '출동 대기', color: 'bg-green-100 text-green-700', icon: 'bg-green-500' };
            case 'working': return { label: '상담/장례 진행 중', color: 'bg-blue-100 text-blue-700', icon: 'bg-blue-500' };
            case 'off': return { label: '휴식 중', color: 'bg-gray-100 text-gray-500', icon: 'bg-gray-400' };
            default: return { label: '상태 미정', color: 'bg-gray-100 text-gray-500', icon: 'bg-gray-400' };
        }
    }
    const myStatusInfo = getStatusInfo(myStatus);

    return (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans">
            <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-30 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        {activeTab === 'available' && '실시간 배정 대기'}
                        {activeTab === 'my_cases' && '내 진행/정산 현황'}
                        {activeTab === 'team' && '내 팀원 관리'}
                        {activeTab === 'profile' && '내 기본 정보'}
                        {isMaster && <Crown className="w-5 h-5 text-yellow-500 fill-current" />}
                    </h1>
                    <div className="flex items-center gap-3">
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
                        <button onClick={() => { if (confirm('로그아웃 하시겠습니까?')) { localStorage.removeItem('user'); navigate('/login'); } }} className="text-gray-400 hover:text-red-500 transition-colors">
                            <LogOut className="w-6 h-6" />
                        </button>
                    </div>
                </div>
                <div className="flex justify-between items-center bg-gray-50 rounded-lg p-2 relative">
                    <div className="flex items-center gap-2 pl-1">
                        <div className="text-sm font-bold text-gray-700">{user.name}</div>
                        <div className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1.5 ${myStatusInfo.color}`}>
                            <span className={`w-2 h-2 rounded-full ${myStatusInfo.icon} ${myStatus === 'waiting' ? 'animate-pulse' : ''}`}></span>
                            {myStatusInfo.label}
                        </div>
                    </div>
                    <button onClick={() => setStatusMenuOpen(!statusMenuOpen)} className="text-xs bg-white border border-gray-200 shadow-sm px-3 py-1.5 rounded-md font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-1 active:bg-gray-100">
                        상태 변경 <ChevronRight className={`w-3 h-3 transition-transform ${statusMenuOpen ? 'rotate-90' : ''}`} />
                    </button>
                    {statusMenuOpen && (
                        <div className="absolute top-12 right-0 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-40 overflow-hidden animate-fadeIn">
                            <div className="p-2 space-y-1">
                                <button onClick={() => handleStatusChange('waiting')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-green-50 text-sm flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500"></span><span className="font-bold text-gray-700">출동 대기</span></button>
                                <button onClick={() => handleStatusChange('working')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 text-sm flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span><span className="font-bold text-gray-700">상담/장례 진행 중</span></button>
                                <button onClick={() => handleStatusChange('off')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 text-sm flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-gray-400"></span><span className="font-bold text-gray-500">휴식 (오프)</span></button>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <main className="p-4 max-w-lg mx-auto space-y-4 pb-24">
                {showTopMenu && (
                    <div className="flex bg-white rounded-xl p-1 border border-gray-200 mb-4 shadow-sm sticky top-[7.5rem] z-20 overflow-x-auto">
                        <button onClick={() => setActiveTab('available')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 min-w-[100px] ${activeTab === 'available' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><Briefcase className="w-4 h-4" />입찰가능</button>
                        <button onClick={() => setActiveTab('my_cases')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 min-w-[100px] ${activeTab === 'my_cases' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><User className="w-4 h-4" />내 현황</button>
                        <button onClick={() => setActiveTab('wallet')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 min-w-[100px] ${activeTab === 'wallet' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><DollarSign className="w-4 h-4" />지갑</button>
                        {user?.grade === 'Master' && (
                            <button onClick={() => setActiveTab('team')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 min-w-[100px] ${activeTab === 'team' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><Users className="w-4 h-4" />팀 관리</button>
                        )}
                        <button onClick={() => setActiveTab('profile')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 min-w-[100px] ${activeTab === 'profile' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-50'}`}><User className="w-4 h-4" />프로필</button>
                    </div>
                )}

                {loading ? <div className="text-center py-10 text-gray-400">데이터를 불러오는 중...</div> : activeTab === 'available' ? (
                    <AvailableList cases={availableCases} onBid={handleBid} isMaster={isMaster} onOpenAssignModal={(caseId) => setAssignModal({ isOpen: true, caseId })} />
                ) : activeTab === 'my_cases' ? (
                    <MyCaseList
                        cases={myCases}
                        isFlowerOrderRequired={isFlowerOrderRequired}
                        onUpdate={handleStatusUpdate}
                        onOrderFlower={handleOrderFlower}
                        onConfirmDelivery={handleConfirmDelivery}
                        onOpenReport={(item) => setReportModal({ isOpen: true, caseItem: item })}
                        onOpenOrder={(item) => setOrderModal({ isOpen: true, caseData: item })}
                        onOpenCoupon={(item) => {
                            const coupon = item.coupons?.[0];
                            if (coupon) setCouponModal({ isOpen: true, coupon, caseId: item.id });
                        }}
                        onOpenDetail={(item) => setConsultModal({
                            isOpen: true,
                            caseId: item.id,
                            deceased_name: item.deceased_name || '',
                            room_number: item.room_number || '',
                            location: item.location || '',
                            encoffinment_time: item.encoffinment_time ? new Date(item.encoffinment_time).toISOString().slice(0, 16) : '',
                            funeral_end_time: item.funeral_end_time ? new Date(item.funeral_end_time).toISOString().slice(0, 16) : '',
                            suggestions: []
                        })}
                    />
                ) : activeTab === 'team' ? (
                    <TeamManagement user={user} />
                ) : activeTab === 'wallet' ? (
                    <MyWallet user={user} />
                ) : (
                    <Profile user={user} onUpdate={setUser} />
                )}
            </main>

            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-3 pb-6 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] overflow-x-auto">
                <button onClick={() => setActiveTab('available')} className={`flex flex-col items-center gap-1 min-w-[64px] ${activeTab === 'available' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <Briefcase className={`w-6 h-6 ${activeTab === 'available' ? 'fill-current' : ''}`} />
                    <span className="text-xs font-bold">입찰가능</span>
                </button>
                <button onClick={() => setActiveTab('my_cases')} className={`flex flex-col items-center gap-1 min-w-[64px] ${activeTab === 'my_cases' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <User className={`w-6 h-6 ${activeTab === 'my_cases' ? 'fill-current' : ''}`} />
                    <span className="text-xs font-bold">내 현황</span>
                </button>
                <button onClick={() => setActiveTab('wallet')} className={`flex flex-col items-center gap-1 min-w-[64px] ${activeTab === 'wallet' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <DollarSign className={`w-6 h-6 ${activeTab === 'wallet' ? 'fill-current' : ''}`} />
                    <span className="text-xs font-bold">지갑</span>
                </button>
                {user?.grade === 'Master' && (
                    <button onClick={() => setActiveTab('team')} className={`flex flex-col items-center gap-1 min-w-[64px] ${activeTab === 'team' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                        <Users className={`w-6 h-6 ${activeTab === 'team' ? 'fill-current' : ''}`} />
                        <span className="text-xs font-bold">팀 관리</span>
                    </button>
                )}
                <button onClick={() => setActiveTab('profile')} className={`flex flex-col items-center gap-1 min-w-[64px] ${activeTab === 'profile' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <User className={`w-6 h-6 ${activeTab === 'profile' ? 'fill-current' : ''}`} />
                    <span className="text-xs font-bold">프로필</span>
                </button>
            </nav>

            {/* 외주 발주 모달 */}
            <OrderModal
                isOpen={orderModal.isOpen}
                onClose={() => setOrderModal({ isOpen: false, caseData: null })}
                caseData={orderModal.caseData}
                teamLeaderId={user?.id}
            />

            {assignModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div><h3 className="font-bold text-lg text-gray-900">팀원에게 배정하기</h3><p className="text-xs text-gray-500">배정할 팀원을 선택해주세요</p></div>
                            <button onClick={() => setAssignModal({ isOpen: false, caseId: null })} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full transition-colors"><XCircle className="w-6 h-6" /></button>
                        </div>
                        <div className="p-4 max-h-[60vh] overflow-y-auto bg-white">
                            {myTeam.length === 0 ? <p className="text-center text-gray-500 py-8">등록된 하위 팀원이 없습니다.</p> : (
                                <div className="space-y-2">
                                    <button onClick={() => handleBid(assignModal.caseId, user.id, '본인')} className="w-full p-3 rounded-xl border border-indigo-100 bg-indigo-50 hover:bg-indigo-100 text-left flex items-center gap-3 transition-colors group mb-4 relative overflow-hidden"><div className="absolute left-0 top-0 h-full w-1 bg-indigo-500"></div><div className="w-10 h-10 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-bold group-hover:bg-indigo-300 shadow-sm">나</div><div><div className="font-bold text-gray-900">본인 직접 수행</div><div className="text-xs text-indigo-600 font-medium">Master Leader 출동</div></div></button>
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">소속 팀원 리스트</h4>
                                    {myTeam.map(member => {
                                        const mStatus = member.current_status || (member.is_working ? 'waiting' : 'off');
                                        const sInfo = getStatusInfo(mStatus);
                                        const isAvailable = mStatus === 'waiting';
                                        return (
                                            <button key={member.user_id} onClick={() => { if (mStatus === 'off') { alert('해당 팀원은 현재 [휴식 중]입니다.'); return; } if (mStatus === 'working') { if (!confirm('해당 팀원은 현재 [장례 진행 중]입니다.\n추가 배정을 하시겠습니까?')) return; } handleBid(assignModal.caseId, member.user_id, member.profiles?.name); }} className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${isAvailable ? 'border-gray-100 hover:bg-gray-50 bg-white' : 'border-gray-100 bg-gray-50 opacity-80'}`}><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm relative ${sInfo.color.replace('text-', 'bg-').replace('100', '200')}`}>{member.profiles?.name?.[0]}<span className={`absolute bottom-0 right-0 w-2.5 h-2.5 border-2 border-white rounded-full ${sInfo.icon}`}></span></div><div className="flex-1"><div className="flex justify-between items-center"><span className={`font-bold ${mStatus === 'off' ? 'text-gray-500' : 'text-gray-900'}`}>{member.profiles?.name} <span className="text-xs font-normal text-gray-400">({member.profiles?.role === 'leader' ? '팀장' : '팀원'})</span></span><span className={`text-[10px] px-1.5 py-0.5 rounded ${sInfo.color}`}>{sInfo.label}</span></div><div className="text-xs text-gray-500">{member.region} • {member.grade}</div></div></button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Stage Progress Report Modal */}
            <ProgressReportModal
                isOpen={reportModal.isOpen}
                onClose={() => setReportModal({ ...reportModal, isOpen: false })}
                caseItem={reportModal.caseItem}
                user={user}
            />

            {couponModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-fadeIn p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-indigo-50">
                            <div>
                                <h3 className="font-bold text-lg text-indigo-900">쿠폰 사용 확인</h3>
                                <p className="text-xs text-indigo-600">상담이 완료되어 쿠폰을 사용합니다.</p>
                            </div>
                            <button onClick={() => setCouponModal({ isOpen: false, coupon: null, caseId: null })} className="text-gray-400 hover:text-gray-600"><XCircle className="w-6 h-6" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <div className="text-xs text-gray-500 mb-1">적용 쿠폰</div>
                                <div className="font-bold text-gray-900 text-lg">{couponModal.coupon?.code}</div>
                                <div className="text-indigo-600 font-black">₩ {couponModal.coupon?.amount?.toLocaleString()}</div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">사용 용도 선택</label>
                                {['현금지급', '화환사용', '입관꽃사용', '수동입력'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => handleCouponUsage(couponModal.coupon.id, type, couponModal.caseId)}
                                        className="w-full p-4 rounded-xl border border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 text-left font-bold text-gray-700 transition-all active:scale-[0.98]"
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Consultation Detail Input Modal */}
            {consultModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-fadeIn p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-blue-50 sticky top-0 z-10">
                            <div>
                                <h3 className="font-bold text-lg text-blue-900">장례 상세 정보 입력</h3>
                                <p className="text-xs text-blue-600">상담 완료 및 진행을 위한 상세 정보를 입력하세요.</p>
                            </div>
                            <button onClick={() => setConsultModal({ ...consultModal, isOpen: false })} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-white rounded-full transition-colors"><XCircle className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleSaveConsultation} className="p-6 space-y-4">
                            <div className="space-y-4">
                                <div className="relative">
                                    <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1">
                                        <MapPin className="w-3 h-3 text-blue-500" /> 장례식장 (장소)
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={consultModal.location}
                                        onChange={e => {
                                            const val = e.target.value;
                                            const filtered = val.trim().length > 0
                                                ? FUNERAL_HOMES_FULL.filter(h => matchHangul(h.name, val) || matchHangul(h.address, val)).slice(0, 10)
                                                : [];
                                            setConsultModal({ ...consultModal, location: val, suggestions: filtered });
                                        }}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold placeholder:text-gray-300"
                                        placeholder="장례식장 이름 검색 (예: 서울아산)"
                                    />
                                    {consultModal.suggestions.length > 0 && (
                                        <ul className="absolute z-50 w-full bg-white border border-gray-100 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto border-t-0 p-1">
                                            {consultModal.suggestions.map((h, i) => (
                                                <li
                                                    key={i}
                                                    onClick={() => setConsultModal({ ...consultModal, location: h.name, suggestions: [] })}
                                                    className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer rounded-lg border-b border-gray-50 last:border-none transition-colors"
                                                >
                                                    <div className="font-bold text-gray-800 text-sm">{h.name}</div>
                                                    <div className="text-[10px] text-gray-500 truncate">{h.address}</div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">고인명</label>
                                        <input
                                            type="text"
                                            required
                                            value={consultModal.deceased_name}
                                            onChange={e => setConsultModal({ ...consultModal, deceased_name: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
                                            placeholder="성함 입력"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">호실 (빈소)</label>
                                        <input
                                            type="text"
                                            required
                                            value={consultModal.room_number}
                                            onChange={e => setConsultModal({ ...consultModal, room_number: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold"
                                            placeholder="예: 201호"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-blue-500" /> 입관 일시
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={consultModal.encoffinment_time}
                                        onChange={e => setConsultModal({ ...consultModal, encoffinment_time: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-blue-500" /> 발인 일시
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={consultModal.funeral_end_time}
                                        onChange={e => setConsultModal({ ...consultModal, funeral_end_time: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                    />
                                </div>
                            </div>

                            {/* e하늘 화장 예약 바로가기 */}
                            <a
                                href="https://15774129.go.kr/new/esky_p/esky_index.do#MENU:M210900000"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between w-full px-4 py-3 bg-sky-50 border border-sky-200 rounded-xl hover:bg-sky-100 transition-colors group"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">🔥</span>
                                    <div>
                                        <p className="text-sm font-bold text-sky-700">e하늘 화장 예약 바로가기</p>
                                        <p className="text-[10px] text-sky-500">보건복지부 화장예약시스템 · 새 탭으로 열림</p>
                                    </div>
                                </div>
                                <ExternalLink className="w-4 h-4 text-sky-400 group-hover:text-sky-600 transition-colors" />
                            </a>

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    <CheckCircle className="w-5 h-5" />
                                    <span>상담 완료 및 서비스 시작</span>
                                </button>
                                <p className="text-center text-[10px] text-gray-400 mt-4">
                                    저장 시 고객 및 본사로 진행 알림이 전송됩니다.
                                </p>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function AvailableList({ cases, onBid, isMaster, onOpenAssignModal }) {
    if (cases.length === 0) return <div className="bg-white rounded-xl p-10 text-center border border-gray-200 mt-8"><div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-gray-300" /></div><h3 className="font-bold text-gray-800">현재 대기 중인 콜이 없습니다.</h3></div>;
    return (
        <div className="space-y-4">
            {cases.map(item => (
                <div key={item.id} className="bg-white p-6 rounded-2xl shadow-md border border-red-50 relative overflow-hidden transform transition-all hover:scale-[1.01]">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>
                    <div className="flex justify-between items-start mb-4"><span className="bg-red-50 text-red-600 text-xs font-bold px-2 py-1 rounded-md mb-2 flex items-center gap-1 animate-pulse">🚨 접수 대기</span><span className="text-xs text-gray-400 font-mono">{new Date(item.created_at).toLocaleTimeString()}</span></div>
                    <div className="mb-6"><h3 className="text-xl font-bold text-gray-900 mb-1">{item.location || '장소 미정'}</h3><div className="flex items-center gap-2 text-sm text-gray-600"><Briefcase className="w-4 h-4 text-gray-400" />{item.package_name}</div><div className="flex items-center gap-2 text-sm text-gray-600 mt-1"><User className="w-4 h-4 text-gray-400" />{item.profiles?.name} 고객님</div></div>
                    <div className="grid grid-cols-2 gap-3"><button onClick={() => onBid(item.id)} className={`bg-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2 ${isMaster ? '' : 'col-span-2'}`}><span className="text-lg">⚡</span><span>{isMaster ? '본인 배정' : '즉시 배정 받기'}</span></button>{isMaster && (<button onClick={() => onOpenAssignModal(item.id)} className="bg-white border-2 border-indigo-100 text-indigo-600 font-bold py-3.5 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2"><Users className="w-5 h-5" />팀원 배정</button>)}</div>
                </div>
            ))}
        </div>
    );
}

function MyCaseList({ cases, isFlowerOrderRequired, onUpdate, onOrderFlower, onOpenReport, onOpenCoupon, onOpenDetail, onOpenOrder, onConfirmDelivery }) {
    if (cases.length === 0) return <div className="bg-white rounded-xl p-10 text-center border border-gray-200 mt-8"><p className="text-gray-500">현재 진행 중인 건이 없습니다.</p></div>;
    return cases.map(item => <CaseCard key={item.id} item={item} isFlowerOrderRequired={isFlowerOrderRequired} onUpdate={onUpdate} onOrderFlower={onOrderFlower} onOpenReport={onOpenReport} onOpenCoupon={onOpenCoupon} onOpenDetail={onOpenDetail} onOpenOrder={onOpenOrder} onConfirmDelivery={onConfirmDelivery} />);
}

function CaseCard({ item, isFlowerOrderRequired, onUpdate, onOrderFlower, onOpenReport, onOpenCoupon, onOpenDetail, onOpenOrder, onConfirmDelivery }) {
    const { id, profiles, location, package_name, status, flower_orders, coupons, deceased_name, room_number, encoffinment_time, funeral_end_time, orders } = item;
    const hasOrderedFlower = flower_orders && flower_orders.length > 0;
    const linkedCoupon = coupons?.[0];
    const isCouponUsed = linkedCoupon?.status === 'used';

    const getStatusBadge = (s) => {
        switch (s) {
            case 'assigned': return <span className="text-yellow-700 bg-yellow-100 px-2 py-1 rounded-md text-xs font-bold">🟡 팀장 배정</span>;
            case 'consulting': return <span className="text-orange-700 bg-orange-100 px-2 py-1 rounded-md text-xs font-bold">🗣️ 상담 중</span>;
            case 'in_progress': return <span className="text-blue-700 bg-blue-100 px-2 py-1 rounded-md text-xs font-bold">🔵 서비스 진행</span>;
            case 'team_settling': return <span className="text-green-700 bg-green-100 px-2 py-1 rounded-md text-xs font-bold">🟢 정산 대기</span>;
            case 'hq_check': return <span className="text-green-700 bg-green-100 px-2 py-1 rounded-md text-xs font-bold">🟢 정산 검토 중</span>;
            case 'completed': return <span className="text-gray-700 bg-gray-100 px-2 py-1 rounded-md text-xs font-bold">⚪ 완료됨</span>;
            default: return <span className="text-gray-500 bg-gray-100 px-2 py-1 rounded-md text-xs font-bold">{s}</span>;
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4 transition-all hover:shadow-md">
            <div className="p-5 border-b border-gray-50 bg-gray-50/30">
                <div className="flex items-center gap-2 mb-2">{getStatusBadge(status)}</div>
                <h4 className="font-bold text-lg text-gray-900 mt-1">
                    {deceased_name ? `🥀 고인명: ${deceased_name}` : '🥀 고인명 미상'}
                </h4>
                <div className="flex items-center text-gray-700 font-bold text-sm mt-2">
                    <MapPin className="w-4 h-4 text-indigo-500 mr-1" />{location || '장례식장 미정'} {room_number && <span className="text-indigo-600 font-bold ml-1">({room_number})</span>}
                </div>
                {(encoffinment_time || funeral_end_time) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {encoffinment_time && (
                            <span className="text-[11px] text-gray-600 flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm">
                                <Clock className="w-3.5 h-3.5" /> 입관: {new Date(encoffinment_time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                        {funeral_end_time && (
                            <span className="text-[11px] text-gray-600 flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded-md shadow-sm">
                                <Calendar className="w-3.5 h-3.5" /> 발인: {new Date(funeral_end_time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                    </div>
                )}
                {linkedCoupon && (
                    <div className="mt-3 flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isCouponUsed ? 'bg-gray-100 text-gray-500' : 'bg-indigo-100 text-indigo-700 animate-pulse'}`}>
                            <Tag className="w-3 h-3 inline mr-1" />
                            쿠폰: {linkedCoupon.code} ({linkedCoupon.amount.toLocaleString()}원)
                        </span>
                        {isCouponUsed && (
                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                                사용됨: {linkedCoupon.used_for}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="p-4 bg-white border-t border-gray-100 space-y-4">

                {/* 1. 장례 진행 관련 (초기 배정 및 상담, 서비스 진행) */}
                <div>
                    {status === 'assigned' && (
                        <button onClick={() => onUpdate(id, 'consulting')} className="w-full bg-orange-50 text-orange-700 border border-orange-200 font-bold py-3.5 rounded-xl hover:bg-orange-100 transition-colors flex items-center justify-center gap-2">
                            <span>다음 단계:</span> <span>🗣️ 상담 시작</span>
                        </button>
                    )}
                    {status === 'consulting' && (
                        <div className="grid grid-cols-2 gap-3">
                            {linkedCoupon && !isCouponUsed ? (
                                <button onClick={() => onOpenCoupon(item)} className="col-span-2 bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2">
                                    <Tag className="w-5 h-5" /> <span>쿠폰 사용 & 빈소 설치</span>
                                </button>
                            ) : (
                                <button onClick={() => onOpenDetail(item)} className="bg-blue-50 text-blue-700 border border-blue-200 font-bold py-3.5 rounded-xl hover:bg-blue-100 transition-all active:scale-95 flex items-center justify-center gap-2">
                                    <span>🔵 빈소 설치 (상담 완료)</span>
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    if (confirm('상담을 취소하시겠습니까?\n배정이 취소되어 다시 전체 공고로 올라갑니다.')) {
                                        onUpdate(id, 'requested', { team_leader_id: null });
                                    }
                                }}
                                className={`bg-red-50 text-red-600 border border-red-100 font-bold py-3.5 rounded-xl hover:bg-red-100 transition-all active:scale-95 flex items-center justify-center gap-2 ${linkedCoupon && !isCouponUsed ? 'col-span-2' : ''}`}
                            >
                                <span>❌ 상담 취소</span>
                            </button>
                        </div>
                    )}
                    {status === 'in_progress' && (
                        <div className="bg-gray-50/50 p-3 rounded-xl border border-gray-100 space-y-2 mb-4">
                            <h5 className="font-bold text-gray-700 text-sm mb-2 flex items-center gap-1.5">
                                <ClipboardList className="w-4 h-4 text-indigo-500" /> 장례 진행 관련
                            </h5>
                            <button onClick={() => onOpenReport(item)} className="w-full bg-white text-indigo-700 border border-indigo-200 font-bold py-3.5 rounded-xl hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
                                <span>📷 장례 진행 보고 (25단계 중 {item.funeral_progress_reports?.length || 0}개 완료)</span>
                            </button>
                            <button onClick={() => onUpdate(id, 'team_settling')} className="w-full bg-green-50 text-green-700 border border-green-200 font-bold py-3.5 rounded-xl hover:bg-green-100 shadow-sm transition-all flex items-center justify-center gap-2 mt-2">
                                <span>다음 단계:</span> <span>🟢 장례 종료 (정산 요청)</span>
                            </button>
                        </div>
                    )}
                    {status === 'team_settling' && (
                        <button className="w-full bg-gray-50 border border-gray-200 text-gray-500 font-bold py-3 rounded-xl flex items-center justify-center gap-2 cursor-default">
                            <CheckCircle className="w-5 h-5 text-green-500" />
                            🟢 정산 확인 대기 (관리자 승인 대기)
                        </button>
                    )}
                    {status === 'hq_check' && (
                        <button className="w-full bg-gray-50 border border-gray-200 text-gray-500 font-bold py-3 rounded-xl flex items-center justify-center gap-2 cursor-default">
                            <Clock className="w-5 h-5" />
                            🟢 본사 정산 검토 중
                        </button>
                    )}
                    {status === 'completed' && (
                        <button className="w-full bg-gray-50 border border-gray-200 text-gray-400 font-bold py-3 rounded-xl flex items-center justify-center gap-2 cursor-default">
                            ⚪ 완전히 종료된 장례입니다.
                        </button>
                    )}
                </div>

                {/* 2. 외주 관련 (발주 및 납품 현황) - 상담 중 단계 이상부터 노출 */}
                {(status === 'consulting' || status === 'in_progress' || status === 'team_settling' || status === 'hq_check' || status === 'completed') && (
                    <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]">
                        <h5 className="font-bold text-gray-700 text-sm mb-2 flex items-center gap-1.5">
                            <Package className="w-4 h-4 text-sky-500" /> 외주 관련 (검색 및 발주)
                        </h5>

                        {(status === 'in_progress' || status === 'consulting') && (
                            <button onClick={() => onOpenOrder(item)} className="w-full bg-sky-50 text-sky-700 border border-sky-200 font-bold py-3.5 rounded-xl hover:bg-sky-100 transition-colors flex items-center justify-center gap-2 mb-3">
                                <span>📦 장례 관련 용품 발주</span>
                            </button>
                        )}

                        {orders && orders.length > 0 && (
                            <div className="space-y-2 mt-2">
                                {orders.map(order => {
                                    const stMap = {
                                        pending: { label: '발주 대기', color: 'text-orange-600 bg-orange-50 border-orange-100' },
                                        confirmed: { label: '확인 완료', color: 'text-blue-600 bg-blue-50 border-blue-100' },
                                        shipped: { label: '배송 중', color: 'text-purple-600 bg-purple-50 border-purple-100' },
                                        delivered: { label: '배송 완료 (인수 대기)', color: 'text-amber-600 bg-amber-50 border-amber-100' },
                                        completed: { label: '납품/인수 완료', color: 'text-green-600 bg-green-50 border-green-100' },
                                        cancelled: { label: '취소', color: 'text-red-600 bg-red-50 border-red-100' }
                                    };
                                    const stInfo = stMap[order.status] || { label: order.status, color: 'text-gray-600 bg-gray-50 border-gray-100' };
                                    const delivery = order.deliveries?.[0];

                                    return (
                                        <div key={order.id} className="bg-white border border-gray-100 shadow-sm rounded-lg p-3 text-sm">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-bold text-gray-800">{order.vendors?.company_name}</div>
                                                    <div className="text-xs text-gray-400 font-mono mt-0.5">{order.order_number}</div>
                                                </div>
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-md border shrink-0 ${stInfo.color}`}>
                                                    {stInfo.label}
                                                </span>
                                            </div>

                                            {(order.status === 'delivered' || order.status === 'completed') && delivery && (
                                                <div className="mt-3 pt-3 border-t border-gray-100">
                                                    <p className="text-xs text-gray-500 mb-2">
                                                        ✅ 납품 시간: {new Date(delivery.completed_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}<br />
                                                        🧑‍🔧 담당 기사: {delivery.driver_name || '미확인'}
                                                    </p>
                                                    {delivery.delivery_photo_url && (
                                                        <a href={delivery.delivery_photo_url} target="_blank" rel="noopener noreferrer" className="block w-full">
                                                            <img
                                                                src={delivery.delivery_photo_url}
                                                                alt="납품 완료 사진"
                                                                className="w-full h-32 object-cover rounded-lg border border-gray-200"
                                                            />
                                                            <p className="text-[10px] text-gray-400 text-center mt-1">사진을 누르면 크게 볼 수 있습니다</p>
                                                        </a>
                                                    )}
                                                    {delivery.notes && (
                                                        <div className="mt-2 text-xs bg-gray-50 p-2 rounded text-gray-600">
                                                            <strong className="text-gray-500">배송 메모:</strong> {delivery.notes}
                                                        </div>
                                                    )}
                                                    {order.status === 'delivered' && (
                                                        <button
                                                            onClick={() => onConfirmDelivery(order.id)}
                                                            className="mt-3 w-full font-bold bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                                        >
                                                            <CheckCircle className="w-4 h-4" /> 인수 확인 완료 (정산 동의)
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
