import React, { useState, useEffect, useRef } from 'react';
import { Camera, Save, XCircle, Loader2, CheckCircle, Image as ImageIcon, Plus, Trash2, Ban, Eye } from 'lucide-react';
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
  { number: 9, group: '1일차', name: '빈소 세팅/도우미 유니폼', requiresImage: true },
    { number: 10, group: '1일차', name: '부고스크린샷/부고링크', requiresImage: true },
    { number: 26, group: '1일차', name: '1일차 부고 사진', requiresImage: true },
    { number: 11, group: '1일차', name: '장례일정표/향로꽃장식', requiresImage: true },
  { number: 12, group: '1일차', name: '1일차 퇴실 사진', requiresImage: true },

  { number: 13, group: '2일차', name: '2일차 입실 사진', requiresImage: true },
  { number: 14, group: '2일차', name: '관 세팅/명정(소렴/대렴 표시)', requiresImage: true },
    { number: 15, group: '2일차', name: '관꽃장식', requiresImage: true },
    { number: 16, group: '2일차', name: '봉안함 발주서', requiresImage: true },
    { number: 17, group: '2일차', name: '장의행사확인서', requiresImage: true },
  { number: 18, group: '2일차', name: '2일차 퇴실 사진', requiresImage: true },

  { number: 19, group: '3일차', name: '3일차 입실 사진', requiresImage: true },
    { number: 20, group: '3일차', name: '장의차량 도착사진(리무진/버스)', requiresImage: true },
    { number: 21, group: '3일차', name: '화장장 사진(봉안함)', requiresImage: true },
    { number: 22, group: '3일차', name: '장지 안치 사진', requiresImage: true },
    { number: 23, group: '3일차', name: '의전보고서/이용후기 사진', requiresImage: true },
    { number: 24, group: '3일차', name: '의전종료보고', requiresImage: false },
  { number: 25, group: '3일차', name: '3일차 퇴실 사진', requiresImage: true }
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

    const teamLeaderId = caseItem?.team_leader_id || caseItem?.team_leader?.id;
    const isMyCase = !teamLeaderId || user?.id === teamLeaderId;

    // 다중 사진: { file: File|null, previewUrl: string }[]
    const [images, setImages] = useState([]);

    const fileInputRef = useRef(null);

    // 추가 매출 관련 state
    const [additionalItems, setAdditionalItems] = useState([]);
    const [newItemName, setNewItemName] = useState('');
    const [newItemDesc, setNewItemDesc] = useState('');
    const [newItemQty, setNewItemQty] = useState(1);
    const [newItemPrice, setNewItemPrice] = useState('');
    const [newItemPhotos, setNewItemPhotos] = useState([]);
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [loadingItems, setLoadingItems] = useState(false);
    const [feeRate, setFeeRate] = useState(null);
    const [signedUrls, setSignedUrls] = useState({});
    const [cancellingItemId, setCancellingItemId] = useState(null);
    const [cancelReasonInput, setCancelReasonInput] = useState('');
    const photoInputRef = useRef(null);

    useEffect(() => {
        if (isOpen && caseItem) {
            fetchReports();
            fetchAdditionalItems();
            fetchPolicyFeeRate();
            setIsAddingItem(false);
            setNewItemName('');
            setNewItemDesc('');
            setNewItemPrice('');
            setNewItemPhotos([]);
        }
    }, [isOpen, caseItem]);

    const fetchPolicyFeeRate = async () => {
        try {
            const pkg = caseItem?.package_name;
            const polId = pkg === '고급형' ? 2 : (pkg === '무빈소' ? 3 : 1);
            const { data } = await supabase
                .from('commission_policies')
                .select('extra_sales_fee_rate')
                .eq('id', polId)
                .single();
            if (data?.extra_sales_fee_rate != null) {
                setFeeRate(Number(data.extra_sales_fee_rate));
            }
        } catch (e) {
            console.warn('Fee rate load fallback:', e);
        }
    };

    const fetchAdditionalItems = async () => {
        try {
            setLoadingItems(true);
            const { data, error } = await supabase
                .from('additional_income_items')
                .select('*')
                .eq('case_id', caseItem.id)
                .order('created_at', { ascending: true });
            
            if (error) {
                console.warn('Error fetching additional items:', error);
                setAdditionalItems([]);
                return;
            }
            const items = data || [];
            setAdditionalItems(items);

            // 비공개 버킷 사진 서명 URL 생성
            const pathsToSign = [];
            items.forEach(item => {
                const photos = Array.isArray(item.photo_urls) ? item.photo_urls : [];
                photos.forEach(p => {
                    if (p && !p.startsWith('http') && !signedUrls[p]) pathsToSign.push(p);
                });
            });
            if (pathsToSign.length > 0) {
                const uniquePaths = Array.from(new Set(pathsToSign));
                Promise.all(uniquePaths.map(async path => {
                    const { data: signData } = await supabase.storage
                        .from('case-extra-photos')
                        .createSignedUrl(path, 3600);
                    return { path, url: signData?.signedUrl };
                })).then(resList => {
                    const urlMap = {};
                    resList.forEach(r => { if (r.url) urlMap[r.path] = r.url; });
                    setSignedUrls(prev => ({ ...prev, ...urlMap }));
                }).catch(() => {});
            }
        } catch (error) {
            console.error('Error fetching additional items:', error);
            setAdditionalItems([]);
        } finally {
            setLoadingItems(false);
        }
    };

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

    const handlePhotoChange = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        const remaining = 10 - newItemPhotos.length;
        if (remaining <= 0) {
            showToast('error', '최대 10장', '사진은 최대 10장까지 첨부할 수 있습니다.');
            return;
        }
        const filesToProcess = files.slice(0, remaining);
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
            setNewItemPhotos(prev => [...prev, ...processed]);
        } catch (err) {
            console.error(err);
            showToast('error', '사진 처리 실패', '사진 처리 중 오류가 발생했습니다.');
        }
        e.target.value = '';
    };

    const handleRemoveNewPhoto = (idx) => {
        setNewItemPhotos(prev => prev.filter((_, i) => i !== idx));
    };

    const handleAddAdditionalItem = async () => {
        if (!newItemName.trim() || !newItemPrice || parseInt(newItemQty) <= 0 || parseInt(newItemPrice) < 0) {
            showToast('error', '입력 오류', '품목명, 수량(1 이상), 단가(0 이상)를 정확히 입력해주세요.');
            return;
        }

        try {
            setLoadingItems(true);

            let photoPaths = [];
            if (newItemPhotos.length > 0) {
                photoPaths = await Promise.all(
                    newItemPhotos.map(async (img) => {
                        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
                        const filePath = `${caseItem.id}/${fileName}`;
                        const { error: uploadErr } = await supabase.storage
                            .from('case-extra-photos')
                            .upload(filePath, img.file, { upsert: true });
                        if (uploadErr) {
                            throw uploadErr;
                        }
                        return filePath;
                    })
                );
                photoPaths = photoPaths.filter(Boolean);
            }

            const payload = {
                case_id: caseItem.id,
                item_name: newItemName.trim(),
                description: newItemDesc.trim() || null,
                quantity: parseInt(newItemQty) || 1,
                unit_price: parseInt(newItemPrice) || 0,
                photo_urls: photoPaths,
                created_by: user.id
            };

            let { error } = await supabase
                .from('additional_income_items')
                .insert([payload]);

            // DB 미반영 시(구버전 테이블) 안전 폴백
            if (error && /description|photo_urls|is_cancelled/i.test(error.message || '')) {
                const { description, photo_urls, ...legacyPayload } = payload;
                const res = await supabase.from('additional_income_items').insert([legacyPayload]);
                error = res.error;
            }

            if (error) throw error;

            showToast('success', '등록 완료', '추가 매출 항목이 등록되었습니다.');
            setNewItemName('');
            setNewItemDesc('');
            setNewItemQty(1);
            setNewItemPrice('');
            setNewItemPhotos([]);
            setIsAddingItem(false);
            fetchAdditionalItems();
        } catch (error) {
            console.error('Error adding item:', error);
            showToast('error', '저장 실패', error.message || '추가 매출 등록 중 오류가 발생했습니다.');
        } finally {
            setLoadingItems(false);
        }
    };

    const handleStartCancel = (itemId) => {
        setCancellingItemId(itemId);
        setCancelReasonInput('');
    };

    const handleConfirmCancelAdditionalItem = async (itemId) => {
        const trimmedReason = cancelReasonInput.trim();
        if (!trimmedReason) {
            showToast('error', '취소 사유 필수', '취소 사유를 입력해 주세요.');
            return;
        }

        try {
            setLoadingItems(true);
            const { error } = await supabase
                .from('additional_income_items')
                .update({ 
                    is_cancelled: true,
                    cancel_reason: trimmedReason
                })
                .eq('id', itemId);

            if (error) throw error;
            showToast('success', '취소 완료', '추가 매출 항목이 취소되었습니다.');
            setCancellingItemId(null);
            setCancelReasonInput('');
            fetchAdditionalItems();
        } catch (error) {
            console.error('Error cancelling item:', error);
            showToast('error', '취소 실패', error.message || '항목 취소 처리 중 오류가 발생했습니다.');
        } finally {
            setLoadingItems(false);
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
              <CheckCircle className="w-5 h-5 text-indigo-600" /> 26단계 진행 체크리스트
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
                                                                            {isMyCase && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleRemoveImage(idx)}
                                                                                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                                                                >
                                                                                    <Trash2 className="w-3 h-3" />
                                                                                </button>
                                                                            )}
                                                                            <div className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1 rounded">
                                                                                {idx + 1}
                                                                            </div>
                                                                        </div>
                                                                    ))}

                                                                    {/* 사진 추가 버튼 */}
                                                                    {images.length < 10 && isMyCase && (
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
                                                                    <p className="text-xs text-gray-400 text-center mt-1">
                                                                        {isMyCase ? '📷 사진 추가 버튼을 눌러 여러 장 첨부하세요' : '📷 등록된 사진이 없습니다.'}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div className="mb-4">
                                                            <label className="block text-sm font-bold text-gray-700 mb-2">특이사항 (선택)</label>
                                                            <textarea
                                                                value={content}
                                                                onChange={(e) => setContent(e.target.value)}
                                                                readOnly={!isMyCase}
                                                                rows={2}
                                                                placeholder={isMyCase ? "진행 상황, 구체적 수량, 가족 요청사항 등 기록" : "등록된 특이사항이 없습니다."}
                                                                className={`w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm resize-none ${!isMyCase ? 'bg-gray-50 focus:ring-0 cursor-default text-gray-600' : 'focus:ring-2 focus:ring-indigo-500'}`}
                                                            />
                                                            </div>

                                                            {isMyCase && (
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
                                                            )}
                                                        </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 추가 매출 항목 (in_progress 진행 중 및 team_settling 정산 대기 중 등록·취소 허용, hq_check 이후 읽기 전용) */}
                    {(() => {
                        const canEditExtraSales = ['in_progress', 'team_settling'].includes(caseItem?.status) && isMyCase;
                        const activeItems = additionalItems.filter(i => !i.is_cancelled);
                        const totalActive = activeItems.reduce((acc, curr) => acc + (curr.total_price || curr.unit_price * curr.quantity || 0), 0);
                        const expectedFee = feeRate != null ? Math.round(totalActive * feeRate / 100) : null;
                        const leaderShare = expectedFee != null ? totalActive - expectedFee : null;

                        return (
                            <div className="mt-2 mb-6 border border-emerald-200 rounded-xl bg-emerald-50/40 overflow-hidden shadow-sm">
                                <div className="bg-emerald-100/60 p-3 border-b border-emerald-200 flex flex-wrap gap-2 justify-between items-center">
                                    <h4 className="font-bold text-emerald-900 flex items-center gap-2 text-sm">
                                        📦 추가 매출 (영정사진, 제단꽃, 수의 변경 등)
                                    </h4>
                                    {!canEditExtraSales ? (
                                        <span className="text-[11px] font-bold text-gray-500 bg-white/80 px-2 py-0.5 rounded-full border border-gray-200">
                                            {['hq_check', 'completed', 'cancelled'].includes(caseItem?.status)
                                                ? '🔒 본사 입금 확인 완료 (수정 불가)'
                                                : '🔒 수정 불가'}
                                        </span>
                                    ) : (
                                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                                            {caseItem?.status === 'team_settling'
                                                ? '🟢 정산 대기 (등록·취소 가능)'
                                                : '🔵 진행 중 (등록·취소 가능)'}
                                        </span>
                                    )}
                                </div>
                                
                                <div className="p-3">
                                    {/* 안내 문구 */}
                                    <div className="mb-3 p-2.5 bg-emerald-50/80 rounded-lg border border-emerald-100 space-y-1 text-xs text-emerald-900">
                                        <p className="font-semibold flex items-center gap-1.5">
                                            <span>💡</span> 수정하려면 취소 후 다시 등록하세요. 취소와 등록 기록은 본사에서 확인합니다.
                                        </p>
                                        {caseItem?.status === 'team_settling' && (
                                            <p className="text-[11px] text-emerald-700">
                                                * 장례 종료 후에도 본사 입금 확인 전까지 추가 매출을 등록·취소할 수 있으며, 변경 시 본사 정산 입금액이 자동으로 재계산됩니다.
                                            </p>
                                        )}
                                    </div>
                                    {additionalItems.length > 0 ? (
                                        <div className="space-y-2 mb-3">
                                            <div className="grid grid-cols-12 gap-1 text-[10px] font-bold text-emerald-800 uppercase px-1">
                                                <div className="col-span-5">품목명 / 설명</div>
                                                <div className="col-span-1 text-center">수량</div>
                                                <div className="col-span-4 text-right">단가 / 소계</div>
                                                <div className="col-span-2 text-center">상태 / 관리</div>
                                            </div>
                                            
                                            {additionalItems.map(item => {
                                                const photos = Array.isArray(item.photo_urls) ? item.photo_urls : (item.receipt_url ? [item.receipt_url] : []);
                                                const subtotal = item.total_price || item.unit_price * item.quantity || 0;

                                                return (
                                                    <React.Fragment key={item.id}>
                                                        <div className={`grid grid-cols-12 gap-1 items-center bg-white p-2.5 rounded-lg border text-xs sm:text-sm transition-all ${item.is_cancelled ? 'border-gray-200 bg-gray-50/80 opacity-60' : 'border-emerald-100'}`}>
                                                        <div className="col-span-5 flex flex-col justify-center">
                                                            <div className={`font-bold text-gray-900 truncate ${item.is_cancelled ? 'line-through text-gray-400' : ''}`} title={item.item_name}>
                                                                {item.item_name}
                                                            </div>
                                                            {item.description && (
                                                                <p className="text-[11px] text-gray-500 truncate" title={item.description}>
                                                                    {item.description}
                                                                </p>
                                                            )}
                                                            {photos.length > 0 && (
                                                                <div className="flex gap-1 mt-1 overflow-x-auto">
                                                                    {photos.map((p, pIdx) => {
                                                                        const imgUrl = signedUrls[p] || p;
                                                                        return (
                                                                            <a key={pIdx} href={imgUrl} target="_blank" rel="noopener noreferrer" className="block w-6 h-6 rounded border border-gray-200 overflow-hidden flex-shrink-0 hover:opacity-80">
                                                                                <img src={imgUrl} alt={`사진 ${pIdx + 1}`} className="w-full h-full object-cover" />
                                                                            </a>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className={`col-span-1 text-center font-medium ${item.is_cancelled ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                                            {item.quantity}
                                                        </div>

                                                        <div className="col-span-4 text-right flex flex-col justify-center">
                                                            <span className="text-[10px] text-gray-400">@ ₩{item.unit_price?.toLocaleString()}</span>
                                                            <span className={`font-bold ${item.is_cancelled ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                                                ₩{subtotal.toLocaleString()}
                                                            </span>
                                                        </div>

                                                        <div className="col-span-2 flex justify-center items-center">
                                                            {item.is_cancelled ? (
                                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500" title={item.cancel_reason ? `취소 사유: ${item.cancel_reason}` : '취소됨'}>
                                                                    취소됨
                                                                </span>
                                                            ) : (
                                                                canEditExtraSales && (
                                                                    <button 
                                                                        onClick={() => handleStartCancel(item.id)}
                                                                        className="text-red-500 hover:text-red-700 px-2 py-1 bg-red-50 hover:bg-red-100 rounded text-xs font-bold transition-colors flex items-center gap-1"
                                                                        title="항목 취소"
                                                                    >
                                                                        <Ban className="w-3 h-3" /> 취소
                                                                    </button>
                                                                )
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* 취소 사유 입력창 (취소 버튼 눌렀을 때 인라인 확장) */}
                                                    {cancellingItemId === item.id && (
                                                        <div className="bg-red-50/70 p-2.5 rounded-lg border border-red-200 text-xs space-y-2 animate-fadeIn mt-1">
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-bold text-red-800">
                                                                    '{item.item_name}' 취소 사유 입력 (필수)
                                                                </span>
                                                                <button 
                                                                    onClick={() => setCancellingItemId(null)}
                                                                    className="text-gray-400 hover:text-gray-600 text-xs"
                                                                >
                                                                    닫기
                                                                </button>
                                                            </div>
                                                            <input 
                                                                type="text"
                                                                value={cancelReasonInput}
                                                                onChange={e => setCancelReasonInput(e.target.value)}
                                                                placeholder="취소 사유를 입력해 주세요 (예: 상주 요청으로 취소, 품목 변경)"
                                                                className="w-full text-xs border border-red-200 rounded px-2.5 py-1.5 focus:ring-red-400 focus:border-red-400 bg-white"
                                                                autoFocus
                                                            />
                                                            {!cancelReasonInput.trim() && (
                                                                <p className="text-[11px] text-red-600">
                                                                    * 취소 사유를 입력해야 취소할 수 있습니다.
                                                                </p>
                                                            )}
                                                            <div className="flex justify-end gap-1.5 pt-1">
                                                                <button
                                                                    onClick={() => setCancellingItemId(null)}
                                                                    className="px-2.5 py-1 text-xs text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50"
                                                                >
                                                                    취소 접기
                                                                </button>
                                                                <button
                                                                    onClick={() => handleConfirmCancelAdditionalItem(item.id)}
                                                                    disabled={!cancelReasonInput.trim() || loadingItems}
                                                                    className="px-3 py-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600 rounded transition-colors flex items-center gap-1 shadow-sm"
                                                                >
                                                                    {loadingItems ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}
                                                                    취소 확정
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                            
                                            {/* 정산 요약 바 */}
                                            <div className="mt-3 pt-3 border-t border-emerald-200 bg-white rounded-lg p-3 space-y-1.5 text-xs">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-600 font-medium">추가 매출 총합계 (취소 제외):</span>
                                                    <span className="text-gray-900 font-bold text-base">
                                                        ₩{totalActive.toLocaleString()}
                                                    </span>
                                                </div>
                                                {feeRate != null && (
                                                    <>
                                                        <div className="flex justify-between items-center text-rose-600">
              <span>추가 매출 본사 수수료 ({feeRate}%, 부가세 포함):</span>
                                                            <span className="font-semibold">- ₩{expectedFee?.toLocaleString()}</span>
                                                        </div>
                                                        <div className="border-t border-gray-100 pt-1 flex justify-between items-center text-emerald-800 font-bold text-sm">
              <span>추가 매출 팀장 순수익 (실수령액):</span>
                                                            <span className="text-emerald-700 text-base">₩{leaderShare?.toLocaleString()}</span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-emerald-700/70 text-center py-3 bg-white rounded-lg border border-emerald-100 border-dashed">
                                            등록된 추가 매출 항목이 없습니다.
                                        </p>
                                    )}

                                    {canEditExtraSales && (
                                        <div className="mt-3">
                                            {isAddingItem ? (
                                                <div className="bg-white p-3.5 rounded-lg border border-emerald-300 shadow-sm animate-fadeIn">
                                                    <div className="grid grid-cols-12 gap-2 mb-2">
                                                        <div className="col-span-12 sm:col-span-6">
                                                            <label className="block text-[10px] font-bold text-gray-700 mb-1">품목명 *</label>
                                                            <input 
                                                                type="text" 
                                                                value={newItemName}
                                                                onChange={e => setNewItemName(e.target.value)}
                                                                placeholder="예: 영정사진 변경, 제단꽃 추가" 
                                                                className="w-full text-sm border-gray-300 rounded focus:ring-emerald-500 focus:border-emerald-500 py-1.5"
                                                            />
                                                        </div>
                                                        <div className="col-span-4 sm:col-span-2">
                                                            <label className="block text-[10px] font-bold text-gray-700 mb-1">수량 *</label>
                                                            <input 
                                                                type="number" 
                                                                value={newItemQty}
                                                                onChange={e => setNewItemQty(e.target.value)}
                                                                min="1"
                                                                className="w-full text-sm border-gray-300 rounded focus:ring-emerald-500 focus:border-emerald-500 py-1.5"
                                                            />
                                                        </div>
                                                        <div className="col-span-8 sm:col-span-4">
                                                            <label className="block text-[10px] font-bold text-gray-700 mb-1">단가 (원) *</label>
                                                            <input 
                                                                type="number" 
                                                                value={newItemPrice}
                                                                onChange={e => setNewItemPrice(e.target.value)}
                                                                min="0"
                                                                placeholder="단가 입력" 
                                                                className="w-full text-sm border-gray-300 rounded focus:ring-emerald-500 focus:border-emerald-500 py-1.5"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="mb-2">
                                                        <label className="block text-[10px] font-bold text-gray-700 mb-1">설명 / 특이사항 (선택, 최대 1,000자)</label>
                                                        <input 
                                                            type="text" 
                                                            value={newItemDesc}
                                                            onChange={e => setNewItemDesc(e.target.value)}
                                                            maxLength={1000}
                                                            placeholder="상주 요청 세부 내용" 
                                                            className="w-full text-xs border-gray-300 rounded focus:ring-emerald-500 focus:border-emerald-500 py-1.5"
                                                        />
                                                    </div>

                                                    {/* 사진 첨부 (최대 10장) */}
                                                    <div className="mb-3">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <label className="text-[10px] font-bold text-gray-700">현장/영수증 사진 첨부 (선택, 최대 10장)</label>
                                                            <span className="text-[10px] text-gray-400">{newItemPhotos.length} / 10장</span>
                                                        </div>
                                                        <input 
                                                            ref={photoInputRef}
                                                            type="file" 
                                                            multiple 
                                                            accept="image/jpeg,image/png,image/webp" 
                                                            className="hidden" 
                                                            onChange={handlePhotoChange}
                                                        />
                                                        <div className="flex flex-wrap gap-2 items-center">
                                                            {newItemPhotos.map((img, idx) => (
                                                                <div key={idx} className="relative w-12 h-12 rounded border border-gray-300 overflow-hidden bg-black group">
                                                                    <img src={img.previewUrl} alt={`미리보기 ${idx+1}`} className="w-full h-full object-cover" />
                                                                    <button 
                                                                        type="button" 
                                                                        onClick={() => handleRemoveNewPhoto(idx)}
                                                                        className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px]"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </div>
                                                            ))}
                                                            {newItemPhotos.length < 10 && (
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => photoInputRef.current?.click()}
                                                                    className="w-12 h-12 rounded border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50 flex flex-col items-center justify-center text-emerald-600 transition-colors"
                                                                >
                                                                    <Camera className="w-4 h-4" />
                                                                    <span className="text-[9px] font-bold">+</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                                                        <button 
                                                            onClick={() => {
                                                                setIsAddingItem(false);
                                                                setNewItemPhotos([]);
                                                            }}
                                                            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                                                        >
                                                            취소
                                                        </button>
                                                        <button 
                                                            onClick={handleAddAdditionalItem}
                                                            disabled={loadingItems}
                                                            className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1"
                                                        >
                                                            {loadingItems ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                            등록
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button 
                                                    onClick={() => setIsAddingItem(true)}
                                                    className="w-full py-2.5 bg-white border border-emerald-300 border-dashed text-emerald-700 text-sm font-bold rounded-lg hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1 shadow-sm"
                                                >
                                                    <Plus className="w-4 h-4" /> 추가 매출 항목 등록
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
}
