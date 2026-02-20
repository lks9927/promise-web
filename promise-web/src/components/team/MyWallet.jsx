import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Wallet, ArrowDownLeft, ArrowUpRight, Clock, AlertCircle } from 'lucide-react';

export default function MyWallet({ user }) {
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchWalletData();
    }, [user.id]);

    const fetchWalletData = async () => {
        try {
            setLoading(true);

            // 1. Fetch Current Balance
            const { data: partnerData, error: partnerError } = await supabase
                .from('partners')
                .select('deposit_balance')
                .eq('user_id', user.id)
                .single();

            if (partnerError) throw partnerError;
            setBalance(partnerData?.deposit_balance || 0);

            // 2. Fetch Transaction History
            const { data: historyData, error: historyError } = await supabase
                .from('deposits')
                .select('*')
                .eq('partner_id', user.id)
                .order('created_at', { ascending: false });

            if (historyError) throw historyError;
            setTransactions(historyData || []);

        } catch (error) {
            console.error('Error fetching wallet data:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Balance Card */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <p className="text-gray-400 text-sm font-medium mb-1">나의 예치금 잔액</p>
                        <h2 className="text-3xl font-bold">₩ {balance.toLocaleString()}</h2>
                    </div>
                    <div className="bg-white/10 p-2 rounded-full">
                        <Wallet className="w-6 h-6 text-white" />
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => alert('입금 신청 기능은 준비 중입니다.\n관리자에게 문의해주세요.')}
                        className="flex-1 bg-white text-gray-900 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors"
                    >
                        충전하기
                    </button>
                    <button
                        onClick={() => alert('출금 신청 기능은 준비 중입니다.\n관리자에게 문의해주세요.')}
                        className="flex-1 bg-white/10 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-white/20 transition-colors"
                    >
                        출금신청
                    </button>
                </div>
            </div>

            {/* Low Balance Warning */}
            {balance < 150000 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="font-bold text-orange-800 text-sm">잔액이 부족합니다</h4>
                        <p className="text-xs text-orange-600 mt-1">
                            원활한 장례 이행을 위해 최소 150,000원 이상의 예치금을 유지해주세요. 잔액 부족 시 배정이 제한될 수 있습니다.
                        </p>
                    </div>
                </div>
            )}

            {/* Transaction History */}
            <div>
                <h3 className="font-bold text-gray-800 mb-4 px-1">최근 거래 내역</h3>
                {loading ? (
                    <div className="text-center py-10 text-gray-400">데이터를 불러오는 중...</div>
                ) : transactions.length === 0 ? (
                    <div className="bg-white p-8 rounded-2xl text-center border border-gray-100">
                        <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Clock className="w-6 h-6 text-gray-300" />
                        </div>
                        <p className="text-gray-400 text-sm">거래 내역이 없습니다.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {transactions.map((item) => {
                            const isDeposit = item.type === 'deposit';
                            return (
                                <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDeposit ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                                            {isDeposit ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900">
                                                {isDeposit ? '예치금 충전' : '본사 사용료 차감'}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-0.5">
                                                {new Date(item.created_at).toLocaleDateString()}
                                                {item.memo && ` • ${item.memo}`}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`font-bold ${isDeposit ? 'text-blue-600' : 'text-gray-900'}`}>
                                        {isDeposit ? '+' : '-'}{item.amount.toLocaleString()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
