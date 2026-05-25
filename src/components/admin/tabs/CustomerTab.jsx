import React, { useState } from 'react';
import { Search, User, Key, Calendar, Mail, Phone, Settings } from 'lucide-react';
import RoleChangeModal from './RoleChangeModal';

export default function CustomerTab({ customers, loading, onRefresh }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // 검색어 필터링 (이름 또는 전화번호로 검색)
    const filteredCustomers = customers.filter(c => {
        const nameMatch = c.name?.toLowerCase().includes(searchTerm.toLowerCase());
        const phoneMatch = c.phone?.replace(/-/g, '').includes(searchTerm.replace(/-/g, ''));
        return nameMatch || phoneMatch;
    });

    const openRoleModal = (user) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    return (
        <div className="p-6 space-y-6">
            
            {/* 상단 검색 및 타이틀 바 */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div>
                    <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        <User className="w-5 h-5 text-indigo-600" /> 일반 고객 명단
                    </h3>
                    <p className="text-gray-500 text-xs mt-0.5">총 {filteredCustomers.length}명의 고객이 등록되어 있습니다.</p>
                </div>
                
                {/* 검색 필드 */}
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="이름 또는 전화번호 검색"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder-gray-400"
                    />
                </div>
            </div>

            {/* 메인 리스트 테이블 */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                {loading ? (
                    <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-sm text-gray-500 font-medium">고객 목록 로딩 중...</p>
                    </div>
                ) : filteredCustomers.length === 0 ? (
                    <div className="py-20 text-center text-gray-400 text-sm flex flex-col items-center justify-center gap-2">
                        <User className="w-12 h-12 text-gray-200" />
                        <p className="font-bold text-gray-500 text-base">검색된 일반 고객이 없습니다</p>
                        <p className="text-gray-400 text-xs">검색어를 확인해 주시거나 새 회원을 가입시켜 주세요.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100 text-gray-400 text-xs font-bold uppercase tracking-wider">
                                    <th className="px-6 py-4">이름</th>
                                    <th className="px-6 py-4">연락처</th>
                                    <th className="px-6 py-4">가입 기기(OS)</th>
                                    <th className="px-6 py-4">활동 지역/주소</th>
                                    <th className="px-6 py-4">이메일</th>
                                    <th className="px-6 py-4">가입 일시 (최신순)</th>
                                    <th className="px-6 py-4 text-center">직업 및 역할 관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                                {filteredCustomers.map((c) => {
                                    const kstTime = c.created_at
                                        ? new Date(c.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                                        : '시간 미상';
                                        
                                    return (
                                        <tr key={c.id} className="hover:bg-indigo-50/20 transition-colors">
                                            {/* 이름 */}
                                            <td className="px-6 py-4 font-bold text-gray-900">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-sm">
                                                        {c.name?.[0] || '고'}
                                                    </div>
                                                    <span>{c.name}</span>
                                                </div>
                                            </td>
                                            
                                            {/* 연락처 */}
                                            <td className="px-6 py-4 font-semibold text-gray-600">
                                                <div className="flex items-center gap-1.5">
                                                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                                                    <span>{c.phone || '없음'}</span>
                                                </div>
                                            </td>

                                            {/* 가입 기기 (OS) */}
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                                                    c.os_type === 'android' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                    c.os_type === 'ios' ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-gray-50 text-gray-600 border border-gray-200'
                                                }`}>
                                                    {c.os_type === 'android' ? '🤖 Android' :
                                                     c.os_type === 'ios' ? '🍎 iPhone' : '💻 Web'}
                                                </span>
                                            </td>

                                            {/* 활동 지역/주소 */}
                                            <td className="px-6 py-4 text-gray-600 text-xs max-w-[200px] truncate" title={c.address || '입력 없음'}>
                                                <span className="font-medium">{c.address || '입력 없음'}</span>
                                            </td>
                                            
                                            {/* 이메일 */}
                                            <td className="px-6 py-4 text-gray-500">
                                                <div className="flex items-center gap-1.5">
                                                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                                                    <span className="font-mono text-xs">{c.email || '없음'}</span>
                                                </div>
                                            </td>
                                            
                                            {/* 가입 일시 */}
                                            <td className="px-6 py-4 text-gray-500 text-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                    <span>{kstTime}</span>
                                                </div>
                                            </td>
                                            
                                            {/* 역할 관리 버튼 */}
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => openRoleModal(c)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-slate-900 font-bold text-xs rounded-lg transition-colors shadow-sm"
                                                >
                                                    <Settings className="w-3.5 h-3.5" />
                                                    역할(직업) 변경
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 역할 변경 안전 모달 */}
            <RoleChangeModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedUser(null);
                }}
                user={selectedUser}
                onUpdate={onRefresh}
            />
        </div>
    );
}
