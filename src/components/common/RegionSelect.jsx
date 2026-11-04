import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Shared by every intake surface.  A missing selection deliberately remains null.
export function RegionSelect({ value, onChange, required = false }) {
  const [regions, setRegions] = useState([]);
  const [sidoId, setSidoId] = useState('');

  useEffect(() => {
    supabase.from('regions').select('id,parent_id,name,level,sort').eq('active', true).order('sort').then(({ data }) => setRegions(data || []));
  }, []);
  const sidos = useMemo(() => regions.filter(r => r.level === 'sido'), [regions]);
  const sigungus = useMemo(() => regions.filter(r => r.level === 'sigungu' && r.parent_id === sidoId), [regions, sidoId]);
  useEffect(() => {
    const selected = regions.find(r => String(r.id) === String(value));
    if (selected?.parent_id) setSidoId(selected.parent_id);
  }, [regions, value]);

  return <div className="grid grid-cols-2 gap-2">
    <select value={sidoId} onChange={e => { setSidoId(e.target.value); onChange(null); }} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm">
      <option value="">시·도 선택 (선택)</option>
      {sidos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
    <select value={value || ''} required={required} disabled={!sidoId} onChange={e => onChange(e.target.value || null)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100">
      <option value="">시·군·구 선택 (선택)</option>
      {sigungus.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  </div>;
}
