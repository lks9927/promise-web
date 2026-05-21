import React from 'react';
import { Clock, ListOrdered } from 'lucide-react';

export function DispatchSettings({ config, toggleConfig, onUpdate }) {
    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm flex items-center justify-between ring-1 ring-indigo-50">
                <div>
                    <h4 className="font-bold text-indigo-900 mb-1 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-indigo-600" /> 팀장 실시간 입찰 허용
                    </h4>
                    <p className="text-sm text-gray-500">팀장(상례사)이 대기 중인 장례 건에 직접 입찰할 수 있도록 허용합니다.</p>
                </div>
                <button
                    onClick={() => toggleConfig('bidding_enabled', config.bidding_enabled)}
                    className={`w-14 h-8 rounded-full transition-colors relative ${config.bidding_enabled === 'true' ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                    <span className={`absolute top-1 left-1 bg-white w-6 h-6 rounded-full transition-transform ${config.bidding_enabled === 'true' ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h4 className="font-bold text-indigo-900 mb-1 flex items-center gap-2">
                            <ListOrdered className="w-5 h-5 text-indigo-600" /> 팀장 배차 방식
                        </h4>
                        <p className="text-sm text-gray-500">신규 접수 건 발생 시 팀장들에게 콜을 노출하는 방식을 선택합니다.</p>
                    </div>
                </div>
                <div className="flex flex-col gap-4 mb-6">
                    <button
                        onClick={() => toggleConfig('dispatch_mode', config.dispatch_mode, 'team_hybrid')}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${config.dispatch_mode === 'team_hybrid' ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-gray-200 hover:border-indigo-300'}`}
                    >
                        <div className="font-bold text-gray-900 text-lg flex items-center gap-2">🏆 팀별 균등 하이브리드 (권장)</div>
                        <div className="text-sm text-gray-500 mt-1">
                            팀(마스터 단위)이 연속으로 콜을 독식하는 것을 방지합니다. <br />
                            <span className="text-indigo-600 font-medium">최신 룰: 다른 마스터 팀 단위로 턴을 돌리며, 그 안에서 가중치(신규/실적)가 가장 높은 사람에게 우선 배정합니다.</span>
                        </div>
                    </button>
                    <div className="flex gap-4">
                        <button
                            onClick={() => toggleConfig('dispatch_mode', config.dispatch_mode, 'hybrid')}
                            className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${config.dispatch_mode === 'hybrid' || !config.dispatch_mode ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-gray-200 hover:border-indigo-300'}`}
                        >
                            <div className="font-bold text-gray-900">⚖️ 전체 가중치 기반 배정</div>
                            <div className="text-xs text-gray-500 mt-1">소속 팀에 상관없이 전체 110명 중 점수가 높은 순으로 배정합니다. (모수가 적을 때 적합)</div>
                        </button>
                        <button
                            onClick={() => toggleConfig('dispatch_mode', config.dispatch_mode, 'sequential')}
                            className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${config.dispatch_mode === 'sequential' ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-gray-200 hover:border-indigo-300'}`}
                        >
                            <div className="font-bold text-gray-900">🔢 완전 수동 순번 배정</div>
                            <div className="text-xs text-gray-500 mt-1">아래에서 지정한 고정 순번대로 콜을 넘깁니다. (점수 무시)</div>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
