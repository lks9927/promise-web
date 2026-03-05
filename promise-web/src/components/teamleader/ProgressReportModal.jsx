import React, { useState, useEffect, useRef } from 'react';
import { Camera, Save, XCircle, Loader2, CheckCircle, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
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

// image_url 컬럼에서 URL 배열로 파싱 (하위 호환)
function parseImageUrls(imageUrl) {
    if (!imageUrl) return [];
    try {
        const parsed = JSON.parse(imageUrl);
        if (Array.isArray(parsed)) return parsed;
        return [parsed]; // 단일 URL 문자열이 JSON으로 저장된 경우
    } catch {
        return [imageUrl]; // 기존 단일 URL 문자열 (레거시)
    }
}

export default function ProgressReportModal({ isOpen, onClose, caseItem, user }) {
    const { showToast } = useNotification();
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    const [activeStage, setActiveStage] = useState(1);
    const [content, setContent] = useState('');

    // 다중 사진: { file: File|null, previewUrl: string }[]
    const [images, setImages] = useState([]);

    const fileInputRef = useRef(null);

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

        const existingReport = currentReports.find(r => r.stage_number === stageNum);
        if (existingReport) {
            setContent(existingReport.content || '');
            const urls = parseImageUrls(existingReport.image_url);
            setImages(urls.map(url => ({ file: null, previewUrl: url })));
        } else {
            setContent('');
            setImages([]);
        }
    };

    // 사진 추가 버튼 클릭 → 숨겨진 file input 트리거
    const handleAddImageClick = () => {
        fileInputRef.current?.click();
    };

    const handleImageChange = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        // 최대 10장 제한
        const remaining = 10 - images.length;
        if (remaining <= 0) {
            showToast('error', '최대 10장', '사진은 최대 10장까지 첨부할 수 있습니다.');
            return;
        }
        const filesToProcess = files.slice(0, remaining);

        showToast('info', '이미지 압축 중...', `${filesToProcess.length}장 최적화를 진행합니다.`);

        const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1200,
            useWebWorker: true,
            fileType: 'image/webp'
        };

        try {
            const processed = await Promise.all(
                filesToProcess.map(async (file) => {
                    const previewUrl = URL.createObjectURL(file);
                    const compressedFile = await imageCompression(file, options);
                    return { file: compressedFile, previewUrl };
                })
            );
            setImages(prev => [...prev, ...processed]);
            showToast('success', '이미지 준비 완료', `${processed.length}장이 추가됐습니다.`);
        } catch (error) {
            console.error(error);
            showToast('error', '이미지 처리 실패', '사진 처리 중 오류가 발생했습니다.');
        }

        // input 초기화 (같은 파일 재선택 가능하게)
        e.target.value = '';
    };

    const handleRemoveImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleSaveReport = async () => {
        try {
            setUploading(true);
            const stageInfo = FUNERAL_STAGES.find(s => s.number === activeStage);

            const hasImages = images.length > 0;

            if (!content && !hasImages) {
                if (stageInfo.requiresImage) {
                    showToast('error', '입력 오류', '해당 항목은 사진 첨부가 필수입니다.');
                    setUploading(false);
                    return;
                }
            } else if (stageInfo.requiresImage && !hasImages) {
                showToast('error', '입력 오류', '해당 항목은 사진 첨부가 필수입니다.');
                setUploading(false);
                return;
            }

            const finalContent = content || (hasImages ? '' : '확인 완료');

            // 새로 추가된 파일만 업로드, 기존 URL은 그대로 유지
            const finalUrls = await Promise.all(
                images.map(async (img) => {
                    if (!img.file) return img.previewUrl; // 기존 저장된 URL
                    const fileName = `${caseItem.id}-${activeStage}-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
                    const filePath = `reports/${fileName}`;

                    const { error: uploadError } = await supabase.storage
                        .from('reports')
                        .upload(filePath, img.file, { upsert: true });

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = supabase.storage
                        .from('reports')
                        .getPublicUrl(filePath);

                    return `${publicUrl}?t=${Date.now()}`;
                })
            );

            // 배열을 JSON 문자열로 저장
            const imageUrlJson = finalUrls.length > 0 ? JSON.stringify(finalUrls) : null;

            const existingReport = reports.find(r => r.stage_number === activeStage);
            let dbError;

            if (existingReport) {
                const { error } = await supabase
                    .from('funeral_progress_reports')
                    .update({
                        content: finalContent,
                        image_url: imageUrlJson,
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
                        image_url: imageUrlJson
                    }]);
                dbError = error;
            }

            if (dbError) throw dbError;

            showToast('success', '보고서 저장 완료', `${stageInfo.name} 단계 보고가 등록되었습니다.`);
            fetchReports();

        } catch (error) {
            console.error('Save error:', error);
            showToast('error', '저장 실패', '보고서 저장 중 문제가 발생했습니다.');
        } finally {
            setUploading(false);
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
                    {/* 숨겨진 파일 input (다중 선택 허용) */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        capture="environment"
                        onChange={handleImageChange}
                        className="hidden"
                    />

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
                                                                    <ImageIcon className="w-4 h-4 text-indigo-500" />
                                                                    현장 사진 첨부
                                                                    <span className="ml-auto text-xs font-normal text-gray-400">{images.length}/10장</span>
                                                                </label>

                                                                {/* 사진 그리드 */}
                                                                <div className="grid grid-cols-3 gap-2 mb-2">
                                                                    {images.map((img, idx) => (
                                                                        <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-black group">
                                                                            <img
                                                                                src={img.previewUrl}
                                                                                alt={`사진 ${idx + 1}`}
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                            {/* 삭제 버튼 */}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleRemoveImage(idx)}
                                                                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                                                            >
                                                                                <Trash2 className="w-3 h-3" />
                                                                            </button>
                                                                            <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1 rounded">
                                                                                {idx + 1}
                                                                            </div>
                                                                        </div>
                                                                    ))}

                                                                    {/* 사진 추가 버튼 */}
                                                                    {images.length < 10 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleAddImageClick}
                                                                            className="aspect-square rounded-lg border-2 border-dashed border-indigo-300 bg-white hover:border-indigo-500 hover:bg-indigo-50 flex flex-col items-center justify-center gap-1 transition-colors text-indigo-400 hover:text-indigo-600"
                                                                        >
                                                                            <Plus className="w-6 h-6" />
                                                                            <span className="text-[10px] font-bold">사진 추가</span>
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {images.length === 0 && (
                                                                    <p className="text-xs text-gray-400 text-center mt-1">📷 사진 추가 버튼을 눌러 여러 장 첨부하세요</p>
                                                                )}
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
