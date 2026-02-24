import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Users, Shield, Award, Briefcase, User, CheckCircle2, Circle } from 'lucide-react';

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
                    partners!partners_user_id_fkey (grade, region, status)
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
        const partner = Array.isArray(user.partners) ? user.partners[0] : user.partners;
        // Mock Login: Set user data in localStorage
        localStorage.setItem('user', JSON.stringify({
            ...user,
            grade: partner?.grade, // Optional: if partner exists
        }));

        // Redirect based on role
        if (user.role === 'admin') navigate('/admin');
        else if (user.role === 'master') navigate('/master');
        else if (user.role === 'leader') navigate('/leader');
        else if (['dealer', 'morning', 'meal'].includes(user.role)) navigate('/dealer');
        else navigate('/');
    };

    const getRoleIcon = (role, grade) => {
        if (role === 'admin') return <Shield className="w-4 h-4 text-red-500" />;
        if (role === 'master' || (role === 'leader' && grade === 'Master')) return <Award className="w-4 h-4 text-purple-600" />;
        if (role === 'leader' || role === 'assistant') return <Briefcase className="w-4 h-4 text-blue-500" />;
        if (role === 'dealer' && grade === 'Master') return <Award className="w-4 h-4 text-pink-500" />;
        if (['dealer', 'morning', 'meal'].includes(role)) return <Briefcase className="w-4 h-4 text-orange-500" />;
        if (role === 'customer') return <Users className="w-4 h-4 text-green-500" />;
        return <User className="w-4 h-4 text-gray-500" />;
    };

    const getGroupedUsers = () => {
        const getGrade = (p) => (Array.isArray(p.partners) ? p.partners[0] : p.partners)?.grade;
        const groups = {
            '관리자 (Admin)': profiles.filter(p => p.role === 'admin'),
            '고객 (Customer)': profiles.filter(p => p.role === 'customer'),
            '마스터 팀장 (Master Leader)': profiles.filter(p => p.role === 'master' || (p.role === 'leader' && getGrade(p) === 'Master')),
            '일반 팀장 (Team Leader)': profiles.filter(p => ['leader', 'assistant'].includes(p.role) && getGrade(p) !== 'Master'),
            '마스터 딜러 (Master Dealer)': profiles.filter(p => p.role === 'dealer' && getGrade(p) === 'Master'),
            '일반 딜러 (Dealer)': profiles.filter(p => ['dealer', 'morning', 'meal'].includes(p.role) && getGrade(p) !== 'Master'),
            '기타 (Others)': profiles.filter(p => !['admin', 'master', 'leader', 'assistant', 'dealer', 'morning', 'meal', 'customer'].includes(p.role))
        };
        return groups;
    };

    const groupedUsers = getGroupedUsers();

    // 프로젝트 진행 현황판 데이터
    const projectTasks = [
        { id: 1, title: '디자인 및 퍼블리싱 (Stitch 100% 반영)', completed: true },
        { id: 2, title: '로그인 및 권한 분류 (6단계 적용 완료)', completed: true },
        { id: 3, title: '데이터베이스 RLS 권한 세팅 및 사진 저장소 연동', completed: true },
        { id: 4, title: '마스터 대시보드 (지점 및 하위 파트너 관리)', completed: true },
        { id: 5, title: '장례 전역 권한 (Global Case) 배정 흐름 적용', completed: true },
        { id: 6, title: '개인 정보 및 프로필 사진 최적화 업로드 기능', completed: true },
        { id: 7, title: '정산 로직 및 수익금 계산 표시 (관리자 수수료율 설정)', completed: true },
        { id: 8, title: '최종 QA 및 운영 환경 검증', completed: true },
    ];
    const completedTasksCount = projectTasks.filter(t => t.completed).length;
    const progressPercentage = Math.round((completedTasksCount / projectTasks.length) * 100);

    if (loading) return <div className="p-10 text-center">유저 목록 로딩 중...</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6">

                {/* 왼쪽: 프로젝트 진행 현황판 */}
                <div className="w-full md:w-1/3 space-y-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-gray-900">🚀 프로젝트 진행 현황</h2>
                            <span className="text-sm font-bold text-indigo-600">{progressPercentage}%</span>
                        </div>

                        {/* 프로그레스 바 */}
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                            <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${progressPercentage}%` }}></div>
                        </div>

                        <div className="space-y-2">
                            {projectTasks.map(task => (
                                <div key={task.id} className="flex items-start gap-2 text-sm">
                                    {task.completed ? (
                                        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                                    ) : (
                                        <Circle className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                                    )}
                                    <span className={task.completed ? 'text-gray-700' : 'text-gray-400'}>
                                        {task.title}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 오른쪽: 로그인 선택 창 */}
                <div className="w-full md:w-2/3">
                    <div className="mb-6 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">⚡ Developer Login</h1>
                            <p className="text-gray-500 text-sm mt-1">비밀번호 없이 원클릭으로 역할별 화면에 진입합니다.</p>
                        </div>
                        <button
                            onClick={() => navigate('/')}
                            className="px-3 py-1.5 text-sm bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200"
                        >
                            메인으로
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {Object.entries(groupedUsers).map(([groupName, users]) => (
                            users.length > 0 && (
                                <div key={groupName} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                                        <span className="font-bold text-gray-700 text-sm">{groupName}</span>
                                        <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-md">{users.length}</span>
                                    </div>
                                    <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
                                        {users.map(user => (
                                            <button
                                                key={user.id}
                                                onClick={() => handleLogin(user)}
                                                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {getRoleIcon(user.role, (Array.isArray(user.partners) ? user.partners[0] : user.partners)?.grade)}
                                                    <div className="text-left">
                                                        <div className="font-semibold text-sm text-gray-800 group-hover:text-indigo-700">
                                                            {user.name}
                                                        </div>
                                                        <div className="text-[11px] text-gray-500">
                                                            {user.role} {(Array.isArray(user.partners) ? user.partners[0] : user.partners)?.grade ? `• ${(Array.isArray(user.partners) ? user.partners[0] : user.partners).grade}` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-[10px] text-gray-400 group-hover:text-indigo-500 font-medium">
                                                    접속 →
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
        </div>
    );
}
