import React, { useState, useEffect } from 'react';
import { X, Share, Settings, PlusSquare, ArrowUp, Bell, Smartphone } from 'lucide-react';

const InstallGuideModal = ({ isOpen, onClose }) => {
    const [osType, setOsType] = useState('android'); // 기본값

    useEffect(() => {
        const userAgent = navigator.userAgent.toLowerCase();
        if (/iphone|ipad|ipod/i.test(userAgent)) {
            setOsType('ios');
        } else if (/android/i.test(userAgent)) {
            setOsType('android');
        } else {
            setOsType('pc');
        }
    }, []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-70 animate-fadeIn">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Smartphone size={24} />
                        앱 설치 및 알림 설정 가이드
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-indigo-500 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto">
                    {osType === 'ios' && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6">
                                <p className="text-blue-800 font-bold mb-2">🍎 아이폰(iPhone) 사용자 필수 안내</p>
                                <p className="text-sm text-blue-700 leading-relaxed">
                                    아이폰은 사파리 인터넷 창으로 접속하면 며칠 뒤 로그인이 풀립니다. 반드시 아래 순서대로 <b>[홈 화면에 추가]</b>하여 앱으로 사용해주세요!
                                </p>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 mt-1">1</div>
                                <div>
                                    <p className="font-bold text-gray-800 text-lg">하단 공유 버튼 누르기</p>
                                    <p className="text-gray-600 mt-1">화면 맨 아래 가운데에 있는 <Share className="inline w-5 h-5 text-blue-500 mx-1"/>공유 버튼(네모 안에서 화살표가 위로 나가는 모양)을 누르세요.</p>
                                </div>
                            </div>
                            
                            <div className="flex justify-center my-2">
                                <ArrowUp className="text-gray-300" size={24} />
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 mt-1">2</div>
                                <div>
                                    <p className="font-bold text-gray-800 text-lg">[홈 화면에 추가] 누르기</p>
                                    <p className="text-gray-600 mt-1">메뉴를 위로 살짝 올려서 <PlusSquare className="inline w-5 h-5 text-gray-600 mx-1"/><b>'홈 화면에 추가'</b>를 찾아 누르세요.</p>
                                </div>
                            </div>

                            <div className="flex justify-center my-2">
                                <ArrowUp className="text-gray-300" size={24} />
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 mt-1">3</div>
                                <div>
                                    <p className="font-bold text-gray-800 text-lg">바탕화면에서 앱 실행 & 로그인</p>
                                    <p className="text-gray-600 mt-1">바탕화면에 설치된 <b>[10년의약속]</b> 아이콘을 눌러서 들어가신 후, <b>딱 한 번만 다시 로그인</b>하세요. 이제 절대 풀리지 않습니다!</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {osType === 'android' && (
                        <div className="space-y-6">
                            <div className="bg-green-50 p-4 rounded-xl border border-green-100 mb-6">
                                <p className="text-green-800 font-bold mb-2">🤖 안드로이드(갤럭시) 사용자 필수 안내</p>
                                <p className="text-sm text-green-700 leading-relaxed">
                                    장례 배정 알림 문자를 놓치지 않으려면 반드시 <b>앱을 설치하고 알림을 허용</b>해 주셔야 합니다.
                                </p>
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 mt-1">1</div>
                                <div>
                                    <p className="font-bold text-gray-800 text-lg">설정 메뉴 열기</p>
                                    <p className="text-gray-600 mt-1">화면 우측 상단에 있는 <Settings className="inline w-5 h-5 text-gray-600 mx-1"/>점 3개(설정) 버튼을 누르세요.</p>
                                </div>
                            </div>
                            
                            <div className="flex justify-center my-2">
                                <ArrowUp className="text-gray-300" size={24} />
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 mt-1">2</div>
                                <div>
                                    <p className="font-bold text-gray-800 text-lg">[앱 설치] 누르기</p>
                                    <p className="text-gray-600 mt-1">메뉴에서 <b>'앱 설치'</b> 또는 <b>'홈 화면에 추가'</b>를 눌러 설치를 진행하세요.</p>
                                </div>
                            </div>

                            <div className="flex justify-center my-2">
                                <ArrowUp className="text-gray-300" size={24} />
                            </div>

                            <div className="flex items-start gap-4">
                                <div className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-full flex items-center justify-center font-bold flex-shrink-0 mt-1">3</div>
                                <div>
                                    <p className="font-bold text-gray-800 text-lg">알림 반드시 [허용] 하기</p>
                                    <p className="text-gray-600 mt-1">바탕화면에 설치된 앱으로 들어가면 뜨는 알림 권한 팝업에서 <Bell className="inline w-5 h-5 text-yellow-500 mx-1"/><b>[허용]</b>을 꼭 눌러주세요!</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {osType === 'pc' && (
                        <div className="text-center py-8">
                            <p className="text-lg font-bold text-gray-800 mb-2">현재 PC(컴퓨터)로 접속하셨습니다.</p>
                            <p className="text-gray-600">앱 설치 및 알림 설정은 스마트폰에서 접속하여 진행해주세요.</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-gray-50 p-4 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                        확인했습니다
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InstallGuideModal;
