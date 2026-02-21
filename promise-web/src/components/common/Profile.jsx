import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import imageCompression from 'browser-image-compression';
import { Camera, User, Loader2 } from 'lucide-react';

export default function Profile({ user, onUpdate }) {
    const { showToast } = useNotification();
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

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

            <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <p className="text-xs text-gray-400 font-bold mb-1">안내사항</p>
                    <p className="text-sm text-gray-600">
                        현재 프로필 사진 외의 세부 정보(소속, 비밀번호 등) 변경은 관리자(Admin)를 통해서만 가능합니다.
                    </p>
                </div>
            </div>
        </div>
    );
}
