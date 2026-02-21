import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Plus, Star, MapPin, Loader2, Award, Briefcase } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';

export default function BranchManagement({ user }) {
    const { showToast } = useNotification();
    const [subDealers, setSubDealers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    // New dealer form state
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        region: '서울 전체',
        grade: 'A' // Default grade for sub-dealer
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchSubDealers();
    }, [user.id]);

    const fetchSubDealers = async () => {
        setLoading(true);
        try {
            // Fetch partners where the master_id is the current user's ID
            const { data, error } = await supabase
                .from('partners')
                .select(`
                    *,
                    profiles!partners_user_id_fkey (name, phone, role)
                `)
                .eq('master_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setSubDealers(data || []);
        } catch (error) {
            console.error('하위 딜러 조회 오류:', error);
            showToast('error', '불러오기 실패', '하위 지점 목록을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddDealer = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            // 1. Generate UUID v4 for the new user profile
            const newUserId = crypto.randomUUID();

            // 2. Insert into profiles
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: newUserId,
                    role: 'dealer',
                    name: formData.name,
                    phone: formData.phone,
                    email: `subdealer_${Date.now()}@test.com` // Temporary dummy email
                });
            if (profileError) throw profileError;

            // 3. Insert into partners linking to this Master Dealer
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

            showToast('success', '등록 완료', `${formData.name} 딜러가 지점에 추가되었습니다.`);

            // Reset form and UI
            setFormData({ name: '', phone: '', region: '서울 전체', grade: 'A' });
            setIsAdding(false);

            // Refresh list
            fetchSubDealers();

        } catch (error) {
            console.error('하위 딜러 등록 오류:', error);
            showToast('error', '등록 실패', error.message || '딜러 등록 중 문제가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGradeChange = async (dealerId, newGrade) => {
        try {
            const { error } = await supabase
                .from('partners')
                .update({ grade: newGrade })
                .eq('id', dealerId);

            if (error) throw error;

            showToast('success', '등급 수정 완료', '해당 딜러의 등급이 변경되었습니다.');
            fetchSubDealers(); // Refresh list to show changes
        } catch (error) {
            console.error('등급 수정 오류:', error);
            showToast('error', '수정 실패', '등급 수정 중 오류가 발생했습니다.');
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-10 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
                <p>지점 목록을 불러오는 중...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                    <Users className="w-6 h-6 text-indigo-600" />
                    내 하위 지점 관리
                </h3>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors border border-indigo-200"
                >
                    {isAdding ? '취소' : <><Plus className="w-4 h-4" /> 딜러 추가</>}
                </button>
            </div>

            {/* Registration Form (Conditionally rendered) */}
            {isAdding && (
                <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm mb-6 animate-fade-in">
                    <h4 className="font-bold text-gray-800 mb-4 border-b border-gray-100 pb-2">신규 하위 딜러 등록</h4>
                    <form onSubmit={handleAddDealer} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">이름</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                    placeholder="딜러 이름"
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
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : '하위 딜러 계정 생성'}
                        </button>
                    </form>
                </div>
            )}

            {/* Sub-dealers List */}
            <div className="space-y-3">
                {subDealers.length === 0 ? (
                    <div className="bg-white p-8 rounded-2xl text-center border border-gray-100 shadow-sm">
                        <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">등록된 하위 딜러가 없습니다.</p>
                        <p className="text-sm text-gray-400 mt-1">우측 상단의 딜러 추가 버튼을 눌러 등록하세요.</p>
                    </div>
                ) : (
                    subDealers.map(dealer => (
                        <div key={dealer.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center group hover:border-indigo-200 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="bg-indigo-50 p-3 rounded-full text-indigo-600">
                                    <Briefcase className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-bold text-gray-800 text-lg">{dealer.profiles?.name || '알 수 없음'}</h4>
                                        <select
                                            className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200 focus:outline-none focus:ring-1 focus:ring-green-500 cursor-pointer appearance-none text-center"
                                            value={dealer.grade}
                                            onChange={(e) => handleGradeChange(dealer.id, e.target.value)}
                                        >
                                            <option value="A">A 등급</option>
                                            <option value="B">B 등급</option>
                                            <option value="C">C 등급</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-gray-500">
                                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {dealer.region}</span>
                                        <span>{dealer.profiles?.phone || '번호 없음'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-xs text-gray-400 mb-1">상태</div>
                                <div className={`text-sm font-semibold ${dealer.status === 'approved' ? 'text-indigo-600' : 'text-orange-500'}`}>
                                    {dealer.status === 'approved' ? '활동 중' : '대기/정지'}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
