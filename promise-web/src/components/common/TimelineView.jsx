import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Clock, ImageIcon, Camera } from 'lucide-react';

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
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 mb-6">
            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Camera className="w-5 h-5 text-indigo-600" />
                장례 진행 현황 (6단계)
            </h3>

            <div className="relative border-l-2 border-indigo-100 ml-3 sm:ml-4 space-y-8 pb-4">
                {GROUPS.map(groupName => (
                    <div key={groupName} className="relative">
                        <div className="absolute -left-[18px] top-0 bg-white py-1">
                            <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                                {groupName}
                            </span>
                        </div>
                        
                        <div className="mt-8 space-y-6">
                            {FUNERAL_STAGES.filter(s => s.group === groupName).map((stage) => {
                                const report = reports.find(r => r.stage_number === stage.number);
                                const isCompleted = !!report;

                                return (
                                    <div key={stage.number} className="relative pl-6 sm:pl-8">
                                        <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 ${isCompleted ? 'bg-indigo-600 border-indigo-600 shadow-[0_0_0_4px_rgba(79,70,229,0.2)]' : 'bg-white border-gray-300'}`} />

                                        <div className="mb-1 flex items-center gap-2">
                                            <h4 className={`font-bold text-sm sm:text-base transition-colors ${isCompleted ? 'text-indigo-900' : 'text-gray-400'}`}>
                                                {stage.name}
                                            </h4>
                                            {isCompleted && (
                                                <span className="text-[10px] sm:text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3" /> 완료
                                                </span>
                                            )}
                                        </div>

                                        {!isCompleted && (
                                            <p className="text-xs sm:text-sm text-gray-400">
                                                진행 대기 중입니다.
                                            </p>
                                        )}

                                        {isCompleted && report && (
                                            <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl p-3 sm:p-4 animate-fadeIn">
                                                <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                                                    <Clock className="w-3.5 h-3.5" />
                                                    {new Date(report.created_at).toLocaleString('ko-KR', {
                                                        month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                    })}
                                                    <span className="mx-1">•</span>
                                                    <span className="font-medium text-gray-500">{report.author_name} 작성</span>
                                                </div>

                                                {report.content && report.content !== '확인 완료' && (
                                                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mb-3">
                                                        {report.content}
                                                    </p>
                                                )}

                                                {report.image_url && (
                                                    <div
                                                        onClick={() => setSelectedImage(report.image_url)}
                                                        className="group relative w-full sm:w-64 aspect-video rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:shadow-md transition-all"
                                                    >
                                                        <img
                                                            src={report.image_url}
                                                            alt={`${stage.name} 사진`}
                                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                        />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                                            <div className="bg-white/90 backdrop-blur-sm text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 shadow-sm transform translate-y-2 group-hover:translate-y-0">
                                                                <ImageIcon className="w-3.5 h-3.5" /> 크게 보기
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
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
