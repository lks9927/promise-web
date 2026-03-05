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
    LogOut,
    Gift,
    ChevronRight
} from 'lucide-react';
import TeamLeaderProfileModal from '../components/common/TeamLeaderProfileModal';
import TimelineView from '../components/common/TimelineView';

export default function CustomerStatus() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [myCase, setMyCase] = useState(null);
    const [loading, setLoading] = useState(true);
    const [couponCode, setCouponCode] = useState(''); // New: Coupon Code State
    const [profileModalOpen, setProfileModalOpen] = useState(false);

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
                        name,
                        phone
                    ),
                    team_leader:team_leader_id (
                        name,
                        phone,
                        role,
                        avatar_url,
                        certificate_url,
                        business_license_url,
                        experience_years,
                        introduction
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

    const handleRegisterCoupon = async (e) => {
        e.preventDefault();
        if (!couponCode) return;

        try {
            setLoading(true);

            // 1. Verify Coupon
            const { data: coupon, error: fetchError } = await supabase
                .from('coupons')
                .select('*')
                .eq('code', couponCode.toUpperCase())
                .eq('status', 'issued')
                .single();

            if (fetchError || !coupon) {
                alert('유효하지 않은 쿠폰이거나 이미 사용된 쿠폰입니다.');
                setLoading(false);
                return;
            }

            // 2. Update Coupon Status
            const { error: updateError } = await supabase
                .from('coupons')
                .update({
                    status: 'used',
                    used_by: user.id,
                    used_at: new Date().toISOString()
                })
                .eq('code', coupon.code);

            if (updateError) throw updateError;

            // 3. Update User Cashback (Optional: if we want to track total cashback on profile immediately)
            // But for now, we can just rely on the connection or trigger a profile update if needed.
            // Let's assume we just mark it as used and maybe show it in a list later.
            // For better UX, let's update profile cashback if column exists.

            // Re-fetch or just alert success
            alert(`🎉 축하합니다! ${coupon.amount.toLocaleString()}원 캐시백이 적립되었습니다.`);
            setCouponCode('');

        } catch (error) {
            console.error('Coupon Error:', error);
            alert('쿠폰 등록 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
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

                {/* New: Coupon Registration Section */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                    <div className="relative z-10">
                        <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
                            <Gift className="w-5 h-5 text-amber-300" /> 캐시백 쿠폰 등록
                        </h3>
                        <p className="text-indigo-100 text-sm mb-4">발급받으신 쿠폰 번호를 입력하고 혜택을 받으세요.</p>

                        <form onSubmit={handleRegisterCoupon} className="flex gap-2">
                            <input
                                type="text"
                                placeholder="쿠폰 번호 입력"
                                className="flex-1 px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-indigo-200 focus:outline-none focus:bg-white/20 transition-all font-mono"
                                value={couponCode}
                                onChange={e => setCouponCode(e.target.value.toUpperCase())}
                            />
                            <button
                                type="submit"
                                className="px-4 py-2 bg-white text-indigo-600 font-bold rounded-lg hover:bg-gray-100 transition-colors shadow-sm"
                            >
                                등록
                            </button>
                        </form>
                    </div>
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
                {myCase.team_leader ? (
                    <div
                        onClick={() => setProfileModalOpen(true)}
                        className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center gap-4 cursor-pointer hover:border-indigo-200 transition-colors group"
                    >
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
                            {myCase.team_leader.profiles?.avatar_url ? (
                                <img src={myCase.team_leader.profiles.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-8 h-8 text-gray-300" />
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="text-sm text-gray-400 font-medium">담당 본부장/팀장</div>
                            <div className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                                {myCase.team_leader.profiles?.name || '정보 없음'}
                            </div>
                            <div className="text-gray-500 text-sm flex items-center gap-1 mt-0.5">
                                프로필 보기 <ChevronRight className="w-3 h-3" />
                            </div>
                        </div>
                        <a
                            href={`tel:${myCase.team_leader.profiles?.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 hover:bg-green-200 transition-colors shadow-sm"
                        >
                            <Phone className="w-5 h-5" />
                        </a>
                    </div>
                ) : (
                    <div className="bg-gray-50 rounded-2xl p-6 text-center text-gray-500 text-sm border border-dashed border-gray-300">
                        아직 담당 본부장/팀장이 배정되지 않았습니다.<br />
                        곧 최적의 전문가를 배정해드리겠습니다.
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

                {/* 6-Stage Progress Timeline */}
                <TimelineView caseId={myCase.id} />

            </main>

            {myCase.team_leader && (
                <TeamLeaderProfileModal
                    isOpen={profileModalOpen}
                    onClose={() => setProfileModalOpen(false)}
                    leaderProfile={myCase.team_leader.profiles}
                />
            )}
        </div>
    );
}
