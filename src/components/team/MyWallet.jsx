import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Wallet, CheckCircle, AlertCircle, TrendingUp, DollarSign, Building, User, ChevronRight, CreditCard, Users } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';
import MySettlements from '../dealer/MySettlements';
import FuneralCaseInfo from '../common/FuneralCaseInfo';

export default function MyWallet({ user }) {
    const { showToast } = useNotification();
    const [policy, setPolicy] = useState(null);
    const [cases, setCases] = useState([]);
    const [loading, setLoading] = useState(true);
    const [subTab, setSubTab] = useState('remittance'); // 'remittance' | 'override'

    useEffect(() => {
        fetchData();
    }, [user.id]);

    const fetchData = async () => {
        try {
            setLoading(true);

            // 1. Fetch Commission Policy
            const { data: policyData, error: policyError } = await supabase
                .from('commission_policies')
                .select('*')
                .eq('id', 1)
                .single();

            if (policyError && policyError.code !== 'PGRST116') throw policyError; // OK if empty initially
            const currentPolicy = policyData || {
                base_margin: 1000000,
                customer_payback: 100000,
                sales_dealer_regular: 200000,
                sales_dealer_master_override: 100000,
                sales_dealer_master_direct: 300000,
                sales_leader_regular: 500000,
                sales_leader_master_direct: 700000,
                exec_leader_master_override: 100000,
                exec_leader_master_direct: 200000
            };
            setPolicy(currentPolicy);

            // 2. Fetch Completed & Settled Cases for this Team Leader
            const { data: casesData, error: casesError } = await supabase
                .from('funeral_cases')
                .select(`
                    id, 
                    created_at, 
                    status,
                    package_name,
                    final_price,
                    deceased_name,
                    location,
                    room_number,
                    additional_income_total,
                    additional_income_rate,
                    additional_income_settled,
                    profiles:customer_id ( id, name, phone ),
                    team_leader:team_leader_id ( id, name, role ),
                    settlements ( id, amount, type, status )
                `)
                .eq('team_leader_id', user.id)
                .eq('is_private', false)
                .in('status', ['assigned', 'in_progress', 'completed', 'team_settling', 'hq_check'])
                .order('created_at', { ascending: false });

            if (casesError) throw casesError;
            setCases(casesData || []);

        } catch (error) {
            console.error('Error fetching wallet data:', error);
            showToast('error', '데이터 로드 실패', '정산 데이터를 불러올 수 없습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsSettled = async (caseId) => {
        if (!window.confirm('각 담당자 및 본사 정산 입금을 완료하셨습니까?\n(정산 완료 처리 후에는 되돌릴 수 없습니다)')) return;

        try {
            const { error } = await supabase
                .from('funeral_cases')
                .update({ status: 'settled', updated_at: new Date().toISOString() })
                .eq('id', caseId);

            if (error) throw error;
            showToast('success', '정산 처리 완료', '해당 건의 정산이 완료 처리되었습니다.');
            fetchData(); // reload
        } catch (error) {
            console.error('Error settling case:', error);
            showToast('error', '처리 실패', '정산 완료 처리에 실패했습니다.');
        }
    };

    const calculateSplit = (c, p) => {
        const req = c.requester || {};
        const exec = c.team_leader || {};

        let salesRole = req.role; // 'dealer', 'leader', 'admin', 'master'
        let salesGrade = req.grade; // 'S', 'Master'

        let execGrade = exec.grade; // 'S', 'Master'

        // Total Margin pool
        const baseContent = {
            total_margin: p.base_margin,
            customer: p.customer_payback,
            hq: 0,
            sales_payout: 0,
            req_name: req.name || '알 수 없음',
            req_bank: req.bank_name,
            req_account: req.account_number,
        };

        // 9 Scenarios (Assuming Team Leader has already collected 1,000,000)
        // Team Leader keeps 1,000,000 and has to distribute it out (to Customer, Dealer, HQ, etc.)

        const abs = (val) => p.is_percentage ? (p.base_margin * val / 100) : val;

        baseContent.customer = abs(p.customer_payback);
        let remaining = p.base_margin - abs(p.customer_payback);

        // Calculate Sales Payout and HQ Margin based on 9 Scenarios
        // Note: 'baseContent.sales_payout' only tracks the amount given to the *Sales Requester* directly
        //       'baseContent.hq' is the amount the Team Leader needs to send to HQ after paying out the Customer, Sales Requester, and keeping their own share (if any).

        let hqMargin = 0;
        let salesPayout = 0;

        // 1 일반딜러영업 / 일반팀장진행 : 일반팀장정산(100) - 고객정산(10) - 일반딜러(20) - 마스터딜러(10) - 마스터팀장(10) = 본사마진(50)
        if (salesRole === 'dealer' && salesGrade !== 'Master' && execGrade === 'S') {
            salesPayout = abs(p.sales_dealer_regular);
            hqMargin = p.base_margin - abs(p.customer_payback) - salesPayout - abs(p.sales_dealer_master_override) - abs(p.exec_leader_master_override);
        }
        // 2 일반딜러영업 / 마스터팀장진행 : 본사정산(100) - 고객정산(10) - 일반딜러(20) - 마스터팀장(20) = 본사마진(60)
        else if (salesRole === 'dealer' && salesGrade !== 'Master' && execGrade === 'Master') {
            salesPayout = abs(p.sales_dealer_regular);
            hqMargin = p.base_margin - abs(p.customer_payback) - salesPayout - abs(p.exec_leader_master_direct);
        }
        // 3 마스터딜러영업 / 일반팀장진행 : 본사정산(100) - 고객정산(10) - 마스터딜러(30) - 마스터팀장(10) = 본사마진(50)
        else if (salesRole === 'dealer' && salesGrade === 'Master' && execGrade === 'S') {
            salesPayout = abs(p.sales_dealer_master_direct);
            hqMargin = p.base_margin - abs(p.customer_payback) - salesPayout - abs(p.exec_leader_master_override);
        }
        // 4 마스터팀장영업 / 일반팀장진행 : 본사정산(100) - 고객정산(10) - 마스터팀장(70) = 본사마진(20)
        else if (salesRole === 'leader' && salesGrade === 'Master' && execGrade === 'S') {
            salesPayout = abs(p.sales_leader_master_direct);
            hqMargin = p.base_margin - abs(p.customer_payback) - salesPayout;
        }
        // 5 마스터팀장영업 / 마스터팀장진행 : 본사정산(30) - 고객정산(10) = 본사마진(20)
        // (마스터팀장 영업이 70이고, 본인 혹은 다른 마스터팀장이 진행. 영업자에게 70 지급. 실제 본사입금은 20)
        else if (salesRole === 'leader' && salesGrade === 'Master' && execGrade === 'Master') {
            salesPayout = abs(p.sales_leader_master_direct);
            hqMargin = p.base_margin - abs(p.customer_payback) - salesPayout;
        }
        // 6 일반팀장영업 / 일반팀장진행 : 본사정산(50) - 고객정산(10) - 마스터팀장(10) = 본사마진(30)
        else if (salesRole === 'leader' && salesGrade !== 'Master' && execGrade === 'S') {
            salesPayout = abs(p.sales_leader_regular);
            hqMargin = p.base_margin - abs(p.customer_payback) - salesPayout - abs(p.exec_leader_master_override);
        }
        // 7 일반팀장영업 / 마스터팀장진행 : 본사정산(50) - 고객정산(10) - 마스터팀장(20) = 본사마진(20)
        else if (salesRole === 'leader' && salesGrade !== 'Master' && execGrade === 'Master') {
            salesPayout = abs(p.sales_leader_regular);
            hqMargin = p.base_margin - abs(p.customer_payback) - salesPayout - abs(p.exec_leader_master_direct);
        }
        // 8 본사영업 (직접방문) / 일반팀장진행 : 본사정산(100) - 고객정산(10) - 마스터팀장(10) = 본사마진(80)
        else if (salesRole === 'admin' && execGrade === 'S') {
            salesPayout = 0; // HQ keeps sales
            hqMargin = p.base_margin - abs(p.customer_payback) - abs(p.exec_leader_master_override);
        }
        // 9 본사영업 (직접방문) / 마스터팀장진행 : 본사정산(100) - 고객정산(10) - 마스터팀장(20) = 본사마진(70)
        else if (salesRole === 'admin' && execGrade === 'Master') {
            salesPayout = 0; // HQ keeps sales
            hqMargin = p.base_margin - abs(p.customer_payback) - abs(p.exec_leader_master_direct);
        }
        // Default Fallback
        else {
            hqMargin = p.base_margin - abs(p.customer_payback);
            salesPayout = 0;
        }

        baseContent.sales_payout = salesPayout;
        baseContent.hq = hqMargin;
        return baseContent;
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">데이터를 불러오는 중입니다...</div>;
    }

    // Pending vs Settled calculations
    const pendingCases = cases.filter(c => ['assigned', 'in_progress', 'team_settling', 'hq_check'].includes(c.status));
    const settledCases = cases.filter(c => c.status === 'completed');

    const getRemittanceAmount = (c) => {
        if (!c.settlements) return 0;
        return c.settlements
            .filter(s => s.type === 'usage_fee_remittance')
            .reduce((sum, s) => sum + s.amount, 0);
    };

    const totalToDeposit = pendingCases.reduce((acc, c) => acc + getRemittanceAmount(c), 0);

    return (
        <div className="space-y-6 pb-20">
            {user?.grade === 'Master' && (
                <div className="flex bg-gray-100 rounded-lg p-1 mb-4">
                    <button
                        onClick={() => setSubTab('remittance')}
                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${subTab === 'remittance' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        장례수수료 정산
                    </button>
                    <button
                        onClick={() => setSubTab('override')}
                        className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${subTab === 'override' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        팀원 관리수수료
                    </button>
                </div>
            )}

            {subTab === 'remittance' ? (
                <>
                    {/* 1. Header / Summary - 본사 송금액 카드 */}
                    <div className="bg-gradient-to-br from-indigo-900 to-indigo-800 rounded-2xl p-6 text-white shadow-xl">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <p className="text-indigo-200 text-sm font-medium mb-1">장례수수료 송금액 (미송금 포함)</p>
                                <h2 className="text-4xl font-black tracking-tight">₩ {totalToDeposit.toLocaleString()}</h2>
                            </div>
                    <div className="bg-white/10 p-3 rounded-full">
                        <Wallet className="w-8 h-8 text-white" />
                    </div>
                </div>

                <div className="bg-indigo-950/50 rounded-xl p-4 flex gap-4">
                    <div className="flex-1">
                        <p className="text-xs text-indigo-300">정산 대기</p>
                        <p className="font-bold text-lg">{pendingCases.length}건</p>
                    </div>
                    <div className="w-px bg-white/10"></div>
                    <div className="flex-1">
                        <p className="text-xs text-indigo-300">정산 완료</p>
                        <p className="font-bold text-lg">{settledCases.length}건</p>
                    </div>
                </div>
            </div>

            {/* 2. 정산 대기 목록 */}
            {pendingCases.length > 0 && (
            <div>
                <h3 className="font-bold text-gray-800 mb-4 px-1 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-orange-500" />
                    정산 대기 목록 (진행 완료)
                </h3>
                    <div className="space-y-4 mb-8">
                        {pendingCases.map((c) => (
                            <div key={c.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="bg-gray-50 px-5 py-4 border-b border-gray-200">
                                    <FuneralCaseInfo
                                        caseId={c.id}
                                        deceasedName={c.deceased_name}
                                        chiefMournerName={c.profiles?.name}
                                        clientPhone={c.profiles?.phone}
                                        location={c.location}
                                        roomNumber={c.room_number}
                                        variant="manager"
                                        statusBadge={
                                            <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
                                                {c.status === 'hq_check' ? '본사 검토 중' : '정산 대기'}
                                            </span>
                                        }
                                        assigneeName={c.team_leader && user && user.id !== c.team_leader.id ? c.team_leader.name : null}
                                        assigneeLabel="팀장"
                                        showAssignee={!!(c.team_leader && user && user.id !== c.team_leader.id)}
                                        date={new Date(c.created_at).toLocaleDateString()}
                                    />
                                </div>

                                <div className="p-5 space-y-4">
                                    <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm text-gray-600">
                                        <div className="flex justify-between items-center">
                                            <span>최종 서비스 금액</span>
                                            <span className="font-bold text-gray-800">{(c.final_price || 0).toLocaleString()} 원</span>
                                        </div>
                                        <div className="h-px bg-gray-200 my-2"></div>
                                        <div className="flex justify-between items-center text-indigo-700 font-bold text-base">
                                            <span>본사 송금 예정 금액 (사용료)</span>
                                            <span>{getRemittanceAmount(c).toLocaleString()} 원</span>
                                        </div>
                                        {c.additional_income_total > 0 && (
                                            <>
                                                <div className="h-px bg-gray-200 my-2"></div>
                                                <div className="flex justify-between items-center">
                                                    <span>부가수입 총 발생액</span>
                                                    <span className="font-bold text-gray-800">{c.additional_income_total.toLocaleString()} 원</span>
                                                </div>
                                                <div className="flex justify-between items-center text-indigo-700 font-bold text-base mt-1">
                                                    <span>팀장 배분 수익 ({c.additional_income_rate || 50}%)</span>
                                                    <span>{Math.round(c.additional_income_total * ((c.additional_income_rate || 50) / 100)).toLocaleString()} 원</span>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="w-full py-3 bg-gray-100 text-gray-500 font-bold rounded-xl flex items-center justify-center gap-2 text-sm mt-2">
                                        <AlertCircle className="w-4 h-4" /> 본사 입금 확인 시 자동 정산 완료
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
            </div>
            )}

            {/* 3. 정산 완료 내역 */}
            <div>
                <h3 className="font-bold text-gray-500 mb-4 px-1 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" /> 정산 완료 내역
                </h3>
                {settledCases.length > 0 ? (
                    <div className="space-y-3">
                        {settledCases.map(c => (
                            <div key={c.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden opacity-70">
                                <div className="absolute right-0 top-0 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                                    정산완료
                                </div>

                                {/* 상단: 뱃지(좌) + 금액(우) 가로 배치 */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-bold px-2.5 py-1 rounded-full text-indigo-600 bg-indigo-50">
                                            본사 입금(사용료)
                                        </span>
                                    </div>
                                    <span className="font-bold text-lg text-gray-400">
                                        {getRemittanceAmount(c).toLocaleString()}원
                                    </span>
                                </div>

                                {/* 중간: 기본정보 박스 */}
                                <FuneralCaseInfo
                                    caseId={c.id}
                                    deceasedName={c.deceased_name}
                                    chiefMournerName={c.profiles?.name}
                                    clientPhone={c.profiles?.phone}
                                    location={c.location}
                                    roomNumber={c.room_number}
                                    variant="dealer"
                                    compact={true}
                                    date={new Date(c.created_at).toLocaleDateString()}
                                />

                                {/* 하단: 부가수입 (있을 때만) */}
                                {c.additional_income_total > 0 && (
                                    <div className="mt-3 border-t border-gray-50 pt-3">
                                        <div className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded inline-block font-bold">
                                            부가수입 배분({c.additional_income_rate || 50}%): {Math.round(c.additional_income_total * ((c.additional_income_rate || 50) / 100)).toLocaleString()}원
                                            {c.additional_income_settled && <span className="ml-1 bg-indigo-200 text-indigo-700 px-1 py-0.5 rounded text-[10px]">지급완료</span>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-xl">완료된 정산 내역이 없습니다.</p>
                )}
            </div>
                </>
            ) : (
                <MySettlements user={user} typeFilter="leader_override" />
            )}
        </div>
    );
}
