import React from 'react';
import { supabase } from '../../../../lib/supabase';

export function GeneralSettings({ config, toggleConfig, onUpdate }) {
    return (
        <>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h4 className="font-bold text-gray-900 mb-1">하늘꽃(입관꽃) 필수 발주</h4>
                    <p className="text-sm text-gray-500">팀장 화면에서 '하늘꽃 발주' 버튼을 노출시킬지 설정합니다.</p>
                </div>
                <button
                    onClick={() => toggleConfig('flower_order_required', config.flower_order_required)}
                    className={`w-14 h-8 rounded-full transition-colors relative ${config.flower_order_required === 'true' ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                    <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.flower_order_required === 'true' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h4 className="font-bold text-gray-900 mb-1">전체 정산 기능 활성화</h4>
                    <p className="text-sm text-gray-500">딜러 및 마스터의 '정산 신청' 버튼을 활성화합니다. (마감 시 OFF 권장)</p>
                </div>
                <button
                    onClick={() => toggleConfig('global_settlement_enabled', config.global_settlement_enabled)}
                    className={`w-14 h-8 rounded-full transition-colors relative ${config.global_settlement_enabled === 'true' ? 'bg-green-600' : 'bg-gray-200'}`}
                >
                    <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.global_settlement_enabled === 'true' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h4 className="font-bold text-indigo-900 mb-1">상단 스크롤 메뉴 표시 (팀원/마스터/딜러)</h4>
                    <p className="text-sm text-gray-500">대시보드 상단의 탭 메뉴(입찰가능 등)를 표시하거나 숨깁니다.</p>
                </div>
                <button
                    onClick={() => toggleConfig('show_top_menu', config.show_top_menu || 'true')}
                    className={`w-14 h-8 rounded-full transition-colors relative ${config.show_top_menu !== 'false' ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                    <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.show_top_menu !== 'false' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h4 className="font-bold text-gray-900 mb-1">딜러 1회 최대 쿠폰 발행량</h4>
                    <p className="text-sm text-gray-500">딜러들이 한 번에 발행할 수 있는 쿠폰 수량을 제한합니다.</p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        className="w-20 px-3 py-1.5 border rounded-lg text-center font-bold"
                        value={config.max_coupon_per_batch || '10'}
                        onChange={async (e) => {
                            const val = e.target.value;
                            await supabase.from('system_config').upsert({ key: 'max_coupon_per_batch', value: val });
                            onUpdate();
                        }}
                    />
                    <span className="text-sm text-gray-500 font-medium">장</span>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                <div>
                    <h4 className="font-bold text-gray-900 mb-1">딜러 발행 최대 쿠폰 금액</h4>
                    <p className="text-sm text-gray-500">딜러가 발행할 수 있는 단일 쿠폰의 최대 금액을 제한합니다.</p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        step="10000"
                        className="w-32 px-3 py-1.5 border rounded-lg text-center font-bold"
                        value={config.max_coupon_amount || '200000'}
                        onChange={async (e) => {
                            const val = e.target.value;
                            await supabase.from('system_config').upsert({ key: 'max_coupon_amount', value: val });
                            onUpdate();
                        }}
                    />
                    <span className="text-sm text-gray-500 font-medium">원</span>
                </div>
            </div>
        </>
    );
}
