import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function LeaderAlertRegions({ userId, role }) {
  const [regions, setRegions] = useState([]); const [selected, setSelected] = useState(new Set()); const [saving, setSaving] = useState(false);
  useEffect(() => { if (role !== 'leader') return; Promise.all([supabase.from('regions').select('*').eq('active', true).order('sort'), supabase.from('partner_alert_regions').select('region_id').eq('partner_id', userId)]).then(([a,b]) => { setRegions(a.data || []); setSelected(new Set((b.data || []).map(x => String(x.region_id)))); }); }, [userId, role]);
  const grouped = useMemo(() => regions.filter(r => r.level === 'sido').map(s => ({ ...s, children: regions.filter(r => r.parent_id === s.id) })), [regions]);
  if (role !== 'leader') return null;
  const toggle = id => setSelected(prev => { const n = new Set(prev); n.has(String(id)) ? n.delete(String(id)) : n.add(String(id)); return n; });
  const selectAll = () => setSelected(new Set(regions.map(r => String(r.id))));
  const save = async () => { setSaving(true); try { await supabase.from('partner_alert_regions').delete().eq('partner_id', userId); if (selected.size) await supabase.from('partner_alert_regions').insert([...selected].map(region_id => ({ partner_id: userId, region_id }))); } finally { setSaving(false); } };
  return <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-5 mt-4"><div className="flex justify-between gap-3"><div><h3 className="font-bold text-gray-800">알림 받을 지역</h3><p className="text-xs text-gray-500 mt-1">지역별 알림이 꺼져 있어도 미리 설정할 수 있습니다. 아무 지역도 고르지 않으면 모든 지역 알림을 받습니다.</p></div><button onClick={selectAll} className="text-xs text-indigo-700 font-bold whitespace-nowrap">전체 선택</button></div><div className="mt-3 space-y-2 max-h-56 overflow-y-auto">{grouped.map(s => <div key={s.id}><label className="font-bold text-sm flex gap-2"><input type="checkbox" checked={selected.has(String(s.id))} onChange={() => toggle(s.id)} />{s.name} 전체</label><div className="grid grid-cols-2 gap-1 ml-5 mt-1">{s.children.map(c => <label key={c.id} className="text-sm flex gap-2"><input type="checkbox" checked={selected.has(String(c.id))} onChange={() => toggle(c.id)} />{c.name}</label>)}</div></div>)}</div><button disabled={saving} onClick={save} className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold">{saving ? '저장 중…' : '지역 저장'}</button></div>;
}
