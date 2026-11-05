import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchMyManagementFeeSummary } from '../../lib/managementFee';
import { fetchSDownlineOverview } from '../../lib/sDownlineOverview';
import { requestPromotion, listPromotionRequests } from '../../lib/promotionRequests';

const STATUS_LABELS = {
    requested: '접수',
    assigned: '배정',
    consulting: '상담',
    in_progress: '진행 중',
    team_settling: '정산 중(팀장)',
    hq_check: '본사 확인',
    completed: '완료',
    cancelled: '취소',
};

const PROMOTION_STATUS_LABELS = {
    pending: '대기',
    approved: '승인됨',
    rejected: '거절됨',
    reverted: '되돌림',
};

const PROMOTION_STATUS_STYLES = {
    pending: 'bg-amber-50 text-amber-700 border border-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    rejected: 'bg-rose-50 text-rose-700 border border-rose-200',
    reverted: 'bg-gray-100 text-gray-700 border border-gray-200',
};

const formatKstTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
};

export default function RepresentativeOverview({ user, title }) {
    const [summary, setSummary] = useState(null);
    const [downlineList, setDownlineList] = useState([]);
    const [promotionRequests, setPromotionRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const refreshPromotionRequests = async () => {
        try {
            const res = await listPromotionRequests();
            if (res.error) {
                console.error('승격 요청 목록 조회 오류:', res.error);
                return;
            }
            setPromotionRequests(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('승격 요청 목록 조회 오류:', err);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const loadOverviewData = async () => {
            setLoading(true);
            setError(null);
            try {
                const [summaryRes, downlineRes, promoRes] = await Promise.all([
                    fetchMyManagementFeeSummary(),
                    fetchSDownlineOverview(),
                    listPromotionRequests()
                ]);

                if (summaryRes.error) throw summaryRes.error;
                if (downlineRes.error) throw downlineRes.error;

                if (isMounted) {
                    const row = Array.isArray(summaryRes.data)
                        ? summaryRes.data[0]
                        : summaryRes.data;
                    setSummary(row || null);
                    setDownlineList(Array.isArray(downlineRes.data) ? downlineRes.data : []);
                    if (!promoRes.error && Array.isArray(promoRes.data)) {
                        setPromotionRequests(promoRes.data);
                    }
                }
            } catch (err) {
                console.error('대표마스터 조회 오류:', err);
                if (isMounted) {
                    setError('조회 권한이 없거나 아직 준비되지 않았습니다.');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadOverviewData();

        return () => {
            isMounted = false;
        };
    }, [user?.id]);

    const handleRequestPromotion = async (row) => {
        const targetName = row['담당자명'] || '해당 파트너';
        const reason = window.prompt(`[${targetName}] 마스터 승격 요청 사유를 한 줄로 입력해주세요:`);
        if (reason === null) return; // 취소하면 중단

        const confirmed = window.confirm(`정말 ${targetName}님을 마스터로 승격 요청하시겠습니까?`);
        if (!confirmed) return;

        try {
            setIsSubmitting(true);
            const { error: reqError } = await requestPromotion(row.partner_id, reason);
            if (reqError) {
                alert(`승격 요청에 실패했습니다: ${reqError.message || '오류가 발생했습니다.'}`);
                return;
            }
            alert('요청했습니다. 본사 승인 후 반영됩니다.');
            await refreshPromotionRequests();
        } catch (err) {
            alert(`승격 요청 중 오류가 발생했습니다: ${err.message || err}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const inProgressCount = Number(summary?.in_progress_count ?? 0);
    const completedCount = Number(summary?.completed_count ?? 0);
    const monthStartedCount = Number(summary?.month_started_count ?? 0);
    const monthAmount = Number(summary?.month_amount ?? 0);

    const pendingTargetIds = new Set(
        promotionRequests
            .filter((req) => req.status === 'pending')
            .map((req) => req.target_id)
    );

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-5">
            <div>
                <h3 className="text-lg font-bold text-gray-800">
                    {title}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                    하위 딜러(또는 팀장)의 개별 금액·연락처·고객 정보는 표시되지 않습니다.
                </p>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-500">
                    <Loader2 className="w-7 h-7 animate-spin mb-3 text-indigo-500" />
                    <p className="text-sm">데이터를 불러오는 중입니다...</p>
                </div>
            ) : error ? (
                <div className="py-8 text-center">
                    <p className="text-sm font-medium text-red-500">{error}</p>
                </div>
            ) : (
                <>
                    {/* 상단 요약 카드 4개 */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                            <div className="text-xs font-medium text-gray-500">진행 중</div>
                            <div className="mt-1 text-xl font-bold text-blue-600">
                                {inProgressCount.toLocaleString()}건
                            </div>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                            <div className="text-xs font-medium text-gray-500">완료</div>
                            <div className="mt-1 text-xl font-bold text-gray-700">
                                {completedCount.toLocaleString()}건
                            </div>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                            <div className="text-xs font-medium text-gray-500">이번 달 시작</div>
                            <div className="mt-1 text-xl font-bold text-indigo-600">
                                {monthStartedCount.toLocaleString()}건
                            </div>
                        </div>
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                            <div className="text-xs font-medium text-gray-500">이번 달 본인 몫</div>
                            <div className="mt-1 text-xl font-bold text-emerald-600">
                                ₩{monthAmount.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    {/* 하위 현황 표 */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-bold text-gray-700">하위 현황</h4>
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                                    <tr>
                                        <th className="py-2.5 px-3 font-semibold whitespace-nowrap">담당자명</th>
                                        <th className="py-2.5 px-3 font-semibold whitespace-nowrap">지역</th>
                                        <th className="py-2.5 px-3 font-semibold whitespace-nowrap">단계</th>
                                        <th className="py-2.5 px-3 font-semibold whitespace-nowrap">접수일</th>
                                        <th className="py-2.5 px-3 font-semibold whitespace-nowrap">입관시각</th>
                                        <th className="py-2.5 px-3 font-semibold whitespace-nowrap">종료시각</th>
                                        <th className="py-2.5 px-3 font-semibold whitespace-nowrap text-center">승격 요청</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {downlineList.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-8 text-center text-gray-400">
                                                조회된 하위 현황 내역이 없습니다.
                                            </td>
                                        </tr>
                                    ) : (
                                        downlineList.map((row, idx) => (
                                            <tr key={row.partner_id ? `${row.partner_id}-${idx}` : idx} className="hover:bg-gray-50/80 transition-colors">
                                                <td className="py-2.5 px-3 font-medium text-gray-900 whitespace-nowrap">
                                                    {row['담당자명'] || '-'}
                                                </td>
                                                <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                                                    {row['지역'] || '-'}
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                                        {STATUS_LABELS[row['단계']] || row['단계'] || '-'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                                                    {formatKstTime(row['접수일'])}
                                                </td>
                                                <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                                                    {formatKstTime(row['입관시각'])}
                                                </td>
                                                <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                                                    {formatKstTime(row['종료시각'])}
                                                </td>
                                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                                    {row.relationship === 'direct_c' ? (
                                                        pendingTargetIds.has(row.partner_id) ? (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                                                요청 대기 중
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRequestPromotion(row)}
                                                                disabled={isSubmitting}
                                                                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded transition-colors"
                                                            >
                                                                마스터 승격 요청
                                                            </button>
                                                        )
                                                    ) : (
                                                        <span className="text-gray-400">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 내 승격 요청 표 (있을 때만 표시) */}
                    {promotionRequests.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-gray-100">
                            <h4 className="text-sm font-bold text-gray-700">내 승격 요청</h4>
                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                                        <tr>
                                            <th className="py-2.5 px-3 font-semibold whitespace-nowrap">대상 이름</th>
                                            <th className="py-2.5 px-3 font-semibold whitespace-nowrap">상태</th>
                                            <th className="py-2.5 px-3 font-semibold whitespace-nowrap">요청일</th>
                                            <th className="py-2.5 px-3 font-semibold whitespace-nowrap">본사 메모</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {promotionRequests.map((req) => (
                                            <tr key={req.id} className="hover:bg-gray-50/80 transition-colors">
                                                <td className="py-2.5 px-3 font-medium text-gray-900 whitespace-nowrap">
                                                    {req.target_name || '-'}
                                                </td>
                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PROMOTION_STATUS_STYLES[req.status] || 'bg-gray-100 text-gray-800'}`}>
                                                        {PROMOTION_STATUS_LABELS[req.status] || req.status || '-'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">
                                                    {formatKstTime(req.created_at)}
                                                </td>
                                                <td className="py-2.5 px-3 text-gray-600 whitespace-pre-wrap max-w-xs break-words">
                                                    {req.decision_note || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
