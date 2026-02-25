import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Clock, ImageIcon, Camera } from 'lucide-react';

const FUNERAL_STAGES = [
    { number: 1, name: '1. 임종/이송', description: '고인 임종 확인 및 장례식장 이송' },
    { number: 2, name: '2. 안치/빈소차림', description: '장례식장 안치 및 빈소 제단 세팅' },
    { number: 3, name: '3. 입관', description: '염습 및 입관식 진행 (하늘꽃 등)' },
    { number: 4, name: '4. 성복제/상식', description: '상복 착용, 제례 진행 (1일차/2일차)' },
    { number: 5, name: '5. 발인/영결식', description: '장례식장을 떠나 장지로 출발' },
    { number: 6, name: '6. 장지 안착/종료', description: '화장장/장지 도착 및 장례 절차 최종 마무리' }
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
                {FUNERAL_STAGES.map((stage) => {
                    const report = reports.find(r => r.stage_number === stage.number);
                    const isCompleted = !!report;
                    const isCurrent = stage.number === maxStageReached + 1;
                    const isFuture = stage.number > maxStageReached + 1;

                    return (
                        <div key={stage.number} className="relative pl-6 sm:pl-8">
                            {/* Timeline Node */}
                            <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 ${isCompleted ? 'bg-indigo-600 border-indigo-600 shadow-[0_0_0_4px_rgba(79,70,229,0.2)]' :
                                    isCurrent ? 'bg-white border-indigo-500 animate-pulse shadow-[0_0_0_4px_rgba(79,70,229,0.1)]' :
                                        'bg-white border-gray-300'
                                }`} />

                            <div className="mb-1 flex items-center gap-2">
                                <h4 className={`font-bold text-base sm:text-lg transition-colors ${isCompleted ? 'text-indigo-900' :
                                        isCurrent ? 'text-gray-900' :
                                            'text-gray-400'
                                    }`}>
                                    {stage.name}
                                </h4>
                                {isCompleted && (
                                    <span className="text-[10px] sm:text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" /> 완료
                                    </span>
                                )}
                            </div>

                            {!isCompleted && (
                                <p className={`text-xs sm:text-sm ${isCurrent ? 'text-gray-600 font-medium' : 'text-gray-400'}`}>
                                    {isCurrent ? '현재 진행 예정인 단계입니다.' : '진행 대기 중입니다.'}
                                </p>
                            )}

                            {/* Report Content */}
                            {isCompleted && report && (
                                <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl p-3 sm:p-4 animate-fadeIn">
                                    <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5" />
                                        {new Date(report.created_at).toLocaleString('ko-KR', {
                                            month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                        })}
                                        <span className="mx-1">•</span>
                                        <span className="font-medium text-gray-500">{report.author_name} 팀장 작성</span>
                                    </div>

                                    {report.content && (
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
