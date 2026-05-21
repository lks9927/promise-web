import React, { useState, useEffect } from 'react';
import { AlertCircle, Phone } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { useNotification } from '../../../../contexts/NotificationContext';

export function NotificationSettings({ config, toggleConfig, onUpdate }) {
    const { showToast } = useNotification();
    const [alertPhones, setAlertPhones] = useState(config.sms_alert_phones || '');

    useEffect(() => {
        setAlertPhones(config.sms_alert_phones || '');
    }, [config.sms_alert_phones]);

    const saveAlertPhones = async () => {
        await supabase.from('system_config').upsert({ key: 'sms_alert_phones', value: alertPhones });
        if (onUpdate) onUpdate();
        showToast('success', '저장 완료', '알림 수신 번호가 저장되었습니다.');
    };

    return (
        <>
        <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm space-y-4">
            <h4 className="font-bold text-indigo-900 mb-1 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-indigo-600" /> 네이버 클라우드(SENS) 문자 발송 설정
            </h4>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                    <h5 className="font-bold text-gray-800">1. 아이폰 유저 입찰 문자만 발송</h5>
                    <p className="text-xs text-gray-500">켜면 아이폰 사용자는 <b>입찰(장례) 알람만 문자로</b> 받고 그 외 일반 알람은 받지 않습니다. <br/>(끄면 일반 알람까지 모두 문자로 전송됩니다)</p>
                </div>
                <button
                    onClick={() => toggleConfig('ios_bidding_sms_only', config.ios_bidding_sms_only)}
                    className={`w-14 h-8 rounded-full transition-colors relative flex-shrink-0 ${config.ios_bidding_sms_only !== 'false' ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                    <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.ios_bidding_sms_only !== 'false' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                    <h5 className="font-bold text-gray-800">2. 모든 유저 입찰문자 필수 발송</h5>
                    <p className="text-xs text-gray-500">켜면 주요 장례/입찰콜 발생 시, <b>앱 푸시와 무관하게 안드로이드를 포함한 모든 사람</b>에게 문자가 전송됩니다.</p>
                </div>
                <button
                    onClick={() => toggleConfig('all_users_bidding_sms', config.all_users_bidding_sms)}
                    className={`w-14 h-8 rounded-full transition-colors relative flex-shrink-0 ${config.all_users_bidding_sms !== 'false' ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                    <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.all_users_bidding_sms !== 'false' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
            </div>
        </div>

        {/* 관리자 알림 문자 발송 설정 */}
        <div className="bg-white p-6 rounded-xl border border-orange-200 shadow-sm space-y-4">
            <h4 className="font-bold text-orange-900 mb-1 flex items-center gap-2">
                <Phone className="w-5 h-5 text-orange-600" /> 관리자 알림 문자 발송 설정
            </h4>
            <p className="text-xs text-gray-400">아래 이벤트 발생 시 지정된 번호로 알림 문자를 발송합니다.</p>

            {/* 토글 1: 신규 회원 가입 알림 */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                    <h5 className="font-bold text-gray-800">신규 회원 가입 알림</h5>
                    <p className="text-xs text-gray-500">새로운 회원이 가입하면 아래 번호로 알림 문자를 발송합니다.</p>
                </div>
                <button
                    onClick={() => toggleConfig('sms_alert_signup', config.sms_alert_signup || 'false')}
                    className={`w-14 h-8 rounded-full transition-colors relative flex-shrink-0 ${config.sms_alert_signup === 'true' ? 'bg-orange-500' : 'bg-gray-200'}`}
                >
                    <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.sms_alert_signup === 'true' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
            </div>

            {/* 토글 2: 신규 장례 접수 알림 */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                    <h5 className="font-bold text-gray-800">신규 장례 접수 알림</h5>
                    <p className="text-xs text-gray-500">새로운 장례가 접수되면 아래 번호로 알림 문자를 발송합니다.</p>
                </div>
                <button
                    onClick={() => toggleConfig('sms_alert_funeral', config.sms_alert_funeral || 'false')}
                    className={`w-14 h-8 rounded-full transition-colors relative flex-shrink-0 ${config.sms_alert_funeral === 'true' ? 'bg-orange-500' : 'bg-gray-200'}`}
                >
                    <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.sms_alert_funeral === 'true' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
            </div>

            {/* 토글 3: 비상 알람 (3명 누락) */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                    <h5 className="font-bold text-gray-800">비상 알람 (누락 인원 초과 시)</h5>
                    <p className="text-xs text-gray-500">설정된 인원 수만큼 무응답 누락이 발생하면 아래 번호로 비상 알림을 발송합니다.</p>
                </div>
                <button
                    onClick={() => toggleConfig('sms_alert_emergency', config.sms_alert_emergency || 'false')}
                    className={`w-14 h-8 rounded-full transition-colors relative flex-shrink-0 ${config.sms_alert_emergency === 'true' ? 'bg-red-500' : 'bg-gray-200'}`}
                >
                    <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.sms_alert_emergency === 'true' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
            </div>

            {/* 알림 수신 번호 입력 */}
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-100 space-y-3">
                <h5 className="font-bold text-gray-800">📱 알림 수신 번호</h5>
                <p className="text-xs text-gray-500">위 알림을 받을 번호를 입력하세요. 여러 개는 콤마(,)로 구분합니다.</p>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="예: 01052549927, 01012345678"
                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
                        value={alertPhones}
                        onChange={e => setAlertPhones(e.target.value)}
                    />
                    <button
                        onClick={saveAlertPhones}
                        className="px-5 py-2.5 bg-orange-500 text-white font-bold rounded-lg hover:bg-orange-600 transition-colors text-sm flex-shrink-0"
                    >
                        저장
                    </button>
                </div>
                {alertPhones && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        {alertPhones.split(',').map((p, i) => p.trim() && (
                            <span key={i} className="px-2 py-1 bg-white border border-orange-200 rounded-full text-xs text-orange-700 font-medium">
                                📞 {p.trim()}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
        </>
    );
}
