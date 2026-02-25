import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import imageCompression from 'browser-image-compression';
import { Camera, User, Loader2, CreditCard, Save } from 'lucide-react';

export default function Profile({ user, onUpdate }) {
    const { showToast } = useNotification();
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [bankInfo, setBankInfo] = useState({ bank_name: '', account_number: '' });
    const [savingBank, setSavingBank] = useState(false);

    // Additional Profile Details
    const [profileDetails, setProfileDetails] = useState({ introduction: '', experience_years: 0 });
    const [savingDetails, setSavingDetails] = useState(false);

    useEffect(() => {
        if (user) fetchProfile();
    }, [user]);

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
            setBankInfo({ bank_name: data.bank_name || '', account_number: data.account_number || '' });
            setProfileDetails({
                introduction: data.introduction || '',
                experience_years: data.experience_years || 0
            });
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
        if (!bankInfo.bank_name || !bankInfo.account_number) {
            showToast('error', '입력 오류', '은행명과 계좌번호를 모두 입력해주세요.');
            return;
        }
        try {
            setSavingBank(true);
            const { error } = await supabase
                .from('profiles')
                .update({
                    bank_name: bankInfo.bank_name,
                    account_number: bankInfo.account_number
                })
                .eq('id', user.id);
            if (error) throw error;
            showToast('success', '저장 완료', '정산 계좌 정보가 저장되었습니다.');
        } catch (error) {
            console.error(error);
            showToast('error', '저장 실패', '계좌 정보 저장 중 오류가 발생했습니다.');
        } finally {
            setSavingBank(false);
        }
    };

    const handleSaveProfileDetails = async () => {
        try {
            setSavingDetails(true);
            const { error } = await supabase
                .from('profiles')
                .update({
                    introduction: profileDetails.introduction,
                    experience_years: parseInt(profileDetails.experience_years) || 0
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

                <div className="bg-gray-50 rounded-xl border border-gray-100 p-5">
                    <h3 className="font-bold gap-2 flex items-center mb-4 text-gray-800">
                        <CreditCard className="w-5 h-5 text-indigo-600" /> 정산 계좌 관리
                    </h3>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">은행명</label>
                            <input
                                type="text"
                                value={bankInfo.bank_name}
                                onChange={(e) => setBankInfo({ ...bankInfo, bank_name: e.target.value })}
                                placeholder="예: 신한은행, 카카오뱅크 등"
                                className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">계좌번호 (예금주: {profileData?.name || user.name})</label>
                            <input
                                type="text"
                                value={bankInfo.account_number}
                                onChange={(e) => setBankInfo({ ...bankInfo, account_number: e.target.value })}
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
        </div>
    );
}
