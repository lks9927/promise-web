import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { AlertCircle, CheckCircle, ShieldAlert, X } from 'lucide-react';

export default function RoleChangeModal({ isOpen, onClose, user, onUpdate }) {
    const [loading, setLoading] = useState(false);
    const [activeCasesCount, setActiveCasesCount] = useState(0);
    const [checkingCases, setCheckingCases] = useState(true);
    const [selectedRole, setSelectedRole] = useState('');
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && user) {
            checkActiveCases();
            setSelectedRole(user.role || 'customer');
            setError(null);
        }
    }, [isOpen, user]);

    // 해당 유저가 관여된 진행 중인 장례(완료/취소되지 않은 건)가 있는지 검사
    const checkActiveCases = async () => {
        try {
            setCheckingCases(true);
            
            // 완료되지 않은 장례 케이스 상태 목록
            const activeStatuses = ['requested', 'assigned', 'in_progress'];
            
            const { data, error: fetchErr } = await supabase
                .from('funeral_cases')
                .select('id')
                .in('status', activeStatuses)
                .or(`customer_id.eq.${user.id},team_leader_id.eq.${user.id},dealer_id.eq.${user.id}`);

            if (fetchErr) throw fetchErr;
            
            setActiveCasesCount(data?.length || 0);
        } catch (err) {
            console.error('Active cases check error:', err);
            setError('진행 중인 장례 상태를 확인하지 못했습니다.');
        } finally {
            setCheckingCases(false);
        }
    };

    const handleRoleChange = async () => {
        if (!user) return;
        if (selectedRole === user.role) {
            alert('현재와 동일한 역할입니다.');
            return;
        }

        if (!confirm(`정말로 ${user.name}님의 역할을 [${getRoleLabel(user.role)}]에서 [${getRoleLabel(selectedRole)}]으로 변경하시겠습니까?\n이 작업은 데이터베이스 테이블 구조를 실시간으로 업데이트합니다.`)) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // 1. 프로필 테이블의 역할 업데이트
            const { error: profileErr } = await supabase
                .from('profiles')
                .update({ role: selectedRole })
                .eq('id', user.id);

            if (profileErr) throw profileErr;

            // 2. 타겟 역할에 맞춘 데이터 정리 및 생성 (트랜잭션 순차 처리)
            
            if (selectedRole === 'customer') {
                // 일반고객으로 변경 시 -> partners 및 vendors 레코드 깔끔하게 제거 (데이터 꼬임 방지)
                await supabase.from('partners').delete().eq('user_id', user.id);
                await supabase.from('vendors').delete().eq('user_id', user.id);
            } 
            else if (selectedRole === 'leader' || selectedRole === 'dealer') {
                // 딜러/팀장으로 변경 시 -> 기존 외주업체 데이터 삭제
                await supabase.from('vendors').delete().eq('user_id', user.id);

                // partners 레코드가 존재하는지 먼저 확인
                const { data: existingPartner } = await supabase
                    .from('partners')
                    .select('user_id')
                    .eq('user_id', user.id)
                    .single();

                if (!existingPartner) {
                    // 레코드가 없으면 신규 생성
                    const { error: partErr } = await supabase
                        .from('partners')
                        .insert([
                            {
                                user_id: user.id,
                                region: '지역 미정',
                                address: user.address || '',
                                detail_address: '',
                                grade: 'C',
                                status: 'pending' // 안전을 위해 승인 대기로 생성
                            }
                        ]);
                    if (partErr) throw partErr;
                }
            } 
            else if (selectedRole === 'vendor') {
                // 외주업체로 변경 시 -> 기존 파트너 데이터 삭제 (3번 사항 완벽 적용)
                await supabase.from('partners').delete().eq('user_id', user.id);

                // vendors 레코드가 존재하는지 먼저 확인
                const { data: existingVendor } = await supabase
                    .from('vendors')
                    .select('user_id')
                    .eq('user_id', user.id)
                    .single();

                if (!existingVendor) {
                    // 레코드가 없으면 신규 생성
                    const { error: vendErr } = await supabase
                        .from('vendors')
                        .insert([
                            {
                                user_id: user.id,
                                company_name: `${user.name} (외주)`,
                                business_type: 'other',
                                phone: user.phone || '',
                                address: user.address || '',
                                status: 'pending' // 안전을 위해 승인 대기로 생성
                            }
                        ]);
                    if (vendErr) throw vendErr;
                }
            }

            alert(`🎉 ${user.name}님의 역할이 [${getRoleLabel(selectedRole)}](으)로 성공적으로 변경되었습니다.`);
            onUpdate();
            onClose();
        } catch (err) {
            console.error('Role update error:', err);
            setError(`변경 실패: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const getRoleLabel = (role) => {
        const labels = {
            admin: '관리자',
            master: '마스터 딜러',
            leader: '팀장',
            dealer: '딜러',
            vendor: '외주업체',
            customer: '일반고객'
        };
        return labels[role] || role;
    };

    if (!isOpen) return null;

    const isBlocked = activeCasesCount > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-gray-100 transform transition-all scale-100">
                
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                    <div>
                        <h3 className="font-bold text-lg">⚙️ 회원 직업(역할) 안전 변경</h3>
                        <p className="text-slate-400 text-xs mt-0.5">{user?.name} 님 ({user?.phone})</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {checkingCases ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-sm text-gray-500 font-medium">진행 중인 장례 현황을 확인하는 중...</p>
                        </div>
                    ) : (
                        <>
                            {/* 장례 진행 상태 경고 배너 */}
                            {isBlocked ? (
                                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex gap-3 text-rose-800">
                                    <ShieldAlert className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold text-sm">역할 변경 불가 (보안 통제)</p>
                                        <p className="text-xs text-rose-600 mt-1 leading-relaxed">
                                            현재 이 유저가 **담당자로 진행 중인 장례 서비스가 {activeCasesCount}건** 존재합니다. 
                                            장례 진행 중에 직업을 바꾸면 시스템 에러가 발생하므로 역할을 변경할 수 없습니다. 
                                            해당 장례들이 모두 완료되거나 취소된 후에 다시 시도해 주세요.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex gap-3 text-emerald-800">
                                    <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold text-sm">안전 검증 통과</p>
                                        <p className="text-xs text-emerald-600 mt-0.5">
                                            진행 중인 장례 서비스가 없습니다. 안심하고 역할을 변경하셔도 좋습니다.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* 역할 선택 영역 */}
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700">이동할 새 직업(역할) 선택</label>
                                <select
                                    disabled={isBlocked || loading}
                                    value={selectedRole}
                                    onChange={(e) => setSelectedRole(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:bg-gray-50 disabled:cursor-not-allowed font-medium text-gray-800"
                                >
                                    <option value="customer">일반고객 (Customer)</option>
                                    <option value="dealer">딜러 (Dealer)</option>
                                    <option value="leader">장례 팀장 (Leader)</option>
                                    <option value="vendor">외주업체 (Vendor)</option>
                                </select>
                            </div>

                            {/* 주의 사항 안내 */}
                            {!isBlocked && (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-2.5 text-amber-800">
                                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-xs text-amber-700 leading-relaxed">
                                        <strong>⚠️ 역할 변경 주의 사항:</strong>
                                        <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                            <li>**외주업체**로 변경 시 기존 딜러/팀장 정보가 완전히 리셋되며 `vendors` 테이블에 신규 생성됩니다.</li>
                                            <li>**일반고객**으로 변경 시 기존 딜러/팀장 및 외주업체 명단에서 안전하게 영구 정리됩니다.</li>
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {error && (
                                <p className="text-xs font-bold text-rose-500 text-center animate-pulse">{error}</p>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                                >
                                    취소
                                </button>
                                <button
                                    type="button"
                                    disabled={isBlocked || loading || selectedRole === user.role}
                                    onClick={handleRoleChange}
                                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-all shadow-sm"
                                >
                                    {loading ? '변경 처리 중...' : '역할 변경 승인'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
