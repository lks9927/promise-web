import React, { useEffect, useState } from 'react';
import { getMyPreRegistrations } from '../../lib/preRegistration';

const labels = { registered: '보관중', converted: '접수완료' };

export function PreRegistrationList({ dealerId }) {
    const [items, setItems] = useState(null);
    useEffect(() => {
        getMyPreRegistrations(dealerId).then(({ data, error }) => {
            if (!error) setItems(data || []);
        }).catch(() => {});
    }, [dealerId]);
    if (items === null) return null;
    return <section className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
        <h3 className="font-bold text-gray-800 text-lg mb-3">내 안심 혜택 명단</h3>
        {items.length === 0 ? <p className="text-gray-400 text-sm">아직 등록한 가족이 없습니다.</p> : <div className="space-y-2">
            {items.map(item => <div key={item.id} className="flex items-center justify-between border-t border-gray-100 pt-2 text-sm">
                <div><span className="font-bold text-gray-800">{item.masked_name}</span><span className="ml-2 text-gray-500">{item.relationship}</span></div>
                <div className="text-right"><span className="font-bold text-indigo-600">{labels[item.status] || item.status}</span><p className="text-xs text-gray-400 mt-1">{new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.created_at))}</p></div>
            </div>)}
        </div>}
    </section>;
}
