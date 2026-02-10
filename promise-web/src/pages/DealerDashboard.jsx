import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
    TrendingUp,
    Users,
    DollarSign,
    Calendar,
    ChevronRight,
    PieChart,
    LogOut
} from 'lucide-react';

// Mock Logged In Dealer (Kim Cheol-su)
const CURRENT_DEALER_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13';

export default function DealerDashboard() {
    const [earnings, setEarnings] = useState([]);
    const [team, setTeam] = useState([]); // Sub-dealers
    const [config, setConfig] = useState({}); // System Config
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEarnings();
        fetchTeamAndConfig();
    }, []);

    const fetchEarnings = async () => {
        try {
            setLoading(true);

            // Fetch settlements for this dealer
            const { data, error } = await supabase
                .from('settlements')
                .select(`
          *,
          funeral_cases (
            location,
            package_name,
            profiles:customer_id (name)
          )
        `)
                .eq('recipient_id', CURRENT_DEALER_ID) // Only my money
                .order('created_at', { ascending: false });

            if (error) throw error;
            setEarnings(data || []);
        } catch (error) {
            console.error('Error fetching earnings:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTeamAndConfig = async () => {
        // 1. Check if I am a Master (Do I have partners with my ID as master_id?)
        const { data: teamData } = await supabase
            .from('partners')
            .select('*, profiles:user_id(name, phone)')
            .eq('master_id', CURRENT_DEALER_ID);
        if (teamData) setTeam(teamData);

        // 2. Fetch System Config
        const { data: configData } = await supabase.from('system_config').select('*');
        if (configData) {
            const configMap = configData.reduce((acc, cur) => ({ ...acc, [cur.key]: cur.value }), {});
            setConfig(configMap);
        }
    };

    // Calculate totals
    const myCommission = earnings.filter(e => e.type !== 'override_fee').reduce((acc, curr) => acc + curr.amount, 0);
    const overrideCommission = earnings.filter(e => e.type === 'override_fee').reduce((acc, curr) => acc + curr.amount, 0);

    // Override Logic: Pending Count
    const pendingOverrides = earnings.filter(e => e.type === 'override_fee' && e.status === 'pending');
    const overrideCount = pendingOverrides.length;

    // Total Display
    const totalDisplay = myCommission + overrideCommission;
    const pendingCommission = earnings.filter(e => e.status === 'pending').reduce((acc, curr) => acc + curr.amount, 0);
    const paidCommission = earnings.filter(e => e.status === 'paid').reduce((acc, curr) => acc + curr.amount, 0);

    // Global Settle Flag
    const isGlobalSettleEnabled = config.global_settlement_enabled === 'true';

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-900">파트너 센터</h1>
                    <p className="text-sm text-gray-500">김철수 딜러님 (Gold)</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (confirm('로그아웃 하시겠습니까?')) {
                                localStorage.removeItem('user');
                                window.location.href = '/login';
                            }
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="로그아웃"
                    >
                        <LogOut className="w-6 h-6" />
                    </button>
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                        김
                    </div>
                </div>
            </header>

            <main className="p-4 max-w-lg mx-auto space-y-6">
                {/* Earnings Card */}
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg shadow-blue-200">
                    <div className="flex justify-between items-center mb-6">
                        <span className="text-blue-100 font-medium">총 누적 수익금 (본인+팀)</span>
                        <TrendingUp className="w-5 h-5 text-blue-200" />
                    </div>
                    <h2 className="text-4xl font-bold mb-2">₩ {totalDisplay.toLocaleString()}</h2>

                    {team.length > 0 && (
                        <div className="mb-4 text-sm bg-blue-800/30 p-2 rounded inline-block">
                            👑 팀 오버라이딩: ₩ {overrideCommission.toLocaleString()} (적립 {overrideCount}건)
                        </div>
                    )}

                    <div className="flex gap-4 mt-2">
                        <div className="bg-white/10 rounded-lg p-3 flex-1 backdrop-blur-sm">
                            <span className="block text-xs text-blue-200 mb-1">지급 완료</span>
                            <span className="font-bold text-lg">₩ {paidCommission.toLocaleString()}</span>
                        </div>
                        <div className="bg-white/20 rounded-lg p-3 flex-1 backdrop-blur-sm border border-white/10">
                            <span className="block text-xs text-blue-100 mb-1">정산 대기</span>
                            <span className="font-bold text-lg">₩ {pendingCommission.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                {/* Master Section: My Team */}
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

                {/* Recent Activity */}
                <div>
                    <h3 className="font-bold text-gray-800 mb-3 px-1 flex items-center justify-between">
                        <span>최근 영업 실적</span>
                        <button onClick={fetchEarnings} className="text-xs text-blue-600">새로고침</button>
                    </h3>

                    <div className="space-y-3">
                        {loading ? (
                            <p className="text-center text-gray-400 py-8">데이터 불러오는 중...</p>
                        ) : earnings.length === 0 ? (
                            <div className="bg-white p-8 rounded-xl text-center text-gray-500 shadow-sm">
                                아직 정산 내역이 없습니다.
                            </div>
                        ) : (
                            earnings.map(item => (
                                <EarningItem key={item.id} item={item} />
                            ))
                        )}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-4">
                    <button className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center gap-2 hover:bg-gray-50 transition-colors">
                        <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
                            <PieChart className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-gray-700 text-sm">실적 리포트</span>
                    </button>

                    <button
                        disabled={!isGlobalSettleEnabled || (overrideCount > 0 && overrideCount < 10)}
                        onClick={() => {
                            if (!isGlobalSettleEnabled) return alert('현재 정산 기간이 아닙니다.');
                            if (overrideCount > 0 && overrideCount < 10) return alert('오버라이딩 수익은 10건 이상 누적 시 정산 가능합니다.');
                            alert('본사로 출금 신청을 보냈습니다.');
                        }}
                        className={`p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center gap-2 transition-colors ${!isGlobalSettleEnabled || (overrideCount > 0 && overrideCount < 10)
                            ? 'bg-gray-100 cursor-not-allowed opacity-50'
                            : 'bg-white hover:bg-gray-50'
                            }`}
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${!isGlobalSettleEnabled ? 'bg-gray-200 text-gray-400' : 'bg-green-100 text-green-600'
                            }`}>
                            <DollarSign className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-gray-700 text-sm">
                            {!isGlobalSettleEnabled ? '정산 마감' : '출금 신청'}
                        </span>
                    </button>
                </div>
            </main>
        </div>
    );
}

function EarningItem({ item }) {
    const { amount, status, is_pre_paid, funeral_cases, type } = item;

    // Status Badge Logic
    let statusBadge;
    if (status === 'paid') {
        statusBadge = <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded font-bold">지급 완료</span>;
    } else if (is_pre_paid) {
        statusBadge = <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded font-bold">선지급 완료</span>;
    } else {
        statusBadge = <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded font-bold">정산 대기</span>;
    }

    return (
        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-900">{funeral_cases?.profiles?.name || '고객'} 님 장례</span>
                    {statusBadge}
                </div>
                <p className="text-xs text-gray-500">
                    {funeral_cases?.location || '장소 미정'} • {funeral_cases?.package_name || '상품 미정'}
                    {type === 'override_fee' && <span className="ml-1 text-purple-600 font-bold">(Team Override)</span>}
                </p>
            </div>
            <div className="text-right">
                <span className={`block font-bold ${type === 'override_fee' ? 'text-purple-600' : 'text-blue-600'}`}>+ {amount.toLocaleString()}</span>
                <span className="text-xs text-gray-400">{type === 'override_fee' ? '오버라이딩' : '수수료'}</span>
            </div>
        </div>
    );
}
