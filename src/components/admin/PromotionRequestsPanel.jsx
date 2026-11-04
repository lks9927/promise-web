import React, { useState, useEffect, useCallback } from 'react';
import { listPromotionRequests, decidePromotion, revertPromotion } from '../../lib/promotionRequests';

const STATUS_LABELS = {
    pending: '대기',
    approved: '승인됨',
    rejected: '거절됨',
    reverted: '되돌림',
};

const STATUS_BADGES = {
    pending: 'bg-amber-100 text-amber-800 border border-amber-200',
    approved: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    rejected: 'bg-rose-100 text-rose-800 border border-rose-200',
    reverted: 'bg-gray-100 text-gray-700 border border-gray-300',
};

function formatGrade(grade) {
    if (grade === 'C') return '일반(C)';
    if (grade === 'Master') return '마스터(Master)';
    if (grade === 'S') return '대표마스터(S)';
    return grade || '-';
}

function formatKoreanDate(dateString) {
    if (!dateString) return '-';
    try {
        const d = new Date(dateString);
        return new Intl.DateTimeFormat('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(d);
    } catch {
        return dateString;
    }
}

export default function PromotionRequestsPanel({ onActionCompleted }) {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [submittingId, setSubmittingId] = useState(null);

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await listPromotionRequests();
            if (error) {
                alert(`목록을 불러오는 중 오류가 발생했습니다: ${error.message}`);
                setRequests([]);
            } else {
                setRequests(data || []);
            }
        } catch (err) {
            alert(`목록을 불러오는 중 오류가 발생했습니다: ${err.message || err}`);
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const pendingCount = requests.filter((r) => r.status === 'pending').length;

    const displayedRequests = requests.filter((r) => {
        if (statusFilter === 'all') return true;
        return r.status === statusFilter;
    });

    // 승인 처리
    const handleApprove = async (req) => {
        const ok = window.confirm(`'${req.target_name}' 파트너의 승격을 승인하시겠습니까?`);
        if (!ok) return;

        setSubmittingId(req.id);
        try {
            const { error } = await decidePromotion(req.id, true, '');
            if (error) {
                alert(`승격 승인 처리에 실패했습니다: ${error.message}`);
            } else {
                await fetchRequests();
                if (onActionCompleted) onActionCompleted();
            }
        } catch (err) {
            alert(`승격 승인 처리에 실패했습니다: ${err.message || err}`);
        } finally {
            setSubmittingId(null);
        }
    };

    // 거절 처리
    const handleReject = async (req) => {
        const ok = window.confirm(`'${req.target_name}' 파트너의 승격 요청을 거절하시겠습니까?`);
        if (!ok) return;

        const note = window.prompt('거절 사유를 입력해주세요 (한 줄):', '');
        if (note === null) return; // 프롬프트 취소 시 중단

        setSubmittingId(req.id);
        try {
            const { error } = await decidePromotion(req.id, false, note.trim());
            if (error) {
                alert(`승격 거절 처리에 실패했습니다: ${error.message}`);
            } else {
                await fetchRequests();
                if (onActionCompleted) onActionCompleted();
            }
        } catch (err) {
            alert(`승격 거절 처리에 실패했습니다: ${err.message || err}`);
        } finally {
            setSubmittingId(null);
        }
    };

    // 되돌리기 처리
    const handleRevert = async (req) => {
        const ok = window.confirm(
            `'${req.target_name}' 파트너의 승격을 되돌리시겠습니까?\n해당 파트너는 이전 등급(${formatGrade(req.from_grade)})으로 복구됩니다.`
        );
        if (!ok) return;

        const note = window.prompt('되돌리기 사유를 입력해주세요 (한 줄):', '');
        if (note === null) return; // 프롬프트 취소 시 중단

        setSubmittingId(req.id);
        try {
            const { error } = await revertPromotion(req.id, note.trim());
            if (error) {
                alert(`승격 되돌리기 처리에 실패했습니다: ${error.message}`);
            } else {
                await fetchRequests();
                if (onActionCompleted) onActionCompleted();
            }
        } catch (err) {
            alert(`승격 되돌리기 처리에 실패했습니다: ${err.message || err}`);
        } finally {
            setSubmittingId(null);
        }
    };

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-gray-900">대표마스터 승격 요청</h3>
                    {pendingCount > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            대기 {pendingCount}건
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <label htmlFor="status-filter-select" className="text-xs text-gray-500 whitespace-nowrap">
                        상태 필터:
                    </label>
                    <select
                        id="status-filter-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-gray-50 text-gray-700 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="all">전체</option>
                        <option value="pending">대기</option>
                        <option value="approved">승인됨</option>
                        <option value="rejected">거절됨</option>
                        <option value="reverted">되돌림</option>
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-y border-gray-200">
                        <tr>
                            <th className="px-4 py-3 whitespace-nowrap">요청자</th>
                            <th className="px-4 py-3 whitespace-nowrap">승격 대상</th>
                            <th className="px-4 py-3 whitespace-nowrap">현재 → 요청 등급</th>
                            <th className="px-4 py-3 whitespace-nowrap">사유</th>
                            <th className="px-4 py-3 whitespace-nowrap">요청일 (한국 시간)</th>
                            <th className="px-4 py-3 whitespace-nowrap">상태</th>
                            <th className="px-4 py-3 whitespace-nowrap text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                                    데이터를 불러오는 중입니다...
                                </td>
                            </tr>
                        ) : displayedRequests.length === 0 ? (
                            <tr>
                                <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                                    요청이 없습니다
                                </td>
                            </tr>
                        ) : (
                            displayedRequests.map((req) => {
                                const isPending = req.status === 'pending';
                                const isApproved = req.status === 'approved';
                                const isProcessing = submittingId === req.id;

                                return (
                                    <tr key={req.id} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                                            {req.requester_name || '알 수 없음'}
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                                            {req.target_name || '알 수 없음'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                                            <span className="font-medium text-gray-600">{formatGrade(req.from_grade)}</span>
                                            <span className="mx-1 text-gray-400">→</span>
                                            <span className="font-bold text-indigo-600">{formatGrade(req.to_grade)}</span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-700 max-w-xs truncate" title={req.reason || '-'}>
                                            {req.reason || '-'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                                            {formatKoreanDate(req.created_at)}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span
                                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                    STATUS_BADGES[req.status] || 'bg-gray-100 text-gray-700'
                                                }`}
                                            >
                                                {STATUS_LABELS[req.status] || req.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-center">
                                            {isPending && (
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleApprove(req)}
                                                        disabled={isProcessing}
                                                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                                                    >
                                                        승인
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleReject(req)}
                                                        disabled={isProcessing}
                                                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                                                    >
                                                        거절
                                                    </button>
                                                </div>
                                            )}
                                            {isApproved && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRevert(req)}
                                                    disabled={isProcessing}
                                                    className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                                                >
                                                    되돌리기
                                                </button>
                                            )}
                                            {!isPending && !isApproved && (
                                                <span className="text-xs text-gray-400">-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
