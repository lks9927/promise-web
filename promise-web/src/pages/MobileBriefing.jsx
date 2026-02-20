import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Clock } from 'lucide-react';

const MobileBriefing = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-indigo-600 px-6 py-8 text-white rounded-b-3xl shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <button onClick={() => navigate('/')} className="p-2 bg-indigo-500 rounded-full hover:bg-indigo-400 transition">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm font-medium bg-indigo-500 px-3 py-1 rounded-full">Project Briefing</span>
                </div>
                <h1 className="text-2xl font-bold mb-2">10년의 약속<br />진행 상황 보고</h1>
                <p className="text-indigo-100 text-sm">현재 단계: 정산 시스템 구축 (DB 완료)</p>
            </div>

            {/* Content */}
            <div className="px-5 -mt-6">

                {/* Card 1: Completed Work */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-4">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-green-100 rounded-lg">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-800">완료된 작업</h2>
                    </div>
                    <ul className="space-y-3">
                        <li className="flex items-start gap-3">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></span>
                            <span className="text-gray-600 text-sm">DB 테이블 설계 및 변경 (예치금, 정산)</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></span>
                            <span className="text-gray-600 text-sm">수수료 자동 계산 로직 (함수/트리거)</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2"></span>
                            <span className="text-gray-600 text-sm">역할별 권한 매트릭스 확정</span>
                        </li>
                    </ul>
                </div>

                {/* Card 2: Next Steps */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-4 ring-1 ring-indigo-50">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Clock className="w-5 h-5 text-blue-600" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-800">다음 진행 예정</h2>
                    </div>

                    <div className="space-y-5">
                        <div className="border-l-2 border-indigo-200 pl-4 py-1">
                            <h3 className="font-bold text-gray-900 text-sm mb-1">1. 관리자 정산 페이지</h3>
                            <p className="text-gray-500 text-xs leading-relaxed">
                                계산된 수수료를 확인하고, 관리자가 금액을 직접 수정(Override)하여 지급 처리하는 화면 개발
                            </p>
                        </div>
                        <div className="border-l-2 border-indigo-200 pl-4 py-1">
                            <h3 className="font-bold text-gray-900 text-sm mb-1">2. 딜러/마스터 수익 확인</h3>
                            <p className="text-gray-500 text-xs leading-relaxed">
                                내 식구들(하위 조직)의 실적과 본인의 예상 수익금을 실시간으로 확인하는 대시보드
                            </p>
                        </div>
                        <div className="border-l-2 border-indigo-200 pl-4 py-1">
                            <h3 className="font-bold text-gray-900 text-sm mb-1">3. 팀장 '내 지갑'</h3>
                            <p className="text-gray-500 text-xs leading-relaxed">
                                예치금 충전, 장례 사용료 송금(차감), 입출금 내역을 관리하는 지갑 기능
                            </p>
                        </div>
                    </div>
                </div>

                {/* Action Button */}
                <div className="mt-8 text-center text-gray-400 text-xs">
                    이 페이지는 모바일 검토용 브리핑 리포트입니다.<br />
                    PC 화면에서 다시 개발을 진행해주세요.
                </div>

            </div>
        </div>
    );
};

export default MobileBriefing;
