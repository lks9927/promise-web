import React, { useState, useRef, useEffect } from 'react';
import { X, MapPin, User, Phone, Package, Clock, DollarSign, Calendar, ChevronDown, Check, Search } from 'lucide-react';
import TimelineView from '../../../components/common/TimelineView';
import { supabase } from '../../../lib/supabase';
import { useNotification } from '../../../contexts/NotificationContext';
import { translateError } from '../../../lib/errorHandler';
import { isMasterOrAbove } from '../../../lib/partnerGrade';

export default function CaseDetailModal({ caseItem, partners, onClose, isReadonly }) {
    const { showToast, sendNotification } = useNotification();
    const [isAssigning, setIsAssigning] = useState(false);
    const [selectedLeaderId, setSelectedLeaderId] = useState('');
    const [searchLeaderQuery, setSearchLeaderQuery] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [extraSalesItems, setExtraSalesItems] = useState([]);
    const [extraSalesLogs, setExtraSalesLogs] = useState([]);

    useEffect(() => {
        if (!caseItem?.id) return;
        const fetchExtraSales = async () => {
            try {
                const { data, error } = await supabase
                    .from('additional_income_items')
                    .select('*')
                    .eq('case_id', caseItem.id)
                    .order('created_at', { ascending: true });
                if (!error && data) {
                    setExtraSalesItems(data);
                }
            } catch {
                // safe fallback
            }
        };

        const fetchExtraSalesLogs = async () => {
            try {
                const { data, error } = await supabase
                    .from('additional_income_item_logs')
                    .select(`
                        id,
                        item_id,
                        action,
                        old_row,
                        new_row,
                        reason,
                        changed_at,
                        profiles:actor_id ( id, name, role )
                    `)
                    .eq('case_id', caseItem.id)
                    .order('changed_at', { ascending: false });
                if (!error && data) {
                    setExtraSalesLogs(data);
                }
            } catch {
                // additional_income_item_logs 미생성 DB 대비 조용히 숨김
                setExtraSalesLogs([]);
            }
        };

        fetchExtraSales();
        fetchExtraSalesLogs();
    }, [caseItem?.id]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (!caseItem) return null;

    const statusMap = {
        'requested': { label: '🚨 접수 대기', class: 'bg-red-100 text-red-700' },
        'assigned': { label: '🟡 팀장 배정', class: 'bg-yellow-100 text-yellow-700' },
        'consulting': { label: '🗣️ 상담 중', class: 'bg-orange-100 text-orange-700' },
        'in_progress': { label: '🔵 서비스 진행', class: 'bg-blue-100 text-blue-700' },
        'team_settling': { label: '🟢 정산 대기', class: 'bg-green-100 text-green-700' },
        'hq_check': { label: '🟢 정산 검토 중', class: 'bg-green-100 text-green-700' },
        'completed': { label: '⚪ 완료됨', class: 'bg-gray-100 text-gray-600' }
    };

    const status = statusMap[caseItem.status] || { label: caseItem.status, class: 'bg-gray-100 text-gray-600' };

    const getPartnerInfo = (partnerId) => {
        if (!partnerId) return null;
        const p = partners.find(p => p.user_id === partnerId);
        return p;
    };

    const teamLeader = getPartnerInfo(caseItem.team_leader_id);
    const requestingDealer = getPartnerInfo(caseItem.dealer_id);

    // Filter available leaders (strictly Team Leaders only, excluding master dealers)
    const availableLeaders = partners
        .filter(p => p.profiles?.role === 'leader' && (p.status === 'approved' || p.status === 'active'))
        .sort((a, b) => {
            const isAMaster = isMasterOrAbove(a.grade);
            const isBMaster = isMasterOrAbove(b.grade);
            if (isAMaster && !isBMaster) return -1;
            if (!isAMaster && isBMaster) return 1;
            return 0;
        });

    const getLeaderLabel = (p) => {
        const isMaster = isMasterOrAbove(p.grade);
        const prefix = isMaster ? '[마스터 팀장]' : '[일반 팀장]';
        return `${prefix} ${p.profiles?.name} (${p.region || '전국'})`;
    };

    const filteredLeaders = availableLeaders.filter(p => 
        getLeaderLabel(p).toLowerCase().includes(searchLeaderQuery.toLowerCase())
    );

    const selectedLeaderLabel = selectedLeaderId 
        ? getLeaderLabel(availableLeaders.find(l => l.user_id === selectedLeaderId))
    : '팀장을 검색한 후 선택하세요';

    const handleManualAssign = async () => {
        if (!selectedLeaderId) return;
        if (!confirm('해당 팀장으로 즉시 배정하시겠습니까?')) return;

        setIsAssigning(true);
        try {
            const { error } = await supabase
                .from('funeral_cases')
                .update({
                    team_leader_id: selectedLeaderId,
                    status: 'assigned'
                })
                .eq('id', caseItem.id);

            if (error) throw error;

            if (sendNotification) {
                // 발송 대상, 타입, 제목, 내용, 이동경로
                sendNotification(
                    selectedLeaderId,
                    'assignment',
                    '새로운 장례 배정',
                    '본사에서 귀하를 팀장으로 직접 배정했습니다. 내 현황에서 확인해주세요.',
                    '/leader'
                );
            }

            showToast('success', '배정 완료', '팀장 배정이 수동으로 완료되었습니다.');
            onClose(); // Close and let parent refresh via realtime
        } catch (error) {
            console.error('Manual Assign Error:', error);
            showToast('error', '배정 실패', translateError(error));
        } finally {
            setIsAssigning(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col h-[90vh] md:h-auto md:max-h-[85vh] animate-fadeIn">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50 rounded-t-2xl flex-shrink-0">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-xl font-bold text-gray-900">상세 접수 정보</h2>
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${status.class}`}>
                                {status.label}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 font-mono">ID: {caseItem.id}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {/* Manual Assign Section - Show if not assigned and non-readonly admins */}
                    {!caseItem.team_leader_id && caseItem.status !== 'completed' && caseItem.status !== 'cancelled' && !isReadonly && (
                        <div className="mb-8 bg-indigo-50 p-5 rounded-2xl border border-indigo-100 relative" style={{ overflow: 'visible' }}>
                            <h3 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
                                <Check className="w-4 h-4" /> 수동 팀장 배정
                            </h3>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <div className="relative flex-1" ref={dropdownRef}>
                                    <div 
                                        className="w-full pl-4 pr-10 py-3 bg-white border border-indigo-200 rounded-xl cursor-pointer text-sm text-gray-800 flex items-center justify-between shadow-sm"
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    >
                                        <span className={`truncate block font-medium ${!selectedLeaderId ? 'text-gray-400' : ''}`}>
                                            {selectedLeaderLabel}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-indigo-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                                    </div>
                                    
                                    {isDropdownOpen && (
                                        <div className="absolute z-50 w-full mt-2 bg-white border border-indigo-100 rounded-xl shadow-xl max-h-60 overflow-hidden flex flex-col">
                                            <div className="p-2 border-b border-gray-100 bg-gray-50">
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                                    <input 
                                                        type="text" 
                                                        placeholder="팀장 이름, 지역 검색..."
                                                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                                        value={searchLeaderQuery}
                                                        onChange={(e) => setSearchLeaderQuery(e.target.value)}
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>
                                            <div className="overflow-y-auto flex-1">
                                                {filteredLeaders.length === 0 ? (
                                                    <div className="p-4 text-center text-sm text-gray-500">검색 결과가 없습니다.</div>
                                                ) : (
                                                    <ul className="py-1">
                                                        {filteredLeaders.map(p => (
                                                            <li 
                                                                key={p.user_id}
                                                                className={`px-4 py-2.5 text-sm cursor-pointer transition-colors ${selectedLeaderId === p.user_id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-gray-50 text-gray-800'}`}
                                                                onClick={() => {
                                                                    setSelectedLeaderId(p.user_id);
                                                                    setIsDropdownOpen(false);
                                                                    setSearchLeaderQuery('');
                                                                }}
                                                            >
                                                                {getLeaderLabel(p)}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={handleManualAssign}
                                    disabled={!selectedLeaderId || isAssigning}
                                    className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 whitespace-nowrap"
                                >
                                    {isAssigning ? '배정 중...' : '배정 완료'}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div>
                            <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">고객 및 장소 정보</h3>
                            <div className="space-y-4">
                                <div className="flex gap-3 items-start">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><User className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-xs text-gray-500">상주 성함</p>
                                        <p className="font-bold text-gray-900">{caseItem.profiles?.name || '미결정'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 items-start">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Phone className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-xs text-gray-500">연락처</p>
                                        <p className="font-medium text-gray-900">{caseItem.profiles?.phone || '미결정'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 items-start">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><MapPin className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-xs text-gray-500">장례식장 (장소)</p>
                                        <p className="font-medium text-gray-900">{caseItem.location || '미결정'}</p>
                                    </div>
                                </div>
                                
                                <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3 items-start">
                                    <div className="p-2 bg-pink-50 text-pink-600 rounded-lg"><User className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-xs text-gray-500">접수 파트너 (최초 딜러)</p>
                                        <p className="font-bold text-gray-900">
                                            {requestingDealer ? `${requestingDealer.profiles?.name} (${requestingDealer.grade || '일반'})` : '본사'}
                                        </p>
                                        {requestingDealer && (
                                            <p className="text-xs text-gray-400 mt-1">{requestingDealer.profiles?.phone}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">상품 및 담당자 정보</h3>
                            <div className="space-y-4">
                                <div className="flex gap-3 items-start">
                                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><Package className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-xs text-gray-500">선택 상품</p>
                                        <p className="font-bold text-gray-900">{caseItem.package_name || '미결정'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-3 items-start">
                                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><User className="w-4 h-4" /></div>
                                    <div>
                                        <p className="text-xs text-gray-500">담당 파트너 (팀장)</p>
                                        <p className="font-medium text-gray-900">
                                            {teamLeader ? `${teamLeader.profiles?.name} (${teamLeader.grade})` : '배정 대기 중'}
                                        </p>
                                        {teamLeader && (
                                            <p className="text-xs text-gray-400 mt-1">{teamLeader.profiles?.phone}</p>
                                        )}
                                    </div>
                                </div>
                                {caseItem.final_price > 0 && (
                                    <div className="flex gap-3 items-start">
                                        <div className="p-2 bg-green-50 text-green-600 rounded-lg"><DollarSign className="w-4 h-4" /></div>
                                        <div>
                                            <p className="text-xs text-gray-500">최종 청구 금액</p>
                                            <p className="font-bold text-green-600">₩ {caseItem.final_price?.toLocaleString()}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 추가 매출 내역 (읽기 전용) */}
                    {extraSalesItems.length > 0 && (
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <span className="w-1.5 h-6 bg-indigo-500 rounded-full inline-block"></span>
                                    추가 매출 내역
                                </h3>
                                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                                    총 {extraSalesItems.filter(i => !i.is_cancelled).length}건{extraSalesItems.some(i => i.is_cancelled) && ` (취소 ${extraSalesItems.filter(i => i.is_cancelled).length}건)`}
                                </span>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                                <div className="divide-y divide-gray-200">
                                    {extraSalesItems.map((item) => (
                                        <div key={item.id} className={`py-2.5 flex justify-between items-center text-sm ${item.is_cancelled ? 'opacity-40 line-through' : ''}`}>
                                            <div>
                                                <span className="font-semibold text-gray-800">{item.item_name}</span>
                                                <span className="text-xs text-gray-500 ml-2">
                                                    (₩{(item.unit_price || 0).toLocaleString()} × {item.quantity || 1}개)
                                                </span>
                                                {item.is_cancelled && (
                                                    <span className="ml-2 text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                                        취소됨
                                                    </span>
                                                )}
                                                {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
                                            </div>
                                            <span className="font-bold text-gray-900">
                                                ₩{((item.unit_price || 0) * (item.quantity || 1)).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="pt-3 border-t border-gray-200 flex justify-between items-center text-sm">
                        <span className="font-bold text-gray-700">추가 매출 합계 (유효 건)</span>
                                    <span className="text-base font-black text-indigo-600">
                                        ₩{extraSalesItems.filter(i => !i.is_cancelled).reduce((sum, item) => sum + ((item.unit_price || 0) * (item.quantity || 1)), 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 추가 매출 변경 기록 (읽기 전용, 테이블 없거나 이력 없으면 조용히 숨김) */}
                    {extraSalesLogs.length > 0 && (
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                    <span className="w-1.5 h-6 bg-slate-500 rounded-full inline-block"></span>
                                    추가 매출 변경 기록
                                </h3>
                                <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                                    총 {extraSalesLogs.length}건의 기록
                                </span>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2.5 text-xs">
                                <div className="divide-y divide-gray-200">
                                    {extraSalesLogs.map((log) => {
                                        const actionBadge = {
                                            'create': { label: '등록', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
                                            'cancel': { label: '취소', cls: 'bg-red-100 text-red-700 border-red-200' },
                                            'restore': { label: '되살림', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                                            'update': { label: '수정', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
                                        }[log.action] || { label: log.action, cls: 'bg-gray-100 text-gray-700 border-gray-200' };

                                        const itemName = log.new_row?.item_name || log.old_row?.item_name || '품목';
                                        const oldPrice = log.old_row ? ((log.old_row.unit_price || 0) * (log.old_row.quantity || 1)) : null;
                                        const newPrice = log.new_row ? ((log.new_row.unit_price || 0) * (log.new_row.quantity || 1)) : null;

                                        return (
                                            <div key={log.id} className="py-2.5 space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${actionBadge.cls}`}>
                                                            {actionBadge.label}
                                                        </span>
                                                        <span className="font-bold text-gray-800 text-xs">
                                                            {itemName}
                                                        </span>
                                                        <span className="text-[11px] text-gray-500">
                                                            by {log.profiles?.name || '담당자'}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-gray-400 font-mono">
                                                        {new Date(log.changed_at).toLocaleString()}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-600 pl-1 text-[11px]">
                                                    {log.action === 'create' && newPrice != null && (
                                                        <span>등록 금액: <strong>₩{newPrice.toLocaleString()}</strong> ({log.new_row.quantity || 1}개)</span>
                                                    )}
                                                    {log.action === 'cancel' && oldPrice != null && (
                                                        <span>취소된 금액: <strong className="text-red-600">₩{oldPrice.toLocaleString()}</strong> ({log.old_row.quantity || 1}개)</span>
                                                    )}
                                                    {log.action === 'restore' && newPrice != null && (
                                                        <span>되살린 금액: <strong className="text-emerald-600">₩{newPrice.toLocaleString()}</strong> ({log.new_row.quantity || 1}개)</span>
                                                    )}
                                                    {log.action === 'update' && oldPrice != null && newPrice != null && (
                                                        <span>금액 변경: ₩{oldPrice.toLocaleString()} → <strong>₩{newPrice.toLocaleString()}</strong></span>
                                                    )}
                                                    {log.reason && (
                                                        <span className="text-red-700 bg-red-50/70 px-1.5 py-0.5 rounded border border-red-100">
                                                            사유: {log.reason}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mb-8">
                        <div className="flex gap-2 items-center mb-4">
                            <Clock className="w-5 h-5 text-indigo-500" />
                            <h3 className="text-sm font-bold text-gray-800">접수 일시</h3>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Calendar className="w-4 h-4" />
                                {new Date(caseItem.created_at).toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-400">
                                (접수 일시: {new Date(caseItem.created_at).toLocaleString()})
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-sm font-bold text-gray-800 mb-4 flex gap-2 items-center">
                            <span className="w-1.5 h-6 bg-indigo-500 rounded-full inline-block"></span>
                            진행 이력 (타임라인)
                        </h3>
                        <div className="bg-white border text-sm border-gray-100 rounded-xl p-4 shadow-inner">
                            <TimelineView caseId={caseItem.id} />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end flex-shrink-0">
                    <button 
                        onClick={onClose} 
                        className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-black transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
