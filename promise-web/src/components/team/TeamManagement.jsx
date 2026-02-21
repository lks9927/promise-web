import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Plus, Star, MapPin, Loader2, Award, Briefcase } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';

export default function TeamManagement({ user }) {
    const { showToast } = useNotification();
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [sortBy, setSortBy] = useState('latest'); // 'latest', 'completed', 'in_progress'

    // New team member form state
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        region: '서울 전체',
        grade: 'A' // Default grade for team member
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchTeamMembers();
    }, [user.id]);

    const fetchTeamMembers = async () => {
        setLoading(true);
        try {
            // Fetch partners where the master_id is the current user's ID
            const { data, error } = await supabase
                .from('partners')
                .select(`
                    *,
                    profiles!partners_user_id_fkey(
                        name, phone, role,
                        funeral_cases!funeral_cases_team_leader_id_fkey(status)
                    )
                `)
                .eq('master_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTeamMembers(data || []);
        } catch (error) {
            console.error('팀원 조회 오류:', error);
            showToast('error', '불러오기 실패', '팀원 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddMember = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            // 1. Generate UUID v4 for the new user profile
            const newUserId = crypto.randomUUID();

            // 2. Insert into profiles (as assistant)
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: newUserId,
                    role: 'assistant',
                    name: formData.name,
                    phone: formData.phone,
                    email: `assistant_${Date.now()}@test.com` // Temporary dummy email
                });
            if (profileError) throw profileError;

            // 3. Insert into partners linking to this Master Team Leader
            const { error: partnerError } = await supabase
                .from('partners')
                .insert({
                    user_id: newUserId,
                    master_id: user.id,
                    region: formData.region,
                    grade: formData.grade,
                    status: 'approved'
                });
            if (partnerError) throw partnerError;

            showToast('success', '등록 완료', `${formData.name} 팀원이 추가되었습니다.`);

            // Reset form and UI
            setFormData({ name: '', phone: '', region: '서울 전체', grade: 'A' });
            setIsAdding(false);

            // Refresh list
            fetchTeamMembers();

        } catch (error) {
            console.error('팀원 등록 오류:', error);
            showToast('error', '등록 실패', error.message || '팀원 등록 중 문제가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Calculate stats and sort members
    const getSortedMembers = () => {
        const membersWithStats = teamMembers.map(member => {
            const cases = member.profiles?.funeral_cases || [];
            return {
                ...member,
                inProgressCount: cases.filter(c => ['assigned', 'consulting', 'in_progress'].includes(c.status)).length,
                completedCount: cases.filter(c => ['team_settling', 'settling', 'hq_check', 'completed'].includes(c.status)).length,
                canceledCount: cases.filter(c => c.status === 'canceled').length,
            };
        });

        return membersWithStats.sort((a, b) => {
            if (sortBy === 'completed') return b.completedCount - a.completedCount;
            if (sortBy === 'in_progress') return b.inProgressCount - a.inProgressCount;
            // Default: 'latest'
            return new Date(b.created_at) - new Date(a.created_at);
        });
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-10 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
                <p>팀원 목록을 불러오는 중...</p>
            </div>
        );
    }

    const sortedMembers = getSortedMembers();

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        <Users className="w-6 h-6 text-indigo-600" />
                        내 팀원 관리
                    </h3>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                        <option value="latest">최신순</option>
                        <option value="completed">완료 많은 순</option>
                        <option value="in_progress">수행 많은 순</option>
                    </select>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors border border-indigo-200"
                >
                    {isAdding ? '취소' : <><Plus className="w-4 h-4" /> 팀원 추가</>}
                </button>
            </div>

            {/* Registration Form (Conditionally rendered) */}
            {isAdding && (
                <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm mb-6 animate-fade-in">
                    <h4 className="font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">신규 팀원 등록</h4>
                    <form onSubmit={handleAddMember} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">이름</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    placeholder="상례사 이름"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">연락처</label>
                                <input
                                    type="tel"
                                    required
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    placeholder="010-XXXX-XXXX"
                                    value={formData.phone}
                                    onChange={e => {
                                        // Auto-format phone
                                        let val = e.target.value.replace(/[^0-9]/g, '');
                                        if (val.length > 3 && val.length <= 7) val = val.replace(/(\d{3})(\d+)/, '$1-$2');
                                        else if (val.length > 7) val = val.replace(/(\d{3})(\d{4})(\d+)/, '$1-$2-$3');
                                        setFormData({ ...formData, phone: val.slice(0, 13) });
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">활동 지역</label>
                                <select
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                                    value={formData.region}
                                    onChange={e => setFormData({ ...formData, region: e.target.value })}
                                >
                                    <option value="서울 전체">서울 전체</option>
                                    <option value="경기 북부">경기 북부</option>
                                    <option value="경기 남부">경기 남부</option>
                                    <option value="인천/부천">인천/부천</option>
                                    <option value="기타 타지역">기타 타지역</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">초기 부여 등급</label>
                                <select
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white"
                                    value={formData.grade}
                                    onChange={e => setFormData({ ...formData, grade: e.target.value })}
                                >
                                    <option value="A">A 등급 (신입)</option>
                                    <option value="B">B 등급 (일반)</option>
                                    <option value="C">C 등급 (우수)</option>
                                </select>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-xl shadow-md hover:bg-indigo-700 transition-all flex justify-center items-center gap-2 mt-2 disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : '팀원(상례사) 계정 생성'}
                        </button>
                    </form>
                </div>
            )}

            {/* Team Members List */}
            <div className="space-y-3">
                {teamMembers.length === 0 ? (
                    <div className="bg-white p-8 rounded-2xl text-center border border-gray-100 shadow-sm">
                        <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">등록된 팀원이 없습니다.</p>
                        <p className="text-sm text-gray-400 mt-1">우측 상단의 팀원 추가 버튼을 눌러 등록하세요.</p>
                    </div>
                ) : (
                    sortedMembers.map(member => {
                        return (
                            <div key={member.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center group hover:border-indigo-200 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="bg-indigo-50 p-3 rounded-full text-indigo-600">
                                        <Briefcase className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-bold text-gray-800 text-lg">{member.profiles?.name || '알 수 없음'}</h4>
                                            <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                                {member.grade} 등급
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {member.region}</span>
                                            <span>{member.profiles?.phone || '번호 없음'}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-[10px] font-medium bg-blue-50 text-blue-600 px-2 py-0.5 rounded">수행 {member.inProgressCount}</span>
                                            <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">완료 {member.completedCount}</span>
                                            {member.canceledCount > 0 && <span className="text-[10px] font-medium bg-red-50 text-red-500 px-2 py-0.5 rounded">취소 {member.canceledCount}</span>}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="text-xs text-gray-400 mb-1">상태</div>
                                    <div className={`text-sm font-semibold ${member.status === 'approved' ? 'text-indigo-600' : 'text-orange-500'}`}>
                                        {member.status === 'approved' ? '활동 중' : '대기/정지'}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
