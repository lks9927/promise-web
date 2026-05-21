import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import bcrypt from 'bcryptjs';
import { requestPushPermission } from '../lib/firebase';
import InstallGuideModal from '../components/common/InstallGuideModal';

const Login = () => {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [defaultPwWarning, setDefaultPwWarning] = useState(false); // 기본 비밀번호 경고
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const navigate = useNavigate();

    // 🔹 Redirect if already logged in
    React.useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const user = JSON.parse(storedUser);
            switch (user.role) {
                case 'admin':
                    navigate(user.phone === 'manager' ? '/admin?role=operating' : '/admin?role=super');
                    break;
                case 'master':
                case 'leader':
                case 'dealer': navigate('/dealer'); break;
                case 'vendor': navigate('/vendor'); break;
                case 'customer': navigate('/mypage'); break;
                default: navigate('/');
            }
        }
    }, [navigate]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // 1. Supabase 공식 Auth 시스템을 이용한 안전한 인증
            // (마이그레이션 스크립트에 의해 이메일은 '전화번호/아이디(영어/숫자만)@promise10.com' 형식으로 맵핑됨)
            const sanitizedPhone = phone.replace(/[^0-9a-zA-Z]/g, '');
            const loginEmail = `${sanitizedPhone}@promise10.com`;

            let authenticatedUser = null;
            let finalUserId = null;

            try {
                // 1. Supabase 공식 Auth 시스템 시도
                const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                    email: loginEmail,
                    password: password,
                });

                if (!authError && authData?.user) {
                    finalUserId = authData.user.id;
                }
            } catch (ignored) {}

            // 2. 만약 Supabase Auth 실패 시 (legacy 유저 또는 관리자 강제 비번 초기화 상태) profiles 폴백 검증
            if (!finalUserId) {
                const { data: fallbackUsers } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('phone', phone);
                
                const profile = fallbackUsers?.[0];
                if (profile) {
                    let isMatch = false;
                    // Check if it's hashed (bcrypt hashes start with $2a$, $2b$ or $2y$)
                    if (profile.password?.startsWith('$2a$') || profile.password?.startsWith('$2b$')) {
                        isMatch = bcrypt.compareSync(password, profile.password);
                    } else {
                        // Legacy plaintext comparison
                        isMatch = (profile.password === password);
                    }

                    if (isMatch) {
                        finalUserId = profile.id;
                    }
                }
            }

            if (!finalUserId) {
                throw new Error('전화번호(아이디) 또는 비밀번호가 일치하지 않습니다.');
            }

            // 3. 프로필 상세 정보 다시 로딩
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', finalUserId)
                .single();

            if (error) throw error;

            if (data) {
                // 🔹 Check Partner Status (Approval)
                if (data.role === 'leader' || data.role === 'dealer' || data.role === 'master') {
                    const { data: partnerData } = await supabase
                        .from('partners')
                        .select('status')
                        .eq('user_id', data.id)
                        .single();

                    if (partnerData) {
                        if (partnerData.status === 'pending') {
                            throw new Error('마스터 승인 대기 중인 계정입니다.');
                        }
                        if (partnerData.status === 'suspended') {
                            throw new Error('활동이 정지된 계정입니다. 관리자에게 문의하세요.');
                        }
                    }
                }

                // 🔹 Check Vendor Status (Approval)
                if (data.role === 'vendor') {
                    const { data: vendorData } = await supabase
                        .from('vendors')
                        .select('status')
                        .eq('user_id', data.id)
                        .single();

                    if (vendorData) {
                        if (vendorData.status === 'pending') {
                            throw new Error('관리자 승인 대기 중인 외주업체 계정입니다.');
                        }
                        if (vendorData.status === 'suspended') {
                            throw new Error('활동이 정지된 외주업체입니다. 관리자에게 문의하세요.');
                        }
                        if (vendorData.status === 'rejected') {
                            throw new Error('가입이 반려된 외주업체입니다.');
                        }
                    }
                }

                console.log('Login successful:', data);

                // 🔹 Capture OS Type
                let osType = 'web';
                const userAgent = navigator.userAgent.toLowerCase();
                if (/android/i.test(userAgent)) {
                    osType = 'android';
                } else if (/iphone|ipad|ipod/i.test(userAgent)) {
                    osType = 'ios';
                }

                if (data.os_type !== osType || (osType === 'android' && !data.fcm_token)) {
                    const updatePayload = { os_type: osType };

                    // 안드로이드일 경우 푸시 권한을 요청하고 토큰을 받아 DB에 함께 저장
                    if (osType === 'android') {
                        const token = await requestPushPermission();
                        if (token) {
                            updatePayload.fcm_token = token;
                            data.fcm_token = token;
                        }
                    }

                    await supabase
                        .from('profiles')
                        .update(updatePayload)
                        .eq('id', finalUserId);
                        
                    data.os_type = osType;
                }

                // Store user session
                localStorage.setItem('user', JSON.stringify(data));

                // 기본 비밀번호(전화번호 뒤 6자리) 사용 여부 체크
                const last6 = data.phone?.replace(/-/g, '').slice(-6);
                if (last6 && password === last6) {
                    setDefaultPwWarning(true);
                    // 3초 후 대시보드로 이동
                    setTimeout(() => {
                        switch (data.role) {
                            case 'admin':
                                window.location.href = data.phone === 'manager' ? '/admin?role=operating' : '/admin?role=super';
                                break;
                            case 'master': case 'leader': case 'dealer':
                                window.location.href = '/dealer';
                                break;
                            case 'vendor': window.location.href = '/vendor'; break;
                            case 'customer': window.location.href = '/mypage'; break;
                            default: window.location.href = '/';
                        }
                    }, 3000);
                    return; // 아래 switch 문연결
                }

                // Redirect based on role
                switch (data.role) {
                    case 'admin':
                        if (data.phone === 'manager') {
                            window.location.href = '/admin?role=operating';
                        } else {
                            window.location.href = '/admin?role=super';
                        }
                        break;
                    case 'master':
                    case 'leader':
                    case 'dealer':
                        window.location.href = '/dealer';
                        break;
                    case 'vendor':
                        window.location.href = '/vendor';
                        break;
                    case 'customer':
                        window.location.href = '/mypage';
                        break;
                    default:
                        window.location.href = '/';
                }
            } else {
                throw new Error('등록되지 않은 사용자입니다.');
            }

        } catch (err) {
            console.error('Login error:', err);
            setError(err.message || '로그인에 실패했습니다. 정보를 확인해주세요.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">

                {/* 기본 비밀번호 경고 배너 */}
                {defaultPwWarning && (
                    <div className="rounded-xl bg-amber-50 border border-amber-300 p-5 text-center animate-pulse">
                        <div className="text-2xl mb-2">🔐</div>
                        <p className="font-bold text-amber-800 text-base">보안을 위해 비밀번호를 변경해주세요!</p>
                        <p className="text-amber-700 text-sm mt-1">현재 초기 비밀번호(전화번호 뒤 6자리)로 로그인되었습니다.</p>
                        <p className="text-amber-600 text-xs mt-2">잠시 후 대시보드로 이동합니다. 프로필 → 비밀번호 변경에서 바꿔주세요.</p>
                    </div>
                )}

                {!defaultPwWarning && (<>
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        로그인
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        등록된 전화번호와 비밀번호를 입력하세요.
                    </p>
                    
                    <button
                        onClick={() => setIsGuideOpen(true)}
                        className="mt-4 w-full flex items-center justify-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 py-3 px-4 rounded-xl font-bold hover:bg-indigo-100 transition-colors shadow-sm animate-pulse"
                    >
                        <span>📢 아이폰/갤럭시 알림 및 로그인 설정 (필독)</span>
                    </button>
                </div>
                <form className="mt-6 space-y-6" onSubmit={handleLogin}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <label htmlFor="phone-number" className="sr-only">전화번호</label>
                            <input
                                id="phone-number"
                                name="phone"
                                type="text"
                                autoComplete="username"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                placeholder="전화번호 또는 아이디 (예: 010-1234-5678, admin)"
                                value={phone}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    // If starts with number, apply phone formatting
                                    if (/^\d/.test(value)) {
                                        const raw = value.replace(/[^0-9]/g, '');
                                        let formatted = raw;
                                        if (raw.length > 3 && raw.length <= 7) {
                                            formatted = `${raw.slice(0, 3)}-${raw.slice(3)}`;
                                        } else if (raw.length > 7) {
                                            formatted = `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 11)}`;
                                        }
                                        setPhone(formatted);
                                    } else {
                                        // Allow text input for 'admin', 'manager'
                                        setPhone(value);
                                    }
                                }}
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">비밀번호</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                placeholder="비밀번호"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                                } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
                        >
                            {loading ? '로그인 중...' : '로그인'}
                        </button>
                    </div>
                </form>
                <div className="text-center mt-4">
                    <div className="flex flex-col items-center gap-3">
                        <button
                            onClick={() => {
                                const name = prompt('이름을 입력해주세요.');
                                if (!name) return;
                                const phoneInput = prompt('가입 시 등록한 연락처를 입력해주세요.');
                                if (!phoneInput) return;

                                const requestReset = async () => {
                                    try {
                                        const { data, error } = await supabase
                                            .from('profiles')
                                            .select('*')
                                            .eq('name', name)
                                            .eq('phone', phoneInput)
                                            .single();

                                        if (error || !data) {
                                            alert('일치하는 사용자 정보가 없습니다.');
                                            return;
                                        }

                                        // 🔹 Master Key Logic for Admins
                                        if (data.role === 'admin') {
                                            const masterKey = prompt(' 관리자 복구 키(Master Key)를 입력하세요.\n(시스템 설정에 저장된 키)');
                                            if (!masterKey) return;

                                            // Fetch key from config
                                            const { data: configData } = await supabase
                                                .from('system_config')
                                                .select('value')
                                                .eq('key', 'master_recovery_key')
                                                .single();

                                            if (configData && configData.value === masterKey) {
                                                const newPw = prompt('새로운 비밀번호를 입력해주세요.');
                                                if (!newPw) return;

                                                // Hash before saving for reset
                                                const salt = bcrypt.genSaltSync(10);
                                                const hashedPw = bcrypt.hashSync(newPw, salt);

                                                const { error: updateError } = await supabase
                                                    .from('profiles')
                                                    .update({ password: hashedPw })
                                                    .eq('id', data.id);

                                                if (updateError) throw updateError;
                                                alert('비밀번호가 즉시 변경되었습니다. 로그인해주세요.');
                                            } else {
                                                alert('복구 키가 일치하지 않습니다.');
                                            }
                                            return;
                                        }

                                        const { error: updateError } = await supabase
                                            .from('profiles')
                                            .update({ password_reset_requested: true })
                                            .eq('id', data.id);

                                        if (updateError) throw updateError;
                                        alert('비밀번호 초기화 요청이 접수되었습니다.\n관리자 승인 후 연락처 뒤 6자리로 초기화됩니다.');
                                    } catch (err) {
                                        console.error(err);
                                        alert('요청 처리 중 오류가 발생했습니다.');
                                    }
                                };
                                requestReset();
                            }}
                            className="text-sm text-gray-500 hover:text-gray-800 font-medium underline"
                        >
                            비밀번호를 잊으셨나요? (초기화 요청)
                        </button>
                        
                        <div className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                            <span>아직 회원이 아니신가요?</span>
                            <button
                                onClick={() => navigate('/apply')}
                                className="text-indigo-600 hover:text-indigo-800 font-bold underline"
                            >
                                10년의 약속 파트너 가입하기
                            </button>
                        </div>
                    </div>
                </div>
            </>)}
            </div>
            
            {/* 앱 설치 가이드 모달 */}
            <InstallGuideModal 
                isOpen={isGuideOpen} 
                onClose={() => setIsGuideOpen(false)} 
            />
        </div>
    );
};

export default Login;
