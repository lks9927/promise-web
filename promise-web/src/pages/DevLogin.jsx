import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Users, Shield, Award, Briefcase, User } from 'lucide-react';

export default function DevLogin() {
    const navigate = useNavigate();
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log('DevLogin Page Mounted');
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            // Fetch profiles combined with partner data to get 'grade' and 'region'
            const { data, error } = await supabase
                .from('profiles')
                .select(`
                    *,
                    partners:id (grade, region, status)
                `)
                .order('role');

            if (error) throw error;
            setProfiles(data || []);
        } catch (error) {
            console.error('Error fetching users:', error);
            alert('유저 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = (user) => {
        // Mock Login: Set user data in localStorage
        localStorage.setItem('user', JSON.stringify({
            id: user.id,
            name: user.name,
            role: user.role,
            grade: user.partners?.[0]?.grade, // Optional: if partner exists
        }));

        // Redirect based on role
        if (user.role === 'admin') navigate('/admin');
        else if (user.role === 'master') navigate('/master');
        else if (user.role === 'leader') navigate('/leader');
        else if (['dealer', 'morning', 'meal'].includes(user.role)) navigate('/dealer');
        else navigate('/');
    };

    const getRoleIcon = (role) => {
        if (role === 'admin') return <Shield className="w-5 h-5 text-red-500" />;
        if (role === 'master') return <Award className="w-5 h-5 text-purple-500" />;
        if (role === 'leader') return <Briefcase className="w-5 h-5 text-blue-500" />;
        return <User className="w-5 h-5 text-green-500" />;
    };

    const getGroupedUsers = () => {
        const groups = {
            'Admin': profiles.filter(p => p.role === 'admin'),
            'Master': profiles.filter(p => p.role === 'master' || (p.role === 'dealer' && p.partners?.[0]?.grade === 'Master')),
            'Team Leader': profiles.filter(p => p.role === 'leader'),
            'Dealer': profiles.filter(p => ['dealer', 'morning', 'meal'].includes(p.role) && p.partners?.[0]?.grade !== 'Master'),
            'Others': profiles.filter(p => !['admin', 'master', 'leader', 'dealer', 'morning', 'meal'].includes(p.role))
        };
        return groups;
    };

    const groupedUsers = getGroupedUsers();

    if (loading) return <div className="p-10 text-center">유저 목록 로딩 중...</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">⚡ Developer Login</h1>
                        <p className="text-gray-500 mt-2">비밀번호 없이 원클릭으로 로그인하여 테스트하세요.</p>
                    </div>
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        메인으로 돌아가기
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Object.entries(groupedUsers).map(([groupName, users]) => (
                        users.length > 0 && (
                            <div key={groupName} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                                    <span className="font-bold text-gray-700">{groupName}</span>
                                    <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{users.length}</span>
                                </div>
                                <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
                                    {users.map(user => (
                                        <button
                                            key={user.id}
                                            onClick={() => handleLogin(user)}
                                            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all group"
                                        >
                                            <div className="flex items-center gap-3">
                                                {getRoleIcon(user.role)}
                                                <div className="text-left">
                                                    <div className="font-bold text-gray-800 group-hover:text-indigo-700">
                                                        {user.name}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {user.role} {user.partners?.[0]?.grade ? `• ${user.partners[0].grade}` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-400 group-hover:text-indigo-500 font-medium">
                                                로그인 →
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )
                    ))}
                </div>
            </div>
        </div>
    );
}
