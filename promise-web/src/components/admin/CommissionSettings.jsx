import React, { useEffect, useState } from 'react';
import { useNotification } from '../../contexts/NotificationContext';
import { Save, AlertCircle, TrendingUp, DollarSign, Calculator } from 'lucide-react';

export default function CommissionSettings({ supabase }) {
    const { showToast } = useNotification();
    const [policy, setPolicy] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchPolicy();
    }, []);

    const fetchPolicy = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('commission_policies')
                .select('*')
                .eq('id', 1)
                .single();

            if (error && error.code !== 'PGRST116') throw error;

            if (data) {
                setPolicy(data);
            } else {
                // Default fallback if table is empty
                setPolicy({
                    base_margin: 1000000,
                    is_percentage: false,
                    customer_payback: 100000,
                    sales_dealer_regular: 200000,
                    sales_dealer_master_override: 100000,
                    sales_dealer_master_direct: 300000,
                    sales_leader_regular: 500000,
                    sales_leader_master_direct: 700000,
                    exec_leader_master_override: 100000,
                    exec_leader_master_direct: 200000
                });
            }
        } catch (error) {
            console.error('Error fetching commission policy:', error);
            showToast('error', '데이터 로드 실패', '수수료 정책을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const { error } = await supabase
                .from('commission_policies')
                .upsert({ id: 1, ...policy, updated_at: new Date().toISOString() });

            if (error) throw error;
            showToast('success', '저장 완료', '수수료 정책이 성공적으로 업데이트되었습니다.');
        } catch (error) {
            console.error('Error saving commission policy:', error);
            showToast('error', '저장 실패', '수수료 정책 저장 중 오류가 발생했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setPolicy(prev => ({
            ...prev,
            [name]: parseFloat(value) || 0
        }));
    };

    const formatNumber = (num) => {
        return (num || 0).toLocaleString();
    };

    if (loading) return <div className="p-8 text-center text-gray-500">데이터를 불러오는 중입니다...</div>;
    if (!policy) return null;

    return (
        <div className="p-6 max-w-4xl mx-auto pb-20">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700 flex items-center gap-2">
                        <Calculator className="w-6 h-6 text-indigo-600" />
                        수수료 및 마진율 설정
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">접수 및 진행 역할에 따른 장례 마진 자동 분배 비율을 설정합니다.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                >
                    <Save className="w-5 h-5" />
                    {saving ? '저장 중...' : '설정 저장하기'}
                </button>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-start gap-3 shadow-sm">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                    <p className="font-bold mb-1">마진 분배 기본 원칙 (1건당 기본 마진에서 차감)</p>
                    <ul className="list-disc pl-4 space-y-1">
                        <li>입력하신 수치(원 또는 %)를 바탕으로 딜러센터와 팀장센터의 정산액이 실시간으로 계산됩니다.</li>
                        <li>비율(%)로 설정 시, 모든 수수료는 **1건당 총 장례 마진**을 기준으로 자동 계산됩니다.</li>
                    </ul>
                </div>
            </div>

            <div className="flex items-center justify-end mb-4 pr-1">
                <label className="flex items-center cursor-pointer gap-2">
                    <span className={`text-sm font-bold ${!policy.is_percentage ? 'text-indigo-600' : 'text-gray-400'}`}>금액(원) 기준</span>
                    <div className="relative">
                        <input
                            type="checkbox"
                            className="sr-only"
                            checked={policy.is_percentage || false}
                            onChange={(e) => setPolicy({ ...policy, is_percentage: e.target.checked })}
                        />
                        <div className={`block w-12 h-6 rounded-full transition-colors ${policy.is_percentage ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
                        <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform transform ${policy.is_percentage ? 'translate-x-6' : ''}`}></div>
                    </div>
                    <span className={`text-sm font-bold ${policy.is_percentage ? 'text-indigo-600' : 'text-gray-400'}`}>비율(%) 기준</span>
                </label>
            </div>

            <div className="space-y-6">
                {/* 1. Base Variables */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-gray-600" />
                        <h3 className="font-bold text-gray-800">기본 장례 마진 및 고객 페이백</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InputField label="1건당 총 장례 마진 (원)" name="base_margin" value={policy.base_margin} onChange={handleChange} helperText="장례 1건 발생 시 확보되는 총 마진" isPercentage={false} />
                        <InputField label={`고객 정산금 (페이백) (${policy.is_percentage ? '%' : '원'})`} name="customer_payback" value={policy.customer_payback} onChange={handleChange} helperText="상주(고객)에게 지급되는 금액" isPercentage={policy.is_percentage} />
                    </div>
                </div>

                {/* 2. Sales Commissions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-gray-800">영업(Sales) 수수료 설정</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                        <InputField label={`일반 딜러 직접 영업 (${policy.is_percentage ? '%' : '원'})`} name="sales_dealer_regular" value={policy.sales_dealer_regular} onChange={handleChange} helperText="일반 딜러 직접 영업 수수료" isPercentage={policy.is_percentage} />
                        <InputField label={`마스터 딜러 하위영업 오버라이드 (${policy.is_percentage ? '%' : '원'})`} name="sales_dealer_master_override" value={policy.sales_dealer_master_override} onChange={handleChange} helperText="하위 딜러 영업 시 마스터 딜러 추가 수익" isPercentage={policy.is_percentage} />
                        <InputField label={`마스터 딜러 직접 영업 (${policy.is_percentage ? '%' : '원'})`} name="sales_dealer_master_direct" value={policy.sales_dealer_master_direct} onChange={handleChange} helperText="마스터 딜러 직접 영업 수수료" isPercentage={policy.is_percentage} />
                        <InputField label={`일반 팀장 직접 영업 (${policy.is_percentage ? '%' : '원'})`} name="sales_leader_regular" value={policy.sales_leader_regular} onChange={handleChange} helperText="일반 팀장이 영업 시 수수료" isPercentage={policy.is_percentage} />
                        <InputField label={`마스터 팀장 직접 영업 (${policy.is_percentage ? '%' : '원'})`} name="sales_leader_master_direct" value={policy.sales_leader_master_direct} onChange={handleChange} helperText="마스터 팀장이 영업 시 수수료" isPercentage={policy.is_percentage} />
                    </div>
                </div>

                {/* 3. Execution Commissions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        <h3 className="font-bold text-gray-800">진행(Execution) 수수료 설정</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                        <InputField label={`마스터 팀장 직속 진행 오버라이드 (${policy.is_percentage ? '%' : '원'})`} name="exec_leader_master_override" value={policy.exec_leader_master_override} onChange={handleChange} helperText="일반팀장이 진행 시 상위 마스터팀장이 받는 수수료" isPercentage={policy.is_percentage} />
                        <InputField label={`마스터 팀장 오버라이드 (직접 진행 시) (${policy.is_percentage ? '%' : '원'})`} name="exec_leader_master_direct" value={policy.exec_leader_master_direct} onChange={handleChange} helperText="타인 영업 건을 마스터가 직접 진행 시 수수료" isPercentage={policy.is_percentage} />
                    </div>
                </div>
            </div>

            {/* Simulation Preview Board */}
            <div className="mt-8 bg-gray-900 rounded-xl p-6 shadow-lg text-white">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-indigo-300">
                    <Calculator className="w-5 h-5" /> 1건당 배분 시뮬레이션 결과 (본사 마진 확인)
                </h3>
                {(() => {
                    const abs = (val) => policy.is_percentage ? (policy.base_margin * val / 100) : val;
                    return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono">
                            <SimRow title="1. 일반딜러 영업 / 일반팀장 진행" margin={policy.base_margin - abs(policy.customer_payback) - abs(policy.sales_dealer_regular) - abs(policy.sales_dealer_master_override) - abs(policy.exec_leader_master_override)} />
                            <SimRow title="2. 일반딜러 영업 / 마스터팀장 진행" margin={policy.base_margin - abs(policy.customer_payback) - abs(policy.sales_dealer_regular) - abs(policy.exec_leader_master_direct)} />
                            <SimRow title="3. 마스터딜러 영업 / 일반팀장 진행" margin={policy.base_margin - abs(policy.customer_payback) - abs(policy.sales_dealer_master_direct) - abs(policy.exec_leader_master_override)} />
                            <SimRow title="4. 마스터팀장 영업 / 일반팀장 진행" margin={policy.base_margin - abs(policy.customer_payback) - abs(policy.sales_leader_master_direct)} />
                            <SimRow title="6. 일반팀장 영업 / 일반팀장 진행" margin={policy.base_margin - abs(policy.customer_payback) - abs(policy.sales_leader_regular) - abs(policy.exec_leader_master_override)} />
                            <SimRow title="8. 본사 영업 / 일반팀장 진행" margin={policy.base_margin - abs(policy.customer_payback) - abs(policy.exec_leader_master_override)} />
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}

function InputField({ label, name, value, onChange, helperText, isPercentage }) {
    return (
        <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">{label}</label>
            <div className="relative">
                <input
                    type="number"
                    step={isPercentage ? "0.1" : "1"}
                    name={name}
                    value={value || (value === 0 ? 0 : '')}
                    onChange={onChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-right font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                />
                {!isPercentage && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₩</span>}
                {isPercentage && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>}
            </div>
            {helperText && <p className="mt-1.5 text-xs text-gray-500">{helperText}</p>}
        </div>
    );
}

function SimRow({ title, margin }) {
    return (
        <div className="flex justify-between items-center py-2 border-b border-gray-800">
            <span className="text-gray-400">{title}</span>
            <span className={`font-bold ${margin < 0 ? 'text-red-400' : 'text-green-400'}`}>
                본사입금: {margin.toLocaleString()} 원
            </span>
        </div>
    );
}
