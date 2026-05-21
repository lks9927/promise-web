import React, { useState, useEffect, useMemo } from 'react';
import { Search, CheckCircle, Edit2, Save, X, ExternalLink, Users, FileText, RefreshCw, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── 순수 SVG 도넛 차트 ────────────────────────────────
function DonutChart({ data, size = 140, margin = 0 }) {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) return <div className="flex items-center justify-center" style={{ width: size, height: size }}><span className="text-gray-400 text-xs">데이터 없음</span></div>;

    const cx = size / 2, cy = size / 2, r = size * 0.35, strokeW = size * 0.18;
    const circumference = 2 * Math.PI * r;

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeW} />
                {data.filter(d => d.value > 0).map((d, i, arr) => {
                    const filtered = data.filter(x => x.value > 0);
                    const cum = filtered.slice(0, i).reduce((sum, item) => sum + (item.value / total), 0);
                    const pct = d.value / total;
                    const dash = pct * circumference;
                    const offset = cum * circumference;
                    return (
                        <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                            stroke={d.color} strokeWidth={strokeW}
                            strokeDasharray={`${dash} ${circumference - dash}`}
                            strokeDashoffset={-offset}
                            transform={`rotate(-90 ${cx} ${cy})`}
                            style={{ transition: 'all 0.8s ease' }}
                        />
                    );
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-sm font-black ${margin >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>{margin >= 0 ? '+' : ''}₩{(margin / 10000).toFixed(0)}만</span>
                <span className="text-[9px] text-gray-400 font-medium">마진</span>
            </div>
        </div>
    );
}

// ─── 입금/출금/마진 트리플 바 차트 ────────────────────
function TripleBarChart({ data }) {
    if (!data.length) return null;
    const allVals = data.flatMap(d => [d.income, d.expense, Math.abs(d.income - d.expense)]);
    const maxVal = Math.max(...allVals, 1);
    const chartH = 110;
    const barW = 16;
    const groupGap = 4;

    return (
        <div className="w-full h-full flex items-end justify-around px-2" style={{ minHeight: chartH + 30 }}>
            {data.map((d, i) => {
                const incH = (d.income / maxVal) * chartH;
                const expH = (d.expense / maxVal) * chartH;
                const margin = d.income - d.expense;
                const mrgH = (Math.abs(margin) / maxVal) * chartH;
                return (
                    <div key={i} className="flex flex-col items-center gap-1">
                        <div className="flex items-end gap-[3px]" style={{ height: chartH }}>
                            {/* 입금 */}
                            <div className="relative group">
                                <div className="rounded-t-sm transition-all duration-500" 
                                     style={{ width: barW, height: Math.max(incH, 2), backgroundColor: '#10b981', opacity: 0.85 }} />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                    입금 ₩{Math.floor(d.income).toLocaleString()}
                                </div>
                            </div>
                            {/* 출금 */}
                            <div className="relative group">
                                <div className="rounded-t-sm transition-all duration-500" 
                                     style={{ width: barW, height: Math.max(expH, 2), backgroundColor: '#f43f5e', opacity: 0.75 }} />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                    출금 ₩{Math.floor(d.expense).toLocaleString()}
                                </div>
                            </div>
                            {/* 마진 */}
                            <div className="relative group">
                                <div className="rounded-t-sm transition-all duration-500" 
                                     style={{ width: barW, height: Math.max(mrgH, 2), backgroundColor: margin >= 0 ? '#3b82f6' : '#ef4444', opacity: 0.9 }} />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                    마진 {margin >= 0 ? '+' : ''}₩{Math.floor(margin).toLocaleString()}
                                </div>
                            </div>
                        </div>
                        <span className="text-[11px] font-semibold text-gray-500">{d.label}</span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── 역할 배지 컴포넌트 ──────────────────────────────────
function RoleBadge({ role, grade, large = false }) {
    let key = role;
    if (role === 'leader' && (grade === 'Master' || grade === 'S' || grade === 'master')) {
        key = 'master_leader';
    }

    const config = {
        admin: { label: '본사', bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-400' },
        dealer: { label: '딜러', bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-400' },
        master: { label: '마스터', bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-400' },
        master_leader: { label: '마스터팀장', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
        leader: { label: '팀장', bg: 'bg-sky-100', text: 'text-sky-700', dot: 'bg-sky-400' },
        team_leader: { label: '팀장', bg: 'bg-sky-100', text: 'text-sky-700', dot: 'bg-sky-400' },
        none: { label: '안내', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
    };
    const c = config[key] || config.dealer;
    return (
        <span className={`inline-flex items-center whitespace-nowrap flex-shrink-0 ${c.bg} ${c.text} ${large ? 'gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold' : 'gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold'}`}>
            <span className={`flex-shrink-0 rounded-full ${c.dot} ${large ? 'w-2 h-2' : 'w-1.5 h-1.5'}`}></span>
            {c.label}
        </span>
    );
}

// ─── 진행 파이프라인 ─────────────────────────────────────
function ProgressPipeline({ status, caseStatus }) {
    const labels = ['정산예정', '입금대기', '지급대기', '완료'];
    
    let currentIdx = 0;
    if (status === 'draft') {
        currentIdx = 0; // 상담 완료 후 정산 레코드만 생성된 상태
    } else if (status === 'awaiting_payment') {
        currentIdx = 1; // 장례 종료, 팀장 입금 대기 중
    } else if (status === 'pending') {
        currentIdx = 2; // 팀장 입금 완료, 하위 수수료 지급 대기
    } else if (status === 'completed' || status === 'paid') {
        currentIdx = 3; // 모든 정산 완료
    }

    return (
        <div className="flex items-center gap-0 w-full px-1">
            {[0, 1, 2, 3].map((stepIdx) => (
                <React.Fragment key={stepIdx}>
                    <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full border-2 transition-all z-10 ${stepIdx <= currentIdx
                            ? stepIdx === currentIdx && currentIdx < 3
                                ? 'bg-amber-400 border-amber-400 animate-pulse'
                                : 'bg-indigo-500 border-indigo-500'
                            : 'bg-white border-gray-300'
                        }`} />
                        <span className={`text-[9px] mt-0.5 whitespace-nowrap ${stepIdx <= currentIdx ? 'text-indigo-700 font-bold' : 'text-gray-400 font-medium'}`}>{labels[stepIdx]}</span>
                    </div>
                    {stepIdx < 3 && (
                        <div className={`w-5 h-0.5 -mt-4 ${stepIdx < currentIdx ? 'bg-indigo-500' : 'bg-gray-200'}`} />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}


export default function SettlementManager() {
    const [settlements, setSettlements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [editAmount, setEditAmount] = useState(0);
    const [editMemo, setEditMemo] = useState('');
    const [pendingIncomes, setPendingIncomes] = useState([]);
    const [ocrModal, setOcrModal] = useState({ isOpen: false, item: null });
    const [expandedCase, setExpandedCase] = useState(null);
    const [selectedPeriod, setSelectedPeriod] = useState(null); // null = 전체 누적, { year, month } = 특정 월
    const [showTaxReport, setShowTaxReport] = useState(false);

    useEffect(() => {
        fetchSettlements();
        fetchPendingIncomes();
    }, []);

    const fetchPendingIncomes = async () => {
        try {
            const { data, error } = await supabase
                .from('funeral_cases')
                .select(`
                    id,
                    package_name,
                    additional_income_total,
                    team_leader_id,
                    profiles:team_leader_id (name, phone)
                `)
                .eq('status', 'completed')
                .eq('is_private', false)
                .gt('additional_income_total', 0)
                .eq('additional_income_settled', false);
            
            if (!error && data) {
                setPendingIncomes(data);
            }
        } catch (error) {
            console.error('Error fetching pending additional incomes', error);
        }
    };

    const fetchSettlements = async () => {
        try {
            setLoading(true);
            const { data: stData, error: stError } = await supabase
                .from('settlements')
                .select(`
                    *,
                    funeral_cases (
                        status,
                        is_private,
                        deceased_name,
                        package_name,
                        final_price,
                        location,
                        room_number,
                        coupon_code,
                        team_leader_id,
                        profiles!funeral_cases_customer_id_fkey (name, phone),
                        dealer:dealer_id (name)
                    ),
                    profiles:recipient_id (
                        name,
                        role,
                        phone,
                        partners:partners!partners_user_id_fkey(bank_account, grade)
                    )
                `)
                .order('created_at', { ascending: false });

            if (stError) throw stError;

            let allData = stData || [];
            allData = allData.filter(s => s.funeral_cases && !s.funeral_cases.is_private);
            allData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            setSettlements(allData);

        } catch (error) {
            console.error('Error fetching settlements:', error);
            alert('정산 데이터를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // ─── 기간 필터링 ─────────────────────────────────────
    const periodSettlements = useMemo(() => {
        if (!selectedPeriod) return settlements;
        const { year, month } = selectedPeriod;
        return settlements.filter(s => {
            const d = new Date(s.created_at);
            return d.getFullYear() === year && d.getMonth() === month;
        });
    }, [settlements, selectedPeriod]);

    const handlePrevMonth = () => {
        const base = selectedPeriod || { year: new Date().getFullYear(), month: new Date().getMonth() };
        const prev = base.month - 1;
        setSelectedPeriod({ year: prev < 0 ? base.year - 1 : base.year, month: prev < 0 ? 11 : prev });
    };
    const handleNextMonth = () => {
        const base = selectedPeriod || { year: new Date().getFullYear(), month: new Date().getMonth() };
        const next = base.month + 1;
        setSelectedPeriod({ year: next > 11 ? base.year + 1 : base.year, month: next > 11 ? 0 : next });
    };
    const getPeriodLabel = () => !selectedPeriod ? '전체 누적' : `${selectedPeriod.year}년 ${selectedPeriod.month + 1}월`;

    // ─── 차트 데이터 계산 ────────────────────────────────
    const chartData = useMemo(() => {
        // 도넛 차트: 입금완료/입금대기/출금완료/출금대기 금액 기반
        const incomeCompleted = periodSettlements
            .filter(s => s.type === 'usage_fee_remittance' && (s.status === 'paid' || s.status === 'completed'))
            .reduce((sum, s) => sum + Math.abs(s.amount || 0), 0);
        const incomePending = periodSettlements
            .filter(s => s.type === 'usage_fee_remittance' && (s.status === 'pending' || s.status === 'awaiting_payment' || s.status === 'draft'))
            .reduce((sum, s) => sum + Math.abs(s.amount || 0), 0);
        const expenseCompleted = periodSettlements
            .filter(s => s.type !== 'usage_fee_remittance' && (s.status === 'paid' || s.status === 'completed'))
            .reduce((sum, s) => sum + Math.abs(s.amount || 0), 0);
        const expensePending = periodSettlements
            .filter(s => s.type !== 'usage_fee_remittance' && (s.status === 'pending' || s.status === 'awaiting_payment' || s.status === 'draft'))
            .reduce((sum, s) => sum + Math.abs(s.amount || 0), 0);
        const donut = [
            { label: '입금완료', value: incomeCompleted, color: '#10b981' },
            { label: '입금대기', value: incomePending, color: '#6ee7b7' },
            { label: '출금완료', value: expenseCompleted, color: '#f43f5e' },
            { label: '출금대기', value: expensePending, color: '#fda4af' },
        ];

        // 바 차트: 이번달 데이터만 (일별 or 주별)
        const now = new Date();
        const targetY = selectedPeriod ? selectedPeriod.year : now.getFullYear();
        const targetM = selectedPeriod ? selectedPeriod.month : now.getMonth();
        
        // 해당 월의 주차별 데이터
        const monthSettlements = settlements.filter(s => {
            const sd = new Date(s.created_at);
            return sd.getFullYear() === targetY && sd.getMonth() === targetM;
        });

        const weeks = [];
        const firstDay = new Date(targetY, targetM, 1);
        const lastDay = new Date(targetY, targetM + 1, 0);
        
        // 주차별로 나누기 (최대 5주)
        for (let w = 0; w < 5; w++) {
            const weekStart = w * 7 + 1;
            const weekEnd = Math.min((w + 1) * 7, lastDay.getDate());
            if (weekStart > lastDay.getDate()) break;
            
            const weekData = monthSettlements.filter(s => {
                const day = new Date(s.created_at).getDate();
                return day >= weekStart && day <= weekEnd;
            });

            const income = weekData
                .filter(s => s.type === 'usage_fee_remittance')
                .reduce((sum, s) => sum + Math.abs(s.amount || 0), 0);
            const expense = weekData
                .filter(s => s.type !== 'usage_fee_remittance')
                .reduce((sum, s) => sum + Math.abs(s.amount || 0), 0);

            weeks.push({ label: `${w + 1}주`, income, expense });
        }

        const totalInc = incomeCompleted + incomePending;
        const totalExp = expenseCompleted + expensePending;
        return { donut, months: weeks, margin: totalInc - totalExp };
    }, [settlements, periodSettlements, selectedPeriod]);

    // ─── 통계 계산 ────────────────────────────────────────
    const stats = useMemo(() => {
        const totalIncome = periodSettlements
            .filter(s => s.type === 'usage_fee_remittance')
            .reduce((sum, s) => sum + Math.abs(s.amount || 0), 0);
        const totalExpense = periodSettlements
            .filter(s => s.type !== 'usage_fee_remittance')
            .reduce((sum, s) => sum + Math.abs(s.amount || 0), 0);
        const pendingAmount = periodSettlements
            .filter(s => s.status === 'pending' && s.type !== 'usage_fee_remittance')
            .reduce((sum, s) => sum + Math.abs(s.amount || 0), 0);
        const incomeWaiting = periodSettlements
            .filter(s => (s.status === 'pending' || s.status === 'awaiting_payment' || s.status === 'draft') && s.type === 'usage_fee_remittance')
            .reduce((sum, s) => sum + Math.abs(s.amount || 0), 0);

        // ── 세무 집계 ──
        // 부가세 (VAT): usage_fee_remittance의 tax_amount 합계
        const vatItems = periodSettlements.filter(s => s.tax_type === 'vat_10' || s.tax_type === 'vat');
        const totalVat = vatItems.reduce((sum, s) => sum + Math.abs(s.tax_amount || 0), 0);
        const vatBase = vatItems.reduce((sum, s) => sum + Math.abs(s.base_amount || 0), 0);
        const vatCount = vatItems.length;

        // 원천징수 3.3%: withholding의 tax_amount 합계
        const withholdingItems = periodSettlements.filter(s => s.tax_type === 'withholding_33' || s.tax_type === 'withholding');
        const totalWithholding = withholdingItems.reduce((sum, s) => sum + Math.abs(s.tax_amount || 0), 0);
        const withholdingBase = withholdingItems.reduce((sum, s) => sum + Math.abs(s.base_amount || 0), 0);
        const withholdingCount = withholdingItems.length;

        // 공급가 (수입에서 VAT 제외)
        const incomeSupply = totalIncome > 0 ? Math.floor(totalIncome / 1.1) : 0;
        // 순마진: 입금 - 출금 - 납부해야할 부가세 - 납부해야할 원천징수세
        const netMargin = totalIncome - totalExpense - totalVat - totalWithholding;
        // 건수
        const caseCount = new Set(periodSettlements.map(s => s.case_id)).size;
        
        return { 
            totalIncome, totalExpense, pendingAmount, incomeWaiting, 
            profit: totalIncome - totalExpense, 
            totalVat, vatBase, vatCount, 
            totalWithholding, withholdingBase, withholdingCount, 
            incomeSupply, netMargin, caseCount 
        };
    }, [periodSettlements]);

    const handleUpdateAmount = async (id) => {
        if (!confirm('금액을 수정하시겠습니까?')) return;

        try {
            const { error } = await supabase
                .from('settlements')
                .update({
                    amount: parseInt(editAmount),
                    admin_memo: editMemo
                })
                .eq('id', id);

            if (error) throw error;

            alert('수정되었습니다.');
            setEditingId(null);
            fetchSettlements();
        } catch (error) {
            console.error('Update error:', error);
            alert('수정 실패: ' + error.message);
        }
    };

    const handleStatusChange = async (id, newStatus) => {
        // 해당 정산 건 찾기
        const targetItem = settlements.find(s => s.id === id);
        
        // ═══ 입금 확인 (usage_fee_remittance → paid) ═══
        if (targetItem?.type === 'usage_fee_remittance' && newStatus === 'paid') {
            const caseId = targetItem.case_id;
            
            const confirmMsg = `팀장 사용료 ₩${Math.floor(targetItem.amount).toLocaleString()} 입금을 확인하시겠습니까?`;
            
            if (!confirm(confirmMsg)) return;

            try {
                // 1. 사용료 입금 확인 (paid 처리)
                const { error: mainErr } = await supabase
                    .from('settlements')
                    .update({ status: 'paid' })
                    .eq('id', id);
                if (mainErr) throw mainErr;

                // 2. 같은 케이스의 나머지 정산건을 pending(지급대기)으로 전환
                const { error: otherErr } = await supabase
                    .from('settlements')
                    .update({ status: 'pending' })
                    .eq('case_id', caseId)
                    .eq('status', 'awaiting_payment')
                    .neq('type', 'usage_fee_remittance');
                if (otherErr) console.warn('하위 정산 전환 실패:', otherErr);

                // 3. 장례 케이스도 hq_check 처리
                const { error: caseErr } = await supabase
                    .from('funeral_cases')
                    .update({ status: 'hq_check' })
                    .eq('id', caseId);
                if (caseErr) console.warn('케이스 상태 변경 실패:', caseErr);

                alert(`✅ 입금 확인 완료!\n딜러·마스터 수수료가 '지급대기' 상태로 전환되었습니다.\n각각 '송금' 버튼을 눌러 개별 처리해주세요.`);
                fetchSettlements();
            } catch (error) {
                console.error('Update error:', error);
                alert('처리 중 오류: ' + error.message);
            }
            return;
        }

        // ═══ 일반 상태 변경 ═══
        if (!confirm(`상태를 '${newStatus === 'paid' ? '송금완료' : newStatus}'(으)로 변경하시겠습니까?`)) return;

        try {
            const { error } = await supabase
                .from('settlements')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;

            // 같은 case_id의 모든 정산이 paid면 → 케이스도 완료 처리
            if (newStatus === 'paid') {
                const caseId = targetItem?.case_id;
                if (caseId) {
                    const siblings = settlements.filter(s => s.case_id === caseId && s.id !== id);
                    const allDone = siblings.every(s => s.status === 'paid');
                    if (allDone) {
                        await supabase.from('funeral_cases').update({ status: 'completed' }).eq('id', caseId);
                    }
                }
            }

            fetchSettlements();
        } catch (error) {
            console.error('Status update error:', error);
            alert('상태 변경 실패');
        }
    };

    // ═══ 건 전체 취소 ═══
    const handleCancelCase = async (caseId) => {
        const caseItems = settlements.filter(s => s.case_id === caseId);
        const totalAmount = caseItems.reduce((s, i) => s + Math.abs(i.amount || 0), 0);
        
        if (!confirm(
            `⚠️ [정산 전체 되돌리기]\n\n` +
            `접수번호: ${caseId.substring(0, 8)}\n` +
            `정산 ${caseItems.length}건 (총 ₩${totalAmount.toLocaleString()})\n\n` +
            `모든 정산을 대기 상태로 되돌리시겠습니까?`
        )) return;

        try {
            // 모든 관련 정산을 pending(대기)으로 되돌림
            const { error } = await supabase
                .from('settlements')
                .update({ status: 'pending', admin_memo: `[일괄되돌리기] ${new Date().toLocaleDateString()}` })
                .eq('case_id', caseId);
            
            if (error) throw error;

            // 케이스 상태도 in_progress로 되돌림
            await supabase
                .from('funeral_cases')
                .update({ status: 'in_progress' })
                .eq('id', caseId);

            alert(`✅ ${caseItems.length}건의 정산이 대기 상태로 되돌려졌습니다.`);
            fetchSettlements();
        } catch (error) {
            console.error('Cancel error:', error);
            alert('취소 처리 실패: ' + error.message);
        }
    };

    const handleSettleAdditionalIncome = async (caseItem) => {
        const rateStr = prompt(`[부가수입 정산]\n총 수입: ₩${caseItem.additional_income_total.toLocaleString()}\n\n본사에 배분할 비율을 입력하세요 (ex: 50 = 50%):`, "50");
        if (!rateStr) return;
        
        const rate = parseInt(rateStr);
        if (isNaN(rate) || rate < 0 || rate > 100) {
            alert('올바른 비율을 입력해주세요 (0~100)');
            return;
        }

        const hqAmount = Math.floor(caseItem.additional_income_total * (rate / 100));
        const leaderAmount = caseItem.additional_income_total - hqAmount;

        if (!confirm(`배분 비율: 본사 ${rate}% (${hqAmount}원) / 팀장 ${100-rate}% (${leaderAmount}원)\n\n정산을 확정하시겠습니까?`)) return;

        try {
            const { error: insertError } = await supabase
                .from('settlements')
                .insert([{
                    case_id: caseItem.id,
                    recipient_id: caseItem.team_leader_id,
                    type: 'additional_income',
                    status: 'pending',
                    amount: leaderAmount,
                    base_amount: leaderAmount,
                    net_amount: leaderAmount,
                    tax_type: 'none',
                    tax_amount: 0,
                    admin_memo: `총 부가수입: ${caseItem.additional_income_total} / 본사비율: ${rate}%`
                }]);
            
            if (insertError) throw insertError;

            const { error: updateError } = await supabase
                .from('funeral_cases')
                .update({ additional_income_settled: true, additional_income_rate: rate })
                .eq('id', caseItem.id);
            
            if (updateError) throw updateError;

            alert('부가수입 정산 처리가 완료되었습니다.');
            fetchPendingIncomes();
            fetchSettlements();
        } catch (error) {
            console.error('Error settling additional income', error);
            alert('처리 중 오류가 발생했습니다.');
        }
    };

    // Filter Logic
    const filteredSettlements = periodSettlements.filter(item => {
        let matchesStatus = true;
        if (filterStatus === 'pending') {
            matchesStatus = item.status === 'pending' || item.status === 'awaiting_payment' || item.status === 'draft';
        } else if (filterStatus === 'completed') {
            matchesStatus = item.status === 'paid' || item.status === 'completed';
        }

        const matchesSearch = !searchTerm ||
            item.profiles?.name?.includes(searchTerm) ||
            item.funeral_cases?.package_name?.includes(searchTerm) ||
            item.case_id?.includes(searchTerm);
        return matchesStatus && matchesSearch;
    });

    const getTypeLabel = (type) => {
        const map = {
            'dealer_commission': '딜러 수수료',
            'team_leader_commission': '팀장 수수료',
            'dealer_override': '관리수수료',
            'leader_override': '관리수수료',
            'usage_fee_remittance': '본사 입금(사용료)',
            'additional_income': '부가수입 분배금',
            'customer_cashback': '상주 캐시백',
            'refund': '환불',
            'progress_only': '정산대기(진행중)'
        };
        return map[type] || type;
    };

    const getTaxLabel = (taxType) => {
        const map = {
            'exempt': '면세',
            'vat': '부가세 10%',
            'withholding': '원천징수 3.3%',
            'none': '-',
        };
        return map[taxType] || '-';
    };

    return (
        <div className="space-y-6">
            {/* ═══════ 기간 선택 바 ═══════ */}
            <div className="bg-white rounded-2xl px-5 py-3 shadow-sm border border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    <span className="text-sm font-bold text-gray-700">조회 기간</span>
                    <span className="text-xs text-gray-400 ml-1">{getPeriodLabel()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setSelectedPeriod(null)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            !selectedPeriod ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                    >전체 누적</button>
                    <div className="w-px h-5 bg-gray-200 mx-1" />
                    <button onClick={handlePrevMonth}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className={`text-sm font-bold min-w-[100px] text-center ${selectedPeriod ? 'text-indigo-700' : 'text-gray-400'}`}>
                        {selectedPeriod ? `${selectedPeriod.year}년 ${selectedPeriod.month + 1}월` : '전체'}
                    </span>
                    <button onClick={handleNextMonth}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-gray-200 mx-1" />
                    <button
                        onClick={() => { const n = new Date(); setSelectedPeriod({ year: n.getFullYear(), month: n.getMonth() }); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            selectedPeriod?.year === new Date().getFullYear() && selectedPeriod?.month === new Date().getMonth()
                                ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                    >이번 달</button>
                    <button
                        onClick={() => { const n = new Date(); const p = n.getMonth()-1; setSelectedPeriod({ year: p<0?n.getFullYear()-1:n.getFullYear(), month: p<0?11:p }); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            (() => { const n=new Date(); const p=n.getMonth()-1; const y=p<0?n.getFullYear()-1:n.getFullYear(); const m=p<0?11:p; return selectedPeriod?.year===y&&selectedPeriod?.month===m; })()
                                ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                    >지난 달</button>
                </div>
            </div>

            {/* ═══════ 상단 통합 영역: 도넛 + 스탯 + 차트 (1줄 컴팩트) ═══════ */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-stretch">
                    {/* 왼쪽: 도넛 차트 + 범례 */}
                    <div className="flex-shrink-0 p-4 border-r border-gray-100 flex flex-col items-center justify-center gap-2" style={{ width: 220 }}>
                        <DonutChart data={chartData.donut} size={120} margin={chartData.margin} />
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            {chartData.donut.map((d, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></span>
                                    <span className="text-[10px] text-gray-500 whitespace-nowrap">{d.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 중앙: 핵심 금액 4개 (2x2) */}
                    <div className="grid grid-cols-2 gap-0 flex-shrink-0" style={{ width: 360 }}>
                        {/* 입금 */}
                        <div className="px-4 py-3 border-r border-b border-gray-100">
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                <span className="text-[11px] font-semibold text-gray-400">입금</span>
                            </div>
                            <p className="text-lg font-black text-gray-900">₩{Math.floor(stats.totalIncome).toLocaleString()}</p>
                            {stats.incomeWaiting > 0 && (
                                <span className="text-[10px] text-emerald-500 font-medium">대기 ₩{Math.floor(stats.incomeWaiting).toLocaleString()}</span>
                            )}
                        </div>
                        {/* 출금 */}
                        <div className="px-4 py-3 border-b border-gray-100">
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                <span className="text-[11px] font-semibold text-gray-400">출금</span>
                            </div>
                            <p className="text-lg font-black text-gray-900">₩{Math.floor(stats.totalExpense).toLocaleString()}</p>
                            {stats.pendingAmount > 0 && (
                                <span className="text-[10px] text-rose-400 font-medium">대기 ₩{Math.floor(stats.pendingAmount).toLocaleString()}</span>
                            )}
                        </div>
                        {/* 지급대기 */}
                        <div className="px-4 py-3 border-r border-gray-100">
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                <span className="text-[11px] font-semibold text-gray-400">지급대기</span>
                            </div>
                            <p className="text-lg font-black text-amber-600">₩{Math.floor(stats.pendingAmount).toLocaleString()}</p>
                            <span className="text-[10px] text-gray-400">{periodSettlements.filter(s => s.status === 'pending' && s.type !== 'usage_fee_remittance').length}건</span>
                        </div>
                        {/* 마진 */}
                        <div className={`px-4 py-3 ${stats.profit >= 0 ? 'bg-gradient-to-br from-blue-50/40 to-indigo-50/40' : 'bg-gradient-to-br from-rose-50/40 to-red-50/40'}`}>
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                <span className="text-[11px] font-semibold text-gray-500">마진</span>
                            </div>
                            <p className={`text-lg font-black ${stats.profit >= 0 ? 'text-blue-700' : 'text-rose-700'}`}>
                                {stats.profit >= 0 ? '+' : ''}₩{Math.floor(stats.profit).toLocaleString()}
                            </p>
                            <span className="text-[10px] text-gray-400">입금 - 출금</span>
                        </div>
                    </div>

                    {/* 오른쪽: 주간 차트 */}
                    <div className="flex-1 p-4 flex flex-col min-w-0">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-bold text-gray-600 flex items-center gap-1.5">
                                {selectedPeriod ? `${selectedPeriod.month + 1}월` : `${new Date().getMonth() + 1}월`} 주간 추이
                            </h3>
                            <div className="flex items-center gap-3 text-[10px]">
                                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-full bg-emerald-500"></span>입금</span>
                                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-full bg-rose-400"></span>출금</span>
                                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-full bg-blue-500"></span>마진</span>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0">
                            <TripleBarChart data={chartData.months} />
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════ 세무 요약 ═══════ */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl shadow-lg p-5 text-white">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-300" />
                        📊 세무 요약 <span className="text-xs text-slate-400 font-normal ml-1">{getPeriodLabel()}</span>
                    </h3>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{stats.caseCount}건 기준</span>
                        <button onClick={() => setShowTaxReport(true)} className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-lg transition-colors shadow-sm">
                            신고 내역 상세 보기
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* 총 수수료 수입 */}
                    <div className="bg-white/10 rounded-xl p-3">
                        <div className="text-[10px] text-slate-400 mb-1">총 장례수수료 (포함가)</div>
                        <div className="text-lg font-black">₩{Math.floor(stats.totalIncome).toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                            <div>공급가: ₩{Math.floor(stats.incomeSupply).toLocaleString()}</div>
                        </div>
                    </div>
                    {/* 부가세 */}
                    <div className="bg-blue-500/20 rounded-xl p-3 border border-blue-400/20">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[10px] text-blue-300">부가세 (VAT 10%)</div>
                            <div className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-200">{stats.vatCount}건</div>
                        </div>
                        <div className="text-lg font-black text-blue-300">₩{Math.floor(stats.totalVat).toLocaleString()}</div>
                        <div className="text-[10px] text-blue-400/70 mt-1 flex justify-between border-t border-blue-400/20 pt-1">
                            <span>과세 대상 수입:</span>
                            <span>₩{Math.floor(stats.vatBase).toLocaleString()}</span>
                        </div>
                    </div>
                    {/* 원천징수 */}
                    <div className="bg-amber-500/20 rounded-xl p-3 border border-amber-400/20">
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-[10px] text-amber-300">원천징수 (3.3%)</div>
                            <div className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200">{stats.withholdingCount}건</div>
                        </div>
                        <div className="text-lg font-black text-amber-300">₩{Math.floor(stats.totalWithholding).toLocaleString()}</div>
                        <div className="text-[10px] text-amber-400/70 mt-1 flex justify-between border-t border-amber-400/20 pt-1">
                            <span>과세 대상 지출:</span>
                            <span>₩{Math.floor(stats.withholdingBase).toLocaleString()}</span>
                        </div>
                    </div>
                    {/* 순 마진 */}
                    <div className={`rounded-xl p-3 border ${stats.netMargin >= 0 ? 'bg-emerald-500/20 border-emerald-400/20' : 'bg-red-500/20 border-red-400/20'}`}>
                        <div className={`text-[10px] mb-1 ${stats.netMargin >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>순 마진 (실제 이익)</div>
                        <div className={`text-lg font-black ${stats.netMargin >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                            {stats.netMargin >= 0 ? '+' : ''}₩{Math.floor(stats.netMargin).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 flex justify-between border-t border-slate-500/30 pt-1">
                            <span>마진 ₩{Math.floor(stats.totalIncome - stats.totalExpense).toLocaleString()}</span>
                            <span className="text-red-300">- 세금 ₩{Math.floor(stats.totalVat + stats.totalWithholding).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════ 정산 목록 ═══════ */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* 헤더 + 필터 */}
                <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="flex items-center gap-3">
                        <h3 className="text-sm font-bold text-gray-700">정산 목록</h3>
                        <div className="flex gap-1">
                            {['all', 'pending', 'completed'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setFilterStatus(status)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterStatus === status
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                    }`}
                                >
                                    {status === 'all' ? '전체' : status === 'pending' ? '대기' : '완료'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative w-48">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 w-3.5 h-3.5" />
                            <input
                                type="text"
                                placeholder="이름 또는 상품명 검색"
                                className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border-0 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <button onClick={fetchSettlements} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="새로고침">
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>


                {/* 미정산 부가수입 */}
                {pendingIncomes.length > 0 && (
                    <div className="px-6 py-3 bg-amber-50/50 border-b border-amber-200">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-amber-800">💰 부가수입 정산 대기건</span>
                            <span className="bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">{pendingIncomes.length}</span>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-1">
                            {pendingIncomes.map(pcase => (
                                <div key={pcase.id} className="flex-shrink-0 bg-white px-3 py-2 rounded-lg border border-amber-100 flex items-center gap-3">
                                    <div>
                                        <div className="text-[10px] text-gray-500">{pcase.package_name || '(상품없음)'}</div>
                                        <div className="text-xs font-bold text-gray-900">₩{pcase.additional_income_total.toLocaleString()}</div>
                                    </div>
                                    <button onClick={() => handleSettleAdditionalIncome(pcase)}
                                        className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold px-2 py-1 rounded transition-colors">
                                        정산 확정
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 그룹화된 정산 목록 */}
                <div className="overflow-y-auto max-h-[55vh]">
                    {loading ? (
                        <div className="flex flex-col items-center gap-2 py-16">
                            <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                            <span className="text-sm text-gray-400">로딩 중...</span>
                        </div>
                    ) : filteredSettlements.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-16">
                            <FileText className="w-6 h-6 text-gray-300" />
                            <span className="text-sm text-gray-400">내역이 없습니다</span>
                        </div>
                    ) : (
                        (() => {
                            // 접수번호(case_id) 기준으로 그룹핑
                            const grouped = {};
                            filteredSettlements.forEach(item => {
                                const key = item.case_id || 'unknown';
                                if (!grouped[key]) grouped[key] = [];
                                grouped[key].push(item);
                            });

                            return (
                                <div className="w-full">
                                    {/* 테이블 헤더 */}
                                    <div className="flex items-center gap-4 px-5 py-3 bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-700 sticky top-0 z-10 shadow-sm">
                                        <div className="w-5 flex-shrink-0"></div>
                                        <div className="w-24 flex-shrink-0">등록번호/날짜</div>
                                        <div className="w-24 flex-shrink-0">상주/고인</div>
                                        <div className="w-36 flex-shrink-0">장례식장/호실</div>
                                        <div className="flex-1 min-w-0">상품/가격</div>
                                        <div className="w-24 flex-shrink-0 text-center">진행인원</div>
                                        <div className="w-[300px] flex-shrink-0 text-center">
                                            <span className="inline-flex items-center gap-2">
                                                정산(<span className="inline-flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>입</span>/<span className="inline-flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>출</span>/<span className="inline-flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>마진</span>)
                                            </span>
                                        </div>
                                        <div className="w-32 flex-shrink-0 text-center">상태</div>
                                    </div>
                                    {Object.entries(grouped).map(([caseId, items]) => {
                                const totalIncome = items.filter(i => i.type === 'usage_fee_remittance').reduce((s, i) => s + Math.abs(i.net_amount || i.amount || 0), 0);
                                const totalExpense = items.filter(i => i.type !== 'usage_fee_remittance').reduce((s, i) => s + Math.abs(i.net_amount || i.amount || 0), 0);
                                const allDone = items.every(i => i.status === 'completed' || i.status === 'paid');
                                const hasPending = items.some(i => i.status === 'pending' || i.status === 'awaiting_payment');
                                const fcInfo = items[0]?.funeral_cases;
                                const packageName = fcInfo?.package_name || '';
                                const createdAt = items[0]?.created_at;

                                return (
                                    <div key={caseId} className="border-b border-gray-100 last:border-b-0">
                                        {/* 케이스 요약 헤더 - 클릭으로 토글 */}
                                        <button
                                            onClick={() => setExpandedCase(expandedCase === caseId ? null : caseId)}
                                            className="w-full px-5 py-4 flex items-center gap-4 hover:bg-indigo-50/30 transition-colors text-left"
                                        >
                                            {/* 펼침 아이콘 */}
                                            <div className={`w-5 h-5 rounded flex items-center justify-center transition-transform ${expandedCase === caseId ? 'rotate-90' : ''}`}>
                                                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                            </div>

                                            {/* 접수번호 */}
                                            <div className="w-24 flex-shrink-0 text-left">
                                                <div className="font-mono text-[12px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded w-fit">{caseId.substring(0, 8)}</div>
                                                {createdAt && <div className="text-[12px] text-gray-500 font-medium mt-1">{new Date(createdAt).toLocaleDateString()}</div>}
                                            </div>

                                            {/* 상주/고인 */}
                                            <div className="w-24 flex-shrink-0 flex flex-col justify-center text-left">
                                                <span className="text-[12px] font-bold text-gray-800" title={`상주: ${fcInfo?.profiles?.name || '정보없음'}`}>상주: {fcInfo?.profiles?.name || '정보없음'}</span>
                                                <span className="text-[12px] text-gray-500 mt-0.5" title={`고인: ${fcInfo?.deceased_name || '미상'}`}>고인: {fcInfo?.deceased_name || '미상'}</span>
                                            </div>

                                            {/* 장례식장/호실 */}
                                            <div className="w-36 flex-shrink-0 flex flex-col justify-center text-left">
                                                <span className="text-[12px] font-bold text-gray-800 truncate" title={fcInfo?.location || '미등록'}>{fcInfo?.location || '미등록'}</span>
                                                <span className="text-[12px] text-gray-500 mt-0.5">{fcInfo?.room_number ? `${fcInfo.room_number}호실` : '호실 미지정'}</span>
                                            </div>

                                            {/* 상품명/가격 */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
                                                <span className="text-[12px] font-bold text-gray-800 truncate" title={packageName || '미지정'}>{packageName || '미지정'}</span>
                                                <span className="text-[12px] text-gray-500 mt-0.5">{fcInfo?.final_price ? `₩${fcInfo.final_price.toLocaleString()}` : '가격 미정'}</span>
                                            </div>

                                            {/* 진행인원 */}
                                            <div className="w-24 flex-shrink-0 flex flex-col justify-center items-center text-center">
                                                <span className="text-[12px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full mb-1">
                                                    총 {items.length}명 참여
                                                </span>
                                                {fcInfo?.coupon_code && (
                                                    <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-bold" title={`쿠폰: ${fcInfo.coupon_code} / 딜러: ${fcInfo.dealer?.name || '?'}`}>
                                                        🎟 {fcInfo.coupon_code}
                                                    </span>
                                                )}
                                            </div>

                                            {/* 정산 요약 (입금/출금/마진) 가로 배열 - 차트 색상 일관성 */}
                                            <div className="w-[300px] flex-shrink-0 flex items-center justify-center gap-3 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                                                <div className="flex items-center gap-1.5 flex-1 justify-center">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
                                                    <span className="text-[11px] text-gray-500">입금</span>
                                                    <span className="text-[12px] font-bold text-emerald-600">₩{Math.floor(totalIncome).toLocaleString()}</span>
                                                </div>
                                                <div className="w-px h-3 bg-gray-200"></div>
                                                <div className="flex items-center gap-1.5 flex-1 justify-center">
                                                    <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0"></span>
                                                    <span className="text-[11px] text-gray-500">출금</span>
                                                    <span className="text-[12px] font-bold text-rose-600">₩{Math.floor(totalExpense).toLocaleString()}</span>
                                                </div>
                                                <div className="w-px h-3 bg-gray-200"></div>
                                                <div className="flex items-center gap-1.5 flex-1 justify-center">
                                                    <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span>
                                                    <span className="text-[11px] text-gray-600 font-bold">마진</span>
                                                    <span className="text-[12px] font-black text-blue-600">₩{Math.floor(totalIncome - totalExpense).toLocaleString()}</span>
                                                </div>
                                            </div>

                                            {/* 전체 상태 & 관리 */}
                                            <div className="w-32 flex-shrink-0 flex flex-col items-center justify-center gap-1.5">
                                                {allDone ? (
                                                    <span className="px-2.5 py-1 rounded-full text-[12px] font-bold bg-emerald-100 text-emerald-700 w-full text-center">완료됨</span>
                                                ) : hasPending ? (
                                                    <span className="px-2.5 py-1 rounded-full text-[12px] font-bold bg-amber-100 text-amber-700 animate-pulse w-full text-center">
                                                        {items.some(i => i.status === 'draft') ? '정산예정' : 
                                                         items.some(i => i.status === 'awaiting_payment') ? '입금대기' :
                                                         `${items.filter(i => i.status === 'pending').length}건 대기`}
                                                    </span>
                                                ) : (
                                                    <span className="px-2.5 py-1 rounded-full text-[12px] font-bold bg-blue-100 text-blue-700 w-full text-center">처리중</span>
                                                )}
                                                
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleCancelCase(caseId); }}
                                                    className="w-full px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 rounded text-[12px] font-bold transition-colors"
                                                >
                                                    일괄취소
                                                </button>
                                            </div>
                                        </button>

                                        {/* 펼쳐진 상세 내역 */}
                                        {expandedCase === caseId && (
                                            <div className="bg-gray-50/70 px-5 pb-4">
                                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                                    {items.map((item, idx) => (
                                                        <div key={item.id} className={`flex items-center gap-4 px-4 py-3 ${idx < items.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-indigo-50/20 transition-colors`}>
                                                            {/* 대상자 */}
                                                            <div className="w-56 flex-shrink-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-base font-bold text-gray-900 leading-none">{item.profiles?.name}</span>
                                                                    {item.type === 'customer_cashback' ? (
                                                                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">상주</span>
                                                                    ) : (
                                                                        <RoleBadge role={item.profiles?.role} grade={item.profiles?.partners?.grade} large={true} />
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* 구분 */}
                                                            <div className="w-32 flex-shrink-0">
                                                                <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                                                                    item.type.includes('remittance') ? 'bg-blue-50 text-blue-700' : 
                                                                    item.type === 'progress_only' ? 'bg-gray-100 text-gray-500' : 'bg-orange-50 text-orange-700'
                                                                }`}>
                                                                    {getTypeLabel(item.type)}
                                                                </span>
                                                            </div>

                                                            {/* 금액 */}
                                                            <div className="flex-1">
                                                                {editingId === item.id ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <input type="number" className="w-28 border border-indigo-300 rounded px-2 py-1 text-right text-xs font-bold"
                                                                            value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                                                                        <input type="text" className="w-28 border border-gray-200 rounded px-2 py-1 text-[10px]"
                                                                            placeholder="변경 사유" value={editMemo} onChange={(e) => setEditMemo(e.target.value)} />
                                                                    </div>
                                                                ) : (
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`text-sm font-black ${item.type === 'usage_fee_remittance' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                                {item.type === 'usage_fee_remittance' ? '+' : '-'}₩{Math.floor(item.net_amount || item.amount || 0).toLocaleString()}
                                                                            </span>
                                                                            {item.tax_type && item.tax_type !== 'none' && (
                                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1 ${
                                                                                    item.tax_type === 'exempt' ? 'bg-gray-100 text-gray-500' :
                                                                                    item.tax_type === 'vat' ? 'bg-blue-50 text-blue-600' :
                                                                                    'bg-amber-50 text-amber-600'
                                                                                }`}>
                                                                                    {getTaxLabel(item.tax_type)}
                                                                                    {item.tax_type !== 'exempt' && (
                                                                                        <span className="opacity-70 font-medium">| ₩{Math.floor(item.tax_amount || 0).toLocaleString()}</span>
                                                                                    )}
                                                                                </span>
                                                                            )}
                                                                            {item.admin_memo && <span className="text-[9px] text-gray-400">📝 {item.admin_memo}</span>}
                                                                        </div>
                                                                )}
                                                            </div>

                                                            {/* 진행 */}
                                                            <div className="w-36 flex-shrink-0">
                                                                <ProgressPipeline status={item.status} caseStatus={item.funeral_cases?.status} />
                                                            </div>

                                                            {/* 관리 버튼 */}
                                                            <div className="w-24 flex-shrink-0 flex justify-end gap-1">
                                                                {editingId === item.id ? (
                                                                    <>
                                                                        <button onClick={() => handleUpdateAmount(item.id)} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Save className="w-3 h-3" /></button>
                                                                        <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-100 text-gray-500 rounded-lg hover:bg-gray-200"><X className="w-3 h-3" /></button>
                                                                    </>
                                                                    ) : item.type === 'progress_only' ? (
                                                                        <span className="text-[10px] text-gray-400">장례종료 대기</span>
                                                                    ) : item.status === 'draft' ? (
                                                                        <span className="text-[10px] text-purple-500 font-bold">정산 예정</span>
                                                                    ) : item.status === 'awaiting_payment' ? (
                                                                        (() => {
                                                                            const isUsageFee = item.type === 'usage_fee_remittance';
                                                                            return isUsageFee ? (
                                                                                <button onClick={() => handleStatusChange(item.id, 'paid')}
                                                                                    className="px-2 py-1 text-[10px] text-white rounded-lg font-bold bg-blue-600 hover:bg-blue-700">
                                                                                    입금확인
                                                                                </button>
                                                                            ) : (
                                                                                <span className="text-[10px] text-amber-600 font-bold">입금대기</span>
                                                                            );
                                                                        })()
                                                                    ) : item.status === 'pending' ? (
                                                                        (() => {
                                                                            const isFuneralEnded = ['completed', 'hq_check', 'team_settling', 'cancelled'].includes(item.funeral_cases?.status);
                                                                            return (
                                                                        <>
                                                                            <button onClick={() => { setEditingId(item.id); setEditAmount(item.amount); setEditMemo(item.admin_memo || ''); }}
                                                                                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="수정">
                                                                                <Edit2 className="w-3 h-3" />
                                                                            </button>
                                                                            {item.type === 'usage_fee_remittance' ? (
                                                                                <button onClick={() => handleStatusChange(item.id, 'paid')}
                                                                                    disabled={!isFuneralEnded}
                                                                                    className={`px-2 py-1 text-[10px] text-white rounded-lg font-bold ${isFuneralEnded ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}
                                                                                    title={isFuneralEnded ? '' : '장례가 종료된 후 입금확인이 가능합니다'}>
                                                                                    입금확인
                                                                                </button>
                                                                            ) : (
                                                                                <button onClick={() => setOcrModal({ isOpen: true, item })}
                                                                                    disabled={!isFuneralEnded}
                                                                                    className={`px-2 py-1 text-[10px] text-white rounded-lg font-bold ${isFuneralEnded ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-400 cursor-not-allowed'}`}
                                                                                    title={isFuneralEnded ? '' : '장례가 종료된 후 송금이 가능합니다'}>
                                                                                    송금
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                        );
                                                                        })()
                                                                    ) : (
                                                                    <span className="text-[10px] text-gray-400">처리완료</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                            );
                        })()
                    )}
                </div>

                {/* 하단 요약 */}
                <div className="px-6 py-3 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-xs text-gray-400">
                        총 {(() => { const g = {}; filteredSettlements.forEach(i => { g[i.case_id||'x']=1; }); return Object.keys(g).length; })()}건 (정산 {filteredSettlements.length}항목)
                    </span>
                    <button onClick={fetchSettlements} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> 새로고침
                    </button>
                </div>
            </div>

            {/* ═══════ 송금용 OCR 스캔 창 ═══════ */}
            {ocrModal.isOpen && ocrModal.item && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl overflow-hidden w-[400px] max-w-[90vw] animate-slideUp relative">
                        <button 
                            onClick={() => setOcrModal({ isOpen: false, item: null })}
                            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        
                        <div className="p-8 text-center border-b border-gray-100">
                            <h3 className="text-sm font-bold text-gray-500 mb-6 tracking-wide">토스 앱 카메라로 스캔하세요 📸</h3>
                            <div className="font-sans">
                                {(() => {
                                    const raw = ocrModal.item.profiles?.partners?.bank_account || '';
                                    const parts = raw.split(' ').filter(Boolean);
                                    let bank = '은행명 없음';
                                    let account = raw || '계좌번호 없음';
                                    let name = ocrModal.item.profiles?.name || '이름 없음';
                                    
                                    if (parts.length >= 3) {
                                        bank = parts[0];
                                        name = parts[parts.length - 1];
                                        account = parts.slice(1, parts.length - 1).join(' ');
                                    } else if (parts.length === 2) {
                                        bank = parts[0];
                                        account = parts[1];
                                    } else if (parts.length === 1 && parts[0]) {
                                        account = parts[0];
                                    }

                                    const BANK_MAP = {
                                        '004': 'KB국민은행', '088': '신한은행', '020': '우리은행', '081': '하나은행',
                                        '011': 'NH농협은행', '003': 'IBK기업은행', '090': '카카오뱅크', '089': '케이뱅크',
                                        '092': '토스뱅크', '002': 'KDB산업은행', '007': '수협은행', '023': 'SC제일은행',
                                        '027': '한국씨티은행', '031': '대구은행', '032': '부산은행', '034': '광주은행',
                                        '035': '제주은행', '037': '전북은행', '039': '경남은행', '045': '새마을금고',
                                        '048': '신협', '050': '저축은행', '071': '우체국', '012': '단위농협',
                                        '064': '산림조합', '062': '중국공상은행', '054': 'HSBC'
                                    };
                                    
                                    if (BANK_MAP[bank]) {
                                        bank = BANK_MAP[bank];
                                    }

                                    return (
                                        <div className="flex flex-col gap-3">
                                            <div className="text-xl font-bold text-gray-500">
                                                {bank}
                                            </div>
                                            <div className="text-3xl font-extrabold text-gray-900 tracking-tight">
                                                {account}
                                            </div>
                                            <div className="text-2xl font-bold text-gray-700 mb-4">
                                                {name}
                                            </div>
                                            <div className="text-[40px] font-black text-indigo-600 tracking-tighter">
                                                {Math.floor(ocrModal.item.net_amount || ocrModal.item.amount).toLocaleString()}원
                                            </div>
                                        </div>
                                    );
                                })()}
                                {ocrModal.item.tax_type && ocrModal.item.tax_type !== 'none' && ocrModal.item.tax_type !== 'exempt' && (
                                    <div className="text-xs text-gray-400 mt-1">
                                        기본 {Math.floor(ocrModal.item.base_amount || ocrModal.item.amount).toLocaleString()}원
                                        {ocrModal.item.tax_type === 'vat' ? ` + 부가세 ${Math.floor(ocrModal.item.tax_amount || 0).toLocaleString()}원` : ` - 원천징수 ${Math.floor(ocrModal.item.tax_amount || 0).toLocaleString()}원`}
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        <div className="p-4 bg-gray-50/50 flex flex-col gap-3">
                            <button
                                onClick={() => {
                                    const textForToss = `${ocrModal.item.profiles?.partners?.bank_account || ''} ${Math.floor(ocrModal.item.net_amount || ocrModal.item.amount)}원`;
                                    navigator.clipboard.writeText(textForToss);
                                    alert('계좌번호와 금액이 복사되었습니다.\n모바일 접속 시 폰에서 토스를 열면 자동 인식됩니다!');
                                }}
                                className="w-full py-4 bg-white border-2 border-indigo-100 text-indigo-600 font-bold rounded-2xl hover:bg-indigo-50 hover:border-indigo-200 transition-colors flex items-center justify-center gap-2"
                            >
                                <ExternalLink className="w-4 h-4" /> 정보 텍스트로 싹 복사하기 (모바일용)
                            </button>
                            <button
                                onClick={() => {
                                    handleStatusChange(ocrModal.item.id, 'paid');
                                    setOcrModal({ isOpen: false, item: null });
                                }}
                                className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-md mt-2"
                            >
                                ✨ 직접 송금 완료 및 닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ═══════ 세금 신고 내역 모달 ═══════ */}
            {showTaxReport && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-slideUp">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-500" />
                                {getPeriodLabel()} 세금 신고 상세 내역
                            </h3>
                            <button onClick={() => setShowTaxReport(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6">
                            {(() => {
                                const taxes = periodSettlements.filter(s => ['vat', 'vat_10', 'withholding', 'withholding_33'].includes(s.tax_type));
                                if (taxes.length === 0) {
                                    return <div className="text-center py-12 text-gray-400">해당 기간의 세금 신고 내역이 없습니다.</div>;
                                }

                                const grouped = {};
                                taxes.forEach(t => {
                                    const p = t.profiles;
                                    const name = p?.name || '미상';
                                    const isVat = ['vat', 'vat_10'].includes(t.tax_type);
                                    
                                    if (!grouped[name]) {
                                        grouped[name] = {
                                            name,
                                            role: p?.role || 'unknown',
                                            grade: p?.partners?.grade,
                                            vatBase: 0,
                                            vatAmount: 0,
                                            withholdingBase: 0,
                                            withholdingAmount: 0,
                                            count: 0
                                        };
                                    }
                                    
                                    grouped[name].count++;
                                    if (isVat) {
                                        grouped[name].vatBase += Math.abs(t.base_amount || 0);
                                        grouped[name].vatAmount += Math.abs(t.tax_amount || 0);
                                    } else {
                                        grouped[name].withholdingBase += Math.abs(t.base_amount || 0);
                                        grouped[name].withholdingAmount += Math.abs(t.tax_amount || 0);
                                    }
                                });
                                
                                const sortedList = Object.values(grouped).sort((a, b) => (b.withholdingAmount + b.vatAmount) - (a.withholdingAmount + a.vatAmount));

                                return (
                                    <div className="w-full">
                                        <div className="flex items-center gap-4 px-4 py-3 bg-gray-100 border border-gray-200 rounded-t-lg text-xs font-bold text-gray-700">
                                            <div className="w-48 flex-shrink-0">이름/직책</div>
                                            <div className="w-20 flex-shrink-0 text-center">건수</div>
                                            <div className="flex-1 min-w-0 text-right">원천징수 과세대상 (3.3%)</div>
                                            <div className="w-32 flex-shrink-0 text-right text-amber-600">원천징수 납부액</div>
                                            <div className="flex-1 min-w-0 text-right">부가세 과세대상 (10%)</div>
                                            <div className="w-32 flex-shrink-0 text-right text-blue-600">부가세 납부액</div>
                                        </div>
                                        <div className="border-x border-b border-gray-200 rounded-b-lg">
                                            {sortedList.map((item, idx) => (
                                                <div key={idx} className={`flex items-center gap-4 px-4 py-3 ${idx < sortedList.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-indigo-50/20`}>
                                                    <div className="w-48 flex-shrink-0 flex items-center gap-2">
                                                        <span className="font-bold text-gray-900">{item.name}</span>
                                                        <RoleBadge role={item.role} grade={item.grade} />
                                                    </div>
                                                    <div className="w-20 flex-shrink-0 text-center text-xs text-gray-500">
                                                        {item.count}건
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-right text-sm">
                                                        {item.withholdingBase > 0 ? `₩${Math.floor(item.withholdingBase).toLocaleString()}` : '-'}
                                                    </div>
                                                    <div className="w-32 flex-shrink-0 text-right font-black text-amber-600">
                                                        {item.withholdingAmount > 0 ? `₩${Math.floor(item.withholdingAmount).toLocaleString()}` : '-'}
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-right text-sm">
                                                        {item.vatBase > 0 ? `₩${Math.floor(item.vatBase).toLocaleString()}` : '-'}
                                                    </div>
                                                    <div className="w-32 flex-shrink-0 text-right font-black text-blue-600">
                                                        {item.vatAmount > 0 ? `₩${Math.floor(item.vatAmount).toLocaleString()}` : '-'}
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            {/* 합계 행 */}
                                            <div className="flex items-center gap-4 px-4 py-4 bg-gray-50 border-t-2 border-gray-200 rounded-b-lg">
                                                <div className="w-48 flex-shrink-0 font-black text-gray-900 text-center">총 합계</div>
                                                <div className="w-20 flex-shrink-0 text-center text-xs font-bold text-gray-700">{sortedList.reduce((sum, i) => sum + i.count, 0)}건</div>
                                                <div className="flex-1 min-w-0 text-right font-bold text-gray-700">
                                                    ₩{Math.floor(sortedList.reduce((sum, i) => sum + i.withholdingBase, 0)).toLocaleString()}
                                                </div>
                                                <div className="w-32 flex-shrink-0 text-right font-black text-amber-700">
                                                    ₩{Math.floor(sortedList.reduce((sum, i) => sum + i.withholdingAmount, 0)).toLocaleString()}
                                                </div>
                                                <div className="flex-1 min-w-0 text-right font-bold text-gray-700">
                                                    ₩{Math.floor(sortedList.reduce((sum, i) => sum + i.vatBase, 0)).toLocaleString()}
                                                </div>
                                                <div className="w-32 flex-shrink-0 text-right font-black text-blue-700">
                                                    ₩{Math.floor(sortedList.reduce((sum, i) => sum + i.vatAmount, 0)).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
