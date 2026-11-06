import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';

export function FamilyBenefitSettings({ config, onUpdate }) {
    const [form, setForm] = useState({ name: '', desc: '', amount: '', elderLabel: '' });
    useEffect(() => setForm({ name: config.family_benefit_name || '', desc: config.family_benefit_desc || '', amount: config.family_benefit_amount || '', elderLabel: config.pre_reg_elder_label || '' }), [config]);
    const save = async () => {
        await supabase.from('system_config').upsert([
            { key: 'family_benefit_name', value: form.name.trim() },
            { key: 'family_benefit_desc', value: form.desc.trim() },
            { key: 'family_benefit_amount', value: form.amount.trim() },
            { key: 'pre_reg_elder_label', value: form.elderLabel.trim() }
        ]);
        onUpdate();
    };
    return <section className="bg-white border rounded-xl p-5 space-y-4"><div><h3 className="font-bold text-gray-800">가족 안심 혜택</h3><p className="text-xs text-gray-500 mt-1">비워 두면 가족 화면에 구체적인 혜택·금액을 보여 주지 않고 일반 문구만 표시됩니다. 혜택 문구는 변호사 확인 후 입력하세요.</p></div>
        <label className="block text-sm font-bold">이름<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full border rounded-lg p-2" /></label>
        <label className="block text-sm font-bold">한 줄 설명<input value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} className="mt-1 w-full border rounded-lg p-2" /></label>
        <label className="block text-sm font-bold">금액 (선택)<input type="number" inputMode="numeric" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, '') })} className="mt-1 w-full border rounded-lg p-2" /></label>
        <label className="block text-sm font-bold">호칭<input value={form.elderLabel} maxLength={10} placeholder="어르신" onChange={e => setForm({ ...form, elderLabel: e.target.value })} className="mt-1 w-full border rounded-lg p-2" /><span className="mt-1 block text-xs font-normal text-gray-500">가족 등록 화면의 칸 이름에 쓰입니다. 비우면 어르신</span></label>
        <button onClick={save} className="bg-indigo-600 text-white rounded-lg px-4 py-2 font-bold">저장</button>
    </section>;
}
