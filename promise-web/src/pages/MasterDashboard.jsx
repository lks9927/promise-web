import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    Users,
    CheckCircle,
    ShieldCheck,
    Search,
    LogOut,
    Send
} from 'lucide-react';
import SendMessageModal from '../components/common/SendMessageModal';

export default function MasterDashboard() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const CURRENT_MASTER_ID = user.id || 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15'; // Fallback for dev

    const [candidates, setCandidates] = useState([]);
    const [myTeam, setMyTeam] = useState([]);
    const [earnings, setEarnings] = useState([]);
    const [completedCases, setCompletedCases] = useState([]); // Fixed: Added missing state
    const [loading, setLoading] = useState(true);
    const [isNotifOpen, setIsNotifOpen] = useState(false);
    const [messageModal, setMessageModal] = useState({ isOpen: false, recipientId: '', recipientName: '', recipientRoleClass: '' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);

            // 1. Fetch My Team & Candidates
            const { data: partnerData, error: partnerError } = await supabase
                .from('partners')
                .select(`
          *,
          profiles:user_id (name, phone, role)
        `)
                .order('created_at', { ascending: false });

            if (partnerError) throw partnerError;

            if (partnerData) {
                setCandidates(partnerData.filter(p => p.status === 'pending'));
                // Master Leaders should see 'leader's. Master Dealers should see 'dealer's/helpers.
                const filteredTeam = partnerData.filter(p => p.status === 'approved' && p.master_id === CURRENT_MASTER_ID);
                if (user.role === 'leader' || user.role === 'master') {
                    // Admin or Master Leader can see Leaders
                    setMyTeam(filteredTeam.filter(p => p.profiles?.role === 'leader'));
                } else if (['dealer', 'morning', 'meal'].includes(user.role)) {
                    // Master Dealer can only see dealers/morning/meal
                    setMyTeam(filteredTeam.filter(p => ['dealer', 'morning', 'meal'].includes(p.profiles?.role)));
                } else {
                    setMyTeam(filteredTeam);
                }
            }

            // 2. Fetch My Earnings (Master Fees)
            const { data: settlementData, error: settlementError } = await supabase
                .from('settlements')
                .select(`
          *,
          funeral_cases (
             id,
             location,
             final_price
          )
        `)
                .eq('recipient_id', CURRENT_MASTER_ID)
                .eq('type', 'master_fee');

            if (settlementError) throw settlementError;
            if (settlementData) setEarnings(settlementData);

            // 3. Fetch Completed Cases needing Rating
            let caseFilterIds = [CURRENT_MASTER_ID];
            if (myTeam.length > 0) {
                // Determine relevant dealer/customer IDs. For Master Dealer, it's their sub-dealers.
                caseFilterIds = [...caseFilterIds, ...myTeam.map(t => t.user_id)];
            }

            const { data: caseData, error: caseError } = await supabase
                .from('funeral_cases')
                .select(`
                    *,
                    profiles:customer_id (name),
                    team_leader:team_leader_id (name)
                `)
                .in('status', ['hq_check', 'completed'])
                .or(`customer_id.in.(${caseFilterIds.join(',')}),dealer_id.in.(${caseFilterIds.join(',')}),team_leader_id.in.(${caseFilterIds.join(',')})`)
                .order('created_at', { ascending: false });

            if (caseError) throw caseError;
            if (caseData) setCompletedCases(caseData);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRating = async (caseId, rating) => {
        if (!window.confirm(`이 장례 수행에 대해 ${rating}점을 주시겠습니까?`)) return;

        try {
            const { error } = await supabase
                .from('funeral_cases')
                .update({ master_rating: rating })
                .eq('id', caseId);

            if (error) throw error;
            alert('평가가 저장되었습니다.');
            fetchData();
        } catch (error) {
            console.error('Error:', error);
            alert('평가 실패');
        }
    };

    const handleApproval = async (userId, newStatus) => {
        if (!window.confirm(`${newStatus === 'approved' ? '승인' : '거절'} 하시겠습니까?`)) return;

        try {
            const { error } = await supabase
                .from('partners')
                .update({
                    status: newStatus,
                    master_id: CURRENT_MASTER_ID // Stamp my approval
                })
                .eq('user_id', userId);

            if (error) throw error;
            alert('처리되었습니다.');
            fetchData();
        } catch (error) {
            console.error('Error:', error);
            alert('처리 실패');
        }
    };

    // Calculate stats
    const totalEarnings = earnings.reduce((acc, cur) => acc + cur.amount, 0);
    const totalCasesManaged = earnings.length;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <header className="bg-[#1a1f37] text-white px-6 py-4 flex justify-between items-center shadow-md">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <ShieldCheck className="text-amber-400" />
                        마스터 관리 시스템
                    </h1>
                    <p className="text-sm text-gray-400 pl-8">강남구 지역장 (Master)</p>
                </div>
                <div className="flex items-center gap-3">
                    <a href="/dealer" className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2">
                        🛍️ 내 영업 활동 (Dealer Mode)
                    </a>
                    <div className="w-10 h-10 bg-indigo-800 rounded-full flex items-center justify-center font-bold border border-indigo-600 shadow-inner">
                        M
                    </div>
                    <button
                        onClick={() => {
                            if (confirm('로그아웃 하시겠습니까?')) {
                                localStorage.removeItem('user');
                                window.location.href = '/login';
                            }
                        }}
                        className="flex items-center gap-1 text-gray-400 hover:text-red-400 transition-colors ml-2"
                    >
                        <span className="text-sm font-medium">로그아웃</span>
                        <LogOut className="w-6 h-6" />
                    </button>
                </div>
            </header>

            <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-8">

                {/* Earnings Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg">
                        <h3 className="text-indigo-100 font-medium mb-1">식구들 성과 수수료 (누적)</h3>
                        <div className="text-3xl font-bold">₩ {totalEarnings.toLocaleString()}</div>
                        <p className="text-indigo-200 text-sm mt-4 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" /> {totalCasesManaged}건의 장례 수행 완료
                        </p>
                    </div>
                </div>

                {/* Pending Approvals Section */}
                <section>
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Users className="text-indigo-600" />
                        신규 가입 승인 대기 ({candidates.length})
                    </h2>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        {candidates.length === 0 ? (
                            <div className="p-10 text-center text-gray-500">
                                승인 대기 중인 파트너가 없습니다.
                            </div>
                        ) : (
                            <>
                                {/* Desktop Table View */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500">
                                            <tr>
                                                <th className="px-6 py-3 whitespace-nowrap">이름/역할</th>
                                                <th className="px-6 py-3 whitespace-nowrap">활동 지역</th>
                                                <th className="px-6 py-3 whitespace-nowrap">연락처</th>
                                                <th className="px-6 py-3 text-right whitespace-nowrap">승인 여부</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {candidates.map(p => (
                                                <tr key={p.user_id} className="hover:bg-indigo-50/30">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="font-bold text-gray-900">{p.profiles?.name}</div>
                                                        <div className="text-xs text-indigo-600 font-medium uppercase">{p.profiles?.role}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{p.region}</td>
                                                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{p.profiles?.phone}</td>
                                                    <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                                                        <button
                                                            onClick={() => handleApproval(p.user_id, 'approved')}
                                                            className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-bold hover:bg-green-200 transition-colors"
                                                        >
                                                            승인
                                                        </button>
                                                        <button
                                                            onClick={() => handleApproval(p.user_id, 'rejected')}
                                                            className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors"
                                                        >
                                                            거절
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {/* Mobile Card View */}
                                <div className="md:hidden flex flex-col divide-y divide-gray-100">
                                    {candidates.map(p => (
                                        <div key={p.user_id} className="p-4 bg-white">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <div className="font-bold text-gray-900 text-base">{p.profiles?.name}</div>
                                                    <div className="text-xs text-indigo-600 font-medium uppercase">{p.profiles?.role}</div>
                                                </div>
                                                <div className="text-right text-sm text-gray-600">
                                                    <div className="font-medium text-gray-800">{p.region}</div>
                                                    <div>{p.profiles?.phone}</div>
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-2 pt-3 border-t border-gray-50">
                                                <button
                                                    onClick={() => handleApproval(p.user_id, 'approved')}
                                                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg font-bold hover:bg-green-200 flex-1 flex justify-center items-center"
                                                >
                                                    승인
                                                </button>
                                                <button
                                                    onClick={() => handleApproval(p.user_id, 'rejected')}
                                                    className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg font-bold hover:bg-gray-200 flex-1 flex justify-center items-center"
                                                >
                                                    거절
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </section>

                {/* My Team Section */}
                <section>
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <ShieldCheck className="text-green-600" />
                        내 관할 팀원 ({myTeam.length})
                    </h2>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                        <div className="p-4 border-b border-gray-100 flex gap-2">
                            <div className="relative flex-1 max-w-xs">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                <input type="text" placeholder="이름 검색..." className="w-full pl-9 pr-4 py-2 bg-gray-50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                            </div>
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                        <th className="px-6 py-3 whitespace-nowrap">이름</th>
                                        <th className="px-6 py-3 whitespace-nowrap">역할</th>
                                        <th className="px-6 py-3 whitespace-nowrap">연락처</th>
                                        <th className="px-6 py-3 whitespace-nowrap">등급</th>
                                        <th className="px-6 py-3 whitespace-nowrap">상태/액션</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {myTeam.length === 0 ? (
                                        <tr><td colSpan="5" className="p-10 text-center text-gray-500">등록된 팀원이 없습니다.</td></tr>
                                    ) : myTeam.map(p => (
                                        <tr key={p.user_id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-bold text-gray-900 whitespace-nowrap">{p.profiles?.name}</td>
                                            <td className="px-6 py-4 whitespace-nowrap min-w-[max-content]">
                                                <span className={`text-xs px-2 py-1 rounded-full border inline-block whitespace-nowrap ${p.profiles?.role === 'leader' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                                                    {p.profiles?.role === 'leader' ? (p.grade === 'Master' || p.grade === 'S' ? '마스터 팀장' : '팀장') : ''}
                                                    {['dealer', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role) ? (p.grade === 'Master' || p.grade === 'S' ? '마스터 딜러' : '딜러') : ''}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{p.profiles?.phone}</td>
                                            <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{p.grade}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-3 w-full">
                                                    <span className="flex flex-1 items-center gap-1 text-green-600 font-bold text-xs">
                                                        <CheckCircle className="w-3 h-3" /> 정상 활동
                                                    </span>
                                                    <button
                                                        onClick={() => setMessageModal({
                                                            isOpen: true,
                                                            recipientId: p.user_id,
                                                            recipientName: p.profiles?.name,
                                                            recipientRoleClass: p.profiles?.role === 'leader' ? '팀장' : '딜러'
                                                        })}
                                                        className="flex items-center gap-1 text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-100 shadow-sm"
                                                    >
                                                        <Send className="w-3.5 h-3.5" /> 메시지 발송
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Mobile Card View */}
                        <div className="md:hidden flex flex-col divide-y divide-gray-100">
                            {myTeam.length === 0 ? (
                                <div className="p-10 text-center text-gray-500">등록된 팀원이 없습니다.</div>
                            ) : myTeam.map(p => (
                                <div key={p.user_id} className="p-4 bg-white hover:bg-gray-50 transition-colors">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="font-bold text-gray-900 text-base">{p.profiles?.name}</div>
                                        <span className="flex items-center gap-1 text-green-600 font-bold text-xs">
                                            <CheckCircle className="w-3 h-3" /> 정상 활동 중
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm text-gray-600">
                                        <span className={`text-xs px-2 py-1 rounded-full border inline-block whitespace-nowrap ${p.profiles?.role === 'leader' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                                            {p.profiles?.role === 'leader' ? (p.grade === 'Master' || p.grade === 'S' ? '마스터 팀장' : '팀장') : ''}
                                            {['dealer', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role) ? (p.grade === 'Master' || p.grade === 'S' ? '마스터 딜러' : '딜러') : ''}
                                        </span>
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col items-end gap-1 text-gray-500 text-xs">
                                                <div className="font-medium text-gray-700">{p.grade}</div>
                                                <div>{p.profiles?.phone}</div>
                                            </div>
                                            <button
                                                onClick={() => setMessageModal({
                                                    isOpen: true,
                                                    recipientId: p.user_id,
                                                    recipientName: p.profiles?.name,
                                                    recipientRoleClass: p.profiles?.role === 'leader' ? '팀장' : '딜러'
                                                })}
                                                className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-colors shadow-sm ml-auto"
                                            >
                                                <Send className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Quality Control / Ratings Section */}
                <section>
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <ShieldCheck className="text-amber-500" />
                        장례 품질 평가 (Quality Control)
                    </h2>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                        <th className="px-6 py-3">장례 정보</th>
                                        <th className="px-6 py-3">담당 팀장</th>
                                        <th className="px-6 py-3">마스터 평가</th>
                                        <th className="px-6 py-3">고객 만족도</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {completedCases.length === 0 ? (
                                        <tr><td colSpan="4" className="p-10 text-center text-gray-500">평가할 내역이 없습니다.</td></tr>
                                    ) : completedCases.map(c => (
                                        <tr key={c.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900">{c.profiles?.name || '고객'}님 장례</div>
                                                <div className="text-xs text-gray-500">{c.location}</div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600">
                                                {c.team_leader?.name ? `${c.team_leader.name} 팀장` : '미배정'}
                                            </td>
                                            <td className="px-6 py-4">
                                                {c.master_rating ? (
                                                    <div className="flex text-amber-500">
                                                        {[...Array(c.master_rating)].map((_, i) => <span key={i}>★</span>)}
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-1">
                                                        {[1, 2, 3, 4, 5].map(score => (
                                                            <button
                                                                key={score}
                                                                onClick={() => handleRating(c.id, score)}
                                                                className="w-6 h-6 rounded-full bg-gray-100 hover:bg-amber-100 text-gray-400 hover:text-amber-600 flex items-center justify-center transition-colors font-bold text-xs"
                                                            >
                                                                {score}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {c.customer_rating ? (
                                                    <span className="text-sm font-bold text-gray-700">{c.customer_rating}점</span>
                                                ) : (
                                                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">미입력</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Mobile Card View */}
                        <div className="md:hidden flex flex-col divide-y divide-gray-100">
                            {completedCases.length === 0 ? (
                                <div className="p-10 text-center text-gray-500">평가할 내역이 없습니다.</div>
                            ) : completedCases.map(c => (
                                <div key={c.id} className="p-4 bg-white hover:bg-gray-50 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="font-bold text-gray-900 text-base">{c.profiles?.name || '고객'}님 장례</div>
                                            <div className="text-xs text-gray-500">{c.location}</div>
                                        </div>
                                        <div className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">
                                            {c.team_leader?.name ? `${c.team_leader.name} 팀장` : '미배정'}
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50">
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-xs text-gray-400 font-medium">마스터 평가 ({c.master_rating || '-'}점)</span>
                                            {c.master_rating ? (
                                                <div className="flex text-amber-500">
                                                    {[...Array(c.master_rating)].map((_, i) => <span key={i}>★</span>)}
                                                </div>
                                            ) : (
                                                <div className="flex gap-1.5">
                                                    {[1, 2, 3, 4, 5].map(score => (
                                                        <button
                                                            key={score}
                                                            onClick={() => handleRating(c.id, score)}
                                                            className="w-7 h-7 rounded-full bg-gray-100 hover:bg-amber-100 text-gray-400 hover:text-amber-600 flex items-center justify-center transition-colors font-bold text-sm"
                                                        >
                                                            {score}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-xs text-gray-400 font-medium">고객 만족도</span>
                                            {c.customer_rating ? (
                                                <span className="text-lg font-bold text-indigo-700">{c.customer_rating}점</span>
                                            ) : (
                                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded mt-1">미입력</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

            </main>

            <SendMessageModal
                isOpen={messageModal.isOpen}
                onClose={() => setMessageModal({ isOpen: false, recipientId: '', recipientName: '', recipientRoleClass: '' })}
                recipientId={messageModal.recipientId}
                recipientName={messageModal.recipientName}
                recipientRoleClass={messageModal.recipientRoleClass}
                currentUserId={user.id}
            />
        </div>
    );
}
