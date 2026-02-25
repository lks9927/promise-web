import React, { useState, useEffect } from 'react';
import { Camera, Save, XCircle, Loader2, CheckCircle, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import imageCompression from 'browser-image-compression';

const FUNERAL_STAGES = [
    { number: 1, name: '1. 임종/이송', description: '고인 임종 확인 및 장례식장 이송' },
    { number: 2, name: '2. 안치/빈소차림', description: '장례식장 안치 및 빈소 제단 세팅' },
    { number: 3, name: '3. 입관', description: '염습 및 입관식 진행 (하늘꽃 등)' },
    { number: 4, name: '4. 성복제/상식', description: '상복 착용, 제례 진행 (1일차/2일차)' },
    { number: 5, name: '5. 발인/영결식', description: '장례식장을 떠나 장지로 출발' },
    { number: 6, name: '6. 장지 안착/종료', description: '화장장/장지 도착 및 장례 절차 최종 마무리' }
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
            const nextStage = FUNERAL_STAGES.find(s => !completedStages.includes(s.number))?.number || 6;
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
        if (!content && !imageFile && !previewUrl) {
            showToast('error', '입력 오류', '보고 내용이나 사진을 등록해주세요.');
            return;
        }

        try {
            setUploading(true);
            const stageInfo = FUNERAL_STAGES.find(s => s.number === activeStage);

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
                        content,
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
                        content,
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-end sm:items-center z-50 animate-fadeIn p-0 sm:p-4">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-transform" style={{ maxHeight: '95vh' }}>
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 sticky top-0 z-10">
                    <div>
                        <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                            <CheckCircle className="w-5 h-5 text-indigo-600" /> 6단계 진행 보고
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            [{caseItem.profiles?.name || '고객'}님의 장례] 실시간 보고서 작성
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <XCircle className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(95vh - 80px)' }}>

                    {/* Stage Navigator */}
                    <div className="mb-6 flex overflow-x-auto gap-2 pb-2 snap-x">
                        {FUNERAL_STAGES.map(stage => {
                            const isCompleted = reports.some(r => r.stage_number === stage.number);
                            const isActive = activeStage === stage.number;
                            return (
                                <button
                                    key={stage.number}
                                    onClick={() => handleStageSelect(stage.number)}
                                    className={`snap-start flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${isActive
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                                            : isCompleted
                                                ? 'bg-green-50 text-green-700 border-green-200'
                                                : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                                        }`}
                                >
                                    <div className="flex items-center gap-1.5">
                                        {isCompleted && !isActive && <CheckCircle className="w-4 h-4" />}
                                        {stage.name}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Active Stage Form */}
                    <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 mb-6">
                        <div className="mb-4">
                            <h4 className="font-bold text-lg text-indigo-900 mb-1">
                                {FUNERAL_STAGES.find(s => s.number === activeStage)?.name}
                            </h4>
                            <p className="text-xs text-gray-500">
                                {FUNERAL_STAGES.find(s => s.number === activeStage)?.description}
                            </p>
                        </div>

                        {/* Image Upload Area */}
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
                                <ImageIcon className="w-4 h-4" /> 현장 사진 첨부
                            </label>

                            <div className="relative group rounded-xl overflow-hidden border-2 border-dashed border-gray-300 bg-white hover:border-indigo-400 transition-colors">
                                {previewUrl ? (
                                    <div className="relative aspect-video w-full bg-black">
                                        <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <span className="bg-white/90 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm backdrop-blur-sm">
                                                사진 변경하기
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-10 flex flex-col items-center justify-center text-gray-400">
                                        <Camera className="w-8 h-8 mb-2 text-gray-300" />
                                        <span className="text-sm font-bold">사진 추가하기</span>
                                        <span className="text-xs mt-1 text-gray-400">터치하여 촬영하거나 앨범에서 선택</span>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment" // Hint for mobile devices to open camera
                                    onChange={handleImageChange}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Text Content Area */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">보고 내용</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={4}
                                placeholder="진행 상황, 특이사항, 가족 요청사항 등을 상세히 기록해주세요."
                                className="w-full px-4 py-3 bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm resize-none transition-shadow hover:shadow-sm"
                            />
                        </div>

                        <button
                            onClick={handleSaveReport}
                            disabled={uploading}
                            className="w-full mt-5 bg-indigo-600 text-white font-bold py-3.5 rounded-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.98]"
                        >
                            {uploading ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> 업로드 중...</>
                            ) : (
                                <><Save className="w-5 h-5" /> 보고서 저장</>
                            )}
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}
