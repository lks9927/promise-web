import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { useNotification } from '../../../../contexts/NotificationContext';
import { supabase } from '../../../../lib/supabase';

export function DispatchOrderSettings({ config, onUpdate, partners }) {
    const { showToast } = useNotification();
    const [dispatchOrderMap, setDispatchOrderMap] = useState({});
    const [autoRegister, setAutoRegister] = useState(false);

    // 자동 순번 등록 설정 로드
    useEffect(() => {
        setAutoRegister(config.auto_dispatch_register === 'true');
    }, [config.auto_dispatch_register]);

    const toggleAutoRegister = async () => {
        const newVal = !autoRegister;
        setAutoRegister(newVal);
        await supabase.from('system_config').upsert({ key: 'auto_dispatch_register', value: String(newVal) });
        showToast('success', newVal ? '자동 등록 활성화' : '자동 등록 비활성화',
            newVal ? '팀장 승인 시 순번표에 자동 추가됩니다.' : '수동으로 순번을 등록해야 합니다.');
        onUpdate();
    };

    useEffect(() => {
        try {
            if (config.dispatch_order_map) {
                setDispatchOrderMap(JSON.parse(config.dispatch_order_map));
            }
        } catch (e) { console.error(e); }
    }, [config.dispatch_order_map]);

    const handleOrderChange = async (userId, newOrder) => {
        const orderVal = parseInt(newOrder);
        const newMap = { ...dispatchOrderMap };
        if (isNaN(orderVal) || newOrder === '') {
            delete newMap[userId];
        } else {
            newMap[userId] = orderVal;
        }
        setDispatchOrderMap(newMap);
        await supabase.from('system_config').upsert({ key: 'dispatch_order_map', value: JSON.stringify(newMap) });
        showToast('success', '저장 완료', '배차 순번이 업데이트 되었습니다.');
        onUpdate();
    };

    // 일괄 자동 순번 채우기 (현재 목록 순서대로 1, 2, 3...)
    const handleAutoFill = async () => {
        const leaders = partners?.filter(p => p.profiles?.role === 'leader' && p.status === 'approved'
        ).sort((a, b) => (dispatchOrderMap[a.user_id] || 999) - (dispatchOrderMap[b.user_id] || 999));

        if (!leaders || leaders.length === 0) return;
        if (!confirm(`${leaders.length}명 모두에게 현재 정렬 순서대로 1~${leaders.length} 순번을 자동 부여할까요?`)) return;

        const newMap = {};
        leaders.forEach((l, i) => { newMap[l.user_id] = i + 1; });
        setDispatchOrderMap(newMap);
        await supabase.from('system_config').upsert({ key: 'dispatch_order_map', value: JSON.stringify(newMap) });
        showToast('success', '자동 순번 완료', `${leaders.length}명에게 순번이 부여되었습니다.`);
        onUpdate();
    };

    // 순번 전체 초기화
    const handleResetOrder = async () => {
        if (!confirm('모든 순번 설정을 초기화할까요?')) return;
        setDispatchOrderMap({});
        await supabase.from('system_config').upsert({ key: 'dispatch_order_map', value: '{}' });
        showToast('info', '초기화 완료', '순번 설정이 초기화되었습니다.');
        onUpdate();
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm transition-all">
            <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-gray-600" /> 팀장 순차 배차 순위 설정
                </h4>
                <div className="flex gap-2">
                    <button
                        onClick={handleAutoFill}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        🔢 자동 순번 채우기
                    </button>
                    <button
                        onClick={handleResetOrder}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                        초기화
                    </button>
                </div>
            </div>
            <p className="text-sm text-gray-500 mb-1">숫자가 낮을수록(1, 2...) 먼저 배정됩니다. 순번 입력 후 다른 곳 클릭 시 즉시 저장됩니다.</p>

            {/* 자동 순번 등록 토글 */}
            <div className="flex items-center justify-between p-3 my-3 bg-gray-50 rounded-lg border border-gray-100">
                <div>
                    <div className="text-sm font-bold text-gray-800">🔄 승인 시 자동 순번 등록</div>
                    <div className="text-xs text-gray-500 mt-0.5">팀장 승인 시 배차 순번표 맨 뒤에 자동 추가됩니다.</div>
                </div>
                <button
                    onClick={toggleAutoRegister}
                    className={`w-14 h-8 rounded-full transition-colors relative ${autoRegister ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                    <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform shadow ${autoRegister ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
            </div>

            <p className="text-xs text-indigo-600 font-medium mb-4">
                ✅ 순번 등록: {Object.values(dispatchOrderMap).filter(v => typeof v === 'number' && v > 0).length}명 / 전체 {partners?.filter(p => p.profiles?.role === 'leader' && p.status === 'approved').length || 0}명
            </p>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                {partners
                    ?.filter(p => p.profiles?.role === 'leader' && p.status === 'approved')
                    .sort((a, b) => (dispatchOrderMap[a.user_id] || 9999) - (dispatchOrderMap[b.user_id] || 9999))
                    .map(leader => (
                    <div key={leader.user_id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        dispatchOrderMap[leader.user_id] ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                    }`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                dispatchOrderMap[leader.user_id] ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-400'
                            }`}>
                                {dispatchOrderMap[leader.user_id] || '–'}
                            </div>
                            <div>
                                <div className="font-bold text-gray-900 flex items-center gap-2">
                                    {leader.profiles?.name}
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                                        leader.grade === 'Master' ? 'bg-yellow-100 text-yellow-700' :
                                        leader.grade === 'S' ? 'bg-purple-100 text-purple-700' :
                                        leader.grade === 'A' ? 'bg-blue-100 text-blue-700' :
                                        'bg-gray-100 text-gray-600'
                                    }`}>{leader.grade || '일반'}</span>
                                    {!dispatchOrderMap[leader.user_id] && (
                                        <span className="text-xs text-orange-500 font-medium">미지정</span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-500">{leader.region || '지역 미정'}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500 font-bold">순번:</label>
                            <input
                                type="number"
                                min="1"
                                className={`w-16 px-2 py-1.5 border rounded text-center text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none ${
                                    dispatchOrderMap[leader.user_id] ? 'border-indigo-300 bg-white' : 'border-gray-300'
                                }`}
                                defaultValue={dispatchOrderMap[leader.user_id] || ''}
                                key={`${leader.user_id}-${dispatchOrderMap[leader.user_id]}`}
                                onBlur={e => handleOrderChange(leader.user_id, e.target.value)}
                                placeholder="순번"
                            />
                        </div>
                    </div>
                ))}
                {partners?.filter(p => p.profiles?.role === 'leader' && p.status === 'approved').length === 0 && (
                    <div className="text-center py-6 text-gray-500 text-sm">등록된 팀장이 없습니다.</div>
                )}
            </div>
        </div>
    );
}
