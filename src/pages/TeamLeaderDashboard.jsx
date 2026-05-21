import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { translateError } from '../lib/errorHandler';
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
    Package,
    ClipboardList,
    Plus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MyWallet from '../components/team/MyWallet';
import FuneralCaseInfo from '../components/common/FuneralCaseInfo';
import TeamManagement from '../components/team/TeamManagement';
import Profile from '../components/common/Profile';
import { useNotification } from '../contexts/NotificationContext';
import MessageInbox from '../components/common/MessageInbox';
import { matchHangul } from '../lib/hangul';
import { FUNERAL_HOMES_FULL } from '../data/funeralHomes';
import ProgressReportModal from '../components/teamleader/ProgressReportModal';
import OrderModal from '../components/teamleader/OrderModal';
import { useMultiRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import PackageBottomSheet from '../components/common/PackageBottomSheet';
import CustomPackageProposalModal from '../components/teamleader/CustomPackageProposalModal';

export default function TeamLeaderDashboard() {
    const { showToast, sendNotification, unreadCount } = useNotification();
    const [activeTab, setActiveTab] = useState('available');
    const hasInitialized = useRef(false);
    const [availableCases, setAvailableCases] = useState([]);
    const [myCases, setMyCases] = useState([]);
    const [myTeam, setMyTeam] = useState([]);
    const [isFlowerOrderRequired, setIsFlowerOrderRequired] = useState(false);
    const [showTopMenu, setShowTopMenu] = useState(true);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [myStatus, setMyStatus] = useState('waiting');
    const [statusMenuOpen, setStatusMenuOpen] = useState(false);
    const [packages, setPackages] = useState([]);
    const [isPreviewMode, setIsPreviewMode] = useState(false);
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
    const [myCasesTab, setMyCasesTab] = useState('in_progress'); // 'in_progress', 'completed'
    const [proposalModalOpen, setProposalModalOpen] = useState(false);
    
    // 신규 추가: 개인 장례 탭 및 등록 모달 상태
    const [profileTab, setProfileTab] = useState('settings'); // 'settings', 'private_active', 'private_completed'
    const [privateRegisterModalOpen, setPrivateRegisterModalOpen] = useState(false);
    const [privateCaseInput, setPrivateCaseInput] = useState({ deceased_name: '', room_number: '', location: '', encoffinment_time: '', funeral_end_time: '' });

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
                setIsPreviewMode(!!parsedUser._preview_mode);
        } else {
            navigate('/login');
        }
    }, [navigate]);

    const handleAdminReturn = () => {
        const backup = localStorage.getItem('admin_preview_backup');
        if (backup) {
            localStorage.setItem('user', backup);
            localStorage.removeItem('admin_preview_backup');
        }
        navigate('/admin');
    };

    useEffect(() => {
        if (user) {
            fetchData();
            fetchSystemConfig();
            fetchMyStatus();

            // Fallback timeout checker (30초 간격 — DB 트리거가 주역할이므로 안전)
            const timeoutInterval = setInterval(async () => {
                try {
                    const { data } = await supabase.rpc('process_bidding_timeouts');
                    if (data > 0) {
                        console.log(`[Bidding] ${data}건 타임아웃 처리됨`);
                        fetchData(); // 변경 발생 시 즉시 새로고침
                    }
                } catch (err) {
                    console.error('Timeout check error:', err);
                }
            }, 30000);

            return () => clearInterval(timeoutInterval);
        }
    }, [user, activeTab]);

    // 🔄 4단계: 실시간 자동 갱신
    const handleRealtimeChange = useCallback((payload) => {
        const { table, eventType } = payload;
        console.log(`[Leader Realtime] ${table} ${eventType} 감지`);
        if (table === 'funeral_cases') {
            fetchData();
            if (eventType === 'INSERT') showToast('info', '새 접수', '🚨 새로운 장례 접수가 도착했습니다!');
            if (eventType === 'UPDATE') showToast('info', '상태 변경', '📋 장례 상태가 업데이트되었습니다.');
        }
    }, [showToast]);

    useMultiRealtimeSubscription(
        [{ table: 'funeral_cases', events: ['INSERT', 'UPDATE'] }],
        handleRealtimeChange,
        !!user
    );

    const fetchSystemConfig = async () => {
        const { data } = await supabase.from('system_config').select('*').in('key', ['flower_order_required', 'show_top_menu', 'funeral_packages']);
        if (data) {
            const flowerConfig = data.find(c => c.key === 'flower_order_required');
            setIsFlowerOrderRequired(flowerConfig?.value === 'true');
            const topMenuConfig = data.find(c => c.key === 'show_top_menu');
            setShowTopMenu(topMenuConfig?.value !== 'false');
            const pkgConfig = data.find(c => c.key === 'funeral_packages');
            if (pkgConfig?.value) {
                try { setPackages(JSON.parse(pkgConfig.value).map(p => ({ items: [], active: true, ...p }))); } catch (e) {}
            }
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
            showToast('error', '상태 변경 실패', translateError(error));
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Determine Target Team IDs
            let targetTeamIds = [user.id];
            if (user.grade === 'Master' || user.grade === 'S') {
                const { data: subMembers } = await supabase
                    .from('partners')
                    .select('user_id')
                    .eq('master_id', user.id);

                if (subMembers) {
                    targetTeamIds = [...targetTeamIds, ...subMembers.map(m => m.user_id)];
                }
            }

            // 2. Parallel Fetch
            const results = await Promise.allSettled([
                supabase.from('funeral_cases').select('*, profiles:customer_id(name, phone)').eq('status', 'requested').order('created_at', { ascending: false }),
                supabase.from('funeral_cases').select('*, profiles:customer_id(name, phone), team_leader:team_leader_id(id, name, role), funeral_progress_reports(id), orders(*, vendors(company_name), deliveries(*))').in('status', ['assigned', 'consulting', 'in_progress', 'team_settling', 'hq_check', 'completed']).in('team_leader_id', targetTeamIds).order('created_at', { ascending: false }),
                user.grade === 'Master' ? supabase.from('partners').select('*, profiles:user_id(name, phone)').eq('master_id', user.id) : Promise.resolve({ data: null })
            ]);

            const [reqRes, myRes, teamRes] = results.map(r => r.status === 'fulfilled' ? r.value : { data: null, error: r.reason });

            if (reqRes.data) {
                // Filter the requested cases:
                // Only show cases that either have NO current_bidder_id (open to all)
                // OR where the current_bidder_id matches the current user.
                const filteredCases = reqRes.data.filter(c => !c.current_bidder_id || c.current_bidder_id === user.id);
                setAvailableCases(filteredCases);
            }
            if (myRes.data) {
                setMyCases(myRes.data);
                
                // 첫 로딩 시 배정된 건(assigned)이나 진행 중인 건이 있다면 '내 현황' 탭으로 자동 이동
                if (!hasInitialized.current) {
                    const hasActiveAssigned = myRes.data.some(c => c.status === 'assigned' || c.status === 'consulting');
                    if (hasActiveAssigned) {
                        setActiveTab('my_cases');
                    }
                    hasInitialized.current = true;
                }
            }
            if (myRes.error) console.error("My Cases fetch error:", myRes.error);
            if (teamRes.data) setMyTeam(teamRes.data);

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
            const newLeaderId = assigneeId || user.id;

            // accept_bidding RPC 호출 (순차배정 히스토리 자동 기록)
            const { data: rpcResult, error: rpcError } = await supabase.rpc('accept_bidding', {
                p_case_id: caseId,
                p_leader_id: newLeaderId
            });

            if (rpcError) {
                console.error('accept_bidding RPC error:', rpcError);
                // RPC 실패 시 직접 업데이트 폴백
                const { data, error } = await supabase
                    .from('funeral_cases')
                    .update({ status: 'assigned', team_leader_id: newLeaderId, current_bidder_id: null, bid_timeout_at: null })
                    .eq('id', caseId)
                    .select();

                if (error || !data || data.length === 0) {
                    showToast('error', '배정 실패', '데이터베이스 권한 문제로 저장이 안 되었습니다.');
                    return;
                }
            } else if (rpcResult === 'NOT_AVAILABLE') {
                showToast('error', '배정 실패', '이미 다른 팀장님이 배정받으셨습니다.');
                fetchData();
                return;
            }

            if (isSelfAssign) {
                await handleStatusChange('working', false);
                showToast('success', '배정 완료', '상담/장례 진행 중 상태로 변경되었습니다.');
                setActiveTab('my_cases');
                setTimeout(() => { fetchData(); }, 100);
            } else {
                showToast('success', '배정 완료', `${assigneeName} 팀장에게 배정되었습니다.`);
                sendNotification(assigneeId, 'assignment', '새로운 장례 배정', `${user.name} 마스터가 장례를 배정했습니다.`, '/leader');
                fetchData();
            }
        } catch (error) {
            console.error(error);
            showToast('error', '배정 실패', translateError(error));
        }
    };

    // 순차배정: 패스 (다음 사람에게 넘기기)
    const handlePass = async (caseId) => {
        if (!confirm('이 장례를 패스하시겠습니까?\n다음 순번 팀장에게 배정됩니다.')) return;
        try {
            const { data: result, error } = await supabase.rpc('pass_bidding', {
                p_case_id: caseId,
                p_leader_id: user.id,
                p_reason: '수동 패스'
            });

            if (error) throw error;

            if (result === 'PASSED_TO_NEXT') {
                showToast('info', '패스 완료', '다음 순번 팀장에게 배정되었습니다.');
            } else if (result === 'CYCLING_RESTART') {
                showToast('warning', '순번 순환', '전체 순번이 소진되어 처음부터 다시 시작합니다.');
            } else if (result === 'NO_AVAILABLE_LEADER') {
                showToast('error', '배정 불가', '가용한 팀장이 없습니다. 관리자에게 문의하세요.');
            } else if (result === 'NOT_CURRENT_BIDDER') {
                showToast('error', '패스 실패', '현재 본인에게 배정된 건이 아닙니다.');
            }
            fetchData();
        } catch (error) {
            console.error(error);
            showToast('error', '패스 실패', translateError(error));
        }
    };
    const handleStatusUpdate = async (caseId, newStatus, extraData = {}) => {
        try {
            let updateData = { status: newStatus, ...extraData };



            const { error } = await supabase
                .from('funeral_cases')
                .update(updateData)
                .eq('id', caseId);
            if (error) throw error;

            // 장례 종료(team_settling) 시: draft → awaiting_payment (팀장 입금 대기)
            if (newStatus === 'team_settling') {
                await supabase
                    .from('settlements')
                    .update({ status: 'awaiting_payment' })
                    .eq('case_id', caseId)
                    .eq('status', 'draft');
            }

            fetchData();
            showToast('success', '상태 업데이트', '장례 진행 단계가 변경되었습니다.');

            if (newStatus === 'hq_check' || newStatus === 'completed') {
                if (confirm('장례가 종료되었습니다. 상태를 [출동 대기]로 변경하시겠습니까?')) {
                    handleStatusChange('waiting');
                }
            }
        } catch (error) {
            showToast('error', '업데이트 실패', translateError(error));
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
            showToast('error', '처리 실패', translateError(error));
        }
    };

    const handleCouponUsage = async (couponId, usedFor, caseId) => {
        try {
            const { error } = await supabase
                .from('coupons')
                .update({ status: 'used' })
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
            showToast('error', '처리 실패', translateError(error));
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
            showToast('error', '저장 실패', translateError(error));
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
            showToast('error', '발주 실패', translateError(error));
        }
    };

    const handleRegisterPrivateCase = async (e) => {
        e.preventDefault();
        if(!window.confirm('개인 장례를 등록하시겠습니까?\n등록 시 바로 [상담/장례 진행 중] 상태로 시작됩니다.')) return;
        try {
            const { error } = await supabase.from('funeral_cases').insert([{
                team_leader_id: user.id,
                status: 'in_progress', // immediately start!
                is_private: true,
                deceased_name: privateCaseInput.deceased_name,
                room_number: privateCaseInput.room_number,
                location: privateCaseInput.location,
                encoffinment_time: privateCaseInput.encoffinment_time || null,
                funeral_end_time: privateCaseInput.funeral_end_time || null,
            }]);
            if(error) throw error;
            showToast('success', '등록 완료', '개인 장례가 성공적으로 등록되었습니다.');
            setPrivateRegisterModalOpen(false);
            setPrivateCaseInput({ deceased_name: '', room_number: '', location: '', encoffinment_time: '', funeral_end_time: '' });
            fetchData();
            if (myStatus !== 'working') {
                await handleStatusChange('working', false);
            }
        } catch(err) {
            showToast('error', '등록 실패', translateError(err));
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
            {/* 관리자 미리보기 배너 */}
            {isPreviewMode && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] bg-red-600/95 backdrop-blur-sm text-white px-4 py-2 flex items-center gap-4 rounded-full shadow-lg border border-red-500">
                    <span className="text-xs font-bold whitespace-nowrap">🔴 미리보기: {user.name}</span>
                    <button
                        onClick={handleAdminReturn}
                        className="text-[10px] bg-white text-red-600 font-black px-3 py-1.5 rounded-full hover:bg-red-50 whitespace-nowrap shadow-sm"
                    >
                        돌아가기
                    </button>
                </div>
            )}
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
                        <button onClick={() => { localStorage.removeItem('user'); navigate('/login'); }} className="text-gray-400 hover:text-red-500 transition-colors">
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
                    <AvailableList cases={availableCases} onBid={handleBid} onPass={handlePass} userId={user.id} isMaster={isMaster} onOpenAssignModal={(caseId) => setAssignModal({ isOpen: true, caseId })} />
                ) : activeTab === 'my_cases' ? (
                    <div className="space-y-4">
                        <div className="flex bg-gray-100 rounded-lg p-1 mx-1">
                            <button onClick={() => setMyCasesTab('in_progress')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${myCasesTab === 'in_progress' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:bg-gray-200'}`}>진행 중</button>
                            <button onClick={() => setMyCasesTab('completed')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${myCasesTab === 'completed' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:bg-gray-200'}`}>완료된 장례</button>
                        </div>
                        <MyCaseList
                            cases={myCases.filter(c => !c.is_private).filter(c => myCasesTab === 'completed' ? c.status === 'completed' : c.status !== 'completed')}
                            isFlowerOrderRequired={isFlowerOrderRequired}
                            packages={packages}
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
                        user={user}
                    />
                    </div>
                ) : activeTab === 'team' ? (
                    <TeamManagement user={user} />
                ) : activeTab === 'wallet' ? (
                    <MyWallet user={user} />
                ) : (
                    <div className="space-y-4">
                        <div className="flex bg-gray-100 rounded-lg p-1 mx-1">
                            <button onClick={() => setProfileTab('settings')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${profileTab === 'settings' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:bg-gray-200'}`}>기본 설정</button>
                            <button onClick={() => setProfileTab('private_active')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${profileTab === 'private_active' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:bg-gray-200'}`}>개인장례 진행</button>
                            <button onClick={() => setProfileTab('private_completed')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${profileTab === 'private_completed' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:bg-gray-200'}`}>개인장례 완료</button>
                        </div>

                        {profileTab === 'settings' && (
                            <div className="space-y-4">
                                <Profile user={user} onUpdate={setUser} />
                                
                                {user?.grade === 'Master' && (
                                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                                                <Package className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">내 상품 제안하기</h3>
                                                <p className="text-xs text-gray-500">본사에 나만의 특화 장례 패키지를 승인 요청합니다.</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => setProposalModalOpen(true)} 
                                            className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                        >
                                            <Plus className="w-5 h-5" /> 상품 제안서 작성
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {profileTab === 'private_active' && (
                            <div className="space-y-4">
                                <button 
                                    onClick={() => setPrivateRegisterModalOpen(true)}
                                    className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2 mb-2"
                                >
                                    <Plus className="w-5 h-5" /> 새로운 개인 장례 등록
                                </button>
                                <MyCaseList
                                    cases={myCases.filter(c => c.is_private && c.status !== 'completed')}
                                    isFlowerOrderRequired={isFlowerOrderRequired}
                                    packages={packages}
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
                                    user={user}
                                />
                            </div>
                        )}

                        {profileTab === 'private_completed' && (
                            <MyCaseList
                                cases={myCases.filter(c => c.is_private && c.status === 'completed')}
                                isFlowerOrderRequired={isFlowerOrderRequired}
                                packages={packages}
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
                                user={user}
                            />
                        )}
                    </div>
                )}
            </main>

            <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-3 pb-6 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] overflow-x-auto">
                <button onClick={() => setActiveTab('available')} className={`flex flex-col items-center gap-1 min-w-[64px] ${activeTab === 'available' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <Briefcase className={`w-6 h-6 ${activeTab === 'available' ? 'fill-current' : ''}`} />
                    <span className="text-xs font-bold">입찰가능</span>
                </button>
                <button onClick={() => setActiveTab('my_cases')} className={`flex flex-col items-center gap-1 min-w-[64px] relative ${activeTab === 'my_cases' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                    <div className="relative">
                        <User className={`w-6 h-6 ${activeTab === 'my_cases' ? 'fill-current' : ''}`} />
                        {myCases.some(c => c.status === 'assigned') && (
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white animate-pulse"></span>
                        )}
                    </div>
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

            <CustomPackageProposalModal 
                isOpen={proposalModalOpen} 
                onClose={() => setProposalModalOpen(false)} 
                user={user}
            />

            {privateRegisterModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] animate-fadeIn p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-indigo-50 sticky top-0 z-10">
                            <div>
                                <h3 className="font-bold text-lg text-indigo-900">개인 장례 등록</h3>
                                <p className="text-xs text-indigo-600">개인 수주건 정보를 입력하여 관리를 시작합니다.</p>
                            </div>
                            <button onClick={() => setPrivateRegisterModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-white rounded-full transition-colors"><XCircle className="w-6 h-6" /></button>
                        </div>
                        <form onSubmit={handleRegisterPrivateCase} className="p-6 space-y-4">
                            <div className="space-y-4">
                                <div className="relative">
                                    <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1">
                                        <MapPin className="w-3 h-3 text-indigo-500" /> 장례식장 (장소)
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={privateCaseInput.location}
                                        onChange={e => setPrivateCaseInput({ ...privateCaseInput, location: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold placeholder:text-gray-300"
                                        placeholder="장례식장 이름 입력"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">고인명</label>
                                        <input
                                            type="text"
                                            required
                                            value={privateCaseInput.deceased_name}
                                            onChange={e => setPrivateCaseInput({ ...privateCaseInput, deceased_name: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                                            placeholder="성함 입력"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">호실 (빈소)</label>
                                        <input
                                            type="text"
                                            required
                                            value={privateCaseInput.room_number}
                                            onChange={e => setPrivateCaseInput({ ...privateCaseInput, room_number: e.target.value })}
                                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                                            placeholder="예: 201호"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-indigo-500" /> 입관 일시
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={privateCaseInput.encoffinment_time}
                                        onChange={e => setPrivateCaseInput({ ...privateCaseInput, encoffinment_time: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-indigo-500" /> 발인 일시
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={privateCaseInput.funeral_end_time}
                                        onChange={e => setPrivateCaseInput({ ...privateCaseInput, funeral_end_time: e.target.value })}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    />
                                </div>
                            </div>
                            <div className="pt-2">
                                <button
                                    type="submit"
                                    className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl hover:bg-indigo-700 shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    <CheckCircle className="w-5 h-5" />
                                    <span>개인 장례 등록 및 진행 시작</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function CountdownTimer({ timeoutAt }) {
    const [timeLeft, setTimeLeft] = useState('');
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
        if (!timeoutAt) return;
        
        const updateTimer = () => {
            const now = new Date();
            const target = new Date(timeoutAt);
            const diff = target - now;

            if (diff <= 0) {
                setTimeLeft('00:00');
                setIsExpired(true);
                return;
            }

            const m = Math.floor(diff / 1000 / 60);
            const s = Math.floor((diff / 1000) % 60);
            setTimeLeft(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
            setIsExpired(false);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [timeoutAt]);

    if (!timeoutAt) return null;

    return (
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${isExpired ? 'bg-red-50 border-red-200 text-red-600' : 'bg-red-600 border-red-700 text-white animate-pulse'}`}>
            <Clock className="w-3.5 h-3.5" />
            <span className="text-sm font-bold font-mono tracking-wider">
                {isExpired ? '시간 초과' : timeLeft}
            </span>
        </div>
    );
}

function AvailableList({ cases, onBid, onPass, userId, isMaster, onOpenAssignModal }) {
    if (cases.length === 0) return <div className="bg-white rounded-xl p-10 text-center border border-gray-200 mt-8"><div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-gray-300" /></div><h3 className="font-bold text-gray-800">현재 대기 중인 콜이 없습니다.</h3></div>;
    return (
        <div className="space-y-4">
            {cases.map(item => {
                const isMyTurn = item.current_bidder_id === userId;
                const isOpenToAll = !item.current_bidder_id;

                return (
                    <div key={item.id} className={`bg-white p-6 rounded-2xl shadow-md border relative overflow-hidden transform transition-all hover:scale-[1.01] ${isMyTurn ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-200'}`}>
                        <div className={`absolute top-0 left-0 w-1.5 h-full ${isMyTurn ? 'bg-red-600' : 'bg-gray-400'}`}></div>
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex flex-col gap-2">
                                {isMyTurn ? (
                                    <span className="bg-red-50 text-red-600 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1 w-fit animate-pulse">🚨 본인 단독 배정 대기중</span>
                                ) : (
                                    <span className="bg-gray-50 text-gray-600 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1 w-fit">📋 전체 공개 건</span>
                                )}
                                {item.bid_timeout_at && isMyTurn && <CountdownTimer timeoutAt={item.bid_timeout_at} />}
                            </div>
                            <span className="text-xs text-gray-400 font-mono">{new Date(item.created_at).toLocaleTimeString()}</span>
                        </div>
                        <div className="mb-6">
                            <h3 className="text-xl font-bold text-gray-900 mb-1">{item.location || '장소 미정'}</h3>
                            <div className="flex items-center gap-2 text-sm text-gray-600"><Briefcase className="w-4 h-4 text-gray-400" />{item.package_name}</div>
                            <div className="flex items-center gap-2 text-sm text-gray-600 mt-1"><User className="w-4 h-4 text-gray-400" />{item.profiles?.name} 고객님</div>
                        </div>

                        {isMyTurn && (
                            <div className="bg-indigo-50 p-3 rounded-lg mb-4 text-xs text-indigo-700 font-medium">
                                ⏱️ 시간이 초과되면 자동으로 다음 대기자에게 순서가 넘어갑니다.
                            </div>
                        )}

                        <div className={`grid gap-3 ${isMaster ? 'grid-cols-2' : (isMyTurn ? 'grid-cols-2' : 'grid-cols-1')}`}>
                            <button
                                onClick={() => onBid(item.id)}
                                className={`bg-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2 ${!isMaster && !isMyTurn ? 'col-span-1' : ''}`}
                            >
                                <span className="text-lg">⚡</span>
                                <span>{isMaster ? '본인 배정' : '즉시 배정 받기'}</span>
                            </button>

                            {isMyTurn && !isMaster && (
                                <button
                                    onClick={() => onPass(item.id)}
                                    className="bg-white border-2 border-gray-200 text-gray-600 font-bold py-3.5 rounded-xl hover:bg-gray-50 hover:border-gray-300 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <XCircle className="w-5 h-5" />
                                    <span>패스</span>
                                </button>
                            )}

                            {isMaster && (
                                <button
                                    onClick={() => onOpenAssignModal(item.id)}
                                    className="bg-white border-2 border-indigo-100 text-indigo-600 font-bold py-3.5 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <Users className="w-5 h-5" />팀원 배정
                                </button>
                            )}

                            {isMaster && isMyTurn && (
                                <button
                                    onClick={() => onPass(item.id)}
                                    className="col-span-2 bg-gray-50 border border-gray-200 text-gray-500 font-bold py-3 rounded-xl hover:bg-gray-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <XCircle className="w-4 h-4" />
                                    <span>이 건 패스 (다음 순번에게 넘기기)</span>
                                </button>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function MyCaseList({ cases, isFlowerOrderRequired, packages, onUpdate, onOrderFlower, onOpenReport, onOpenCoupon, onOpenDetail, onOpenOrder, onConfirmDelivery, user }) {
    if (cases.length === 0) return <div className="bg-white rounded-xl p-10 text-center border border-gray-200 mt-8"><p className="text-gray-500">현재 진행 중인 건이 없습니다.</p></div>;

    const myCases = cases.filter(c => !c.team_leader || c.team_leader?.id === user?.id);
    const teamCases = cases.filter(c => c.team_leader && c.team_leader?.id !== user?.id);

    return (
        <div className="space-y-6">
            {/* 내 장례 섹션 */}
            {myCases.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                        <h3 className="font-bold text-gray-800 text-sm">📌 내 진행 장례 ({myCases.length}건)</h3>
                    </div>
                    {myCases.map(item => <CaseCard key={item.id} item={item} packages={packages} isFlowerOrderRequired={isFlowerOrderRequired} onUpdate={onUpdate} onOrderFlower={onOrderFlower} onOpenReport={onOpenReport} onOpenCoupon={onOpenCoupon} onOpenDetail={onOpenDetail} onOpenOrder={onOpenOrder} onConfirmDelivery={onConfirmDelivery} user={user} />)}
                </div>
            )}

            {/* 소속 팀장 장례 섹션 */}
            {teamCases.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
                        <h3 className="font-bold text-gray-500 text-sm">👥 소속 팀장 장례 현황 ({teamCases.length}건)</h3>
                        <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">🔒 열람 전용</span>
                    </div>
                    {teamCases.map(item => <CaseCard key={item.id} item={item} packages={packages} isFlowerOrderRequired={isFlowerOrderRequired} onUpdate={onUpdate} onOrderFlower={onOrderFlower} onOpenReport={onOpenReport} onOpenCoupon={onOpenCoupon} onOpenDetail={onOpenDetail} onOpenOrder={onOpenOrder} onConfirmDelivery={onConfirmDelivery} user={user} />)}
                </div>
            )}
        </div>
    );
}

function CaseCard({ item, packages, isFlowerOrderRequired, onUpdate, onOrderFlower, onOpenReport, onOpenCoupon, onOpenDetail, onOpenOrder, onConfirmDelivery, user }) {
    const { id, profiles, location, package_name, status, flower_orders, coupons, deceased_name, room_number, encoffinment_time, funeral_end_time, created_at, orders, team_leader } = item;
    const hasOrderedFlower = flower_orders && flower_orders.length > 0;
    const linkedCoupon = coupons?.[0];
    const isCouponUsed = linkedCoupon?.status === 'used';
    const [sheetPkg, setSheetPkg] = useState(null);

    // Is current user the assigned team leader?
    const isMyCase = !team_leader || user?.id === team_leader.id;

    // 현재 케이스 상품의 패키지 데이터 찾기
    const matchedPkg = packages?.find(p => p.value === package_name);
    const hasItems = matchedPkg?.items?.length > 0;

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
        <div className={`rounded-xl shadow-sm overflow-hidden mb-4 transition-all ${isMyCase ? 'bg-white border border-gray-100 hover:shadow-md' : 'bg-gray-50/70 border-2 border-dashed border-gray-200 opacity-90'}`}>
            {!isMyCase && (
                <div className="bg-gray-200/60 px-4 py-2 flex items-center gap-2 text-xs font-bold text-gray-600 border-b border-gray-300">
                    <span>🔒</span>
                    <span className="text-indigo-700">{team_leader?.name}</span>
                    <span>팀장 담당 건</span>
                    <span className="ml-auto bg-white/80 text-gray-500 px-2 py-0.5 rounded-full text-[10px] border border-gray-300">열람 전용</span>
                </div>
            )}
            <div className={`p-5 border-b border-gray-50 ${isMyCase ? 'bg-gray-50/30' : 'bg-gray-50/50'}`}>
                <FuneralCaseInfo
                    caseId={id}
                    deceasedName={deceased_name}
                    chiefMournerName={profiles?.name}
                    clientPhone={profiles?.phone}
                    location={location}
                    roomNumber={room_number}
                    variant="manager"
                    statusBadge={getStatusBadge(status)}
                    assigneeName={team_leader && user && user.id !== team_leader.id ? team_leader.name : null}
                    assigneeLabel={(team_leader?.role === 'team_leader' || team_leader?.role === 'leader' || team_leader?.role === 'master') ? '팀장' : ''}
                    showAssignee={!!(team_leader && user && user.id !== team_leader.id)}
                    encoffinmentTime={encoffinment_time}
                    funeralEndTime={funeral_end_time}
                    createdAt={created_at}
                />
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
                {/* 상품 구성 보기 버튼 */}
                {hasItems && (
                    <button
                        onClick={() => setSheetPkg(matchedPkg)}
                        className="mt-2 flex items-center gap-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
                    >
                        <Package className="w-3.5 h-3.5" />
                        {package_name} 상품 구성 보기
                    </button>
                )}
            </div>

            <div className="p-4 bg-white border-t border-gray-100 space-y-4">

                {/* 바텀시트 */}
                <PackageBottomSheet
                    isOpen={!!sheetPkg}
                    onClose={() => setSheetPkg(null)}
                    pkg={sheetPkg}
                />

                {/* 1. 장례 진행 관련 (초기 배정 및 상담, 서비스 진행) */}
                <div>
                    {status === 'assigned' && isMyCase && (
                        <button onClick={() => onUpdate(id, 'consulting')} className="w-full bg-orange-50 text-orange-700 border border-orange-200 font-bold py-3.5 rounded-xl hover:bg-orange-100 transition-colors flex items-center justify-center gap-2">
                            <span>다음 단계:</span> <span>🗣️ 상담 시작</span>
                        </button>
                    )}
                    {status === 'consulting' && isMyCase && (
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
                    {['in_progress', 'team_settling', 'hq_check', 'completed'].includes(status) && (
                        <div className="bg-gray-50/50 p-3 rounded-xl border border-gray-100 space-y-2 mb-4">
                            <h5 className="font-bold text-gray-700 text-sm mb-2 flex items-center gap-1.5">
                                <ClipboardList className="w-4 h-4 text-indigo-500" /> 장례 진행 관련
                            </h5>
                            <button onClick={() => onOpenReport(item)} className="w-full bg-white text-indigo-700 border border-indigo-200 font-bold py-3.5 rounded-xl hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
                                <span>📷 장례 타임라인 보기 (26단계 중 {item.funeral_progress_reports?.length || 0}개 완료)</span>
                            </button>
                            
                            {status === 'in_progress' && isMyCase && (
                                <button onClick={() => onUpdate(id, 'team_settling')} className="w-full bg-green-50 text-green-700 border border-green-200 font-bold py-3.5 rounded-xl hover:bg-green-100 shadow-sm transition-all flex items-center justify-center gap-2 mt-2">
                                    <span>다음 단계:</span> <span>🟢 장례 종료 (정산 요청)</span>
                                </button>
                            )}
                            {status === 'team_settling' && (
                                <button className="w-full bg-gray-50 border border-gray-200 text-gray-500 font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2 cursor-default shadow-sm">
                                    <CheckCircle className="w-5 h-5 text-green-500" />
                                    🟢 정산 확인 대기 (관리자 승인 대기)
                                </button>
                            )}
                            {status === 'hq_check' && (
                                <button className="w-full bg-gray-50 border border-gray-200 text-gray-500 font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2 cursor-default shadow-sm">
                                    <Clock className="w-5 h-5" />
                                    🟢 본사 정산 검토 중
                                </button>
                            )}
                            {status === 'completed' && (
                                <button className="w-full bg-gray-50 border border-gray-200 text-gray-400 font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-2 cursor-default shadow-sm">
                                    ⚪ 완전히 종료된 장례입니다.
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* 2. 외주 관련 (발주 및 납품 현황) - 상담 중 단계 이상부터 노출 */}
                {(status === 'consulting' || status === 'in_progress' || status === 'team_settling' || status === 'hq_check' || status === 'completed') && (
                    <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-3 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]">
                        <h5 className="font-bold text-gray-700 text-sm mb-2 flex items-center gap-1.5">
                            <Package className="w-4 h-4 text-sky-500" /> 외주 관련 (검색 및 발주)
                        </h5>

                        {(status === 'in_progress' || status === 'consulting') && isMyCase && (
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
                                                    {order.status === 'delivered' && isMyCase && (
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
