import React, { useState } from 'react';
import TimelineView from '../../common/TimelineView';
import CaseDetailModal from '../modals/CaseDetailModal';

export default function CaseTab({ cases, partners, coupons = [], loading, isReadonly }) {
    const [selectedCase, setSelectedCase] = useState(null);

    // 케이스에 연결된 쿠폰 찾기 (funeral_cases.coupon_code → coupons.code 로 매칭)
    const findCouponForCase = (item) => {
        if (!item.coupon_code) return null;
        return coupons.find(c => c.code === item.coupon_code);
    };

    // 딜러 ID 결정 헬퍼: dealer_id가 없으면 쿠폰 발행자로 대체
    const getEffectiveDealerId = (item) => {
        if (item.dealer_id) return item.dealer_id;
        // 쿠폰으로 접수된 경우 → 쿠폰 발행자 = 딜러
        const coupon = findCouponForCase(item);
        if (coupon?.issued_by) return coupon.issued_by;
        return null;
    };

    // 딜러 정보 조회 헬퍼
    const getDealerInfo = (item) => {
        const dealerId = getEffectiveDealerId(item);
        if (!dealerId) {
            // 쿠폰으로 들어왔거나 딜러 없이 들어오면 본사
            const coupon = findCouponForCase(item);
            return { name: '본사', phone: null, fromCoupon: !!coupon };
        }
        // 1) dealer join 데이터가 있으면 사용
        if (item.dealer_id && item.dealer) return { name: item.dealer.name, phone: item.dealer.phone, fromCoupon: false };
        // 2) 쿠폰 경유 → partners에서 발행자 이름 찾기
        const coupon = findCouponForCase(item);
        if (coupon) {
            // 쿠폰에 profiles join 데이터가 있으면 사용
            if (coupon.profiles?.name) return { name: coupon.profiles.name, phone: null, fromCoupon: true };
            // partners에서 찾기
            const p = partners.find(p => p.user_id === coupon.issued_by);
            if (p) return { name: p.profiles?.name, phone: p.profiles?.phone, fromCoupon: true };
            // 쿠폰 발행자가 파트너 목록에 없으면 본사
            return { name: '본사', phone: null, fromCoupon: true };
        }
        // 3) partners 목록에서 직접 찾기
        const p = partners.find(p => p.user_id === dealerId);
        return p ? { name: p.profiles?.name, phone: p.profiles?.phone, fromCoupon: !item.dealer_id } : { name: '본사', phone: null, fromCoupon: false };
    };

    // 딜러 마스터 정보 조회 헬퍼
    const getDealerMasterInfo = (item) => {
        const dealerId = getEffectiveDealerId(item);
        if (!dealerId) return null;
        const p = partners.find(p => p.user_id === dealerId);
        if (!p) return null;
        if (p.grade === 'Master' || p.grade === 'S') return { name: p.profiles?.name, isSelf: true };
        if (p.master_id) {
            const m = partners.find(mp => mp.user_id === p.master_id);
            return m ? { name: m.profiles?.name, isSelf: false } : null;
        }
        return null;
    };


    return (
        <>
            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto overflow-y-auto max-h-[70vh] relative">
                <table className="w-full text-left" style={{ fontSize: '14px' }}>
                    <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-5 py-3">접수번호</th>
                            <th className="px-5 py-3">상주 성함 (연락처)</th>
                            <th className="px-5 py-3">장소</th>
                            <th className="px-5 py-3">상품</th>
                            <th className="px-5 py-3">접수 딜러</th>
                            <th className="px-5 py-3">딜러 마스터</th>
                            <th className="px-5 py-3">담당 팀장</th>
                            <th className="px-5 py-3">소속 마스터</th>
                            <th className="px-5 py-3 text-center">상태</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan="9" className="px-5 py-4 text-center">데이터를 불러오는 중...</td></tr>
                        ) : (
                            cases.map(item => {
                                const dealerInfo = getDealerInfo(item);
                                const dealerMaster = getDealerMasterInfo(item);

                                return (
                                <React.Fragment key={item.id}>
                                    <tr 
                                        className="hover:bg-indigo-50 cursor-pointer transition-colors"
                                        onClick={() => setSelectedCase(item)}
                                    >
                                        <td className="px-5 py-3 font-mono text-gray-500">{item.id.substring(0, 8)}...</td>
                                        <td className="px-5 py-3 font-bold text-gray-900">
                                            {item.profiles?.name} <span className="text-gray-400 font-normal">({item.profiles?.phone})</span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-600">{item.location}</td>
                                        <td className="px-5 py-3 text-gray-600">{item.package_name}</td>
                                        {/* 접수 딜러 */}
                                        <td className="px-5 py-3">
                                            {dealerInfo ? (
                                                <div>
                                                    <div className="font-bold text-gray-900">{dealerInfo.name}</div>
                                                    {dealerInfo.fromCoupon && <div className="text-indigo-500" style={{ fontSize: '11px' }}>🎟️ 쿠폰 경유</div>}
                                                </div>
                                            ) : <span className="text-gray-400" style={{ fontSize: '12px' }}>-</span>}
                                        </td>
                                        {/* 딜러 마스터 */}
                                        <td className="px-5 py-3">
                                            {dealerMaster ? (
                                                dealerMaster.isSelf ? (
                                                    <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded" style={{ fontSize: '12px' }}>본인 (Master)</span>
                                                ) : (
                                                    <span className="font-medium text-gray-700">{dealerMaster.name}</span>
                                                )
                                            ) : <span className="text-gray-400" style={{ fontSize: '12px' }}>-</span>}
                                        </td>
                                        {/* 담당 팀장 */}
                                        <td className="px-5 py-3">
                                            {(() => {
                                                if (item.team_leader_id) {
                                                    const p = partners.find(p => p.user_id === item.team_leader_id);
                                                    return p ? (
                                                        <div>
                                                            <div className="font-bold text-gray-900">{p.profiles?.name}</div>
                                                            <div className="text-indigo-500" style={{ fontSize: '12px' }}>{p.grade}</div>
                                                        </div>
                                                    ) : <span className="text-gray-400">정보 없음</span>;
                                                }
                                                if (item.current_bidder_id) {
                                                    const bidder = partners.find(p => p.user_id === item.current_bidder_id);
                                                    return (
                                                        <div>
                                                            <div className="text-amber-600 font-bold" style={{ fontSize: '12px' }}>⏳ 배정예정</div>
                                                            <div className="text-gray-700 font-medium">{bidder?.profiles?.name || '확인중'}</div>
                                                        </div>
                                                    );
                                                }
                                                return <span className="text-gray-400" style={{ fontSize: '12px' }}>-</span>;
                                            })()}
                                        </td>
                                        {/* 소속 마스터 (팀장 기준) */}
                                        <td className="px-5 py-3">
                                            {(() => {
                                                if (!item.team_leader_id) return <span className="text-gray-400" style={{ fontSize: '12px' }}>-</span>;
                                                const p = partners.find(p => p.user_id === item.team_leader_id);
                                                if (!p) return '-';
                                                if (p.grade === 'Master') return <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded" style={{ fontSize: '12px' }}>본인 (Master)</span>;
                                                if (p.master_id) {
                                                    const m = partners.find(mp => mp.user_id === p.master_id);
                                                    return m ? <span className="font-medium text-gray-700">{m.profiles?.name}</span> : <span className="text-red-400" style={{ fontSize: '12px' }}>마스터 정보 없음</span>;
                                                }
                                                return <span className="text-gray-400" style={{ fontSize: '12px' }}>-</span>;
                                            })()}
                                        </td>
                                        <td className="px-5 py-3 text-center align-middle">
                                            {(() => {
                                                const statusMap = {
                                                    'requested': { label: '🚨 접수 대기', class: 'bg-red-100 text-red-700 animate-pulse' },
                                                    'assigned': { label: '🟡 팀장 배정', class: 'bg-yellow-100 text-yellow-700' },
                                                    'consulting': { label: '🗣️ 상담 중', class: 'bg-orange-100 text-orange-700' },
                                                    'in_progress': { label: '🔵 서비스 진행', class: 'bg-blue-100 text-blue-700' },
                                                    'team_settling': { label: '🟢 정산 대기', class: 'bg-green-100 text-green-700' },
                                                    'hq_check': { label: '🟢 정산 검토 중', class: 'bg-green-100 text-green-700' },
                                                    'completed': { label: '⚪ 완료됨', class: 'bg-gray-100 text-gray-600' }
                                                };
                                                const status = statusMap[item.status] || { label: item.status, class: 'bg-gray-100 text-gray-600' };
                                                return (
                                                    <span className={`px-3 py-1 rounded-full font-bold ${status.class}`} style={{ fontSize: '12px' }}>
                                                        {status.label}
                                                    </span>
                                                );
                                            })()}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedCase(item);
                                                }}
                                                className="mt-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-md font-bold hover:bg-indigo-100 transition-colors"
                                                style={{ fontSize: '12px' }}
                                            >
                                                상세 내용
                                            </button>
                                        </td>
                                    </tr>
                                </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            {/* Mobile View */}
            <div className="md:hidden flex flex-col p-4 bg-gray-50/50 min-h-screen" style={{ fontSize: '14px' }}>
                {loading ? (
                    <div className="text-center py-10 text-gray-500 font-bold">데이터를 불러오는 중...</div>
                ) : (
                    cases.map(item => {
                        const statusMap = {
                            'requested': { label: '🚨 접수 대기', class: 'text-red-700 bg-red-100 animate-pulse' },
                            'assigned': { label: '🟡 팀 배정', class: 'text-yellow-700 bg-yellow-100' },
                            'consulting': { label: '🗣️ 상담 중', class: 'text-orange-700 bg-orange-100' },
                            'in_progress': { label: '🔵 서비스 진행', class: 'text-blue-700 bg-blue-100' },
                            'team_settling': { label: '🟢 정산 대기', class: 'text-green-700 bg-green-100' },
                            'hq_check': { label: '🟢 정산 검토', class: 'text-green-700 bg-green-100' },
                            'completed': { label: '⚪ 완료됨', class: 'text-gray-600 bg-gray-100' }
                        };
                        const status = statusMap[item.status] || { label: item.status, class: 'text-gray-600 bg-gray-100' };
                        const dealerInfo = getDealerInfo(item);
                        const dealerMaster = getDealerMasterInfo(item);

                        return (
                            <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-3">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <div className="text-gray-400 font-mono mb-1" style={{ fontSize: '11px' }}>{item.id.substring(0, 8)}...</div>
                                        <div className="font-bold text-gray-900 text-lg">{item.profiles?.name} <span className="font-normal text-gray-500" style={{ fontSize: '13px' }}>({item.profiles?.phone})</span></div>
                                        <div className="text-gray-600 mt-1">{item.location} • {item.package_name}</div>
                                    </div>
                                    <span className={`px-2 py-1 rounded-full font-bold ${status.class}`} style={{ fontSize: '12px' }}>{status.label}</span>
                                </div>
                                <div className="pt-3 mt-3 border-t border-gray-50 space-y-1">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">접수 딜러:</span>
                                        <span className="font-medium text-gray-900">{dealerInfo ? dealerInfo.name : '-'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">딜러 마스터:</span>
                                        <span className="font-medium text-gray-900">
                                            {dealerMaster ? (dealerMaster.isSelf ? '본인(Master)' : dealerMaster.name) : '-'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">담당:</span>
                                        <span className="font-medium text-gray-900">
                                            {(() => {
                                                if (!item.team_leader_id) return '-';
                                                const p = partners.find(p => p.user_id === item.team_leader_id);
                                                return p ? `${p.profiles?.name} (${p.grade})` : '정보 없음';
                                            })()}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">마스터:</span>
                                        <span className="font-medium text-gray-900">
                                            {(() => {
                                                if (!item.team_leader_id) return '-';
                                                const p = partners.find(p => p.user_id === item.team_leader_id);
                                                if (!p) return '-';
                                                if (p.grade === 'Master') return '본인(Master)';
                                                if (p.master_id) {
                                                    const m = partners.find(mp => mp.user_id === p.master_id);
                                                    return m ? m.profiles?.name : '없음';
                                                }
                                                return '-';
                                            })()}
                                        </span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setSelectedCase(item)} 
                                    className="w-full mt-3 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-lg transition-all hover:bg-indigo-100 active:scale-95"
                                    style={{ fontSize: '13px' }}
                                >
                                    상세 내용 확인
                                </button>
                            </div>
                        );
                    })
                )}
            </div>

            {selectedCase && (
                <CaseDetailModal 
                    caseItem={selectedCase} 
                    partners={partners} 
                    onClose={() => setSelectedCase(null)} 
                    isReadonly={isReadonly}
                />
            )}
        </>
    );
}
