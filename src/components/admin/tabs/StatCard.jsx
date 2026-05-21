import React from 'react';
import { FileText, Clock, DollarSign, Users, UserPlus } from 'lucide-react';

/**
 * 컴팩트 대시보드 요약 바 — 한 줄 밀도형 (가독성 개선)
 * 4개 그룹: 접수 | 처리 | 정산 | 파트너
 */
export default function DashboardSummaryBar({ cases = [], settlements = [], partners = [] }) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // ── 접수 통계 ──
    const todayCases = cases.filter(c => {
        const d = new Date(c.created_at);
        return d.getDate() === today.getDate() && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    const monthlyCases = cases.filter(c => {
        const d = new Date(c.created_at);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    const totalCases = cases.length;

    // ── 처리 통계 (이번달) ──
    const monthlyInProgress = cases.filter(c => {
        const d = new Date(c.created_at);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear && c.status === 'in_progress';
    }).length;

    const monthlyCompleted = cases.filter(c => {
        const d = new Date(c.created_at);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear && (c.status === 'completed' || c.status === 'settled');
    }).length;

    const completionRate = monthlyCases > 0 ? Math.round((monthlyCompleted / monthlyCases) * 100) : 0;

    // ── 정산 통계 ──
    const totalIncome = settlements.filter(s => s.type === 'usage_fee_remittance').reduce((acc, cur) => acc + Math.abs(cur.amount || 0), 0);
    const totalExpense = settlements.filter(s => s.type !== 'usage_fee_remittance').reduce((acc, cur) => acc + Math.abs(cur.amount || 0), 0);
    const pendingSettlement = settlements.filter(s => s.status === 'pending' && s.type !== 'usage_fee_remittance').reduce((acc, cur) => acc + Math.abs(cur.amount || 0), 0);
    const pendingCount = settlements.filter(s => s.status === 'pending' && s.type !== 'usage_fee_remittance').length;

    // ── 파트너 통계 ──
    const totalPartners = partners.length;
    const dealers = partners.filter(p => {
        const role = p.profiles?.role;
        return role === 'master' || role === 'dealer' || role === 'morning' || role === 'meal' || role === '아침' || role === '식사';
    }).length;
    const leaders = partners.filter(p => p.profiles?.role === 'leader').length;
    const todayNewPartners = partners.filter(p => {
        if (!p.created_at) return false;
        const d = new Date(p.created_at);
        return d.getDate() === today.getDate() && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-3 py-3 mb-5">
            <div className="flex items-stretch divide-x divide-gray-200">
                {/* ── 접수 현황 ── */}
                <div className="flex-1 px-4 py-1.5 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span className="text-xs font-bold text-gray-500 tracking-wide">접수</span>
                    </div>
                    <div className="flex items-baseline gap-4">
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-gray-900 leading-none">{todayCases}</span>
                            <span className="text-xs text-gray-400 font-medium">오늘</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-gray-600">{monthlyCases}</span>
                            <span className="text-xs text-gray-400">월</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-gray-400">{totalCases}</span>
                            <span className="text-xs text-gray-300">전체</span>
                        </div>
                    </div>
                </div>

                {/* ── 처리 현황 ── */}
                <div className="flex-1 px-4 py-1.5 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <Clock className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        <span className="text-xs font-bold text-gray-500 tracking-wide">이번달 처리</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-blue-600">{monthlyCases}</span>
                            <span className="text-xs text-gray-400">누적</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-orange-600">{monthlyInProgress}</span>
                            <span className="text-xs text-gray-400">진행</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-green-600">{monthlyCompleted}</span>
                            <span className="text-xs text-gray-400">완료</span>
                        </div>
                        {/* 미니 프로그레스바 */}
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <div className="h-2 flex-1 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-500"
                                    style={{ width: `${completionRate}%` }}
                                />
                            </div>
                            <span className="text-xs font-bold text-gray-500">{completionRate}%</span>
                        </div>
                    </div>
                </div>

                {/* ── 정산 ── */}
                <div className="flex-1 px-4 py-1.5 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <DollarSign className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        <span className="text-xs font-bold text-gray-500 tracking-wide">정산</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-emerald-700">₩{totalIncome.toLocaleString()}</span>
                            <span className="text-xs text-gray-400">입금</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-rose-600">₩{totalExpense.toLocaleString()}</span>
                            <span className="text-xs text-gray-400">출금</span>
                        </div>
                        <div className="flex items-center gap-1">
                            {pendingCount > 0 && (
                                <span className="relative flex h-2 w-2 flex-shrink-0">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                </span>
                            )}
                            <span className={`text-sm font-bold ${pendingCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                                ₩{pendingSettlement.toLocaleString()}
                            </span>
                            <span className="text-xs text-gray-400">
                                대기{pendingCount > 0 && <span className="text-amber-600 font-bold"> ({pendingCount})</span>}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── 파트너 ── */}
                <div className="flex-1 px-4 py-1.5 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                        <Users className="w-4 h-4 text-purple-500 flex-shrink-0" />
                        <span className="text-xs font-bold text-gray-500 tracking-wide">파트너</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-gray-900 leading-none">{totalPartners}</span>
                            <span className="text-xs text-gray-400 font-medium">전체</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-blue-600">{dealers}</span>
                            <span className="text-xs text-gray-400">딜러</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-base font-bold text-amber-600">{leaders}</span>
                            <span className="text-xs text-gray-400">팀장</span>
                        </div>
                        {todayNewPartners > 0 && (
                            <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <UserPlus className="w-3 h-3 text-emerald-600" />
                                <span className="text-xs font-bold text-emerald-700">+{todayNewPartners}</span>
                                <span className="text-[10px] text-emerald-500">오늘</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
