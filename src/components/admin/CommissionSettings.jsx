import React, { useEffect, useState } from 'react';
import { useNotification } from '../../contexts/NotificationContext';
import { Save, Calculator, Plus, X, Pencil, Check, Trash2, Eye, EyeOff } from 'lucide-react';
import { supabase as supabaseClient } from '../../lib/supabase';
import { GRADE_LABELS } from '../../lib/partnerGrade';

const DEFAULT_POLICY = {
    base_margin: 1000000,
    is_percentage: false,
    customer_payback: 100000,
    sales_dealer_regular: 200000,
    sales_dealer_master_override: 100000,
    sales_dealer_master_direct: 300000,
    sales_leader_regular: 500000,
    sales_leader_master_direct: 700000,
    exec_leader_master_override: 100000,
    exec_leader_master_direct: 200000,
    team_leader_fee: 0,
    s_dealer_management_fee: 0,
    s_leader_management_fee: 0,
    extra_sales_fee_rate: 0,
};

const DEFAULT_PACKAGES = [
    { value: '기본형', label: '기본형 (390만원)', items: [], active: true },
    { value: '고급형', label: '고급형 (490만원)', items: [], active: true },
];

const TAG_COLORS = {
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
};

const ROWS = [
    { label: '고객 캐시백', name: 'customer_payback', tag: '지출', tagColor: 'red' },
    { label: '영업 수수료', name: 'sales_dealer_regular', tag: '딜러', tagColor: 'blue' },
    { label: '관리 수수료 – 마스터 딜러', name: 'sales_dealer_master_override', tag: '딜러', tagColor: 'blue' },
    { label: '마스터딜러 직접 영업', name: 'sales_dealer_master_direct', tag: '딜러', tagColor: 'blue' },
    { label: '팀장 직접 영업', name: 'sales_leader_regular', tag: '팀장', tagColor: 'purple' },
    { label: '마스터팀장 직접 영업', name: 'sales_leader_master_direct', tag: '팀장', tagColor: 'purple' },
    { label: '팀장 수수료', name: 'team_leader_fee', tag: '팀장', tagColor: 'purple' },
    { label: '관리 수수료 – 마스터 팀장', name: 'exec_leader_master_override', tag: '팀장', tagColor: 'purple' },
    { label: '마스터팀장 직접 영업수수료', name: 'exec_leader_master_direct', tag: '팀장', tagColor: 'purple' },
    { label: '관리 수수료 – 대표마스터 딜러', name: 's_dealer_management_fee', tag: '딜러', tagColor: 'blue' },
    { label: '관리 수수료 – 대표마스터 팀장', name: 's_leader_management_fee', tag: '팀장', tagColor: 'purple' },
    { label: '추가 매출 수수료(%)', name: 'extra_sales_fee_rate', tag: '팀장', tagColor: 'purple' },
];

const ROW_GROUPS = [
    {
        id: 'dealer',
        title: '딜러 라인',
        headerClass: 'bg-blue-50/80 text-blue-900 border-t border-b border-blue-200',
        dotClass: 'bg-blue-600',
        names: [
            'sales_dealer_regular',
            'sales_dealer_master_override',
            's_dealer_management_fee',
        ],
    },
    {
        id: 'leader',
        title: '팀장 라인',
        headerClass: 'bg-purple-50/80 text-purple-900 border-t border-b border-purple-200',
        dotClass: 'bg-purple-600',
        names: [
            'team_leader_fee',
            'exec_leader_master_override',
            's_leader_management_fee',
            'extra_sales_fee_rate',
        ],
    },
    {
        id: 'expense',
        title: '지출 (고객 페이백)',
        headerClass: 'bg-red-50/80 text-red-900 border-t border-b border-red-200',
        dotClass: 'bg-red-600',
        names: [
            'customer_payback',
        ],
    },
];

const ROW_DESC = {
    customer_payback: {
        desc: '쿠폰 사용 시 본사가 고객에게 지급합니다. 명함 쿠폰 사용 건은 제외됩니다.',
        needsCheck: false,
    },
    sales_dealer_regular: {
        desc: '딜러가 영업한 건에 딜러 라인 모두 같은 금액입니다. (원천징수 3.3% 공제)',
        needsCheck: false,
    },
    sales_dealer_master_override: {
        desc: '직속 산하 일반 딜러가 영업한 건에 마스터 딜러에게 지급합니다. (원천징수 3.3% 공제)',
        needsCheck: false,
    },
    s_dealer_management_fee: {
        desc: `${GRADE_LABELS.dealer.S}가 산하 전체 딜러 조직의 당월 진행 건당 받는 관리수수료입니다. (단, 변호사 확인 전까지 0원 유지)`,
        needsCheck: false,
    },
    team_leader_fee: {
        desc: '팀장 본인 건(기록용)에서 팀장이 본사에 내는 금액입니다. 0이면 정산서가 생성되지 않습니다.',
        needsCheck: false,
    },
    exec_leader_master_override: {
        desc: '직속 산하 일반 팀장이 진행한 건에 마스터 팀장에게 지급합니다. (면세)',
        needsCheck: false,
    },
    s_leader_management_fee: {
        desc: `${GRADE_LABELS.leader.S}가 산하 전체 팀장 조직의 당월 진행 건당 받는 관리수수료입니다. (단, 변호사 확인 전까지 0원 유지)`,
        needsCheck: false,
    },
    extra_sales_fee_rate: {
        desc: '장례 진행 중 발생한 추가 매출(용품 등)에 대해 팀장이 본사에 납부하는 수수료율(%)입니다.',
        needsCheck: false,
    },
};

const ROW_MAP = Object.fromEntries(ROWS.map(r => [r.name, r]));

export default function CommissionSettings({ supabase }) {
    const { showToast } = useNotification();
    const db = supabase || supabaseClient;

    const [packages, setPackages] = useState(DEFAULT_PACKAGES);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [editingPkg, setEditingPkg] = useState(null);
    const [addingPkg, setAddingPkg] = useState(false);
    const [newPkg, setNewPkg] = useState({ value: '', label: '' });
    const [newItem, setNewItem] = useState({ name: '', cost: 0 });

    const [policy, setPolicy] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => { fetchPackages(); }, []);
    useEffect(() => { if (packages.length > 0) fetchPolicy(selectedIdx); }, [selectedIdx]);

    // 하위호환: string[] → {name, cost}[] 자동 변환
    const normalizeItems = (items) => {
        if (!items || !Array.isArray(items)) return [];
        return items.map(item => typeof item === 'string' ? { name: item, cost: 0 } : item);
    };

    const fetchPackages = async () => {
        try {
            const { data } = await db.from('system_config').select('value').eq('key', 'funeral_packages').single();
            if (data?.value) {
                const parsed = JSON.parse(data.value);
                setPackages(parsed.map(p => {
                    const { items: rawItems, ...rest } = p;
                    return { active: true, price: 0, ...rest, items: normalizeItems(rawItems) };
                }));
            }
        } catch (e) { /* 기본값 유지 */ }
    };

    // 패키지 로컬 상태만 업데이트 (DB 저장은 handleSave에서 같이)
    const updatePackagesLocal = (newPkgs) => setPackages(newPkgs);

    // DB에 패키지만 즉시 저장 (추가/삭제 시)
    const savePackagesNow = async (newPkgs) => {
        await db.from('system_config').upsert({ key: 'funeral_packages', value: JSON.stringify(newPkgs) });
        setPackages(newPkgs);
    };

    // 상품 추가
    const handleAddPackage = async () => {
        if (!newPkg.value.trim()) {
            showToast('error', '입력 오류', '상품의 고유값을 입력해주세요. (예: 프리미엄)');
            return;
        }
        const updated = [...packages, { value: newPkg.value.trim(), label: newPkg.label.trim() || newPkg.value.trim(), items: [], price: 0, active: true }];
        await savePackagesNow(updated);
        showToast('success', '추가 완료', '상품이 추가되었습니다.');
        setAddingPkg(false);
        setNewPkg({ value: '', label: '' });
        setSelectedIdx(updated.length - 1);
    };

    // 상품 삭제
    const handleDeletePackage = async (idx) => {
        if (!confirm(`"${packages[idx].label}" 상품을 삭제하시겠습니까?\n이 상품의 수수료 정책도 함께 삭제됩니다.`)) return;
        const updated = packages.filter((_, i) => i !== idx);
        await savePackagesNow(updated);
        showToast('success', '삭제 완료', '상품이 삭제되었습니다.');
        setSelectedIdx(Math.max(0, idx - 1));
    };

    // 상품명 수정 저장
    const handleEditSave = async () => {
        const updated = packages.map((p, i) =>
            i === editingPkg.idx ? { ...p, value: editingPkg.value, label: editingPkg.label } : p
        );
        await savePackagesNow(updated);
        showToast('success', '수정 완료', '상품명이 수정되었습니다.');
        setEditingPkg(null);
    };

    // 게시 여부 토글
    const handleToggleActive = (idx) => {
        const updated = packages.map((p, i) => i === idx ? { ...p, active: !p.active } : p);
        updatePackagesLocal(updated);
    };

    // 항목 추가 ({name, cost} 객체)
    const handleAddItem = () => {
        if (!newItem.name.trim()) {
            showToast('error', '입력 오류', '추가할 항목의 이름을 텍스트 칸에 먼저 입력해주세요!');
            return;
        }
        const updated = packages.map((p, i) =>
            i === selectedIdx ? { ...p, items: [...normalizeItems(p.items), { name: newItem.name.trim(), cost: Math.round(parseFloat(String(newItem.cost).replace(/,/g, '')) || 0) }] } : p
        );
        updatePackagesLocal(updated);
        setNewItem({ name: '', cost: 0 });
    };

    // 항목 삭제
    const handleDeleteItem = (itemIdx) => {
        const updated = packages.map((p, i) =>
            i === selectedIdx ? { ...p, items: normalizeItems(p.items).filter((_, j) => j !== itemIdx) } : p
        );
        updatePackagesLocal(updated);
    };

    // 항목명 수정
    const handleItemChange = (itemIdx, val) => {
        const updated = packages.map((p, i) => {
            if (i !== selectedIdx) return p;
            const items = [...normalizeItems(p.items)];
            items[itemIdx] = { ...items[itemIdx], name: val };
            return { ...p, items };
        });
        updatePackagesLocal(updated);
    };

    // 항목 원가 수정
    const handleItemCostChange = (itemIdx, rawValue) => {
        const cost = Math.round(parseFloat(String(rawValue).replace(/,/g, '')) || 0);
        const updated = packages.map((p, i) => {
            if (i !== selectedIdx) return p;
            const items = [...normalizeItems(p.items)];
            items[itemIdx] = { ...items[itemIdx], cost };
            return { ...p, items };
        });
        updatePackagesLocal(updated);
    };

    // 상품 판매가 수정
    const handlePriceChange = (rawValue) => {
        const price = Math.round(parseFloat(String(rawValue).replace(/,/g, '')) || 0);
        const updated = packages.map((p, i) => i === selectedIdx ? { ...p, price } : p);
        updatePackagesLocal(updated);
    };

    const fetchPolicy = async (idx) => {
        try {
            setLoading(true);
            const policyId = idx + 1;
            const { data, error } = await db.from('commission_policies').select('*').eq('id', policyId).single();
            if (error && error.code !== 'PGRST116') throw error;
            // The new representative-master columns are absent before P3c is applied.
            // Keep their display/edit state at zero until the migration is available.
            setPolicy({ ...DEFAULT_POLICY, ...(data || {}), id: policyId });
        } catch (e) {
            showToast('error', '로드 실패', '수수료 정책을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // 수수료 + 항목표 동시 저장
    const handleSave = async () => {
        try {
            setSaving(true);
            const policyId = selectedIdx + 1;

            // 1. 수수료 정책 저장 (_pct 필드 제거)
            const toSave = Object.fromEntries(
                Object.entries({ ...policy, id: policyId, updated_at: new Date().toISOString() })
                    .filter(([k]) => !k.endsWith('_pct'))
            );
            let { error: policyError } = await db.from('commission_policies').upsert(toSave);
            // Before P3c reaches the DB, retain the existing settings-save path and omit
            // only the two unavailable columns. The visible values remain safely at zero.
            if (policyError && /extra_sales_fee_rate|s_(dealer|leader)_management_fee|team_leader_fee|column/i.test(policyError.message || '')) {
                const { extra_sales_fee_rate, s_dealer_management_fee, s_leader_management_fee, team_leader_fee, ...legacyPolicy } = toSave;
                ({ error: policyError } = await db.from('commission_policies').upsert(legacyPolicy));
            }
            if (policyError) throw policyError;

            // 2. 항목표(패키지) 저장
            const { error: pkgError } = await db.from('system_config')
                .upsert({ key: 'funeral_packages', value: JSON.stringify(packages) });
            if (pkgError) throw pkgError;

            showToast('success', '저장 완료', '수수료 및 상품 항목이 저장되었습니다.');
        } catch (e) {
            console.error('Save error:', e);
            showToast('error', '저장 실패', e.message || '저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const handleAmountChange = (name, rawValue) => {
        const amount = Math.round(parseFloat(String(rawValue).replace(/,/g, '')) || 0);
        setPolicy(prev => ({ ...prev, [name]: amount }));
    };
    const handlePctChange = (name, rawValue) => {
        const pct = Math.min(100, parseFloat(rawValue) || 0);
        setPolicy(prev => ({ ...prev, [`${name}_pct`]: pct }));
    };
    const handleBaseMarginChange = (rawValue) => {
        const base = Math.round(parseFloat(String(rawValue).replace(/,/g, '')) || 0);
        setPolicy(prev => ({ ...prev, base_margin: base }));
    };

    const getAmount = (name) => Math.round(policy?.[name] || 0);
    const getPct = (name) => {
        if (policy?.[`${name}_pct`] !== undefined) return policy[`${name}_pct`];
        return policy?.base_margin > 0 ? parseFloat(((getAmount(name) / policy.base_margin) * 100).toFixed(2)) : 0;
    };
    const actualPayout = (name) => {
        if (!policy) return 0;
        return Math.round(policy.is_percentage ? (policy.base_margin * getPct(name) / 100) : getAmount(name));
    };

    const simCases = policy ? [
        { title: '일반 딜러 영업 / 일반 팀장 진행', payouts: [{ label: '영업 수수료', v: actualPayout('sales_dealer_regular') }] },
        { title: '일반 딜러 영업 / 마스터 딜러·팀장 관리', payouts: [{ label: '영업 수수료', v: actualPayout('sales_dealer_regular') }, { label: '마스터 딜러 관리', v: actualPayout('sales_dealer_master_override') }, { label: '마스터 팀장 관리', v: actualPayout('exec_leader_master_override') }] },
        { title: '기록용 팀장 본인 건', payouts: [{ label: '팀장 수수료', v: actualPayout('team_leader_fee') }] },
        { title: '쿠폰 사용 건', payouts: [{ label: '고객 캐시백', v: actualPayout('customer_payback') }] },
    ] : [];

    const isPct = policy?.is_percentage;
    const currentPkg = packages[selectedIdx];
    const currentItems = normalizeItems(currentPkg?.items);
    const totalCost = currentItems.reduce((sum, item) => sum + (item.cost || 0), 0);
    const pkgPrice = currentPkg?.price || 0;
    const pkgMargin = pkgPrice - totalCost;

    return (
        <div className="p-6 max-w-5xl mx-auto pb-20">

            {/* 헤더 */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <Calculator className="w-6 h-6 text-indigo-600" /> 상품 및 수수료 설정
                </h2>
                <button onClick={handleSave} disabled={saving || loading}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-md">
                    <Save className="w-5 h-5" />{saving ? '저장 중...' : '수수료 + 항목 저장'}
                </button>
            </div>

            {/* 상품 탭 */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-6">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">희망 상품 목록</h3>
                <div className="flex flex-wrap gap-2 items-center">
                    {packages.map((pkg, idx) => (
                        <div key={idx} className={`relative flex items-center rounded-xl border-2 transition-all
                            ${selectedIdx === idx
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                : pkg.active
                                    ? 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                                    : 'bg-gray-50 border-gray-200 text-gray-400'}`}>

                            {editingPkg?.idx === idx ? (
                                <div className="flex items-center gap-1 px-3 py-2">
                                    <input className="text-sm font-bold bg-transparent border-b border-white/60 outline-none w-20"
                                        value={editingPkg.value}
                                        onChange={e => setEditingPkg(p => ({ ...p, value: e.target.value }))} />
                                    <input className="text-xs bg-transparent border-b border-white/60 outline-none w-32"
                                        placeholder="표시명"
                                        value={editingPkg.label}
                                        onChange={e => setEditingPkg(p => ({ ...p, label: e.target.value }))} />
                                    <button onClick={handleEditSave}><Check className="w-4 h-4" /></button>
                                    <button onClick={() => setEditingPkg(null)}><X className="w-4 h-4" /></button>
                                </div>
                            ) : (
                                <button onClick={() => setSelectedIdx(idx)} className="px-4 py-2 font-bold text-sm flex items-center gap-2">
                                    {!pkg.active && <EyeOff className="w-3.5 h-3.5 opacity-60" />}
                                    {pkg.label || pkg.value}
                                </button>
                            )}

                            {/* 선택된 상품 액션 버튼들 */}
                            {selectedIdx === idx && !editingPkg && (
                                <div className="flex items-center gap-1 pr-2">
                                    <button onClick={() => setEditingPkg({ idx, value: pkg.value, label: pkg.label })}
                                        title="이름 수정"
                                        className="p-1 rounded opacity-70 hover:opacity-100 hover:bg-white/20">
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => handleToggleActive(idx)}
                                        title={pkg.active ? '비게시로 변경' : '게시로 변경'}
                                        className="p-1 rounded opacity-70 hover:opacity-100 hover:bg-white/20">
                                        {pkg.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                    </button>
                                    <button onClick={() => handleDeletePackage(idx)}
                                        title="상품 삭제"
                                        className="p-1 rounded opacity-70 hover:opacity-100 hover:bg-red-500/30">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}

                    {addingPkg ? (
                        <div className="flex items-center gap-2 border border-indigo-300 rounded-xl px-3 py-2 bg-indigo-50">
                            <input className="text-sm font-bold outline-none w-20 bg-transparent" placeholder="값 (기본형)"
                                value={newPkg.value} onChange={e => setNewPkg(p => ({ ...p, value: e.target.value }))} autoFocus />
                            <input className="text-xs outline-none w-32 bg-transparent" placeholder="표시명 (기본형 390만원)"
                                value={newPkg.label} onChange={e => setNewPkg(p => ({ ...p, label: e.target.value }))}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                        e.preventDefault();
                                        handleAddPackage();
                                    }
                                }} />
                            <button onClick={handleAddPackage} className="text-indigo-600"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setAddingPkg(false)} className="text-gray-400"><X className="w-4 h-4" /></button>
                        </div>
                    ) : (
                        <button onClick={() => setAddingPkg(true)}
                            className="px-4 py-2 rounded-xl font-bold text-sm border-2 border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 flex items-center gap-1 transition-colors">
                            <Plus className="w-4 h-4" /> 상품 추가
                        </button>
                    )}
                </div>

                {/* 현재 선택 상품 게시 여부 표시 */}
                {currentPkg && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
                        <span className="text-xs text-gray-500 font-medium">게시 여부:</span>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleToggleActive(selectedIdx)}>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${currentPkg.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${currentPkg.active ? 'translate-x-5' : ''}`} />
                            </div>
                            <span className={`text-xs font-bold ${currentPkg.active ? 'text-green-600' : 'text-gray-400'}`}>
                                {currentPkg.active ? '게시 중 (고객/딜러에게 노출)' : '비게시 (숨김 상태)'}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* 항목표 */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
                <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-slate-700 to-slate-600">
                    <div>
                        <h3 className="text-white font-bold text-sm">📋 {currentPkg?.label || currentPkg?.value} — 구성 항목표</h3>
                        <p className="text-slate-400 text-xs mt-0.5">딜러 / 고객이 상품 선택 시 확인하는 포함 항목 (원가는 관리자만 확인)</p>
                    </div>
                    <span className="text-xs bg-slate-500 text-white px-3 py-1 rounded-full">{currentItems.length}개 항목</span>
                </div>

                {/* 상품 판매가 입력 */}
                <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-700">💰 상품 판매가:</span>
                        <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-500 text-xs">₩</span>
                            <input type="text" inputMode="numeric"
                                value={pkgPrice > 0 ? Number(pkgPrice).toLocaleString() : ''}
                                placeholder="예: 3,500,000"
                                onChange={e => handlePriceChange(e.target.value)}
                                className="pl-6 pr-2 py-1.5 w-40 border border-amber-300 rounded-lg text-right font-bold text-sm focus:ring-2 focus:ring-amber-400 bg-white" />
                        </div>
                    </div>
                    {pkgPrice > 0 && (
                        <div className="flex items-center gap-3 text-xs text-amber-600">
                            <span>원가합계: <strong className="text-gray-700">₩{totalCost.toLocaleString()}</strong></span>
                            <span className="text-amber-300">|</span>
                            <span>총마진: <strong className={`${pkgMargin >= 0 ? 'text-green-700' : 'text-red-600'}`}>₩{pkgMargin.toLocaleString()}</strong></span>
                        </div>
                    )}
                </div>

                {currentItems.length > 0 ? (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="text-center px-4 py-2 text-gray-400 font-bold w-12">No.</th>
                                <th className="text-left px-4 py-2 text-gray-600 font-bold">항목 내용</th>
                                <th className="text-right px-3 py-2 text-gray-600 font-bold w-36">원가(₩)</th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {currentItems.map((item, i) => (
                                <tr key={i} className="hover:bg-indigo-50/30 group">
                                    <td className="text-center px-4 py-2.5">
                                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center mx-auto">{i + 1}</span>
                                    </td>
                                    <td className="px-4 py-2">
                                        <input type="text" value={item.name || ''}
                                            onChange={e => handleItemChange(i, e.target.value)}
                                            className="w-full bg-transparent border-0 outline-none text-gray-700 focus:bg-white focus:border focus:border-indigo-200 focus:rounded px-2 py-1 transition-all" />
                                    </td>
                                    <td className="px-3 py-2">
                                        <input type="text" inputMode="numeric"
                                            value={item.cost > 0 ? Number(item.cost).toLocaleString() : ''}
                                            placeholder="0"
                                            onChange={e => handleItemCostChange(i, e.target.value)}
                                            className="w-full text-right bg-transparent border-0 outline-none text-gray-600 font-mono text-xs focus:bg-white focus:border focus:border-amber-200 focus:rounded px-2 py-1 transition-all" />
                                    </td>
                                    <td className="px-2 py-2 text-center">
                                        <button onClick={() => handleDeleteItem(i)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {/* 원가 합계 행 */}
                            <tr className="bg-gray-50 border-t border-gray-200">
                                <td colSpan="2" className="px-4 py-2 text-right text-xs font-bold text-gray-500">원가 합계</td>
                                <td className="px-3 py-2 text-right font-bold text-sm text-gray-800 font-mono">₩{totalCost.toLocaleString()}</td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                ) : (
                    <div className="py-8 text-center text-gray-400 text-sm">항목을 추가해 주세요</div>
                )}

                <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50">
                    <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {currentItems.length + 1}
                    </span>
                    <input type="text" placeholder="항목명"
                        value={newItem.name}
                        onChange={e => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                handleAddItem();
                            }
                        }}
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
                    <input type="text" inputMode="numeric" placeholder="원가"
                        value={newItem.cost > 0 ? Number(newItem.cost).toLocaleString() : ''}
                        onChange={e => setNewItem(prev => ({ ...prev, cost: Math.round(parseFloat(String(e.target.value).replace(/,/g, '')) || 0) }))}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                e.preventDefault();
                                handleAddItem();
                            }
                        }}
                        className="w-28 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-amber-300 bg-white font-mono" />
                    <button onClick={handleAddItem}
                        className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 flex items-center gap-1">
                        <Plus className="w-4 h-4" /> 추가
                    </button>
                </div>

                {/* 마진 분석 섹션 */}
                {pkgPrice > 0 && totalCost > 0 && (
                    <div className="px-4 py-4 bg-gradient-to-r from-slate-50 to-indigo-50 border-t border-gray-200">
                        <h4 className="text-xs font-bold text-gray-600 mb-3 flex items-center gap-1.5">
                            <Calculator className="w-3.5 h-3.5 text-indigo-500" /> 마진 분석 (팀장·본사 배분 참고)
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                                <div className="text-[10px] text-gray-400 mb-1">상품 판매가</div>
                                <div className="text-base font-black text-gray-800 font-mono">₩{pkgPrice.toLocaleString()}</div>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm">
                                <div className="text-[10px] text-gray-400 mb-1">원가 합계</div>
                                <div className="text-base font-black text-red-600 font-mono">-₩{totalCost.toLocaleString()}</div>
                            </div>
                            <div className="bg-white rounded-lg p-3 border border-indigo-200 shadow-sm bg-indigo-50/50">
                                <div className="text-[10px] text-indigo-500 mb-1">마진 (팀장·본사 배분)</div>
                                <div className={`text-base font-black font-mono ${pkgMargin >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>₩{pkgMargin.toLocaleString()}</div>
                            </div>
                        </div>
                        {policy && (
                            <div className="mt-3 text-[11px] text-gray-500 bg-white/80 rounded-lg p-2.5 border border-gray-100">
                                💡 이 마진은 <em>상품 판매가 - 원가</em>로, 팀장과 본사가 나누는 금액입니다.
                                장례수수료 <strong className="text-gray-700">₩{Number(policy.base_margin).toLocaleString()}</strong>(부가세 포함)은 본사 수입으로 별도 관리됩니다.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {loading ? <div className="p-8 text-center text-gray-400">불러오는 중...</div> : policy && (<>

                {/* 지급 방식 토글 */}
                <div className="flex items-center gap-3 mb-5 bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm w-fit">
                    <span className="text-sm text-gray-500 font-medium">실제 지급 기준:</span>
                    <span className={`text-sm font-bold ${!isPct ? 'text-indigo-700' : 'text-gray-400'}`}>금액(원) 고정</span>
                    <div className="relative cursor-pointer w-12 h-6"
                        onClick={() => setPolicy(p => ({ ...p, is_percentage: !p.is_percentage }))}>
                        <div className={`block w-12 h-6 rounded-full transition-colors ${isPct ? 'bg-indigo-600' : 'bg-gray-300'}`} />
                        <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow transition-transform ${isPct ? 'translate-x-6' : ''}`} />
                    </div>
                    <span className={`text-sm font-bold ${isPct ? 'text-indigo-700' : 'text-gray-400'}`}>장례수수료 대비 비율(%)</span>
                </div>

                {/* 수수료 입력 테이블 */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
                    <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
                        <span className="text-xs font-bold text-indigo-700">💰 {currentPkg?.label || currentPkg?.value} 수수료 설정</span>
                        <p className="mt-1 text-xs text-amber-700">{GRADE_LABELS.dealer.S} 및 {GRADE_LABELS.leader.S} 관리수수료는 변호사 확인 전에는 0원으로 유지하세요. 기존 정산 경로는 변경하지 않습니다.</p>
                    </div>
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="text-left px-4 py-3 font-bold text-gray-500 w-16">구분</th>
                                <th className="text-left px-4 py-3 font-bold text-gray-500">항목</th>
                                <th className={`text-center px-3 py-3 font-bold w-44 ${!isPct ? 'text-indigo-600' : 'text-gray-400'}`}>
                                    금액(원) {!isPct && <span className="text-xs font-normal bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full">지급기준</span>}
                                </th>
                                <th className={`text-center px-3 py-3 font-bold w-56 ${isPct ? 'text-indigo-600' : 'text-gray-400'}`}>
                                    비율(%) → 계산금액 {isPct && <span className="text-xs font-normal bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full">지급기준</span>}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            <tr className="bg-green-50">
                                <td className="px-4 py-3"><span className="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-green-100 text-green-700">수입</span></td>
                                <td className="px-4 py-3">
                                    <div className="font-semibold text-gray-800">장례수수료 (들어오는 돈)</div>
                                    <span className="text-[10px] text-green-600 font-medium">부가세 10% 포함가</span>
                                </td>
                                <td className="px-3 py-2">
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₩</span>
                                        <input type="text" inputMode="numeric"
                                            value={Number(policy.base_margin).toLocaleString()}
                                            onChange={e => handleBaseMarginChange(e.target.value)}
                                            className="w-full pl-6 pr-2 py-1.5 border border-green-300 rounded-lg text-right font-bold text-sm focus:ring-2 focus:ring-green-400 bg-white" />
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-center text-gray-400 text-xs italic">기준금액 = 100%</td>
                            </tr>
                            {/* VAT 분리 표시 */}
                            <tr className="bg-green-50/50">
                                <td className="px-4 py-1"></td>
                                <td className="px-4 py-1" colSpan="3">
                                    <div className="flex items-center gap-4 text-[11px] text-gray-500 pl-3 border-l-2 border-green-300">
                                        <span>공급가: <span className="font-bold text-gray-700">₩{Math.floor(policy.base_margin / 1.1).toLocaleString()}</span></span>
                                        <span className="text-gray-300">|</span>
                                        <span>부가세(10%): <span className="font-bold text-blue-600">₩{Math.floor(policy.base_margin - Math.floor(policy.base_margin / 1.1)).toLocaleString()}</span></span>
                                        <span className="text-gray-300">|</span>
                                        <span>합계: <span className="font-bold text-gray-700">₩{Number(policy.base_margin).toLocaleString()}</span></span>
                                    </div>
                                </td>
                            </tr>
                            {ROW_GROUPS.map(group => (
                                <React.Fragment key={group.id}>
                                    {/* 그룹 헤더 행 (색 띠) */}
                                    <tr className={group.headerClass}>
                                        <td colSpan="4" className="px-4 py-2">
                                            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
                                                <span className={`w-2 h-2 rounded-full ${group.dotClass}`}></span>
                                                <span>{group.title}</span>
                                            </div>
                                        </td>
                                    </tr>
                                    {/* 그룹 안의 행들 */}
                                    {group.names.map(name => {
                                        const row = ROW_MAP[name];
                                        if (!row) return null;
                                        const descInfo = ROW_DESC[name];
                                        const amount = getAmount(row.name);
                                        const pct = getPct(row.name);
                                        const calcFromPct = Math.round(policy.base_margin * pct / 100);

                                        return (
                                            <React.Fragment key={row.name}>
                                                <tr className="hover:bg-gray-50/70 transition-colors">
                                                    <td className="px-4 py-2.5 align-middle">
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${TAG_COLORS[row.tagColor]}`}>{row.tag}</span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-gray-800 font-semibold align-middle">{row.label}</td>
                                                    {row.name === 'extra_sales_fee_rate' ? (
                                                        <>
                                                            <td className="px-3 py-2 align-middle text-center text-xs text-gray-400 font-medium">
                                                                추가 매출액 비례
                                                            </td>
                                                            <td className="px-3 py-2 align-middle">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="relative w-24 flex-shrink-0">
                                                                        <input type="number" step="0.1" min="0" max="100"
                                                                            value={policy.extra_sales_fee_rate ?? 0}
                                                                            onChange={e => {
                                                                                const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                                                                                setPolicy(p => ({ ...p, extra_sales_fee_rate: val }));
                                                                            }}
                                                                            className="w-full pl-2 pr-7 py-1.5 border border-purple-300 bg-purple-50 text-purple-700 rounded-lg text-right font-bold text-sm focus:ring-2 focus:ring-purple-400" />
                                                                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-purple-400">%</span>
                                                                    </div>
                                                                    <span className="text-xs text-gray-500 whitespace-nowrap">본사 수수료율</span>
                                                                </div>
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="px-3 py-2 align-middle">
                                                                <div className="relative">
                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₩</span>
                                                                    <input type="text" inputMode="numeric"
                                                                        value={Number(amount).toLocaleString()}
                                                                        onChange={e => handleAmountChange(row.name, e.target.value)}
                                                                        className={`w-full pl-6 pr-2 py-1.5 border rounded-lg text-right font-bold text-sm focus:ring-2 bg-white
                                                                            ${!isPct ? 'border-indigo-300 focus:ring-indigo-400' : 'border-gray-200 focus:ring-gray-300 text-gray-400'}`} />
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 align-middle">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="relative w-24 flex-shrink-0">
                                                                        <input type="number" step="0.1" min="0" max="100"
                                                                            value={pct}
                                                                            onChange={e => handlePctChange(row.name, e.target.value)}
                                                                            className={`w-full pl-2 pr-7 py-1.5 border rounded-lg text-right font-bold text-sm focus:ring-2
                                                                                ${isPct ? 'border-indigo-300 bg-indigo-50 text-indigo-700 focus:ring-indigo-400' : 'border-blue-100 bg-blue-50 text-blue-600 focus:ring-blue-300'}`} />
                                                                        <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold ${isPct ? 'text-indigo-400' : 'text-blue-400'}`}>%</span>
                                                                    </div>
                                                                    <span className="text-xs text-gray-400 whitespace-nowrap">= ₩{calcFromPct.toLocaleString()}</span>
                                                                </div>
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>
                                                {/* 행 아래 설명 줄 */}
                                                {descInfo && (
                                                    <tr className="border-b border-gray-100 bg-gray-50/20">
                                                        <td colSpan="4" className="px-4 pt-0.5 pb-2.5">
                                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 pl-3 border-l-2 border-gray-200 leading-relaxed">
                                                                <span>{descInfo.desc}</span>
                                                                {descInfo.needsCheck && (
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">
                                                                        확인 필요: 지금 정산 계산이 이 금액을 읽지 않음
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* 시뮬레이션 */}
                <div className="bg-gray-900 rounded-xl p-5 text-white">
                    <h3 className="text-base font-bold mb-1 text-indigo-300 flex items-center gap-2">
                        <Calculator className="w-4 h-4" /> 케이스별 영업이익 시뮬레이션
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                        지급 기준: {isPct ? `비율(%) — 장례수수료 ${Number(policy.base_margin).toLocaleString()}원 대비 자동계산` : '금액(원) 고정 지급'}
                    </p>
                    <div className="space-y-3">
                        {simCases.map((c, i) => {
                            const totalPayout = Math.round(c.payouts.reduce((s, p) => s + p.v, 0));
                            const supplyPrice = Math.floor(policy.base_margin / 1.1);
                            const vatAmount = policy.base_margin - supplyPrice;
                            const profit = Math.round(supplyPrice - totalPayout);
                            return (
                                <div key={i} className="bg-gray-800 rounded-lg p-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-sm font-bold text-gray-200">{i + 1}. {c.title}</span>
                                        <span className={`text-base font-bold ${profit < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                            영업이익: {profit.toLocaleString()}원
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-700">
                                        <span className="text-xs text-gray-500 self-center">지급내역:</span>
                                        {c.payouts.map((p, j) => (
                                            <span key={j} className="text-xs bg-gray-700 text-red-300 px-2 py-0.5 rounded">
                                                {p.label} -{p.v.toLocaleString()}
                                            </span>
                                        ))}
                                        <span className="text-xs bg-gray-700 text-blue-300 px-2 py-0.5 rounded">
                                            VAT -{vatAmount.toLocaleString()}
                                        </span>
                                        <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded ml-auto">
                                            합계 -{(totalPayout + vatAmount).toLocaleString()}원
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </>)}
        </div>
    );
}
