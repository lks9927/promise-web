import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, Calendar, Filter, ChevronDown, ArrowUpRight, Clock, CheckCircle } from 'lucide-react';
import FuneralCaseInfo from '../common/FuneralCaseInfo';

export default function MySettlements({ user, typeFilter }) {
    const [settlements, setSettlements] = useState([]);
    const [leaderNames, setLeaderNames] = useState({});
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all');
    const [dateRange, setDateRange] = useState('all');
    const isTeamLeader = user.role === 'leader' || user.role === 'team_leader';

    useEffect(() => {
        fetchSettlements();
    }, [user.id, dateRange]);

    const fetchSettlements = async () => {
        try {
            setLoading(true);
            let query = supabase
                .from('settlements')
                .select(`
                    *,
                    funeral_cases (
                        id,
                        is_private,
                        deceased_name,
                        package_name,
                        location,
                        final_price,
                        team_leader_id,
                        profiles:customer_id (name),
                        coupons (id, code, amount, status)
                    ),
                    profiles:recipient_id (name)
                `)
                .eq('recipient_id', user.id)
                .order('created_at', { ascending: false });

            if (typeFilter) {
                query = query.eq('type', typeFilter);
            }

            const { data, error } = await query;
            if (error) throw error;
            
            let finalData = data || [];
            finalData = finalData.filter(s => s.funeral_cases && !s.funeral_cases.is_private);
            setSettlements(finalData);

            // 팀장인 경우: 담당 팀장 이름을 별도로 조회
            if (isTeamLeader && finalData.length > 0) {
                const leaderIds = [...new Set(finalData.map(s => s.funeral_cases?.team_leader_id).filter(Boolean))];
                if (leaderIds.length > 0) {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, name')
                        .in('id', leaderIds);
                    const nameMap = {};
                    profiles?.forEach(p => { nameMap[p.id] = p.name; });
                    setLeaderNames(nameMap);
                }
            }
        } catch (error) {
            console.error('Error fetching my settlements:', error);
        } finally {
            setLoading(false);
        }
    };

    // Derived stats
    const totalEarned = settlements.reduce((acc, cur) => acc + cur.amount, 0);
    const pendingAmount = settlements.filter(s => s.status === 'pending').reduce((acc, cur) => acc + cur.amount, 0);
    const paidAmount = settlements.filter(s => s.status === 'paid' || s.status === 'completed').reduce((acc, cur) => acc + cur.amount, 0);

    const filteredList = settlements.filter(item => {
        if (filterStatus === 'all') return true;
        return item.status === filterStatus;
    });

    const getTypeLabel = (type) => {
        switch (type) {
            case 'dealer_commission': return { text: '판매 수수료', color: 'text-blue-600 bg-blue-50' };
            case 'dealer_override': return { text: '관리수수료', color: 'text-purple-600 bg-purple-50' };
            case 'leader_override': return { text: '관리수수료', color: 'text-green-600 bg-green-50' };
            default: return { text: type, color: 'text-gray-600 bg-gray-50' };
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header / Stats Cards */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 col-span-2">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <p className="text-gray-500 text-sm font-medium">총 누적 수익</p>
                            <h2 className="text-3xl font-bold text-gray-900 mt-1">
                                ₩ {totalEarned.toLocaleString()}
                            </h2>
                        </div>
                        <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center">
                            <DollarSign className="w-6 h-6 text-indigo-600" />
                        </div>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full mt-4 overflow-hidden">
                        <div
                            className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${(paidAmount / (totalEarned || 1)) * 100}%` }}
                        ></div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2 text-right">지급률 {Math.round((paidAmount / (totalEarned || 1)) * 100)}%</p>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-orange-100">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-orange-500" />
                        <span className="text-xs font-bold text-orange-600">지급 대기</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">₩ {pendingAmount.toLocaleString()}</p>
                </div>

                <div className="bg-white p-4 rounded-2xl shadow-sm border border-green-100">
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-xs font-bold text-green-600">지급 완료</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">₩ {paidAmount.toLocaleString()}</p>
                </div>
            </div>

            {/* Filter Section */}
            <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800 text-lg">상세 내역</h3>
                <div className="flex bg-white rounded-lg p-1 border border-gray-200">
                    <button
                        onClick={() => setFilterStatus('all')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filterStatus === 'all' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        전체
                    </button>
                    <button
                        onClick={() => setFilterStatus('pending')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filterStatus === 'pending' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        대기
                    </button>
                    <button
                        onClick={() => setFilterStatus('paid')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${filterStatus === 'paid' ? 'bg-green-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        완료
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="space-y-3">
                {loading ? (
                    <div className="text-center py-10 text-gray-400">내역 불러오는 중...</div>
                ) : filteredList.length === 0 ? (
                    <div className="text-center py-10 bg-white rounded-2xl border border-gray-100 text-gray-400">
                        해당 내역이 없습니다.
                    </div>
                ) : (
                    filteredList.map((item) => {
                        const typeInfo = getTypeLabel(item.type);
                        const isPaid = item.status === 'paid' || item.status === 'completed';

                        return (
                            <div key={item.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                                {isPaid && (
                                    <div className="absolute right-0 top-0 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                                        지급완료
                                    </div>
                                )}

                                {/* 상단: 관리수수료뱃지 | 장례담당뱃지 | 정산금액 */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${typeInfo.color}`}>
                                            {typeInfo.text}
                                        </span>
                                        {isTeamLeader && item.funeral_cases?.team_leader_id && item.funeral_cases.team_leader_id !== user.id && leaderNames[item.funeral_cases.team_leader_id] && (
                                            <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full font-bold border border-blue-100">
                                                담당: {leaderNames[item.funeral_cases.team_leader_id]} 팀장
                                            </span>
                                        )}
                                    </div>
                                    <span className={`font-bold text-lg ${isPaid ? 'text-gray-400' : 'text-indigo-600'}`}>
                                        + {item.amount.toLocaleString()}
                                    </span>
                                </div>

                                {/* 기본정보 박스 */}
                                <FuneralCaseInfo
                                    caseId={item.funeral_cases?.id || item.case_id}
                                    deceasedName={item.funeral_cases?.deceased_name}
                                    chiefMournerName={item.funeral_cases?.profiles?.name}
                                    location={item.funeral_cases?.location}
                                    variant="dealer"
                                    compact={true}
                                    createdAt={item.created_at}
                                >
                                    {item.funeral_cases?.coupons?.length > 0 && (
                                        <div className="mt-1 text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded inline-block font-bold">
                                            쿠폰 적용됨: {item.funeral_cases.coupons[0].code}
                                        </div>
                                    )}
                                </FuneralCaseInfo>

                                {/* 관리자 메모 (있을 때만) */}
                                {item.admin_memo && (
                                    <div className="mt-3 border-t border-gray-50 pt-3">
                                        <div className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">
                                            관리자 메모: {item.admin_memo}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
