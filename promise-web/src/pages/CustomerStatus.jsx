import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
    Phone,
    CheckCircle,
    User,
    Truck,
    Star,
    Heart,
    LogOut
} from 'lucide-react';

export default function CustomerStatus() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [myCase, setMyCase] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        checkSession();
    }, []);

    const checkSession = async () => {
        try {
            const storedUser = localStorage.getItem('user');
            if (!storedUser) {
                alert('로그인이 필요한 서비스입니다.');
                navigate('/login');
                return;
            }

            const userData = JSON.parse(storedUser);
            setUser(userData);

            // Fetch active case
            await fetchMyCase(userData.id);

        } catch (error) {
            console.error('Session check error:', error);
            navigate('/login');
        }
    };

    const fetchMyCase = async (userId) => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('funeral_cases')
                .select(`
                    *,
                    dealer:dealer_id (
                        *,
                        profiles:user_id (name, phone)
                    )
                `)
                .eq('customer_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') { // Ignore not found error
                throw error;
            }

            if (data) {
                setMyCase(data);
            }

        } catch (error) {
            console.error('Fetch case error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('user');
        navigate('/login');
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center">로딩 중...</div>;
    }

    if (!myCase) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
                <div className="text-center">
                    <Heart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">진행 중인 장례 내역이 없습니다.</h2>
                    <p className="text-gray-500 mb-6">새로운 장례 접수가 필요하신가요?</p>
                    <div className="flex gap-4 justify-center">
                        <button onClick={() => navigate('/')} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">홈으로</button>
                        <button onClick={handleLogout} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">로그아웃</button>
                    </div>
                </div>
            </div>
        );
    }

    // Progress Steps
    const steps = [
        { id: 'requested', label: '접수 완료', icon: CheckCircle },
        { id: 'assigned', label: '팀장 배정', icon: User },
        { id: 'in_progress', label: '장례 진행', icon: Truck },
        { id: 'completed', label: '발인/종료', icon: Star }
    ];

    const currentStepIndex = steps.findIndex(s => s.id === myCase.status) < 0
        ? (myCase.status === 'hq_check' || myCase.status === 'team_settling' ? 3 : 0)
        : steps.findIndex(s => s.id === myCase.status);

    return (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans">
            {/* Header */}
            <header className="bg-white px-6 py-4 shadow-sm flex items-center justify-between sticky top-0 z-10">
                <h1 className="text-lg font-bold text-gray-900">내 장례 진행 현황</h1>
                <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-red-500 flex items-center gap-1">
                    <LogOut className="w-4 h-4" /> 로그아웃
                </button>
            </header>

            <main className="max-w-md mx-auto p-6 space-y-6">

                {/* Welcome Message */}
                <div className="text-center mb-2">
                    <p className="text-gray-500 text-sm">
                        <span className="font-bold text-gray-900">{user.name}</span>님, 따뜻한 마음으로 함께하겠습니다.
                    </p>
                </div>

                {/* Status Card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                    <div className="text-center mb-6">
                        <div className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-bold mb-2">
                            현재 상태
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900">
                            {myCase.status === 'requested' && '팀장 배정 대기 중'}
                            {myCase.status === 'assigned' && '팀장 출동 중'}
                            {myCase.status === 'in_progress' && '장례 서비스 진행 중'}
                            {(myCase.status === 'completed' || myCase.status === 'hq_check' || myCase.status === 'team_settling') && '장례 절차 종료'}
                        </h2>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex justify-between relative mt-8">
                        {/* Line */}
                        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -z-10 -translate-y-1/2"></div>
                        <div
                            className="absolute top-1/2 left-0 h-1 bg-indigo-600 -z-10 -translate-y-1/2 transition-all duration-500"
                            style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
                        ></div>

                        {steps.map((step, idx) => {
                            const isActive = idx <= currentStepIndex;
                            return (
                                <div key={step.id} className="flex flex-col items-center gap-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 border-2 transition-all ${isActive ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-300'
                                        }`}>
                                        <step.icon className="w-4 h-4" />
                                    </div>
                                    <span className={`text-xs font-medium ${isActive ? 'text-indigo-700' : 'text-gray-400'}`}>
                                        {step.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Assigned Leader Card */}
                {myCase.dealer ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4">
                        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-3xl overflow-hidden">
                            🧔🏻
                        </div>
                        <div className="flex-1">
                            <div className="text-sm text-gray-400 font-medium">담당 팀장</div>
                            <div className="text-lg font-bold text-gray-900">{myCase.dealer.profiles?.name || '정보 없음'}</div>
                            <div className="text-indigo-600 text-sm font-medium">{myCase.dealer.profiles?.phone || ''}</div>
                        </div>
                        <a href={`tel:${myCase.dealer.profiles?.phone}`} className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 hover:bg-green-200 transition-colors shadow-sm">
                            <Phone className="w-5 h-5" />
                        </a>
                    </div>
                ) : (
                    <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-500 text-sm border border-dashed border-gray-300">
                        아직 담당 팀장이 배정되지 않았습니다.<br />
                        곧 배정 후 연락드리겠습니다.
                    </div>
                )}

                {/* Case Details */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
                    <h3 className="font-bold text-gray-900">접수 정보</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b border-gray-50 pb-2">
                            <span className="text-gray-500">장소</span>
                            <span className="text-gray-900 font-medium">{myCase.location}</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-50 pb-2">
                            <span className="text-gray-500">상품</span>
                            <span className="text-gray-900 font-medium">{myCase.package_name || '미정 (상담 후 결정)'}</span>
                        </div>
                        <div className="flex justify-between items-center pt-1">
                            <span className="text-gray-500">접수 일시</span>
                            <span className="text-gray-900 font-medium text-xs bg-gray-100 px-2 py-1 rounded">{new Date(myCase.created_at).toLocaleString()}</span>
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}
