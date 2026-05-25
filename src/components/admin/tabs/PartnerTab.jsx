import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { translateError } from '../../../lib/errorHandler';
import { useNotification } from '../../../contexts/NotificationContext';
import RoleChangeModal from './RoleChangeModal';

// ─── 역할 배지 컴포넌트 ──────────────────────────────────
function RoleBadge({ role, grade, large = false }) {
    let key = role;
    if (role === 'leader' && (grade === 'Master' || grade === 'S' || grade === 'master')) {
        key = 'master_leader';
    } else if (['dealer', 'morning', 'meal', '아침', '식사'].includes(role) && (grade === 'Master' || grade === 'S')) {
        key = 'master_dealer';
    } else if (['dealer', 'morning', 'meal', '아침', '식사'].includes(role)) {
        key = 'dealer';
    } else if (role === 'master') {
        key = 'master_dealer';
    }

    const config = {
        admin: { label: '본사', bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-400' },
        dealer: { label: '딜러', bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-400' },
        master_dealer: { label: '마스터 딜러', bg: 'bg-pink-100', text: 'text-pink-700', dot: 'bg-pink-400' },
        master_leader: { label: '마스터 팀장', bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-400' },
        leader: { label: '팀장', bg: 'bg-sky-100', text: 'text-sky-700', dot: 'bg-sky-400' },
        team_leader: { label: '팀장', bg: 'bg-sky-100', text: 'text-sky-700', dot: 'bg-sky-400' },
    };
    const c = config[key] || config.dealer;
    return (
        <span className={`inline-flex items-center whitespace-nowrap flex-shrink-0 ${c.bg} ${c.text} ${large ? 'gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold' : 'gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold'}`}>
            <span className={`flex-shrink-0 rounded-full ${c.dot} ${large ? 'w-2 h-2' : 'w-1.5 h-1.5'}`}></span>
            {c.label}
        </span>
    );
}

// ─── 현재 배정 상태 배지 컴포넌트 ──────────────────────────────────
function CurrentStatusBadge({ status, role }) {
    // 팀장에게만 상태 표시를 적용 (필요 시 딜러 확장 가능)
    if (role !== 'leader') return <span className="text-gray-300 text-xs">-</span>;

    const config = {
        waiting: { label: '출동 대기', bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
        working: { label: '진행 중', bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
        off: { label: '휴무/오프', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
    };
    
    const c = config[status] || config.off;

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${c.bg} ${c.text}`}>
            <span className={`w-2 h-2 rounded-full ${c.dot} animate-pulse`}></span>
            {c.label}
        </span>
    );
}

export default function PartnerTab({ partners, loading, onRefresh, onApproveReset, isReadonly, onUpdateMaxSubordinates }) {
    const { showToast } = useNotification();
    const [partnerFilter, setPartnerFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [gradeModal, setGradeModal] = useState({ isOpen: false, partnerId: null, currentGrade: '', name: '' });
    const [roleModal, setRoleModal] = useState({ isOpen: false, partnerId: null, currentRole: '', currentMasterId: null, name: '' });
    const [isChangeRoleOpen, setIsChangeRoleOpen] = useState(false);
    const [roleChangeUser, setRoleChangeUser] = useState(null);

    const togglePartnerStatus = async (partnerId, currentStatus, role) => {
        const newStatus = (currentStatus === 'suspended' || currentStatus === 'pending') ? 'approved' : 'suspended';

        if (role === 'leader' && newStatus === 'suspended') {
            const { count } = await supabase
                .from('funeral_cases')
                .select('*', { count: 'exact', head: true })
                .eq('team_leader_id', partnerId)
                .in('status', ['assigned', 'consulting', 'in_progress', 'team_settling']);

            if (count > 0) {
                showToast('error', '정지 불가', `진행 중인 장례 건(${count}건)이 있어 정지할 수 없습니다.`);
                return;
            }
        }

        if (confirm(`해당 파트너를 ${newStatus === 'approved' ? '승인' : '정지'} 처리하시겠습니까?`)) {
            const { error } = await supabase
                .from('partners')
                .update({ status: newStatus })
                .eq('user_id', partnerId);

            if (error) {
                console.error(error);
                showToast('error', '처리 실패', '상태 변경 중 오류가 발생했습니다.');
            } else {
                showToast('success', '처리 완료', `파트너가 ${newStatus === 'approved' ? '승인' : '정지'}되었습니다.`);
                onRefresh();
            }
        }
    };

    const handlePasswordReset = async (userId, name) => {
        const partner = partners.find(p => p.user_id === userId);
        if (!partner || !partner.profiles?.phone) {
            showToast('error', '오류', '사용자 정보를 찾을 수 없습니다.');
            return;
        }

        onApproveReset(userId, partner.profiles.phone, name, partner.profiles.role);
    };

    const getRoleDisplayName = (role, grade) => {
        if (role === 'leader') {
            return (grade === 'S' || grade === 'Master') ? '마스터 팀장' : '팀장';
        }
        if (['dealer', 'morning', 'meal', '아침', '식사'].includes(role)) {
            return (grade === 'S' || grade === 'Master') ? '마스터 딜러' : '딜러';
        }
        if (role === 'master') return '마스터 딜러';
        return role;
    };

    const openGradeModal = (partnerId, currentGrade, name) => {
        setGradeModal({ isOpen: true, partnerId, currentGrade, name });
    };

    const openRoleModal = (partnerId, currentRole, currentMasterId, name) => {
        setRoleModal({ isOpen: true, partnerId, currentRole, currentMasterId, name });
    };

    const confirmRoleChange = async (pseudoRole, newMasterId) => {
        if (!roleModal.partnerId) return;

        const partnerData = partners.find(p => p.user_id === roleModal.partnerId);
        if (!partnerData) return;

        const currentDbRole = partnerData.profiles?.role;
        const currentGrade = partnerData.grade;
        
        let newDbRole = currentDbRole;
        let willDemoteGrade = false;
        let willPromoteGrade = false;

        // Determine actual DB role and if grade needs changing
        if (pseudoRole === 'master_leader') {
            newDbRole = 'leader';
            if (!['Master', 'S'].includes(currentGrade)) willPromoteGrade = true;
        } else if (pseudoRole === 'leader') {
            newDbRole = 'leader';
            if (['Master', 'S'].includes(currentGrade)) willDemoteGrade = true;
        } else if (pseudoRole === 'master_dealer') {
            newDbRole = currentDbRole === 'master' ? 'master' : (['morning', 'meal', '아침', '식사'].includes(currentDbRole) ? currentDbRole : 'dealer');
            if (currentDbRole !== 'master' && !['Master', 'S'].includes(currentGrade)) willPromoteGrade = true;
        } else if (pseudoRole === 'dealer') {
            newDbRole = currentDbRole === 'master' ? 'dealer' : currentDbRole;
            if (['Master', 'S'].includes(currentGrade) || currentDbRole === 'master') willDemoteGrade = true;
        }

        const finalMasterId = (pseudoRole.includes('master') || newMasterId === 'none') ? null : newMasterId;

        let confirmMessage = `${roleModal.name}님의 직급/소속을 변경하시겠습니까?`;
        
        if (willPromoteGrade) {
            confirmMessage = `${roleModal.name}님의 직급/소속을 변경하시겠습니까?\n\n⭐ 알림: 마스터 권한으로 독립하므로, 등급이 자동으로 [Master]로 승급됩니다.`;
        } else if (willDemoteGrade || finalMasterId) {
            willDemoteGrade = true;
            confirmMessage = `${roleModal.name}님의 직급/소속을 변경하시겠습니까?\n\n⚠️ 주의: 일반 소속으로 편입되어 기존 마스터 권한이 소멸되며 등급이 [C]로 초기화됩니다.`;
        }

        if (confirm(confirmMessage)) {
            try {
                // 1. Update profiles.role
                const { error: profileError } = await supabase
                    .from('profiles')
                    .update({ role: newDbRole })
                    .eq('id', roleModal.partnerId);
                
                if (profileError) throw profileError;

                // 2. Update partners.master_id and grade
                let updatePayload = { master_id: finalMasterId };
                if (willDemoteGrade) updatePayload.grade = 'C';
                if (willPromoteGrade) updatePayload.grade = 'Master';

                const { error: partnerError } = await supabase
                    .from('partners')
                    .update(updatePayload)
                    .eq('user_id', roleModal.partnerId);

                if (partnerError) throw partnerError;

                // 3. 연쇄 강등 로직: 마스터에서 강등 시 산하 파트너들의 소속을 일괄 '독립(NULL)' 처리
                if (willDemoteGrade) {
                    const { error: cascadeError } = await supabase
                        .from('partners')
                        .update({ master_id: null })
                        .eq('master_id', roleModal.partnerId);
                        
                    if (cascadeError) {
                        console.error('Cascade Master Reset Error:', cascadeError);
                        showToast('error', '하위 소속 해제 실패', '주의: 하위 파트너 소속 해제 중 오류가 발생했습니다.');
                    }
                }

                showToast('success', '변경 완료', '직급 및 소속 상태가 일괄 업데이트되었습니다.');
                onRefresh();
            } catch (error) {
                console.error('Role Update Error:', error);
                showToast('error', '변경 실패', translateError(error));
            }
        }
        setRoleModal({ isOpen: false, partnerId: null, currentRole: '', currentMasterId: null, name: '' });
    };

    const confirmGradeChange = async (newGrade) => {
        if (!gradeModal.partnerId) return;

        if (confirm(`${gradeModal.name}님의 등급을 '${gradeModal.currentGrade}' → '${newGrade}'(으)로 변경하시겠습니까?`)) {
            const { error } = await supabase
                .from('partners')
                .update({ grade: newGrade })
                .eq('user_id', gradeModal.partnerId);

            if (error) {
                console.error('Grade Update Error:', error);
                showToast('error', '변경 실패', translateError(error));
            } else {
                showToast('success', '변경 완료', '등급이 변경되었습니다.');
                onRefresh();
            }
        }
        setGradeModal({ isOpen: false, partnerId: null, currentGrade: '', name: '' });
    };

    const displayPartners = partners
        .filter(p => {
            if (partnerFilter === 'all') return true;
            if (partnerFilter === 'master_dealer') return p.profiles?.role === 'master' || (['dealer', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role) && ['Master', 'S'].includes(p.grade));
            if (partnerFilter === 'dealer') return ['dealer', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role) && !['Master', 'S'].includes(p.grade);
            if (partnerFilter === 'master_leader') return p.profiles?.role === 'leader' && ['Master', 'S'].includes(p.grade);
            if (partnerFilter === 'leader') return p.profiles?.role === 'leader' && !['Master', 'S'].includes(p.grade);
            return true;
        })
        .filter(p => {
            if (!searchQuery) return true;
            const term = searchQuery.toLowerCase();
            return (p.profiles?.name || '').toLowerCase().includes(term) || (p.profiles?.phone || '').includes(term);
        });

    // 마스터-소속 관계 헬퍼
    const getMasterName = (masterId) => {
        const master = partners.find(p => p.user_id === masterId);
        return master?.profiles?.name || null;
    };

    // 마스터 팀장 탭: 소속 팀장을 마스터 아래에 트리 형태로 표시
    const finalDisplayList = (() => {
        if (partnerFilter === 'master_leader') {
            const result = [];
            displayPartners.forEach(master => {
                const subs = partners.filter(p => 
                    p.master_id === master.user_id && 
                    p.profiles?.role === 'leader' &&
                    !['Master', 'S'].includes(p.grade)
                );
                result.push({ ...master, _subCount: subs.length });
                subs.forEach(sub => result.push({ ...sub, _isSubordinate: true }));
            });
            return result;
        }
        return displayPartners;
    })();

    return (
        <div>
            <div className="px-6 pt-4 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-4">
                <div className="flex flex-wrap gap-2">
                    {Object.entries({
                        all: '전체',
                        master_dealer: '마스터 딜러',
                        dealer: '딜러',
                        master_leader: '마스터 팀장',
                        leader: '팀장'
                    }).map(([role, label]) => (
                        <button key={role}
                            onClick={() => setPartnerFilter(role)}
                            className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-bold transition-colors
                                ${partnerFilter === role ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                        >
                            {label} ({partners.filter(p => {
                                if (role === 'all') return true;
                                if (role === 'master_dealer') return p.profiles?.role === 'master' || (['dealer', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role) && ['Master', 'S'].includes(p.grade));
                                if (role === 'dealer') return ['dealer', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role) && !['Master', 'S'].includes(p.grade);
                                if (role === 'master_leader') return p.profiles?.role === 'leader' && ['Master', 'S'].includes(p.grade);
                                if (role === 'leader') return p.profiles?.role === 'leader' && !['Master', 'S'].includes(p.grade);
                                return false;
                            }).length}명)
                        </button>
                    ))}
                </div>
                
                <div className="relative w-full md:w-64 flex-shrink-0">
                    <input 
                        type="text" 
                        placeholder="이름 또는 연락처 검색" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full text-sm border border-gray-300 rounded-lg pl-3 pr-3 py-2 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    />
                </div>
            </div>

            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto overflow-y-auto max-h-[70vh] relative">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-6 py-4 whitespace-nowrap">이름</th>
                            <th className="px-6 py-4 whitespace-nowrap">현재 상태</th>
                            <th className="px-6 py-4 whitespace-nowrap">직급</th>
                            <th className="px-6 py-4 whitespace-nowrap">소속 관리</th>
                            <th className="px-6 py-4 whitespace-nowrap">연락처</th>
                            <th className="px-6 py-4 whitespace-nowrap">활동 지역</th>
                            <th className="px-6 py-4 whitespace-nowrap">등급</th>
                            <th className="px-6 py-4 whitespace-nowrap text-center">계정 상태</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan="7" className="px-6 py-4 text-center">데이터를 불러오는 중...</td></tr>
                        ) : (
                            finalDisplayList.map((partner) => (
                                <tr key={partner.user_id} className={`hover:bg-gray-50 transition-colors ${partner.status === 'suspended' ? 'bg-red-50' : ''} ${partner._isSubordinate ? 'bg-indigo-50/40 border-l-2 border-indigo-200' : ''}`}>
                                    <td className={`py-4 whitespace-nowrap ${partner._isSubordinate ? 'pl-12' : 'px-6'}`}>
                                        <div className="flex items-center gap-1.5">
                                            {partner._isSubordinate && <span className="text-indigo-400 text-sm font-mono">└</span>}
                                            <span className={`font-bold ${partner.status === 'suspended' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                                                {partner.profiles?.name}
                                            </span>
                                            {partner._subCount > 0 && (
                                                <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full font-bold">소속 {partner._subCount}명</span>
                                            )}
                                            {partnerFilter === 'leader' && partner.master_id && (
                                                <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">소속: {getMasterName(partner.master_id)}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <CurrentStatusBadge status={partner.current_status} role={partner.profiles?.role} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <RoleBadge role={partner.profiles?.role} grade={partner.grade} large={true} />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={() => !isReadonly && openRoleModal(partner.user_id, partner.profiles?.role, partner.master_id, partner.profiles?.name)}
                                            disabled={isReadonly}
                                            className={`text-[11px] px-2 py-1 rounded transition-colors whitespace-nowrap ${
                                                isReadonly ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100'
                                            }`}
                                        >
                                            소속 관리 {isReadonly ? '🔒' : '⚙️'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (isReadonly) return;
                                                setRoleChangeUser({
                                                    id: partner.user_id,
                                                    name: partner.profiles?.name,
                                                    phone: partner.profiles?.phone,
                                                    role: partner.profiles?.role,
                                                    address: partner.address || ''
                                                });
                                                setIsChangeRoleOpen(true);
                                            }}
                                            disabled={isReadonly}
                                            className={`text-[11px] px-2 py-1 rounded transition-colors whitespace-nowrap ml-1 ${
                                                isReadonly ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
                                            }`}
                                        >
                                            직업 변경
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{partner.profiles?.phone}</td>
                                    <td className="px-6 py-4 text-gray-600">{partner.region}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-2 items-start">
                                            {!(partner.grade === 'Master' || partner.grade === 'S') && (
                                                <button
                                                    onClick={() => !isReadonly && openGradeModal(partner.user_id, partner.grade, partner.profiles?.name)}
                                                    disabled={isReadonly}
                                                    className={`font-bold px-2 py-1 rounded text-xs border transition-colors ${
                                                        isReadonly
                                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                            : 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200 cursor-pointer'
                                                    }`}
                                                    title={isReadonly ? '🔒 열람 전용 모드' : '클릭하여 등급 변경'}
                                                >
                                                    {partner.grade || 'N/A'} {isReadonly ? '🔒' : '✏️'}
                                                </button>
                                            )}
                                            
                                            {(partner.grade === 'Master' || partner.grade === 'S') && (
                                                <button
                                                    onClick={() => {
                                                        if (isReadonly) return;
                                                        const newVal = prompt(`${partner.profiles?.name} 마스터의 식구 제한 수를 입력하세요.`, partner.max_subordinates || 10);
                                                        if (newVal !== null && !isNaN(newVal)) {
                                                            // Calls the parent provided function to update
                                                            onUpdateMaxSubordinates(partner.user_id, parseInt(newVal));
                                                        }
                                                    }}
                                                    disabled={isReadonly}
                                                    className="font-bold px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded text-xs transition-colors flex items-center gap-1"
                                                    title={isReadonly ? '🔒 열람 전용 모드' : '식구 보유 허용량 변경'}
                                                >
                                                    T/O: {partner.max_subordinates || 10}명 {isReadonly ? '🔒' : '📝'}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-gray-500 text-xs flex items-center gap-2">
                                        <button
                                            onClick={() => !isReadonly && togglePartnerStatus(partner.user_id, partner.status, partner.profiles?.role)}
                                            disabled={isReadonly}
                                            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                                                isReadonly
                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                    : partner.status === 'approved'
                                                        ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                                                        : 'bg-gray-200 text-gray-500 hover:bg-green-100 hover:text-green-700'
                                            }`}
                                            title={isReadonly ? '🔒 열람 전용 모드' : ''}
                                        >
                                            {partner.status === 'approved' ? '정상 승인' : partner.status === 'suspended' ? '활동 정지' : partner.status}
                                        </button>
                                        {!isReadonly && (
                                            <button
                                                onClick={() => handlePasswordReset(partner.user_id, partner.profiles?.name)}
                                                className="p-1 text-gray-400 hover:text-indigo-600 transition-colors"
                                                title="비밀번호 변경"
                                            >
                                                <Lock className="w-4 h-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile View */}
            <div className="md:hidden flex flex-col p-4 bg-gray-50/50 min-h-screen">
                {loading ? (
                    <div className="text-center py-10 text-gray-500 font-bold">데이터를 불러오는 중...</div>
                ) : (
                    finalDisplayList.map(partner => (
                        <div key={partner.user_id} className={`bg-white p-4 rounded-xl shadow-sm mb-3 border ${partner.status === 'suspended' ? 'bg-red-50 border-red-200' : 'border-gray-200'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        {partner._isSubordinate && <span className="text-indigo-400 font-mono">└</span>}
                                        <span className={`font-bold text-lg ${partner.status === 'suspended' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{partner.profiles?.name}</span>
                                        {partner._subCount > 0 && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full font-bold">소속 {partner._subCount}명</span>}
                                        {partnerFilter === 'leader' && partner.master_id && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">소속: {getMasterName(partner.master_id)}</span>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                        <CurrentStatusBadge status={partner.current_status} role={partner.profiles?.role} />
                                        <RoleBadge role={partner.profiles?.role} grade={partner.grade} large={true} />
                                        <button
                                            onClick={() => !isReadonly && openRoleModal(partner.user_id, partner.profiles?.role, partner.master_id, partner.profiles?.name)}
                                            disabled={isReadonly}
                                            className="text-[11px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-1 rounded whitespace-nowrap"
                                        >
                                            소속관리
                                        </button>
                                    </div>
                                </div>
                                <div className="text-right text-sm">
                                    <div className="text-gray-900 font-bold">{partner.profiles?.phone}</div>
                                    <div className="text-gray-500 mt-1">{partner.region}</div>
                                </div>
                            </div>
                            <div className="pt-4 mt-3 border-t border-gray-50 flex justify-between items-center">
                                {!(partner.grade === 'Master' || partner.grade === 'S') && (
                                    <button
                                        onClick={() => !isReadonly && openGradeModal(partner.user_id, partner.grade, partner.profiles?.name)}
                                        disabled={isReadonly}
                                        className={`font-bold px-3 py-2 rounded-lg text-sm flex items-center gap-1 active:scale-95 transition-transform ${
                                            isReadonly ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-purple-100 text-purple-700'
                                        }`}
                                    >
                                        {partner.grade || 'N/A'} <span className="opacity-50">{isReadonly ? '🔒' : '✏️'}</span>
                                    </button>
                                )}
                                {(partner.grade === 'Master' || partner.grade === 'S') && (
                                    <button
                                        onClick={() => {
                                            if (isReadonly) return;
                                            const newVal = prompt(`${partner.profiles?.name} 마스터의 식구 제한 수를 입력하세요.`, partner.max_subordinates || 10);
                                            if (newVal !== null && !isNaN(newVal)) {
                                                onUpdateMaxSubordinates(partner.user_id, parseInt(newVal));
                                            }
                                        }}
                                        disabled={isReadonly}
                                        className={`font-bold px-3 py-2 rounded-lg text-sm flex items-center gap-1 active:scale-95 transition-transform ${
                                            isReadonly ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-amber-100 text-amber-700'
                                        }`}
                                    >
                                        T/O: {partner.max_subordinates || 10}명 <span className="opacity-50">{isReadonly ? '🔒' : '📝'}</span>
                                    </button>
                                )}
                                {!isReadonly && (
                                    <div className="flex gap-2">
                                        <button onClick={() => togglePartnerStatus(partner.user_id, partner.status, partner.profiles?.role)} className={`px-4 py-2 rounded-lg text-sm font-bold active:scale-95 transition-transform ${partner.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                            {partner.status === 'approved' ? '정상' : partner.status === 'suspended' ? '정지' : partner.status}
                                        </button>
                                        <button onClick={() => handlePasswordReset(partner.user_id, partner.profiles?.name)} className="p-2 bg-gray-100 text-gray-600 rounded-lg active:scale-95 transition-transform">
                                            <Lock className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {gradeModal.isOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-80 max-w-full transform transition-all scale-100">
                        <h3 className="text-lg font-bold text-gray-800 mb-2">등급 변경</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            <span className="font-bold text-indigo-600">{gradeModal.name}</span> 님의 새로운 등급을 선택하세요.
                        </p>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            {['A', 'B', 'C'].map((grade) => (
                                <button
                                    key={grade}
                                    onClick={() => confirmGradeChange(grade)}
                                    className={`py-3 rounded-lg font-bold border transition-all 
                                    ${gradeModal.currentGrade === grade ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-200' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'}
                                    `}
                                >
                                    {grade}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setGradeModal({ ...gradeModal, isOpen: false })}
                            className="w-full py-2.5 text-gray-500 font-medium hover:bg-gray-100 rounded-lg transition-colors text-sm"
                        >
                            취소
                        </button>
                    </div>
                </div>
            )}

            <RoleCompanyModal 
                isOpen={roleModal.isOpen}
                partnerId={roleModal.partnerId}
                currentRole={roleModal.currentRole}
                currentMasterId={roleModal.currentMasterId}
                name={roleModal.name}
                partners={partners}
                onConfirm={confirmRoleChange}
                onCancel={() => setRoleModal({ ...roleModal, isOpen: false })}
            />
             {isChangeRoleOpen && (
                <RoleChangeModal
                    isOpen={isChangeRoleOpen}
                    onClose={() => {
                        setIsChangeRoleOpen(false);
                        setRoleChangeUser(null);
                    }}
                    user={roleChangeUser}
                    onUpdate={onRefresh}
                />
            )}
        </div>
    );
}

const RoleCompanyModal = ({ isOpen, partnerId, currentRole, currentMasterId, name, partners, onConfirm, onCancel }) => {
    const partnerData = partners.find(p => p.user_id === partnerId);
    const currentGrade = partnerData?.grade || 'C';
    
    const isLeaderFamily = currentRole === 'leader';
    const isDealerFamily = ['dealer', 'morning', 'meal', '아침', '식사', 'master'].includes(currentRole);

    const getInitialPseudoRole = () => {
        if (isLeaderFamily) return ['Master', 'S'].includes(currentGrade) ? 'master_leader' : 'leader';
        if (isDealerFamily) return (currentRole === 'master' || ['Master', 'S'].includes(currentGrade)) ? 'master_dealer' : 'dealer';
        return 'dealer';
    };

    const [selectedRole, setSelectedRole] = useState('dealer');
    const [selectedMaster, setSelectedMaster] = useState('none');

    // Reset when modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedRole(getInitialPseudoRole());
            setSelectedMaster(currentMasterId || 'none');
        }
    }, [isOpen, partnerId, currentRole, currentMasterId, currentGrade]);

    if (!isOpen) return null;

    const availableMasters = selectedRole.includes('leader') 
        ? partners.filter(p => p.profiles?.role === 'leader' && ['Master', 'S'].includes(p.grade) && p.user_id !== partnerId)
        : partners.filter(p => (p.profiles?.role === 'master' || (['dealer', 'morning', 'meal', '아침', '식사'].includes(p.profiles?.role) && ['Master', 'S'].includes(p.grade))) && p.user_id !== partnerId);

    const masterLabel = selectedRole.includes('leader') ? '마스터 팀장' : '마스터 딜러';
    const isMasterSelected = selectedRole.includes('master');

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-96 max-w-full transform transition-all scale-100">
                <h3 className="text-lg font-bold text-gray-800 mb-2">직급 및 소속 변경</h3>
                <p className="text-sm text-gray-500 mb-6 border-b pb-4">
                    <span className="font-bold text-blue-600">{name}</span> 님의 상세 설정을 변경합니다.
                </p>

                <div className="space-y-5 mb-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">직책 그룹 (Role Group)</label>
                        <select
                            value={selectedRole}
                            onChange={(e) => {
                                setSelectedRole(e.target.value);
                                setSelectedMaster('none'); // Reset master when role changes
                            }}
                            className="w-full border border-gray-300 rounded-lg p-2.5 bg-gray-50 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
                        >
                            {isLeaderFamily && (
                                <>
                                    <option value="leader">팀장 (소속 팀원)</option>
                                    <option value="master_leader">마스터 팀장 (독립된 팀장)</option>
                                </>
                            )}
                            {isDealerFamily && (
                                <>
                                    <option value="dealer">딜러 (소속 파트너)</option>
                                    <option value="master_dealer">마스터 딜러 (독립된 딜러)</option>
                                </>
                            )}
                            {!isLeaderFamily && !isDealerFamily && (
                                <option value="dealer">알 수 없음</option>
                            )}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">소속 {masterLabel} (Affiliation)</label>
                        <select
                            value={isMasterSelected ? 'none' : selectedMaster}
                            onChange={(e) => setSelectedMaster(e.target.value)}
                            disabled={isMasterSelected}
                            className={`w-full border rounded-lg p-2.5 text-sm outline-none transition-colors ${isMasterSelected ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-gray-50 border-gray-300 focus:bg-white focus:ring-2 focus:ring-blue-500'}`}
                        >
                            <option value="none">소속 없음 (분리)</option>
                            {availableMasters.map(m => (
                                <option key={m.user_id} value={m.user_id}>
                                    {m.profiles?.name} {masterLabel} ({m.region || '지역 미상'})
                                </option>
                            ))}
                        </select>
                        {isMasterSelected ? (
                            <p className="text-xs text-red-500 mt-2 font-medium bg-red-50 p-2 rounded">
                                💡 마스터 승급 시 자동으로 독립 설정되며, Master 등급이 부여됩니다.
                            </p>
                        ) : (
                            <p className="text-xs text-blue-500 mt-2 font-medium bg-blue-50 p-2 rounded">
                                💡 소속을 적용하면 일반({isLeaderFamily ? '팀장' : '딜러'}) 자격으로 하위 편입됩니다.
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-lg hover:bg-gray-200 transition-colors"
                    >
                        취소
                    </button>
                    <button
                        onClick={() => onConfirm(selectedRole, selectedMaster)}
                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-sm transition-colors"
                    >
                        변경 저장
                    </button>
                </div>
            </div>
        </div>
    );
};
