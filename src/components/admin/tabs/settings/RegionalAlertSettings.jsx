import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';

export function RegionalAlertSettings({ config, onUpdate }) {
  const [regions, setRegions] = useState([]); const [name, setName] = useState(''); const [level, setLevel] = useState('sido'); const [parentId, setParentId] = useState(''); const [unconfigured, setUnconfigured] = useState(0);
  const load = async () => {
    const [{ data: r }, { count }] = await Promise.all([
      supabase.from('regions').select('*').order('level').order('sort'),
      supabase.from('partners').select('user_id, profiles!inner(role)', { count: 'exact', head: false }).eq('status', 'approved').eq('profiles.role', 'leader')
    ]);
    setRegions(r || []);
    const leaders = (await supabase.from('partners').select('user_id, profiles!inner(role)').eq('status', 'approved').eq('profiles.role', 'leader')).data || [];
    const { data: chosen } = await supabase.from('partner_alert_regions').select('partner_id');
    const chosenIds = new Set((chosen || []).map(x => x.partner_id)); setUnconfigured(leaders.filter(x => !chosenIds.has(x.user_id)).length);
  };
  useEffect(() => { load(); }, []);
  const saveMode = async e => { await supabase.from('system_config').upsert({ key: 'regional_alert_mode', value: e.target.value }); onUpdate(); };
  const add = async () => { if (!name.trim() || (level === 'sigungu' && !parentId)) return; const sort = regions.filter(r => r.level === level && r.parent_id === (level === 'sigungu' ? parentId : null)).length + 1; await supabase.from('regions').insert({ name: name.trim(), level, parent_id: level === 'sigungu' ? parentId : null, sort, active: true }); setName(''); load(); };
  const toggle = async r => { await supabase.from('regions').update({ active: !r.active }).eq('id', r.id); load(); };
  const sidos = regions.filter(r => r.level === 'sido');
  return <section className="bg-white border rounded-xl p-5 space-y-4"><div><h3 className="font-bold text-gray-800">지역별 알림</h3><p className="text-xs text-gray-500 mt-1">끄기일 때는 기존 알림·배정 대상과 동일합니다. 지역을 고르지 않은 팀장은 켠 뒤에도 모든 건을 받습니다.</p></div><label className="block text-sm font-bold">지역별 알림 단위<select value={config.regional_alert_mode || 'off'} onChange={saveMode} className="mt-1 w-full border rounded-lg p-2"><option value="off">끄기</option><option value="sido">시·도</option><option value="sigungu">시·군·구</option></select></label><p className="text-sm">지역 미설정 승인 팀장: <b>{unconfigured}명</b></p><div className="border-t pt-3 space-y-2"><div className="flex gap-2"><select value={level} onChange={e => setLevel(e.target.value)} className="border rounded p-2 text-sm"><option value="sido">시·도</option><option value="sigungu">시·군·구</option></select>{level === 'sigungu' && <select value={parentId} onChange={e => setParentId(e.target.value)} className="border rounded p-2 text-sm"><option value="">상위 시·도</option>{sidos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}<input value={name} onChange={e => setName(e.target.value)} placeholder="지역명" className="border rounded p-2 text-sm flex-1"/><button onClick={add} className="bg-indigo-600 text-white rounded px-3 text-sm">추가</button></div>{regions.map(r => <div key={r.id} className="flex justify-between text-sm py-1"><span>{r.level === 'sigungu' ? '└ ' : ''}{r.name}</span><button onClick={() => toggle(r)} className="text-indigo-600">{r.active ? '비활성화' : '활성화'}</button></div>)}</div></section>;
}
