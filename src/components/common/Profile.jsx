import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import imageCompression from 'browser-image-compression';
import { Camera, User, Loader2, CreditCard, Save, Send, ShieldCheck, FileBadge, Image as ImageIcon, Plus, Trash2, Search, X } from 'lucide-react';
import { useRef } from 'react';
import SendMessageModal from './SendMessageModal';
import ImageBlurEditor from './ImageBlurEditor';
import DaumPostcode from 'react-daum-postcode';

export default function Profile({ user, onUpdate }) {
    const { showToast } = useNotification();
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [bankInfo, setBankInfo] = useState({ bank_code: '', bank_account: '', bank_holder: '' });
    const [savingBank, setSavingBank] = useState(false);

    const [galleryUrls, setGalleryUrls] = useState([]);
    const [galleryUploading, setGalleryUploading] = useState(false);
    const galleryInputRef = useRef(null);

    // Additional Profile Details
    const [profileDetails, setProfileDetails] = useState({ introduction: '', experience_years: 0, address: '', address_detail: '' });
    const [savingDetails, setSavingDetails] = useState(false);
    const [isPostcodeOpen, setIsPostcodeOpen] = useState(false);

    const handleCompletePostcode = (data) => {
        let fullAddress = data.address;
        let extraAddress = '';

        if (data.addressType === 'R') {
            if (data.bname !== '') extraAddress += data.bname;
            if (data.buildingName !== '') extraAddress += (extraAddress !== '' ? `, ${data.buildingName}` : data.buildingName);
            fullAddress += (extraAddress !== '' ? ` (${extraAddress})` : '');
        }

        setProfileDetails(prev => ({
            ...prev,
            address: fullAddress
        }));
        setIsPostcodeOpen(false);
    };

    const [certUploading, setCertUploading] = useState(false);
    const [pendingCertImage, setPendingCertImage] = useState(null);

    const [bizLicUploading, setBizLicUploading] = useState(false);
    const [pendingBizLicImage, setPendingBizLicImage] = useState(null);

    const [masterInfo, setMasterInfo] = useState(null);
    const [messageModal, setMessageModal] = useState({ isOpen: false, recipientId: '', recipientName: '', recipientRoleClass: '' });
    const [bizInfoModalOpen, setBizInfoModalOpen] = useState(false);

    useEffect(() => {
        if (user) fetchProfile();
    }, [user]);

    const handleCertFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setCertUploading(true);
            const options = {
                maxSizeMB: 1,
                maxWidthOrHeight: 1200,
                useWebWorker: true,
                fileType: 'image/jpeg'
            };
            showToast('info', '이미지 처리 중...', '사진을 최적화하고 있습니다.');
            const compressedFile = await imageCompression(file, options);
            
            const reader = new FileReader();
            reader.onload = (event) => { setPendingCertImage(event.target.result); };
            reader.readAsDataURL(compressedFile);
        } catch (error) {
            console.error('Image compression error:', error);
            showToast('error', '오류', '이미지 처리 중 오류가 발생했습니다.');
        } finally {
            setCertUploading(false);
        }
        e.target.value = null;
    };

    const handleBizLicFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setBizLicUploading(true);
            const options = {
                maxSizeMB: 1,
                maxWidthOrHeight: 1200,
                useWebWorker: true,
                fileType: 'image/jpeg'
            };
            showToast('info', '이미지 처리 중...', '사진을 최적화하고 있습니다.');
            const compressedFile = await imageCompression(file, options);
            
            const reader = new FileReader();
            reader.onload = (event) => { setPendingBizLicImage(event.target.result); };
            reader.readAsDataURL(compressedFile);
        } catch (error) {
            console.error('Image compression error:', error);
            showToast('error', '오류', '이미지 처리 중 오류가 발생했습니다.');
        } finally {
            setBizLicUploading(false);
        }
        e.target.value = null;
    };

    const handleCertSave = async (blurredBlob) => {
        setPendingCertImage(null);
        if (!blurredBlob) return;

        try {
            setCertUploading(true);
            showToast('info', '업로드 중...', '이미지를 안전하게 저장하고 있습니다.');

            const fileExt = 'jpeg';
            const fileName = `cert-${user.id}-${Date.now()}.${fileExt}`;
            const filePath = `certificates/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('profiles')
                .upload(filePath, blurredBlob, { upsert: true, contentType: 'image/jpeg' });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('profiles')
                .getPublicUrl(filePath);

            const timestampedUrl = `${publicUrl}?t=${Date.now()}`;

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ certificate_url: timestampedUrl })
                .eq('id', user.id);

            if (updateError) throw updateError;

            setProfileData(prev => ({ ...prev, certificate_url: timestampedUrl }));
            showToast('success', '업로드 완료', '모자이크 처리된 이미지가 저장되었습니다.');

        } catch (error) {
            console.error('Cert upload error:', error);
            showToast('error', '업로드 실패', '이미지 업로드 중 오류가 발생했습니다.');
        } finally {
            setCertUploading(false);
        }
    };

    // 사업자등록증 저장
    const handleBizLicSave = async (blurredBlob) => {
        setPendingBizLicImage(null);
        if (!blurredBlob) return;
        try {
            setBizLicUploading(true);
            showToast('info', '업로드 중...', '사업자등록증을 저장하고 있습니다.');
            const fileName = `bizlic-${user.id}-${Date.now()}.jpeg`;
            const filePath = `certificates/${fileName}`;
            const { error: uploadError } = await supabase.storage
                .from('profiles')
                .upload(filePath, blurredBlob, { upsert: true, contentType: 'image/jpeg' });
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(filePath);
            const timestampedUrl = `${publicUrl}?t=${Date.now()}`;
            const { error: updateError } = await supabase.from('profiles')
                .update({ business_license_url: timestampedUrl })
                .eq('id', user.id);
            if (updateError) throw updateError;
            setProfileData(prev => ({ ...prev, business_license_url: timestampedUrl }));
            showToast('success', '업로드 완료', '사업자등록증이 저장되었습니다.');
        } catch (error) {
            console.error(error);
            showToast('error', '업로드 실패', '사업자등록증 업로드 중 오류가 발생했습니다.');
        } finally {
            setBizLicUploading(false);
        }
    };

    const fetchProfile = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            if (error) throw error;
            setProfileData(data);
            setProfileDetails({
                introduction: data.introduction || '',
                experience_years: data.experience_years || 0,
                address: data.address || '',
                address_detail: data.address_detail || ''
            });
            setGalleryUrls(data.gallery_urls || []);

            // 은행 정보는 profiles가 아니라 partners(또는 vendors) 테이블에 저장됨
            let bankStr = '';
            if (user.role === 'vendor') {
                const { data: vData } = await supabase.from('vendors').select('bank_account').eq('user_id', user.id).single();
                if (vData) bankStr = vData.bank_account || '';
            } else {
                const { data: pData } = await supabase.from('partners').select('bank_account').eq('user_id', user.id).single();
                if (pData) bankStr = pData.bank_account || '';
            }

            // bankStr 예상 형식: "국민은행 123-123-123 홍길동"
            const parts = bankStr.split(' ');
            if (parts.length >= 3) {
                setBankInfo({
                    bank_code: parts[0],
                    bank_account: parts[1],
                    bank_holder: parts.slice(2).join(' ')
                });
            } else if (parts.length > 0 && bankStr.length > 0) {
                setBankInfo({
                    bank_code: '기타은행',
                    bank_account: bankStr,
                    bank_holder: data.name || ''
                });
            } else {
                 setBankInfo({ bank_code: '', bank_account: '', bank_holder: '' });
            }
            setGalleryUrls(data.gallery_urls || []);

            if (['leader', 'dealer', 'morning', 'meal', '아침', '식사'].includes(user.role) && user.grade !== 'Master') {
                const { data: pData } = await supabase.from('partners').select('master_id').eq('user_id', user.id).single();
                if (pData?.master_id) {
                    const { data: mData } = await supabase.from('profiles').select('id, name, phone, role').eq('id', pData.master_id).single();
                    if (mData) setMasterInfo(mData);
                }
            }

        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setUploading(true);

            // 1. Compress Image
            const options = {
                maxSizeMB: 1, // Max file size
                maxWidthOrHeight: 1024, // Max width/height
                useWebWorker: true,
                fileType: 'image/webp' // Convert to WebP for better compression
            };

            showToast('info', '이미지 최적화 중...', '사진 크기를 줄이고 있습니다.');
            const compressedFile = await imageCompression(file, options);

            // 2. Upload to Supabase Storage
            const fileExt = 'webp';
            const fileName = `${user.id}-${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            showToast('info', '업로드 중...', '서버에 저장 중입니다.');

            // Note: Make sure a storage bucket named 'assets' or similar exists and is public
            const { error: uploadError } = await supabase.storage
                .from('profiles')
                .upload(filePath, compressedFile, { upsert: true });

            if (uploadError) throw uploadError;

            // 3. Get Public URL and append timestamp to prevent browser caching
            const { data: { publicUrl } } = supabase.storage
                .from('profiles')
                .getPublicUrl(filePath);

            const timestampedUrl = `${publicUrl}?t=${Date.now()}`;

            // 4. Update Profile Record
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: timestampedUrl })
                .eq('id', user.id);

            if (updateError) throw updateError;

            // Update local state
            setProfileData(prev => ({ ...prev, avatar_url: timestampedUrl }));

            // Update global user object if onUpdate is provided
            if (onUpdate) onUpdate({ ...user, avatar_url: timestampedUrl });

            showToast('success', '업로드 성공', '프로필 사진이 변경되었습니다.');

        } catch (error) {
            console.error('Upload error:', error);
            showToast('error', '업로드 실패', error.message || '사진 업로드 중 문제가 발생했습니다.');
        } finally {
            setUploading(false);
            // Reset file input
            e.target.value = null;
        }
    };

    const handleSaveBankInfo = async () => {
        if (!bankInfo.bank_code || !bankInfo.bank_account || !bankInfo.bank_holder) {
            showToast('error', '입력 오류', '은행명, 예금주, 계좌번호를 모두 입력해주세요.');
            return;
        }
        try {
            setSavingBank(true);
            const combinedBankAccount = `${bankInfo.bank_code} ${bankInfo.bank_account} ${bankInfo.bank_holder}`;
            const table = user.role === 'vendor' ? 'vendors' : 'partners';

            const { error } = await supabase
                .from(table)
                .update({ bank_account: combinedBankAccount })
                .eq('user_id', user.id);

            if (error) throw error;
            showToast('success', '저장 완료', '정산 계좌 정보가 저장되었습니다.');
        } catch (error) {
            console.error('Error saving bank info:', error);
            showToast('error', '저장 실패', '계좌 정보 저장 중 오류가 발생했습니다.');
        } finally {
            setSavingBank(false);
        }
    };

    const handleGalleryUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        const remaining = 10 - galleryUrls.length;
        if (remaining <= 0) {
            showToast('error', '최대 10장', '추가 프로필 사진은 최대 10장까지 가능합니다.');
            return;
        }

        const filesToProcess = files.slice(0, remaining);
        setGalleryUploading(true);
        showToast('info', '사진 업로드 중...', '여러 장의 사진을 처리하고 있습니다.');

        try {
            const options = { maxSizeMB: 1, maxWidthOrHeight: 1200, useWebWorker: true, fileType: 'image/webp' };
            const newUrls = [];

            for (const file of filesToProcess) {
                const compressedFile = await imageCompression(file, options);
                const fileName = `gallery-${user.id}-${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
                const filePath = `avatars/${fileName}`;

                const { error: uploadError } = await supabase.storage.from('profiles').upload(filePath, compressedFile);
                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(filePath);
                newUrls.push(publicUrl);
            }

            const updatedUrls = [...galleryUrls, ...newUrls];

            const { error: updateError } = await supabase.from('profiles').update({ gallery_urls: updatedUrls }).eq('id', user.id);
            if (updateError) throw updateError;

            setGalleryUrls(updatedUrls);
            setProfileData(prev => ({ ...prev, gallery_urls: updatedUrls }));
            showToast('success', '업로드 완료', '추가 프로필 사진이 등록되었습니다.');

        } catch (error) {
            console.error(error);
            showToast('error', '업로드 실패', '사진 업로드 중 오류가 발생했습니다.');
        } finally {
            setGalleryUploading(false);
            e.target.value = null;
        }
    };

    const handleRemoveGalleryImage = async (indexToRemove) => {
        if (!confirm('이 사진을 삭제하시겠습니까?')) return;
        const updatedUrls = galleryUrls.filter((_, i) => i !== indexToRemove);
        try {
            const { error } = await supabase.from('profiles').update({ gallery_urls: updatedUrls }).eq('id', user.id);
            if (error) throw error;
            setGalleryUrls(updatedUrls);
            setProfileData(prev => ({ ...prev, gallery_urls: updatedUrls }));
            showToast('success', '삭제 완료', '사진이 삭제되었습니다.');
        } catch (error) {
            showToast('error', '삭제 실패', '사진 삭제 중 오류가 발생했습니다.');
        }
    };

    const handleSaveProfileDetails = async () => {
        try {
            setSavingDetails(true);
            const { error } = await supabase
                .from('profiles')
                .update({
                    introduction: profileDetails.introduction,
                    experience_years: parseInt(profileDetails.experience_years) || 0,
                    address: profileDetails.address,
                    address_detail: profileDetails.address_detail
                })
                .eq('id', user.id);
            if (error) throw error;
            showToast('success', '저장 완료', '프로필 상세 정보가 저장되었습니다.');
        } catch (error) {
            console.error(error);
            showToast('error', '저장 실패', '정보 저장 중 오류가 발생했습니다.');
        } finally {
            setSavingDetails(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-400">로딩 중...</div>;

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-600" /> 기본 정보 관리
            </h2>

            <div className="flex flex-col items-center mb-8">
                <div className="relative group">
                    <div className="w-24 h-24 rounded-full bg-gray-100 overflow-hidden border-4 border-white shadow-lg flex items-center justify-center relative">
                        {profileData?.avatar_url ? (
                            <img
                                src={profileData.avatar_url}
                                alt="Profile Avatar"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <User className="w-12 h-12 text-gray-300" />
                        )}

                        {uploading && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Loader2 className="w-6 h-6 text-white animate-spin" />
                            </div>
                        )}
                    </div>

                    <label
                        className={`absolute bottom-0 right-0 w-8 h-8 bg-indigo-600 rounded-full border-2 border-white flex items-center justify-center cursor-pointer shadow-md hover:bg-indigo-700 transition-colors ${uploading ? 'pointer-events-none opacity-50' : ''}`}
                        title="프로필 사진 변경"
                    >
                        <Camera className="w-4 h-4 text-white" />
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            disabled={uploading}
                            className="hidden"
                        />
                    </label>
                </div>
                <p className="mt-4 font-bold text-lg text-gray-800">{profileData?.name || user.name}</p>
                <p className="text-sm text-gray-500">
                    {user.role === 'admin' ? '관리자' :
                        user.role === 'master' ? '본사 마스터' :
                            user.role === 'leader' ? (user.grade === 'Master' ? '마스터팀장' : '팀장') :
                                user.role === 'dealer' ? (user.grade === 'Master' ? '마스터딜러' : '파트너딜러') :
                                    '사용자'} ({profileData?.phone || user.phone})
                </p>
            </div>

            <div className="space-y-6 mt-6">
                {/* Team Leader specific details */}
                {['leader', 'admin', 'master'].includes(user.role) && (
                    <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-5">
                        <h3 className="font-bold gap-2 flex items-center mb-4 text-gray-800">
                            <User className="w-5 h-5 text-indigo-600" /> 팀장 프로필 정보 (고객에게 노출됨)
                        </h3>
                        <div className="space-y-4">
                            {/* 1. 상례지도사 자격증 업로드 */}
                            <div className="bg-white p-4 rounded-lg border border-indigo-100">
                                <label className="block text-xs font-bold text-gray-800 mb-1 flex items-center gap-2">
                                    <FileBadge className="w-4 h-4 text-indigo-500" /> ① 상례지도사 자격증
                                </label>
                                <p className="text-xs text-gray-500 mb-3 leading-relaxed">자격증을 업로드하세요. 업로드 과정에서 <strong>주민번호 뒷자리 등을 블러(모자이크) 처리</strong>할 수 있습니다.</p>
                                {profileData?.certificate_url ? (
                                    <div className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50 mb-2">
                                        <img src={profileData.certificate_url} alt="자격증" className="w-full h-auto max-h-48 object-contain" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <label className="cursor-pointer bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:bg-gray-100 transition-colors">
                                                다시 업로드하기
                                                <input type="file" accept="image/*" onChange={handleCertFileSelect} className="hidden" disabled={certUploading} />
                                            </label>
                                        </div>
                                    </div>
                                ) : (
                                    <label className={`block w-full text-center py-6 border-2 border-dashed border-indigo-200 rounded-lg cursor-pointer hover:bg-indigo-50 hover:border-indigo-400 transition-colors ${certUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <div className="flex flex-col items-center justify-center text-indigo-500">
                                            {certUploading ? <Loader2 className="w-6 h-6 animate-spin mb-2" /> : <Camera className="w-6 h-6 mb-2" />}
                                            <span className="text-sm font-bold">{certUploading ? '처리 중...' : '사진 업로드'}</span>
                                        </div>
                                        <input type="file" accept="image/*" onChange={handleCertFileSelect} className="hidden" disabled={certUploading} />
                                    </label>
                                )}
                            </div>

                            {/* 2. 사업자등록증 업로드 */}
                            <div className="bg-white p-4 rounded-lg border border-indigo-100">
                                <label className="block text-xs font-bold text-gray-800 mb-1 flex items-center gap-2">
                                    <FileBadge className="w-4 h-4 text-purple-500" /> ② 사업자등록증
                                </label>
                                <p className="text-xs text-gray-500 mb-3 leading-relaxed">사업자등록증을 업로드하세요. 업로드 과정에서 <strong>민감 정보를 블러(모자이크) 처리</strong>할 수 있습니다.</p>
                                {profileData?.business_license_url ? (
                                    <div className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50 mb-2">
                                        <img src={profileData.business_license_url} alt="사업자등록증" className="w-full h-auto max-h-48 object-contain" />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <label className="cursor-pointer bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-bold shadow-lg hover:bg-gray-100 transition-colors">
                                                다시 업로드하기
                                                <input type="file" accept="image/*" onChange={handleBizLicFileSelect} className="hidden" disabled={bizLicUploading} />
                                            </label>
                                        </div>
                                    </div>
                                ) : (
                                    <label className={`block w-full text-center py-6 border-2 border-dashed border-purple-200 rounded-lg cursor-pointer hover:bg-purple-50 hover:border-purple-400 transition-colors ${bizLicUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <div className="flex flex-col items-center justify-center text-purple-400">
                                            {bizLicUploading ? <Loader2 className="w-6 h-6 animate-spin mb-2" /> : <Camera className="w-6 h-6 mb-2" />}
                                            <span className="text-sm font-bold">{bizLicUploading ? '처리 중...' : '사진 업로드'}</span>
                                        </div>
                                        <input type="file" accept="image/*" onChange={handleBizLicFileSelect} className="hidden" disabled={bizLicUploading} />
                                    </label>
                                )}

                                {/* 사업자 정보 입력 */}
                                <div className="mt-3 border-t border-purple-100 pt-3">
                                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 accent-purple-600"
                                            checked={profileData?.has_business || false}
                                            onChange={async (e) => {
                                                const checked = e.target.checked;
                                                setProfileData(prev => ({ ...prev, has_business: checked }));
                                                await supabase.from('profiles').update({ has_business: checked }).eq('id', user.id);
                                                if (checked) {
                                                    setBizInfoModalOpen(true);
                                                    showToast('info', '사업자 정보 입력', '사업자 정보를 입력해주세요.');
                                                } else {
                                                    showToast('success', '해제 완료', '사업자 등록이 해제되었습니다.');
                                                }
                                            }}
                                        />
                                        <span className="text-xs font-bold text-purple-700">사업자 있음 (체크 시 3.3% 원천징수 미적용)</span>
                                        {profileData?.has_business && (
                                            <button
                                                type="button"
                                                onClick={() => setBizInfoModalOpen(true)}
                                                className="ml-auto text-[10px] text-purple-600 underline hover:text-purple-800"
                                            >
                                                정보 수정
                                            </button>
                                        )}
                                    </label>
                                    {profileData?.has_business && profileData?.business_number && (
                                        <div className="text-xs text-gray-500 bg-purple-50 rounded-lg px-3 py-2">
                                            <span className="font-bold text-purple-700">{profileData.business_name}</span>
                                            <span className="ml-2 text-gray-400">{profileData.business_number}</span>
                                        </div>
                                    )}
                                </div>
                            </div>



                            {/* Gallery Upload Area */}
                            <div className="bg-white p-4 rounded-lg border border-indigo-100">
                                <label className="block text-xs font-bold text-gray-800 mb-2 flex items-center gap-2">
                                    <ImageIcon className="w-4 h-4 text-indigo-500" /> 추가 프로필 (갤러리 / 현장 사진 등)
                                </label>
                                <p className="text-xs text-gray-500 mb-3 leading-relaxed">최대 10장까지 등록 가능하며, 고객에게 신뢰감을 줄 수 있는 다양한 프로필/현장 사진을 올려주세요.</p>

                                <div className="grid grid-cols-3 gap-2 mb-3">
                                    {galleryUrls.map((url, i) => (
                                        <div key={i} className="relative aspect-square rounded-lg border border-gray-200 overflow-hidden bg-gray-50 group">
                                            <img src={url} alt={`Gallery ${i}`} className="w-full h-full object-cover" />
                                            <button
                                                onClick={() => handleRemoveGalleryImage(i)}
                                                className="absolute top-1 right-1 w-6 h-6 bg-red-500/80 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                    {galleryUrls.length < 10 && (
                                        <button
                                            onClick={() => galleryInputRef.current?.click()}
                                            disabled={galleryUploading}
                                            className={`aspect-square rounded-lg border-2 border-dashed border-indigo-200 flex flex-col items-center justify-center text-indigo-400 hover:bg-indigo-50 transition-colors ${galleryUploading ? 'opacity-50' : ''}`}
                                        >
                                            {galleryUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-6 h-6" />}
                                            <span className="text-[10px] font-bold mt-1">사진 추가</span>
                                        </button>
                                    )}
                                </div>
                                <input type="file" multiple accept="image/*" className="hidden" ref={galleryInputRef} onChange={handleGalleryUpload} />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">자택 주소 (상례용품 배송지)</label>
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={profileDetails.address}
                                            onClick={() => setIsPostcodeOpen(true)}
                                            placeholder="주소 검색을 통해 주소를 입력해주세요."
                                            className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-medium cursor-pointer"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setIsPostcodeOpen(true)}
                                            className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 font-bold text-sm whitespace-nowrap shadow-sm"
                                        >
                                            <Search className="w-4 h-4" /> 주소 검색
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={profileDetails.address_detail}
                                        onChange={(e) => setProfileDetails({ ...profileDetails, address_detail: e.target.value })}
                                        placeholder="상세 주소 및 배송 특이사항 (예: 101동 202호 / 공동현관 비밀번호 1234#)"
                                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">경력 (년)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        min="0"
                                        value={profileDetails.experience_years}
                                        onChange={(e) => setProfileDetails({ ...profileDetails, experience_years: e.target.value })}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-medium pr-10"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-bold">년</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">인사말 / 소개글</label>
                                <textarea
                                    value={profileDetails.introduction}
                                    onChange={(e) => setProfileDetails({ ...profileDetails, introduction: e.target.value })}
                                    rows="3"
                                    placeholder="고객 및 딜러에게 보여질 짧은 소개글을 작성해주세요."
                                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-medium resize-none"
                                />
                            </div>
                            <button
                                onClick={handleSaveProfileDetails}
                                disabled={savingDetails}
                                className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition-colors mt-2"
                            >
                                {savingDetails ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                프로필 정보 저장
                            </button>
                        </div>
                    </div>
                )}

                {/* Master Info Section for regular Team Leaders / Dealers */}
                {masterInfo && (
                    <div className="bg-orange-50/50 rounded-xl border border-orange-100 p-5">
                        <h3 className="font-bold gap-2 flex items-center mb-4 text-gray-800">
                            <ShieldCheck className="w-5 h-5 text-orange-600" /> 소속 본부 (마스터) 정보
                        </h3>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-bold text-gray-900">{masterInfo.name} 마스터</p>
                                <p className="text-sm text-gray-500">{masterInfo.phone}</p>
                            </div>
                            <button
                                onClick={() => setMessageModal({
                                    isOpen: true,
                                    recipientId: masterInfo.id,
                                    recipientName: masterInfo.name,
                                    recipientRoleClass: '마스터'
                                })}
                                className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 py-2 border-orange-200 px-4 rounded-lg font-bold hover:bg-orange-50 hover:text-orange-700 transition-colors shadow-sm"
                            >
                                <Send className="w-4 h-4 text-orange-500" />
                                메시지 보내기
                            </button>
                        </div>
                    </div>
                )}

                <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-5 mt-4">
                    <h3 className="font-bold gap-2 flex items-center mb-4 text-gray-800">
                        <ShieldCheck className="w-5 h-5 text-blue-600" /> 관리자(고객센터) 문의
                    </h3>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-bold text-gray-900">프라미스 운영 관리자</p>
                            <p className="text-sm text-gray-500">시스템 오류 및 일반 문의</p>
                        </div>
                        <button
                            onClick={() => setMessageModal({
                                isOpen: true,
                                recipientId: 'admin',
                                recipientName: '운영 관리자',
                                recipientRoleClass: '관리자'
                            })}
                            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 py-2 px-4 rounded-lg font-bold hover:bg-blue-50 hover:text-blue-700 transition-colors shadow-sm"
                        >
                            <Send className="w-4 h-4 text-blue-500" />
                            문의하기
                        </button>
                    </div>
                </div>

                <div className="bg-gray-50 rounded-xl border border-gray-100 p-5 mt-4">
                    <h3 className="font-bold gap-2 flex items-center mb-4 text-gray-800">
                        <CreditCard className="w-5 h-5 text-indigo-600" /> 정산 계좌 관리 <span className="text-xs font-normal text-gray-500 ml-2">(토스 원천징수 송금용)</span>
                    </h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">은행명</label>
                            <select
                                value={bankInfo.bank_code}
                                onChange={(e) => setBankInfo({ ...bankInfo, bank_code: e.target.value })}
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                            >
                                <option value="">선택해주세요</option>
                                {/* 시중은행 */}
                                <option value="004">KB국민은행</option>
                                <option value="088">신한은행</option>
                                <option value="020">우리은행</option>
                                <option value="081">하나은행</option>
                                <option value="011">NH농협은행</option>
                                <option value="003">IBK기업은행</option>
                                <option value="023">SC제일은행</option>
                                <option value="027">한국씨티은행</option>
                                {/* 인터넷은행 */}
                                <option value="090">카카오뱅크</option>
                                <option value="089">케이뱅크</option>
                                <option value="092">토스뱅크</option>
                                {/* 특수은행 */}
                                <option value="002">KDB산업은행</option>
                                <option value="007">수협은행</option>
                                <option value="012">단위농협</option>
                                <option value="032">부산은행</option>
                                <option value="031">대구은행</option>
                                <option value="034">광주은행</option>
                                <option value="035">제주은행</option>
                                <option value="037">전북은행</option>
                                <option value="039">경남은행</option>
                                {/* 기타 */}
                                <option value="071">우체국</option>
                                <option value="045">새마을금고</option>
                                <option value="048">신협</option>
                                <option value="064">산림조합</option>
                                <option value="050">저축은행</option>
                                <option value="062">중국공상은행</option>
                                <option value="054">HSBC</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">예금주</label>
                            <input
                                type="text"
                                value={bankInfo.bank_holder}
                                onChange={(e) => setBankInfo({ ...bankInfo, bank_holder: e.target.value })}
                                placeholder="예금주 이름 실명 입력"
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">계좌번호</label>
                            <input
                                type="text"
                                value={bankInfo.bank_account}
                                onChange={(e) => setBankInfo({ ...bankInfo, bank_account: e.target.value })}
                                placeholder="- 기호 없이 숫자만 입력"
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-medium font-mono"
                            />
                        </div>
                        <button
                            onClick={handleSaveBankInfo}
                            disabled={savingBank}
                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition-colors mt-2"
                        >
                            {savingBank ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            계좌 저장
                        </button>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-xs text-gray-400 font-bold mb-1">안내사항</p>
                    <p className="text-sm text-gray-600">
                        계좌번호 외의 정보(소속, 비밀번호 등) 변경은 관리자를 통해서만 가능합니다.
                    </p>
                </div>
            </div>

            <SendMessageModal
                isOpen={messageModal.isOpen}
                onClose={() => setMessageModal({ isOpen: false, recipientId: '', recipientName: '', recipientRoleClass: '' })}
                recipientId={messageModal.recipientId}
                recipientName={messageModal.recipientName}
                recipientRoleClass={messageModal.recipientRoleClass}
                currentUserId={user.id}
            />
            {pendingCertImage && (
                <ImageBlurEditor
                    imageUrl={pendingCertImage}
                    onSave={handleCertSave}
                    onCancel={() => setPendingCertImage(null)}
                />
            )}
            {pendingBizLicImage && (
                <ImageBlurEditor
                    imageUrl={pendingBizLicImage}
                    onSave={handleBizLicSave}
                    onCancel={() => setPendingBizLicImage(null)}
                />
            )}

            {/* Daum Postcode Modal */}
            {isPostcodeOpen && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <Search className="w-5 h-5 text-indigo-600" /> 주소 검색
                            </h3>
                            <button onClick={() => setIsPostcodeOpen(false)} className="text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-200 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="h-[450px] overflow-y-auto">
                            <DaumPostcode onComplete={handleCompletePostcode} style={{ width: '100%', height: '100%' }} />
                        </div>
                    </div>
                </div>
            )}

            {/* 사업자 정보 모달 */}
            {bizInfoModalOpen && (
                <BizInfoModal
                    profileData={profileData}
                    setProfileData={setProfileData}
                    userId={user.id}
                    showToast={showToast}
                    onClose={() => setBizInfoModalOpen(false)}
                />
            )}
        </div>
    );
}

function BizInfoModal({ profileData, setProfileData, userId, showToast, onClose }) {
    const [form, setForm] = useState({
        business_number: profileData?.business_number || '',
        business_name: profileData?.business_name || '',
        ceo_name: profileData?.ceo_name || '',
        business_type: profileData?.business_type || '',
        business_item: profileData?.business_item || '',
        tax_email: profileData?.tax_email || '',
        business_address: profileData?.business_address || '',
    });
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!form.business_number || !form.business_name || !form.ceo_name) {
            showToast('error', '입력 오류', '사업자번호, 상호명, 대표자명은 필수입니다.');
            return;
        }
        try {
            setSaving(true);
            const { error } = await supabase
                .from('profiles')
                .update({ ...form, has_business: true })
                .eq('id', userId);
            if (error) throw error;
            setProfileData(prev => ({ ...prev, ...form, has_business: true }));
            showToast('success', '저장 완료', '사업자 정보가 저장되었습니다.');
            onClose();
        } catch (e) {
            showToast('error', '저장 실패', e.message);
        } finally {
            setSaving(false);
        }
    };

    const fields = [
        { key: 'business_number', label: '사업자등록번호', placeholder: '000-00-00000', required: true },
        { key: 'business_name', label: '상호(사업자명)', placeholder: '주식회사 10년', required: true },
        { key: 'ceo_name', label: '대표자명', placeholder: '홍길동', required: true },
        { key: 'business_type', label: '업태', placeholder: '서비스업' },
        { key: 'business_item', label: '종목', placeholder: '장례서비스' },
        { key: 'tax_email', label: '세금계산서 이메일', placeholder: 'tax@company.com' },
        { key: 'business_address', label: '사업장 주소', placeholder: '서울시 강남구 ...' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-purple-600 px-6 py-4 flex justify-between items-center">
                    <h3 className="font-bold text-white text-base">사업자 정보 입력</h3>
                    <button onClick={onClose} className="text-white/70 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-3 max-h-[70vh] overflow-y-auto">
                    <p className="text-xs text-gray-500 mb-2">입력된 정보는 세금계산서 발행 및 정산 처리에 사용됩니다.</p>
                    {fields.map(f => (
                        <div key={f.key}>
                            <label className="block text-xs font-bold text-gray-700 mb-1">
                                {f.label} {f.required && <span className="text-red-500">*</span>}
                            </label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                                placeholder={f.placeholder}
                                value={form[f.key]}
                                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                            />
                        </div>
                    ))}
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium">
                        취소
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 text-sm text-white bg-purple-600 rounded-lg hover:bg-purple-700 font-bold disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        저장
                    </button>
                </div>
            </div>
        </div>
    );
}
