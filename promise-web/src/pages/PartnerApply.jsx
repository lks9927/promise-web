import React, { useState } from 'react';
import { supabase } from '../lib/supabase'; // Ensure consistent import
import { useNavigate } from 'react-router-dom';
import { UserPlus, CheckCircle, Store, Briefcase, User } from 'lucide-react';

import DaumPostcodeEmbed from 'react-daum-postcode';

export default function PartnerApply() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [isAddressOpen, setIsAddressOpen] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        password: '',
        confirmPassword: '',
        role: 'customer', // Default role
        region: '',
        address: '',
        detailAddress: ''
    });

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.password !== formData.confirmPassword) {
            alert('비밀번호가 일치하지 않습니다.');
            return;
        }

        if (formData.password.length < 4) {
            alert('비밀번호는 최소 4자 이상이어야 합니다.');
            return;
        }

        if (!window.confirm('입력하신 정보로 가입하시겠습니까?')) return;

        setLoading(true);
        try {
            // 1. Create Profile ID
            const newUserId = crypto.randomUUID();

            // 2. Create Profile
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    {
                        id: newUserId,
                        email: `${formData.phone}@promise10.com`,
                        name: formData.name,
                        phone: formData.phone,
                        password: formData.password,
                        role: formData.role
                    }
                ]);

            if (profileError) throw profileError;

            // 3. Create Partner Record (Only for Leader/Dealer)
            if (formData.role === 'leader' || formData.role === 'dealer') {
                const { error: partnerError } = await supabase
                    .from('partners')
                    .insert([
                        {
                            user_id: newUserId,
                            region: formData.region || '지역 미정',
                            address: formData.address,
                            detail_address: formData.detailAddress,
                            grade: 'C',
                            status: 'pending'
                        }
                    ]);

                if (partnerError) throw partnerError;
                alert('파트너 신청이 접수되었습니다.\n마스터 승인 후 활동 가능합니다.');
            } else {
                alert('회원가입이 완료되었습니다.');
            }

            navigate('/');

        } catch (error) {
            console.error('Application Error:', error);
            if (error.code === '23505') {
                alert('이미 등록된 전화번호입니다. 다른 번호로 시도해 주세요.');
            } else {
                alert(`가입 중 오류가 발생했습니다: ${error.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-[#1a1f37] p-8 text-center">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                        <UserPlus className="w-8 h-8 text-amber-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">10년의 약속 가입하기</h1>
                    <p className="text-gray-400 text-sm">함께해주셔서 감사합니다</p>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {/* Role Selection */}
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { id: 'leader', label: '팀장', icon: Briefcase },
                            { id: 'dealer', label: '딜러', icon: Store },
                            { id: 'customer', label: '일반고객', icon: User }
                        ].map(role => (
                            <button
                                type="button"
                                key={role.id}
                                onClick={() => setFormData({ ...formData, role: role.id })}
                                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${formData.role === role.id
                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                    : 'border-gray-100 hover:border-gray-200 text-gray-500'
                                    }`}
                            >
                                <role.icon className={`w-6 h-6 mb-1 ${formData.role === role.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                                <span className="text-xs font-bold">{role.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                            <input
                                type="text"
                                required
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                placeholder="실명 입력"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
                            <input
                                type="tel"
                                required
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                placeholder="010-1234-5678"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
                                <input
                                    type="password"
                                    required
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    placeholder="4자 이상"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
                                <input
                                    type="password"
                                    required
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    placeholder="한 번 더 입력"
                                    value={formData.confirmPassword}
                                    onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Activity Region for Leader/Dealer */}
                        {(formData.role === 'leader' || formData.role === 'dealer') && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">활동 지역</label>
                                <select
                                    required
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    value={formData.region}
                                    onChange={e => setFormData({ ...formData, region: e.target.value })}
                                >
                                    <option value="">활동 지역 선택</option>
                                    <option value="서울">서울</option>
                                    <option value="경기 북부">경기 북부</option>
                                    <option value="경기 남부">경기 남부</option>
                                    <option value="인천">인천</option>
                                    <option value="강원">강원</option>
                                    <option value="충청">충청</option>
                                    <option value="전라">전라</option>
                                    <option value="경상">경상</option>
                                    <option value="제주">제주</option>
                                </select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">자택 주소</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    className="flex-1 px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-gray-600 focus:outline-none cursor-not-allowed"
                                    placeholder="주소 검색을 진행해주세요"
                                    value={formData.address || ''}
                                />
                                <button
                                    type="button"
                                    onClick={() => setIsAddressOpen(true)}
                                    className="px-4 py-3 bg-[#433831] text-white font-bold rounded-lg hover:bg-[#2C241E] transition-colors whitespace-nowrap"
                                >
                                    주소 검색
                                </button>
                            </div>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                placeholder="상세 주소 (선택)"
                                value={formData.detailAddress || ''}
                                onChange={e => setFormData({ ...formData, detailAddress: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Address Search Modal */}
                    {isAddressOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative">
                                <div className="p-4 border-b flex justify-between items-center">
                                    <h3 className="font-bold text-lg">주소 검색</h3>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddressOpen(false)}
                                        className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
                                    >
                                        &times;
                                    </button>
                                </div>
                                <div className="h-[400px]">
                                    <DaumPostcodeEmbed
                                        onComplete={(data) => {
                                            let fullAddress = data.address;
                                            let extraAddress = '';

                                            if (data.addressType === 'R') {
                                                if (data.bname !== '') {
                                                    extraAddress += data.bname;
                                                }
                                                if (data.buildingName !== '') {
                                                    extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName);
                                                }
                                                fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '');
                                            }

                                            setFormData({
                                                ...formData,
                                                address: fullAddress,
                                                // Removed region overwriting since we have a dedicated input for it
                                            });
                                            setIsAddressOpen(false);
                                        }}
                                        style={{ width: '100%', height: '100%' }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? '처리 중...' : '가입하기'}
                    </button>
                </form>
            </div>
        </div>
    );
}
