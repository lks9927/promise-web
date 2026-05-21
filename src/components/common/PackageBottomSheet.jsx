import React, { useEffect } from 'react';
import { X, CheckCircle2 } from 'lucide-react';

/**
 * PackageBottomSheet
 * props:
 *   isOpen  - boolean
 *   onClose - fn
 *   pkg     - { value, label, items: string[], active }
 */
export default function PackageBottomSheet({ isOpen, onClose, pkg }) {
    // 열릴 때 body 스크롤 잠금
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    if (!pkg) return null;

    return (
        <>
            {/* 배경 오버레이 */}
            <div
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            {/* 바텀시트 */}
            <div
                className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-out
                    ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
                style={{ maxHeight: '85vh' }}
            >
                {/* 핸들바 */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 bg-gray-300 rounded-full" />
                </div>

                {/* 헤더 */}
                <div className="flex items-start justify-between px-6 pt-3 pb-4 border-b border-gray-100">
                    <div>
                        <p className="text-xs text-indigo-500 font-bold uppercase tracking-wide mb-0.5">상품 구성</p>
                        <h2 className="text-xl font-black text-gray-900">{pkg.label || pkg.value}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 transition-colors mt-1"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* 항목 리스트 */}
                <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: 'calc(85vh - 130px)' }}>
                    {pkg.items && pkg.items.length > 0 ? (
                        <ul className="space-y-3">
                            {pkg.items.map((item, i) => (
                                <li key={i} className="flex items-start gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center mt-0.5">
                                        {i + 1}
                                    </span>
                                    <span className="text-gray-700 text-sm leading-relaxed pt-0.5">{typeof item === 'string' ? item : item.name}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="py-10 text-center text-gray-400 text-sm">
                            등록된 항목이 없습니다
                        </div>
                    )}

                    {/* 하단 안내 */}
                    {pkg.items?.length > 0 && (
                        <div className="mt-6 p-4 bg-indigo-50 rounded-2xl">
                            <div className="flex items-center gap-2 text-indigo-700 text-xs font-bold">
                                <CheckCircle2 className="w-4 h-4" />
                                위 항목이 모두 포함된 패키지입니다
                            </div>
                            <p className="text-xs text-indigo-500 mt-1 ml-6">
                                무빈소 장례 기준 / 빈소 이용 시 상담 후 조정
                            </p>
                        </div>
                    )}

                    {/* 아이폰 홈바 여백 */}
                    <div className="h-8" />
                </div>
            </div>
        </>
    );
}
