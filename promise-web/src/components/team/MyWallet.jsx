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
                    deceased_name,
                    cemetery_name,
                    requester:requester_id ( id, name, role, grade, phone, bank_name, account_number ),
                    team_leader:team_leader_id ( id, name, role, grade )
                `)
                .eq('team_leader_id', user.id)
                .in('status', ['completed', 'settled'])
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

        // Helper to deduct
        let remaining = p.base_margin - p.customer_payback;

        // If Sales is Dealer
        if (salesRole === 'dealer') {
            if (salesGrade === 'Master') {
                // 3: 마스터딜러(영업) / 팀장(진행)
                baseContent.sales_payout = p.sales_dealer_master_direct;
                remaining -= p.sales_dealer_master_direct;
                if (execGrade === 'S') remaining -= p.exec_leader_master_override; // Master team leader takes override

            } else {
                // 1 or 2: 일반딜러
                baseContent.sales_payout = p.sales_dealer_regular;
                remaining -= p.sales_dealer_regular;
                // + Master Dealer Override (goes to their upline... simplified HQ takes it if no upline tracking, or HQ handles it)
                remaining -= p.sales_dealer_master_override; // Assuming HQ holds the override to give to Master Dealer

                if (execGrade === 'Master') {
                    // 2: 일반딜러(영업) / 마스터팀장(진행)
                    remaining -= p.exec_leader_master_direct;
                } else {
                    // 1: 일반딜러(영업) / 일반팀장(진행)
                    remaining -= p.exec_leader_master_override;
                }
            }
        }
        // If Sales is Leader
        else if (salesRole === 'leader') {
            if (salesGrade === 'Master') {
                if (execGrade === 'Master') {
                    // 5: 마스터팀장(영업) / 마스터팀장(진행) -> Same person?
                    baseContent.sales_payout = 0; // Pre-deducted
                    remaining = 200000; // As per doc
                } else {
                    // 4: 마스터팀장(영업) / 일반팀장(진행)
                    baseContent.sales_payout = p.sales_leader_master_direct;
                    remaining -= p.sales_leader_master_direct;
                }
            } else {
                // 일반팀장 영업
                if (execGrade === 'Master') {
                    // 7: 일반팀장(영업) / 마스터팀장(진행)
                    baseContent.sales_payout = 0; // Pre-deducted
                    remaining = 200000;
                } else {
                    // 6: 일반팀장(영업) / 일반팀장(진행) -> Same person?
                    baseContent.sales_payout = 0; // Pre-deducted 
                    remaining = 300000;
                }
            }
        }
        // If Sales is Admin/HQ
        else {
            if (execGrade === 'Master') {
                // 9
                baseContent.sales_payout = 0;
                remaining -= p.exec_leader_master_direct; // 20만
            } else {
                // 8
                baseContent.sales_payout = 0;
                remaining -= p.exec_leader_master_override; // 10만
            }
        }

        baseContent.hq = remaining;
        return baseContent;
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">데이터를 불러오는 중입니다...</div>;
    }

    // Pending vs Settled calculations
    const pendingCases = cases.filter(c => c.status === 'completed');
    const settledCases = cases.filter(c => c.status === 'settled');

    // Total HQ To Deposit
    const totalToDeposit = pendingCases.reduce((acc, c) => acc + calculateSplit(c, policy).hq, 0);

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
                        {pendingCases.map((c) => {
                            const split = calculateSplit(c, policy);
                            return (
                                <div key={c.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                    {/* Card Header */}
                                    <div className="bg-gray-50 px-5 py-4 flex justify-between items-center border-b border-gray-200">
                                        <div>
                                            <p className="text-xs text-gray-500 mb-0.5">{new Date(c.created_at).toLocaleDateString()}</p>
                                            <h4 className="font-bold text-gray-900 text-lg">고인: {c.deceased_name}</h4>
                                        </div>
                                        <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
                                            정산대기
                                        </span>
                                    </div>

                                    {/* Breakdown */}
                                    <div className="p-5 space-y-4">
                                        {/* Sales Person Info */}
                                        <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                                                    <User className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-500">영업 담당자 (지급 대상)</p>
                                                    <p className="font-bold text-gray-800">{split.req_name}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-gray-500">영업 수수료</p>
                                                <p className="font-bold text-blue-600 text-lg">+{split.sales_payout.toLocaleString()}원</p>
                                            </div>
                                        </div>

                                        {/* Bank Info for Direct Transfer */}
                                        {split.sales_payout > 0 && (
                                            <div className="bg-blue-50 rounded-xl p-4 flex justify-between items-center">
                                                <div>
                                                    <p className="text-xs text-blue-600 font-bold mb-1 flex items-center gap-1">
                                                        <CreditCard className="w-3 h-3" /> 입금 계좌정보
                                                    </p>
                                                    {split.req_bank && split.req_account ? (
                                                        <p className="font-bold text-blue-900 font-mono tracking-tight">{split.req_bank} {split.req_account}</p>
                                                    ) : (
                                                        <p className="text-sm text-blue-400 font-medium">계좌 정보가 등록되지 않았습니다.</p>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const txt = `${split.req_bank} ${split.req_account}`;
                                                        navigator.clipboard.writeText(txt);
                                                        showToast('success', '복사 완료', '계좌번호가 복사되었습니다.');
                                                    }}
                                                    className="px-3 py-1.5 bg-white text-blue-600 text-xs font-bold rounded-lg shadow-sm"
                                                >
                                                    복사
                                                </button>
                                            </div>
                                        )}

                                        {/* HQ & Customer breakdown */}
                                        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm text-gray-600">
                                            <div className="flex justify-between items-center">
                                                <span>총 마진금액</span>
                                                <span className="font-bold text-gray-800">{split.total_margin.toLocaleString()} 원</span>
                                            </div>
                                            <div className="flex justify-between items-center text-red-500">
                                                <span>상주 페이백 (지출)</span>
                                                <span>-{split.customer.toLocaleString()} 원</span>
                                            </div>
                                            <div className="h-px bg-gray-200 my-2"></div>
                                            <div className="flex justify-between items-center text-indigo-700 font-bold text-base">
                                                <span>본사 최종 송금액</span>
                                                <span>{split.hq.toLocaleString()} 원</span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <button
                                            onClick={() => handleMarkAsSettled(c.id)}
                                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors mt-2"
                                        >
                                            <CheckCircle className="w-5 h-5" /> 모든 정산/송금 완료 처리
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
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
                        {settledCases.map(c => {
                            const split = calculateSplit(c, policy);
                            return (
                                <div key={c.id} className="bg-white p-4 flex justify-between items-center rounded-xl border border-gray-100 opacity-70">
                                    <div>
                                        <p className="font-bold text-gray-800 text-sm">고인: {c.deceased_name}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{new Date(c.updated_at || c.created_at).toLocaleDateString()} 정산완료</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-gray-500 mb-0.5">본사 송금액</p>
                                        <p className="font-bold text-gray-600 text-sm">{split.hq.toLocaleString()}원</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-xl">완료된 정산 내역이 없습니다.</p>
                )}
            </div>

        </div>
    );
}
