import React from 'react';
import { MapPin, Clock, Calendar, Users } from 'lucide-react';

/**
 * FuneralCaseInfo — 공통 장례 정보 카드 컴포넌트
 * 
 * 팀장:
 *   진행상황뱃지 | 장례담당: OO팀장
 *   ┌──────────────────────────────────┐
 *   │ 등록번호: xxx | 상주: OO | 고인: OO │
 *   │ 등록날짜: OO  | 장례식장: OO | 호실  │
 *   └──────────────────────────────────┘
 *   입관뱃지 | 발인뱃지
 * 
 * 딜러:
 *   ┌──────────────────────────────────┐
 *   │ 등록번호: xxx | 상주: OO | 고인: OO │
 *   │ 등록날짜: OO  | 장례식장: OO | 호실  │
 *   └──────────────────────────────────┘
 */
export default function FuneralCaseInfo({
    caseId,
    deceasedName,
    chiefMournerName,
    clientPhone,
    location,
    roomNumber,
    variant = 'dealer',
    statusBadge,
    assigneeName,
    assigneeLabel = '팀장',
    showAssignee = true,
    encoffinmentTime,
    funeralEndTime,
    createdAt,
    date,
    compact = false,
    children
}) {
    const shortId = caseId ? caseId.split('-')[0] : '';
    const isManager = variant === 'manager';
    const formattedDate = date || (createdAt ? new Date(createdAt).toLocaleDateString('ko-KR') : '');

    // ── 공통 핵심 정보 박스 ──
    const InfoBox = () => (
        <div className="border border-gray-200 rounded-lg px-4 py-3 bg-gray-50/50 overflow-x-auto scrollbar-hide" style={{ fontSize: '14px', lineHeight: '2' }}>
            {/* Line 1: 등록번호 | 상주 | 고인 */}
            <div className="flex items-center whitespace-nowrap">
                <span className="text-gray-500">등록번호:</span>
                <span className="font-bold text-gray-900 ml-1">{shortId}</span>
                <span className="text-gray-300 mx-2">|</span>
                <span className="text-gray-500">상주:</span>
                <span className="font-bold text-gray-900 ml-1">{chiefMournerName || '미상'}</span>
                {clientPhone && (
                    <>
                        <span className="text-gray-300 mx-1">-</span>
                        <a href={`tel:${clientPhone}`} className="text-indigo-600 font-bold ml-1 hover:underline">{clientPhone}</a>
                    </>
                )}
            </div>
            {/* Line 2: 등록날짜 | 장례식장 | 호실 */}
            <div className="flex items-center whitespace-nowrap mt-1">
                <span className="text-gray-500">등록날짜:</span>
                <span className="font-bold text-gray-900 ml-1">{formattedDate || '-'}</span>
                <span className="text-gray-300 mx-2">|</span>
                <span className="text-gray-500">장례식장:</span>
                <span className="font-bold text-gray-900 ml-1">{location || '미정'}</span>
                {roomNumber && (
                    <>
                        <span className="text-gray-300 mx-2">|</span>
                        <span className="font-bold text-indigo-600">{roomNumber}호</span>
                    </>
                )}
            </div>
        </div>
    );

    // ── 딜러용 ──
    if (!isManager) {
        return (
            <div className="space-y-2">
                {statusBadge && (
                    <div>{statusBadge}</div>
                )}
                <InfoBox />
                {children}
            </div>
        );
    }

    // ── 팀장용 ──
    return (
        <div className="space-y-2">
            {/* Row 1: 진행상황뱃지 | 장례담당: OO팀장 */}
            <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: '14px' }}>
                {statusBadge}
                {showAssignee && assigneeName && (
                    <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md font-bold inline-flex items-center gap-1 border border-blue-100" style={{ fontSize: '13px' }}>
                        <Users className="w-3.5 h-3.5" />
                        장례담당: {assigneeName} {assigneeLabel}
                    </span>
                )}
            </div>

            {/* Row 2~3: 핵심 정보 박스 */}
            <InfoBox />

            {/* Row 4: 입관뱃지 | 발인뱃지 */}
            {(encoffinmentTime || funeralEndTime) && (
                <div className="flex flex-wrap gap-2">
                    {encoffinmentTime && (
                        <span className="text-gray-700 flex items-center gap-1 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full font-bold" style={{ fontSize: '13px' }}>
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            입관 {new Date(encoffinmentTime).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    {funeralEndTime && (
                        <span className="text-gray-700 flex items-center gap-1 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full font-bold" style={{ fontSize: '13px' }}>
                            <Calendar className="w-3.5 h-3.5 text-rose-500" />
                            발인 {new Date(funeralEndTime).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                </div>
            )}

            {children}
        </div>
    );
}
