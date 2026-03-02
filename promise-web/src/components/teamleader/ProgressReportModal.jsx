import React, { useState, useEffect } from 'react';
import { Camera, Save, XCircle, Loader2, CheckCircle, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import imageCompression from 'browser-image-compression';

const GROUPS = ['상담', '1일차', '2일차', '3일차'];
const FUNERAL_STAGES = [
    { number: 1, group: '상담', name: '콜문자', requiresImage: false },
    { number: 2, group: '상담', name: '상품표/팀장프로필 발송문자', requiresImage: false },
    { number: 3, group: '상담', name: '사망진단서/화장예약확인', requiresImage: true },
    { number: 5, group: '상담', name: '상담결과보고', requiresImage: false },

    { number: 4, group: '1일차', name: '1일차 입실 사진', requiresImage: true },
    { number: 6, group: '1일차', name: '현황판/근조기', requiresImage: true },
    { number: 7, group: '1일차', name: '제단/헌화꽃', requiresImage: true },
    { number: 8, group: '1일차', name: '편의용품/일회용품', requiresImage: true },
    { number: 9, group: '1일차', name: '빈소셋팅/도우미유니폼', requiresImage: true },
    { number: 10, group: '1일차', name: '부고스크린샷/부고링크', requiresImage: true },
    { number: 26, group: '1일차', name: '1일차 부고 사진', requiresImage: true },
    { number: 11, group: '1일차', name: '장례일정표/향로꽃장식', requiresImage: true },
    { number: 12, group: '1일차', name: '1일차 퇴실사진', requiresImage: true },

    { number: 13, group: '2일차', name: '2일차 입실사진', requiresImage: true },
    { number: 14, group: '2일차', name: '관셋팅/명정(소렴/대렴 표시)', requiresImage: true },
    { number: 15, group: '2일차', name: '관꽃장식', requiresImage: true },
    { number: 16, group: '2일차', name: '봉안함 발주서', requiresImage: true },
    { number: 17, group: '2일차', name: '장의행사확인서', requiresImage: true },
    { number: 18, group: '2일차', name: '2일차 퇴실사진', requiresImage: true },

    { number: 19, group: '3일차', name: '3일차 입실사진', requiresImage: true },
    { number: 20, group: '3일차', name: '장의차량 도착사진(리무진/버스)', requiresImage: true },
    { number: 21, group: '3일차', name: '화장장 사진(봉안함)', requiresImage: true },
    { number: 22, group: '3일차', name: '장지 안치 사진', requiresImage: true },
    { number: 23, group: '3일차', name: '의전보고서/이용후기 사진', requiresImage: true },
    { number: 24, group: '3일차', name: '의전종료보고', requiresImage: false },
    { number: 25, group: '3일차', name: '3일차 퇴실사진', requiresImage: true }
];

export default function ProgressReportModal({ isOpen, onClose, caseItem, user }) {
    const { showToast } = useNotification();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    // Form state for current selected stage
    const [activeStage, setActiveStage] = useState(1);
    const [content, setContent] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);

    useEffect(() => {
        if (isOpen && caseItem) {
            fetchReports();
        }
    }, [isOpen, caseItem]);

    const fetchReports = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('funeral_progress_reports')
                .select('*')
                .eq('case_id', caseItem.id)
                .order('stage_number', { ascending: true });

            if (error) throw error;
            setReports(data || []);

            // Auto-select the next uncompleted stage
            const completedStages = (data || []).map(r => r.stage_number);
            const nextStage = FUNERAL_STAGES.find(s => !completedStages.includes(s.number))?.number || FUNERAL_STAGES[FUNERAL_STAGES.length - 1].number;
            handleStageSelect(nextStage, data || []);

        } catch (error) {
            console.error('Error fetching reports:', error);
            showToast('error', '로딩 실패', '보고서 목록을 불러올 수 없습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleStageSelect = (stageNum, currentReports = reports) => {
        setActiveStage(stageNum);
        setImageFile(null);
        setPreviewUrl(null);

        // Find existing report for this stage to pre-fill
        const existingReport = currentReports.find(r => r.stage_number === stageNum);
        if (existingReport) {
            setContent(existingReport.content || '');
            if (existingReport.image_url) {
                setPreviewUrl(existingReport.image_url);
            }
        } else {
            setContent('');
        }
    };

    const handleImageChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            // Create a quick local preview
            const objectUrl = URL.createObjectURL(file);
            setPreviewUrl(objectUrl);

            showToast('info', '이미지 압축 중...', '사진 최적화를 진행합니다.');
            const options = {
                maxSizeMB: 1,
                maxWidthOrHeight: 1200,
                useWebWorker: true,
                fileType: 'image/webp'
            };
            const compressedFile = await imageCompression(file, options);
            setImageFile(compressedFile);
            showToast('success', '이미지 준비 완료', '보고서를 저장해 주세요.');
        } catch (error) {
            console.error(error);
            showToast('error', '이미지 처리 실패', '사진 처리에 실패했습니다.');
            setPreviewUrl(null);
            setImageFile(null);
        }
    };

    const handleSaveReport = async () => {
        try {
            setUploading(true);
            const stageInfo = FUNERAL_STAGES.find(s => s.number === activeStage);
            
            let finalContent = content;
            if (!finalContent && !imageFile && !previewUrl) {
                if (stageInfo.requiresImage) {
                    showToast('error', '입력 오류', '해당 항목은 사진 첨부가 필수입니다.');
                    setUploading(false);
                    return;
                } else {
                    finalContent = '확인 완료';
                }
            } else if (stageInfo.requiresImage && !imageFile && !previewUrl) {
                showToast('error', '입력 오류', '해당 항목은 사진 첨부가 필수입니다.');
                setUploading(false);
                return;
            }

            let finalImageUrl = previewUrl; // Use existing URL if no new file is uploaded

            // 1. Upload new image if exists
            if (imageFile) {
                const fileExt = 'webp';
                const fileName = `${caseItem.id}-${activeStage}-${Date.now()}.${fileExt}`;
                const filePath = `reports/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('reports')
                    .upload(filePath, imageFile, { upsert: true });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('reports')
                    .getPublicUrl(filePath);

                finalImageUrl = `${publicUrl}?t=${Date.now()}`;
            }

            // 2. Upsert the report record
            // Check if report for this stage already exists
            const existingReport = reports.find(r => r.stage_number === activeStage);
            let dbError;

            if (existingReport) {
                const { error } = await supabase
                    .from('funeral_progress_reports')
                    .update({
                        content: finalContent,
                        image_url: finalImageUrl,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingReport.id);
                dbError = error;
            } else {
                const { error } = await supabase
                    .from('funeral_progress_reports')
                    .insert([{
                        case_id: caseItem.id,
                        author_id: user.id,
                        author_name: user.name,
                        author_grade: user.grade,
                        stage_number: activeStage,
                        stage_name: stageInfo.name,
                        content: finalContent,
                        image_url: finalImageUrl
                    }]);
                dbError = error;
            }

            if (dbError) throw dbError;

            showToast('success', '보고서 저장 완료', `${stageInfo.name} 단계 보고가 등록되었습니다.`);
            fetchReports(); // Refresh data

            // If there's a next stage, jump to it
            // if (activeStage < 6) setActiveStage(activeStage + 1);

        } catch (error) {
            console.error('Save error:', error);
            showToast('error', '저장 실패', '보고서 저장 중 문제가 발생했습니다.');
        } finally {
            setUploading(false);
            setImageFile(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-end sm:items-center z-[70] animate-fadeIn p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-transform" style={{ maxHeight: '95vh' }}>
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 sticky top-0 z-10">
                    <div>
                        <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-indigo-600" /> 25단계 진행 체크리스트
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            [{caseItem.profiles?.name || '고객'}님의 장례] 실시간 보고서 작성
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <XCircle className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-3 sm:p-5 overflow-y-auto bg-gray-50/50" style={{ maxHeight: 'calc(95vh - 80px)' }}>

                    <div className="space-y-6 pb-6 w-full max-w-full overflow-hidden">
                        {GROUPS.map(groupName => (
                            <div key={groupName} className="mb-2">
                                <h4 className="font-bold text-gray-800 mb-3 px-1 border-l-4 border-indigo-500 pl-2 ml-1">{groupName}</h4>
                                <div className="space-y-2.5">
                                    {FUNERAL_STAGES.filter(s => s.group === groupName).map(stage => {
                                        const isCompleted = reports.some(r => r.stage_number === stage.number);
                                        const isActive = activeStage === stage.number;
                                        return (
                                            <div key={stage.number} id={`stage-form-${stage.number}`} className={`border rounded-xl bg-white transition-all ${isActive ? 'border-indigo-400 shadow-md ring-1 ring-indigo-400' : 'border-gray-200'}`}>
                                                <button 
                                                    className="w-full px-4 py-3.5 flex items-center justify-between text-left"
                                                    onClick={() => {
                                                        if (isActive) {
                                                            setActiveStage(null);
                                                        } else {
                                                            handleStageSelect(stage.number);
                                                            setTimeout(() => {
                                                                document.getElementById(`stage-form-${stage.number}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                            }, 50);
                                                        }
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        {isCompleted ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" /> : <div className="w-5 h-5 rounded-full border-2 border-gray-300 bg-gray-50 flex-shrink-0"></div>}
                                                        <span className={`font-medium ${isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'} text-sm sm:text-base`}>{stage.name}</span>
                                                    </div>
                                                    {!isCompleted && stage.requiresImage && (
                                                        <span className="text-[10px] sm:text-xs font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full whitespace-nowrap ml-2">사진 필수</span>
                                                    )}
                                                </button>
                                                
                                                {isActive && (
                                                    <div className="p-4 bg-indigo-50/30 border-t border-indigo-100">
                                                        {stage.requiresImage && (
                                                            <div className="mb-4">
                                                                <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
                                                                    <ImageIcon className="w-4 h-4 text-indigo-500" /> 현장 사진 첨부
                                                                </label>
                                                                <div className="relative group rounded-xl overflow-hidden border-2 border-dashed border-indigo-300 bg-white hover:border-indigo-500 transition-colors">
                                                                    {previewUrl ? (
                                                                        <div className="relative aspect-video w-full bg-black">
                                                                            <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                                <span className="bg-white/90 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm backdrop-blur-sm">사진 변경하기</span>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="py-8 flex flex-col items-center justify-center text-gray-400">
                                                                            <Camera className="w-7 h-7 mb-2 text-indigo-300" />
                                                                            <span className="text-sm font-bold text-indigo-900">사진 추가</span>
                                                                        </div>
                                                                    )}
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        capture="environment"
                                                                        onChange={handleImageChange}
                                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="mb-4">
                                                            <label className="block text-sm font-bold text-gray-700 mb-2">특이사항 (선택)</label>
                                                            <textarea
                                                                value={content}
                                                                onChange={(e) => setContent(e.target.value)}
                                                                rows={2}
                                                                placeholder="진행 상황, 구체적 수량, 가족 요청사항 등 기록"
                                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                                                            />
                                                        </div>

                                                        <button
                                                            onClick={handleSaveReport}
                                                            disabled={uploading}
                                                            className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-md"
                                                        >
                                                            {uploading ? (
                                                                <><Loader2 className="w-5 h-5 animate-spin" /> 업로드 중...</>
                                                            ) : (
                                                                <><Save className="w-5 h-5" /> 완료 및 저장</>
                                                            )}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            </div>
        </div>
    );
}
