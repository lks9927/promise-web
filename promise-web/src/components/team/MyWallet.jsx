import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Wallet, CheckCircle, AlertCircle, TrendingUp, DollarSign, Building, User, ChevronRight, CreditCard } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';

export default function MyWallet({ user }) {
    const { showToast } = useNotification();
    const [policy, setPolicy] = useState(null);
    const [cases, setCases] = useState([]);
    const [loading, setLoading] = useState(true);

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
                    location,
                    package_name,
                    final_price,
                    deceased_name,
                    profiles:customer_id ( id, name, phone ),
                    team_leader:team_leader_id ( id, name, role )
                `)
                .eq('team_leader_id', user.id)
                .in('status', ['completed', 'team_settling', 'hq_check'])
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
    const pendingCases = cases.filter(c => c.status === 'team_settling' || c.status === 'hq_check');
    const settledCases = cases.filter(c => c.status === 'completed');

    const totalToDeposit = pendingCases.reduce((acc, c) => acc + (c.final_price || 0), 0);

    return (
        <div className="space-y-6 pb-20">
            {/* Header / Summary */}
            <div className="bg-gradient-to-br from-indigo-900 to-indigo-800 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <p className="text-indigo-200 text-sm font-medium mb-1">본사 송금 요망 (미정산 잔액)</p>
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

            {/* List of Pending Cases */}
            <div>
                <h3 className="font-bold text-gray-800 mb-4 px-1 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-orange-500" />
                    정산 대기 목록 (진행 완료)
                </h3>
                {pendingCases.length === 0 ? (
                    <div className="bg-white p-8 rounded-2xl text-center border border-gray-100 mb-6">
                        <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium text-sm">모든 건의 정산이 완료되었습니다!</p>
                    </div>
                ) : (
                    <div className="space-y-4 mb-8">
                        {pendingCases.map((c) => (
                            <div key={c.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="bg-gray-50 px-5 py-4 flex justify-between items-center border-b border-gray-200">
                                    <div>
                                        <p className="text-xs text-gray-500 mb-0.5">{new Date(c.created_at).toLocaleDateString()}</p>
                                        <h4 className="font-bold text-gray-900 text-lg">
                                            {c.deceased_name ? `고인: ${c.deceased_name}` : (c.profiles?.name ? `${c.profiles.name} 님 장례` : '장례 건')}
                                        </h4>
                                        <p className="text-xs text-gray-500 mt-0.5">{c.location} · {c.package_name}</p>
                                    </div>
                                    <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
                                        {c.status === 'hq_check' ? '본사 검토 중' : '정산 대기'}
                                    </span>
                                </div>

                                <div className="p-5 space-y-4">
                                    <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm text-gray-600">
                                        <div className="flex justify-between items-center">
                                            <span>최종 서비스 금액</span>
                                            <span className="font-bold text-gray-800">{(c.final_price || 0).toLocaleString()} 원</span>
                                        </div>
                                        <div className="h-px bg-gray-200 my-2"></div>
                                        <div className="flex justify-between items-center text-indigo-700 font-bold text-base">
                                            <span>정산 대기금액</span>
                                            <span>{(c.final_price || 0).toLocaleString()} 원</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleMarkAsSettled(c.id)}
                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors mt-2"
                                    >
                                        <CheckCircle className="w-5 h-5" /> 정산 완료 처리
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* List of Settled Cases */}
            <div>
                <h3 className="font-bold text-gray-500 mb-4 px-1 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" /> 정산 완료 내역
                </h3>
                {settledCases.length > 0 ? (
                    <div className="space-y-3">
                        {settledCases.map(c => (
                            <div key={c.id} className="bg-white p-4 flex justify-between items-center rounded-xl border border-gray-100 opacity-70">
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">
                                        {c.deceased_name ? `고인: ${c.deceased_name}` : (c.profiles?.name ? `${c.profiles.name} 님 장례` : '장례 건')}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-0.5">{new Date(c.created_at).toLocaleDateString()} · {c.location}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 mb-0.5">최종 금액</p>
                                    <p className="font-bold text-gray-600 text-sm">{(c.final_price || 0).toLocaleString()}원</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-xl">완료된 정산 내역이 없습니다.</p>
                )}
            </div>

        </div>
    );
}
