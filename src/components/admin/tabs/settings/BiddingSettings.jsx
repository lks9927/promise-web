import React, { useState } from 'react';
import { Clock } from 'lucide-react';
import { useNotification } from '../../../../contexts/NotificationContext';
import { supabase } from '../../../../lib/supabase';

export function BiddingSettings({ config, onUpdate }) {
    const { showToast } = useNotification();
    const [timeoutMinutes, setTimeoutMinutes] = useState(config.bidding_timeout_minutes || '5');
    const [maxPings, setMaxPings] = useState(config.bidding_max_pings || '3');
    const [escalationCount, setEscalationCount] = useState(config.escalation_pass_count || '3');

    const handleSave = async () => {
        await supabase.from('system_config').upsert([
            { key: 'bidding_timeout_minutes', value: timeoutMinutes },
            { key: 'bidding_max_pings', value: maxPings },
            { key: 'escalation_pass_count', value: escalationCount }
        ]);
        showToast('success', '저장 완료', '배정 타임아웃 및 에스컬레이션 설정이 저장되었습니다.');
        onUpdate();
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-indigo-200 shadow-md">
            <h4 className="font-bold text-indigo-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" /> 순차 배정 타이머 및 비상 알람 설정
            </h4>
            <div className="space-y-4">
                <div className="flex bg-gray-50 p-4 rounded-xl border border-gray-100 flex-col md:flex-row gap-4 justify-between md:items-center">
                    <div>
                        <div className="font-bold text-gray-800">개별 팀장 알람 간격 (응답 대기시간)</div>
                        <div className="text-xs text-gray-500">지정된 시간(분)마다 한 명의 팀장에게 배정 요청 알람을 유지/재발송 합니다.</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min="1"
                            max="60"
                            className="w-20 px-3 py-2 border rounded-lg text-center font-bold"
                            value={timeoutMinutes}
                            onChange={(e) => setTimeoutMinutes(e.target.value)}
                        />
                        <span className="text-sm text-gray-500 font-medium">분</span>
                    </div>
                </div>

                <div className="flex bg-gray-50 p-4 rounded-xl border border-gray-100 flex-col md:flex-row gap-4 justify-between md:items-center">
                    <div>
                        <div className="font-bold text-gray-800">한 사람당 최대 알람 발송 횟수</div>
                        <div className="text-xs text-gray-500">한 명에게 (알람 간격마다) 최대 몇 번까지 재알람을 보낼지 설정합니다. (초과 시 다음 사람에게 패스)</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min="1"
                            max="10"
                            className="w-20 px-3 py-2 border rounded-lg text-center font-bold"
                            value={maxPings}
                            onChange={(e) => setMaxPings(e.target.value)}
                        />
                        <span className="text-sm text-gray-500 font-medium">회</span>
                    </div>
                </div>

                <div className="flex bg-gray-50 p-4 rounded-xl border border-gray-100 flex-col md:flex-row gap-4 justify-between md:items-center">
                    <div>
                        <div className="font-bold text-red-700">관리자 비상 알람 발동 기준 (누락 인원)</div>
                        <div className="text-xs text-red-500 font-medium">다음 사람으로 계속 패스되어 설정된 '명' 수가 넘어가면 본사에 긴급 알람이 울립니다.</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min="1"
                            max="100"
                            className="w-20 px-3 py-2 border-red-200 rounded-lg text-center font-bold text-red-700 focus:ring-red-500"
                            value={escalationCount}
                            onChange={(e) => setEscalationCount(e.target.value)}
                        />
                        <span className="text-sm text-red-500 font-bold">명 누락 시</span>
                    </div>
                </div>

                <div className="pt-2 flex justify-end">
                    <button onClick={handleSave} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-sm transition-colors">
                        설정 저장하기
                    </button>
                </div>
            </div>
            <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-700">
                <span className="font-bold">계산 예시:</span> 현재 설정 기준 <b>한 사람 당 총 {parseInt(timeoutMinutes) * parseInt(maxPings) || 0}분 ({timeoutMinutes}분 간격 × {maxPings}회)</b>간 대기한 후 다음 순번으로 넘어갑니다.<br/>
                이후 이러한 패스가 누적되어 총 <b>{escalationCount}명</b>이 패스하면 관리자에게 긴급 비상 알림이 울립니다.
            </div>
        </div>
    );
}
