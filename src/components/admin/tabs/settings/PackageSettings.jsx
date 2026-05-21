import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { useNotification } from '../../../../contexts/NotificationContext';
import { supabase } from '../../../../lib/supabase';

export function PackageSettings({ config, onUpdate }) {
    const { showToast } = useNotification();
    const [packages, setPackages] = useState([]);

    useEffect(() => {
        try {
            if (config.funeral_packages) {
                setPackages(JSON.parse(config.funeral_packages));
            } else {
                setPackages([
                    { value: '기본형', label: '기본형 (390만원)' },
                    { value: '고급형', label: '고급형 (490만원)' },
                    { value: '프리미엄', label: '프리미엄 (590만원)' },
                    { value: 'VIP', label: 'VIP (790만원)' }
                ]);
            }
        } catch (e) { console.error('Error parsing packages'); }
    }, [config.funeral_packages]);

    const handleSave = async (newPackages) => {
        const value = JSON.stringify(newPackages);
        await supabase.from('system_config').upsert({ key: 'funeral_packages', value });
        showToast('success', '저장 완료', '상품 목록이 업데이트 되었습니다.');
        onUpdate();
    };

    const addPackage = () => {
        setPackages([...packages, { value: '', label: '' }]);
    };

    const removePackage = (index) => {
        const newArr = packages.filter((_, i) => i !== index);
        setPackages(newArr);
    };

    const handleChange = (index, field, val) => {
        const newArr = [...packages];
        newArr[index][field] = val;
        setPackages(newArr);
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600" /> 희망 상품 목록 관리
            </h4>
            <div className="space-y-3 mb-4">
                {packages.map((pkg, idx) => (
                    <div key={idx} className="flex gap-2">
                        <input
                            type="text"
                            placeholder="값 (예: 기본형)"
                            className="flex-1 px-3 py-2 border rounded"
                            value={pkg.value}
                            onChange={(e) => handleChange(idx, 'value', e.target.value)}
                        />
                        <input
                            type="text"
                            placeholder="표시명 (예: 기본형 (390만원))"
                            className="flex-1 px-3 py-2 border rounded"
                            value={pkg.label}
                            onChange={(e) => handleChange(idx, 'label', e.target.value)}
                        />
                        <button onClick={() => removePackage(idx)} className="px-3 py-2 bg-red-100 text-red-600 rounded hover:bg-red-200">
                            삭제
                        </button>
                    </div>
                ))}
            </div>
            <div className="flex justify-between">
                <button onClick={addPackage} className="px-4 py-2 border border-indigo-600 text-indigo-600 rounded hover:bg-indigo-50 font-bold">
                    + 항목 추가
                </button>
                <button onClick={() => handleSave(packages)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-bold">
                    저장하기
                </button>
            </div>
        </div>
    );
}
