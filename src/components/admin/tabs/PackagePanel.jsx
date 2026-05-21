import React, { useState, useEffect } from 'react';
import { translateError } from '../../../lib/errorHandler';
import { Package, CheckCircle, XCircle, Clock, Search, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { useNotification } from '../../../contexts/NotificationContext';

export default function PackagePanel({ supabase, isReadonly }) {
    const { showToast } = useNotification();
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('pending'); // 'pending', 'approved', 'rejected', 'all'
    const [expandedPkgId, setExpandedPkgId] = useState(null);

    useEffect(() => {
        fetchPackages();
    }, []);

    const fetchPackages = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('custom_packages')
                .select('*, profiles:team_leader_id(name, phone, grade)')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPackages(data || []);
        } catch (error) {
            console.error('Packages fetch error:', error);
            showToast('error', '상품 목록 불러오기 실패', translateError(error));
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (pkgId, newStatus) => {
        if (isReadonly) return showToast('warning', '권한 없음', '열람 전용 계정은 상태를 변경할 수 없습니다.');

        const actionName = newStatus === 'approved' ? '승인' : '거절';
        let memo = '';

        if (newStatus === 'rejected') {
            memo = prompt('거절 사유를 입력해주세요 (팀장에게 노출됩니다):');
            if (memo === null) return;
            if (!memo.trim()) {
                showToast('warning', '거절 실패', '거절 사유를 반드시 입력해야 합니다.');
                return;
            }
        } else {
            if (!confirm(`이 커스텀 패키지를 ${actionName}하시겠습니까?\n승인 시 해당 팀장은 이 상품을 즉시 사용할 수 있습니다.`)) {
                return;
            }
        }

        try {
            const updatePayload = {
                status: newStatus,
                updated_at: new Date().toISOString()
            };
            if (newStatus === 'rejected') {
                updatePayload.admin_memo = memo;
            }

            const { error } = await supabase
                .from('custom_packages')
                .update(updatePayload)
                .eq('id', pkgId);

            if (error) throw error;
            showToast('success', `처리 완료`, `상품 제안이 ${actionName} 처리되었습니다.`);
            fetchPackages();
        } catch (error) {
            console.error('Package update error:', error);
            showToast('error', '처리 실패', translateError(error));
        }
    };

    const filteredPackages = packages.filter(p => filter === 'all' || p.status === filter);

    if (loading) {
        return <div className="p-10 text-center text-gray-500 font-bold">로딩 중...</div>;
    }

    return (
        <div className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    {['pending', 'approved', 'rejected', 'all'].map(status => {
                        const labels = { pending: '승인 대기', approved: '승인됨', rejected: '반려됨', all: '전체 보기' };
                        const count = packages.filter(p => status === 'all' || p.status === status).length;
                        return (
                            <button
                                key={status}
                                onClick={() => setFilter(status)}
                                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${filter === status ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
                            >
                                {labels[status]} <span className="ml-1 text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{count}</span>
                            </button>
                        );
                    })}
                </div>
                <button onClick={fetchPackages} className="text-sm text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1">
                    새로고침
                </button>
            </div>

            <div className="space-y-4">
                {filteredPackages.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-gray-100 flex flex-col items-center">
                        <Package className="w-12 h-12 text-gray-200 mb-2" />
                        <p className="text-gray-500 font-bold">해당하는 제안 내역이 없습니다.</p>
                    </div>
                ) : (
                    filteredPackages.map(pkg => {
                        const isExpanded = expandedPkgId === pkg.id;
                        const stMap = {
                            pending: { label: '심사 대기중', color: 'text-orange-700 bg-orange-50 border-orange-200' },
                            approved: { label: '승인됨', color: 'text-green-700 bg-green-50 border-green-200' },
                            rejected: { label: '반려됨', color: 'text-red-700 bg-red-50 border-red-200' }
                        };
                        const statusInfo = stMap[pkg.status] || stMap.pending;

                        return (
                            <div key={pkg.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-md">
                                <div 
                                    className="p-5 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                                    onClick={() => setExpandedPkgId(isExpanded ? null : pkg.id)}
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                                                {statusInfo.label}
                                            </span>
                                            <span className="text-xs text-gray-400 font-mono">
                                                {new Date(pkg.created_at).toLocaleString('ko-KR')}
                                            </span>
                                        </div>
                                        <h4 className="font-bold text-lg text-gray-900">{pkg.name}</h4>
                                        <p className="text-sm text-gray-500 mt-1 line-clamp-1">{pkg.description}</p>
                                        
                                        <div className="flex items-center gap-3 mt-3 text-sm">
                                            <div className="text-gray-600 bg-gray-50 px-2 py-1 rounded w-fit text-xs font-medium">
                                                제안자: <strong>{pkg.profiles?.name}</strong> ({pkg.profiles?.grade})
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6 min-w-[200px]">
                                        <div className="text-right">
                                            <div className="text-xs text-gray-500 mb-1">총 상품가 (고객 노출)</div>
                                            <div className="text-xl font-black text-indigo-700 font-mono mb-2">
                                                {pkg.total_price.toLocaleString()}원
                                            </div>
                                            <div className="text-[10px] text-gray-400">
                                                본사 수수료: <strong className="text-gray-700">{pkg.fee_amount.toLocaleString()}원</strong>
                                            </div>
                                        </div>
                                        <div className="md:mt-3 text-indigo-400">
                                            {isExpanded ? <ChevronUp className="w-5 h-5 mx-auto" /> : <ChevronDown className="w-5 h-5 mx-auto" />}
                                        </div>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="bg-gray-50 border-t border-gray-100 p-5 pb-6">
                                        <h5 className="font-bold text-gray-800 text-sm mb-3">상품 구성표</h5>
                                        <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                                            <table className="w-full text-left text-sm whitespace-nowrap">
                                                <thead>
                                                    <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                                                        <th className="p-3 font-bold">품목명 / 내역</th>
                                                        <th className="p-3 font-bold text-center">수량</th>
                                                        <th className="p-3 font-bold text-right">단가(원)</th>
                                                        <th className="p-3 font-bold text-right">합계(원)</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(pkg.items || []).map((item, idx) => (
                                                        <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                                                            <td className="p-3 text-gray-800 font-medium">{item.name}</td>
                                                            <td className="p-3 text-center text-gray-600 font-mono">{item.qty}</td>
                                                            <td className="p-3 text-right text-gray-600 font-mono">{item.price?.toLocaleString()}</td>
                                                            <td className="p-3 text-right text-indigo-700 font-bold font-mono bg-indigo-50/20">{(item.qty * item.price)?.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        
                                        {pkg.status === 'rejected' && pkg.admin_memo && (
                                            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                                                <h6 className="text-xs font-bold text-red-800 mb-1">반려 사유 (관리자 코멘트)</h6>
                                                <p className="text-sm text-red-600">{pkg.admin_memo}</p>
                                            </div>
                                        )}

                                        {pkg.status === 'pending' && !isReadonly && (
                                            <div className="flex gap-3 mt-6">
                                                <button
                                                    onClick={() => handleUpdateStatus(pkg.id, 'rejected')}
                                                    className="flex-1 py-3 bg-white border-2 border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <XCircle className="w-5 h-5" /> 반려 (거절)
                                                </button>
                                                <button
                                                    onClick={() => handleUpdateStatus(pkg.id, 'approved')}
                                                    className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-sm transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircle className="w-5 h-5" /> 승인 처리
                                                </button>
                                            </div>
                                        )}
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
