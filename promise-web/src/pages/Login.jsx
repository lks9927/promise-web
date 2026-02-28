import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const Login = () => {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
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
                case 'master': navigate('/master'); break;
                case 'leader': navigate('/leader'); break;
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
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('phone', phone)
                .single();

            if (error) throw error;

            if (data) {
                // Password Validation (Simple check for prototype)
                // In production, use Supabase Auth or proper hashing
                if (data.password && data.password !== password) {
                    throw new Error('비밀번호가 일치하지 않습니다.');
                }

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
                // Store user session
                localStorage.setItem('user', JSON.stringify(data));

                // Redirect based on role
                switch (data.role) {
                    case 'admin':
                        if (data.phone === 'manager') {
                            navigate('/admin?role=operating');
                        } else {
                            navigate('/admin?role=super');
                        }
                        break;
                    case 'master':
                        navigate('/master');
                        break;
                    case 'leader':
                        navigate('/leader');
                        break;
                    case 'dealer':
                        navigate('/dealer');
                        break;
                    case 'vendor':
                        navigate('/vendor');
                        break;
                    case 'customer':
                        navigate('/mypage');
                        break;
                    default:
                        navigate('/');
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
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        로그인
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        등록된 전화번호와 비밀번호를 입력하세요.
                    </p>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
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

                                            const { error: updateError } = await supabase
                                                .from('profiles')
                                                .update({ password: newPw })
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
                                    alert('비밀번호 초기화 요청이 접수되었습니다.\n관리자 승인 후 연락처 뒤 4자리로 초기화됩니다.');
                                } catch (err) {
                                    console.error(err);
                                    alert('요청 처리 중 오류가 발생했습니다.');
                                }
                            };
                            requestReset();
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-500 font-medium underline"
                    >
                        비밀번호를 잊으셨나요? (초기화 요청)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
