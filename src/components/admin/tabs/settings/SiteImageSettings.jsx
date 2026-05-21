import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useNotification } from '../../../../contexts/NotificationContext';
import { supabase } from '../../../../lib/supabase';

export function SiteImageSettings({ config, onUpdate }) {
    const { showToast } = useNotification();
    const [heroImages, setHeroImages] = useState([]);
    const [storyImages, setStoryImages] = useState([]);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        try {
            if (config.hero_images) setHeroImages(JSON.parse(config.hero_images));
            if (config.story_images) setStoryImages(JSON.parse(config.story_images));
        } catch (e) { console.error('Error parsing site images'); }
    }, [config.hero_images, config.story_images]);

    const handleFileUpload = async (e, type) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setUploading(true);
        try {
            const newUrls = [];
            for (const file of files) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const filePath = `site/${fileName}`;

                // Use profiles bucket as a fallback since we know it exists with public access
                const { error: uploadError } = await supabase.storage.from('profiles').upload(filePath, file);
                
                if (uploadError) throw uploadError;
                
                const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(filePath);
                newUrls.push(publicUrl);
            }

            const isHero = type === 'hero';
            const currentImages = isHero ? heroImages : storyImages;
            const updatedImages = [...currentImages, ...newUrls];
            
            const configKey = isHero ? 'hero_images' : 'story_images';
            const value = JSON.stringify(updatedImages);
            
            await supabase.from('system_config').upsert({ key: configKey, value });
            
            isHero ? setHeroImages(updatedImages) : setStoryImages(updatedImages);
            showToast('success', '업로드 성공', '이미지가 추가되었습니다.');
            onUpdate();
        } catch (err) {
            console.error('Upload Error:', err);
            showToast('error', '업로드 실패', '이미지 업로드에 실패했습니다.');
        } finally {
            setUploading(false);
            e.target.value = ''; // Reset input
        }
    };

    const handleRemoveImage = async (index, type) => {
        const isHero = type === 'hero';
        const currentImages = isHero ? [...heroImages] : [...storyImages];
        currentImages.splice(index, 1);
        
        const configKey = isHero ? 'hero_images' : 'story_images';
        const value = JSON.stringify(currentImages);
        
        await supabase.from('system_config').upsert({ key: configKey, value });
        
        isHero ? setHeroImages(currentImages) : setStoryImages(currentImages);
        showToast('success', '삭제 성공', '이미지가 삭제되었습니다.');
        onUpdate();
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600" /> 사이트 이미지 관리 (슬라이드쇼)
            </h4>
            <p className="text-xs text-gray-400 mb-6">이미지를 업로드하면 홈페이지에 반영됩니다. 아래 권장 사이즈대로 제작하면 최적으로 표시됩니다.</p>

            <div className="space-y-8">
                {/* 메인 히어로 이미지 */}
                <div>
                    <div className="flex items-start justify-between mb-1">
                        <h5 className="font-bold text-indigo-900">① 메인 히어로 이미지 (상단 아치형)</h5>
                        {/* 사이즈 가이드 배지 */}
                        <div className="flex flex-wrap gap-1.5 ml-4">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-full">
                                📐 500 × 625 px
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold rounded-full">
                                비율 4 : 5 (세로)
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 border border-gray-300 text-gray-600 text-xs font-mono rounded-full">
                                /public/hero_warm_light.png
                            </span>
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">여러 장의 이미지를 업로드하면 메인 페이지에서 부드럽게 디밍(Crossfade) 됩니다.</p>
                    <div className="flex flex-wrap gap-4">
                        {heroImages.map((url, idx) => (
                            <div key={`hero-${idx}`} className="relative group w-32 h-32">
                                <img src={url} alt={`Hero ${idx}`} className="w-full h-full object-cover rounded-xl border border-gray-200 shadow-sm" />
                                <button
                                    onClick={() => handleRemoveImage(idx, 'hero')}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                        <label className="w-32 h-32 flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 bg-gray-50 rounded-xl cursor-pointer hover:bg-indigo-50 transition-colors">
                            <span className="text-indigo-400 text-3xl font-light mb-1">+</span>
                            <span className="text-xs text-indigo-500 font-medium">{uploading ? '업로드 중...' : '추가'}</span>
                            <input type="file" multiple accept="image/*" className="hidden" disabled={uploading} onChange={(e) => handleFileUpload(e, 'hero')} />
                        </label>
                    </div>
                </div>

                <div className="border-t border-gray-100"></div>

                {/* 서브 스토리 이미지 */}
                <div>
                    <div className="flex items-start justify-between mb-1">
                        <h5 className="font-bold text-indigo-900">② 서브 스토리 이미지 (하단 가로형)</h5>
                        {/* 사이즈 가이드 배지 */}
                        <div className="flex flex-wrap gap-1.5 ml-4">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-full">
                                📐 800 × 450 px
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold rounded-full">
                                비율 16 : 9 (가로)
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 border border-gray-300 text-gray-600 text-xs font-mono rounded-full">
                                /public/comfort_hands.png
                            </span>
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">홈페이지 하단 스토리(Process) 영역에 노출되는 이미지 슬라이드쇼입니다.</p>
                    <div className="flex flex-wrap gap-4">
                        {storyImages.map((url, idx) => (
                            <div key={`story-${idx}`} className="relative group w-40 h-24">
                                <img src={url} alt={`Story ${idx}`} className="w-full h-full object-cover rounded-xl border border-gray-200 shadow-sm" />
                                <button
                                    onClick={() => handleRemoveImage(idx, 'story')}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                        <label className="w-40 h-24 flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 bg-gray-50 rounded-xl cursor-pointer hover:bg-indigo-50 transition-colors">
                            <span className="text-indigo-400 text-3xl font-light mb-1">+</span>
                            <span className="text-xs text-indigo-500 font-medium">{uploading ? '업로드 중...' : '추가'}</span>
                            <input type="file" multiple accept="image/*" className="hidden" disabled={uploading} onChange={(e) => handleFileUpload(e, 'story')} />
                        </label>
                    </div>
                </div>

                {/* 파일 교체 안내 */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                    <p className="font-bold text-amber-800 mb-1">💡 직접 파일 교체로 즉시 반영하는 방법</p>
                    <p className="text-amber-700">
                        위 업로드 버튼을 사용하지 않고 프로젝트의 <code className="bg-amber-100 px-1 rounded">/public</code> 폴더 안에 직접 덮어쓰기 하셔도 됩니다 (각 3장씩 등록).
                    </p>
                    <ul className="mt-2 space-y-1 text-amber-800 font-mono text-xs">
                        <li>📁 <strong>/public/hero_1.png</strong>, <strong>hero_2.png</strong>, <strong>hero_3.png</strong> — 메인 히어로 이미지 (1000 × 1250 px, 4:5 비율)</li>
                        <li>📁 <strong>/public/story_1.png</strong>, <strong>story_2.png</strong>, <strong>story_3.png</strong> — 서브 스토리 이미지 (1920 × 1080 px, 16:9 비율)</li>
                    </ul>
                </div>

            </div>
        </div>
    );
}
