import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, Calendar, Filter, ChevronDown, ArrowUpRight, Clock, CheckCircle } from 'lucide-react';

export default function MySettlements({ user }) {
    const [settlements, setSettlements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'pending', 'paid'
    const [dateRange, setDateRange] = useState('all'); // 'all', 'month', '3months'

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
                        package_name,
                        location,
                        final_price
                    ),
                    profiles:recipient_id (name)
                `)
                .eq('recipient_id', user.id)
                .order('created_at', { ascending: false });

            // Date filtering could be added here if needed in SQL, 
            // but for now we'll fetch recent history and filter in UI or simple SQL limit depending on volume.
            // Let's stick to client-side filter for MVP unless data is huge.

            const { data, error } = await query;
            if (error) throw error;
            setSettlements(data || []);
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
            case 'dealer_override': return { text: '마스터 오버라이딩', color: 'text-purple-600 bg-purple-50' };
            case 'leader_override': return { text: '팀장 오버라이딩', color: 'text-green-600 bg-green-50' };
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

                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex flex-col">
                                        <span className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 ${typeInfo.color}`}>
                                            {typeInfo.text}
                                        </span>
                                        <h4 className="font-bold text-gray-900">{item.funeral_cases?.package_name || '상품 정보 없음'}</h4>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {item.funeral_cases?.location || '위치 정보 없음'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-bold text-lg ${isPaid ? 'text-gray-400' : 'text-indigo-600'}`}>
                                            + {item.amount.toLocaleString()}
                                        </p>
                                        <p className="text-[10px] text-gray-400">
                                            {new Date(item.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>

                                {/* Timeline / Case Ref */}
                                <div className="border-t border-gray-50 pt-3 flex justify-between items-center">
                                    <div className="flex items-center gap-1 text-xs text-gray-400">
                                        <span className="font-mono">ID: {item.id.substring(0, 6)}</span>
                                    </div>
                                    {item.admin_memo && (
                                        <div className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">
                                            관리자 메모: {item.admin_memo}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
