import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Clock, ImageIcon, Camera } from 'lucide-react';
import useRealtimeSubscription from '../../hooks/useRealtimeSubscription';

// image_url 컬럼에서 URL 배열로 파싱 (하위 호환)
function parseImageUrls(imageUrl) {
    if (!imageUrl) return [];
    try {
        const parsed = JSON.parse(imageUrl);
        if (Array.isArray(parsed)) return parsed;
        return [parsed];
    } catch {
        return [imageUrl];
    }
}
const GROUPS = ['상담', '1일차', '2일차', '3일차'];
const FUNERAL_STAGES = [
    { number: 1, group: '상담', name: '콜문자' },
    { number: 2, group: '상담', name: '상품표/팀장프로필 발송문자' },
    { number: 3, group: '상담', name: '사망진단서/화장예약확인' },
    { number: 5, group: '상담', name: '상담결과보고' },

    { number: 4, group: '1일차', name: '1일차 입실 사진' },
    { number: 6, group: '1일차', name: '현황판/근조기' },
    { number: 7, group: '1일차', name: '제단/헌화꽃' },
    { number: 8, group: '1일차', name: '편의용품/일회용품' },
    { number: 9, group: '1일차', name: '빈소셋팅/도우미유니폼' },
    { number: 10, group: '1일차', name: '부고스크린샷/부고링크' },
    { number: 26, group: '1일차', name: '1일차 부고 사진' },
    { number: 11, group: '1일차', name: '장례일정표/향로꽃장식' },
    { number: 12, group: '1일차', name: '1일차 퇴실사진' },

    { number: 13, group: '2일차', name: '2일차 입실사진' },
    { number: 14, group: '2일차', name: '관셋팅/명정(소렴/대렴 표시)' },
    { number: 15, group: '2일차', name: '관꽃장식' },
    { number: 16, group: '2일차', name: '봉안함 발주서' },
    { number: 17, group: '2일차', name: '장의행사확인서' },
    { number: 18, group: '2일차', name: '2일차 퇴실사진' },

    { number: 19, group: '3일차', name: '3일차 입실사진' },
    { number: 20, group: '3일차', name: '장의차량 도착사진(리무진/버스)' },
    { number: 21, group: '3일차', name: '화장장 사진(봉안함)' },
    { number: 22, group: '3일차', name: '장지 안치 사진' },
    { number: 23, group: '3일차', name: '의전보고서/이용후기 사진' },
    { number: 24, group: '3일차', name: '의전종료보고' },
    { number: 25, group: '3일차', name: '3일차 퇴실사진' }
];

export default function TimelineView({ caseId }) {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null);

    useEffect(() => {
        if (caseId) {
            fetchReports();
        }
    }, [caseId]);

    // 🔄 4단계: 실시간 자동 갱신 — 진행 보고 변경 감지
    useRealtimeSubscription(
        'funeral_progress_reports',
        useCallback((payload) => {
            if (!caseId) return;
            // 해당 케이스의 보고만 재조회
            if (payload.new?.case_id === caseId || payload.old?.case_id === caseId) {
                fetchReports();
            }
        }, [caseId]),
        { events: ['INSERT', 'UPDATE'], enabled: !!caseId }
    );

    const fetchReports = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('funeral_progress_reports')
                .select('*')
                .eq('case_id', caseId)
                .order('stage_number', { ascending: true });

            if (error) throw error;
            setReports(data || []);
        } catch (error) {
            console.error('Error fetching timeline:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="py-8 flex justify-center"><div className="animate-pulse flex gap-2 items-center text-gray-400"><Clock className="w-5 h-5 animate-spin" /> 타임라인 불러오는 중...</div></div>;
    }

    // Determine the highest stage reached
    const maxStageReached = reports.length > 0 ? Math.max(...reports.map(r => r.stage_number)) : 0;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 mb-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2 sticky top-0 z-30 bg-white/95 backdrop-blur-sm py-2">
                <Camera className="w-5 h-5 text-indigo-600" />
                장례 진행 현황 (26단계)
            </h3>

            <div className="relative border-l-2 border-indigo-100 ml-4 sm:ml-5 pb-4">
                {GROUPS.map(groupName => (
                    <div key={groupName} className="relative pb-6">
                        {/* Sticky Group Header */}
                        <div className="sticky top-[48px] z-20 py-2 bg-white/95 backdrop-blur-sm -left-[20px]">
                            <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm ml-[-9px]">
                                {groupName}
                            </span>
                        </div>
                        
                        <div className="mt-2 flex flex-col gap-1">
                            {FUNERAL_STAGES.filter(s => s.group === groupName).map((stage) => {
                                const report = reports.find(r => r.stage_number === stage.number);
                                const isCompleted = !!report;

                                return (
                                    <div key={stage.number} className="relative pl-8 py-3 flex items-center justify-between gap-3 group hover:bg-gray-50/50 rounded-xl transition-colors">
                                        {/* Timeline indicator */}
                                        <div className="absolute -left-[13px] top-1/2 -translate-y-1/2 bg-white flex items-center justify-center">
                                            {isCompleted ? (
                                                <CheckCircle className="w-6 h-6 text-green-500 bg-white" />
                                            ) : (
                                                <div className="w-4 h-4 rounded-full border-2 border-gray-300 bg-white ml-1" />
                                            )}
                                        </div>

                                        {/* Left Side: Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className={`font-bold text-sm sm:text-base truncate ${isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                                                    {stage.name}
                                                </h4>
                                            </div>
                                            
                                            {isCompleted && report ? (
                                                <div className="mt-1 flex flex-col gap-1">
                                                    <div className="text-[11px] sm:text-xs text-gray-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(report.created_at).toLocaleString('ko-KR', {
                                                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                        })}
                                                        <span className="mx-1">•</span>
                                                        <span className="truncate">{report.author_name}</span>
                                                    </div>
                                                    
                                                    {report.content && report.content !== '확인 완료' && (
                                                        <details className="text-xs text-gray-600 mt-1 cursor-pointer max-w-sm">
                                                            <summary className="outline-none truncate hover:text-indigo-600 transition-colors font-medium">
                                                                {report.content.split('\n')[0]} {/* 첫 줄만 표시 */}
                                                            </summary>
                                                            <div className="pt-2 pb-1 whitespace-pre-wrap leading-relaxed text-gray-500">
                                                                {report.content}
                                                            </div>
                                                        </details>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-[11px] sm:text-xs text-gray-400 mt-1">대기 중</p>
                                            )}
                                        </div>

                                        {/* Right Side: Thumbnail */}
                                        <div className="flex-shrink-0">
                                            {(() => {
                                                if (!isCompleted || !report) return null;
                                                const urls = parseImageUrls(report.image_url);
                                                
                                                if (urls.length === 0) {
                                                    return (
                                                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center">
                                                            <Camera className="w-4 h-4 text-gray-300" />
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div 
                                                        className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg border border-gray-200 overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow group-hover:scale-105 transform bg-black"
                                                        onClick={() => setSelectedImage(urls[0])}
                                                    >
                                                        <img src={urls[0]} alt="썸네일" className="w-full h-full object-cover" />
                                                        {urls.length > 1 && (
                                                            <div className="absolute bottom-0 right-0 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded-tl-lg">
                                                                +{urls.length - 1}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Lightbox for Image */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
                    onClick={() => setSelectedImage(null)}
                >
                    <div className="relative max-w-5xl w-full flex justify-center">
                        <img
                            src={selectedImage}
                            alt="확대된 이미지"
                            className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl"
                        />
                        <button
                            className="absolute -top-12 right-0 text-white/70 hover:text-white font-bold tracking-wider text-sm transition-colors py-2 px-4 bg-white/10 hover:bg-white/20 rounded-full"
                        >
                            닫기 (아무 곳이나 터치)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
