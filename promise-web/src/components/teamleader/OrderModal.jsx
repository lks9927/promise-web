import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNotification } from '../../contexts/NotificationContext';
import { X, ShoppingCart, Plus, Minus, Trash2, FileText, Truck, Package, Flower, Building } from 'lucide-react';

const BUSINESS_TYPE_LABELS = {
    all: { label: '종합 (용품/입관꽃/화환)', icon: '🌟', color: 'indigo' },
    flowers: { label: '입관꽃', icon: '🌸', color: 'pink' },
    wreaths: { label: '근조화환', icon: '💐', color: 'emerald' },
    goods: { label: '장례용품', icon: '📦', color: 'amber' },
    burial: { label: '장지(납골당/수목장)', icon: '🌿', color: 'green' },
    other: { label: '기타', icon: '🏢', color: 'gray' },
};

export default function OrderModal({ isOpen, onClose, caseData, teamLeaderId }) {
    const { showToast } = useNotification();
    const [vendors, setVendors] = useState([]);
    const [selectedVendor, setSelectedVendor] = useState(null);
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]); // { product, quantity }
    const [deliveryNote, setDeliveryNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [step, setStep] = useState('vendor'); // 'vendor' | 'products' | 'confirm'

    useEffect(() => {
        if (isOpen) {
            fetchVendors();
            setCart([]);
            setStep('vendor');
            setSelectedVendor(null);
        }
    }, [isOpen]);

    const fetchVendors = async () => {
        const { data } = await supabase
            .from('vendors')
            .select('*')
            .eq('status', 'approved')
            .order('business_type');
        setVendors(data || []);
    };

    const handleSelectVendor = async (vendor) => {
        setSelectedVendor(vendor);
        const { data } = await supabase
            .from('vendor_products')
            .select('*')
            .eq('vendor_id', vendor.id)
            .eq('is_active', true)
            .order('category');
        setProducts(data || []);
        setStep('products');
    };

    const addToCart = (product) => {
        setCart(prev => {
            const existing = prev.find(c => c.product.id === product.id);
            if (existing) {
                return prev.map(c => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c);
            }
            return [...prev, { product, quantity: 1 }];
        });
    };

    const updateQty = (productId, delta) => {
        setCart(prev =>
            prev.map(c => c.product.id === productId
                ? { ...c, quantity: Math.max(1, c.quantity + delta) }
                : c
            )
        );
    };

    const removeFromCart = (productId) => {
        setCart(prev => prev.filter(c => c.product.id !== productId));
    };

    const totalAmount = cart.reduce((sum, c) => sum + c.product.price * c.quantity, 0);

    const handleSubmitOrder = async () => {
        if (cart.length === 0) return showToast('error', '상품 없음', '상품을 선택해주세요.');
        setSubmitting(true);
        try {
            // 1. 발주서 생성
            const { data: order, error: orderErr } = await supabase
                .from('orders')
                .insert({
                    case_id: caseData.id,
                    team_leader_id: teamLeaderId,
                    vendor_id: selectedVendor.id,
                    total_amount: totalAmount,
                    delivery_address: caseData.location || '',
                    delivery_note: deliveryNote || `고인명: ${caseData.deceased_name || '-'}\n장례식장: ${caseData.location || '-'}\n입관: ${caseData.encoffinment_time ? new Date(caseData.encoffinment_time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '미정'}\n발인: ${caseData.funeral_end_time ? new Date(caseData.funeral_end_time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '미정'}`,
                    status: 'pending'
                })
                .select()
                .single();
            if (orderErr) throw orderErr;

            // 2. 발주 항목 삽입
            const items = cart.map(c => ({
                order_id: order.id,
                product_id: c.product.id,
                product_name: c.product.product_name,
                unit_price: c.product.price,
                quantity: c.quantity,
                unit: c.product.unit || '개',
            }));
            const { error: itemErr } = await supabase.from('order_items').insert(items);
            if (itemErr) throw itemErr;

            // 3. 외주업체에 알림 발송
            await supabase.from('notifications').insert({
                user_id: selectedVendor.user_id,
                title: '신규 발주서 도착',
                body: `[${order.order_number}] ${caseData.location || '장소미정'}에서 발주서가 도착했습니다. 총 ${totalAmount.toLocaleString()}원`,
                type: 'order',
                related_id: order.id,
            });

            showToast('success', '발주 완료', `발주번호 ${order.order_number} 발송되었습니다.`);
            onClose();
        } catch (err) {
            showToast('error', '발주 실패', err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-blue-600" />
                        <div>
                            <h2 className="font-bold text-gray-900">외주 발주서 작성</h2>
                            <p className="text-xs text-gray-400">
                                {step === 'vendor' && '업체 선택'}
                                {step === 'products' && `${selectedVendor?.company_name} · 상품 선택`}
                                {step === 'confirm' && '발주서 확인'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Progress */}
                <div className="flex px-5 pt-3 gap-2">
                    {['vendor', 'products', 'confirm'].map((s, i) => (
                        <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${step === s || (step === 'confirm' && i < 2) || (step === 'products' && i < 1)
                            ? 'bg-blue-500' : 'bg-gray-100'
                            }`} />
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">

                    {/* Step 1: 업체 선택 */}
                    {step === 'vendor' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-500 font-medium">발주할 업체를 선택하세요</p>
                            {Object.entries(BUSINESS_TYPE_LABELS).map(([type, info]) => {
                                const typeVendors = vendors.filter(v => v.business_type === type);
                                if (typeVendors.length === 0) return null;
                                return (
                                    <div key={type}>
                                        <p className="text-xs font-bold text-gray-400 mb-2">{info.icon} {info.label}</p>
                                        {typeVendors.map(vendor => (
                                            <button
                                                key={vendor.id}
                                                onClick={() => handleSelectVendor(vendor)}
                                                className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition-all mb-2"
                                            >
                                                <div className="text-left">
                                                    <p className="font-bold text-gray-800">{vendor.company_name}</p>
                                                    <p className="text-xs text-gray-400">{vendor.phone}</p>
                                                </div>
                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">승인완료</span>
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                            {vendors.length === 0 && (
                                <div className="text-center py-10 text-gray-400">
                                    <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">등록된 외주업체가 없습니다.</p>
                                    <p className="text-xs mt-1">관리자에게 문의하세요.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: 상품 선택 */}
                    {step === 'products' && (
                        <div className="space-y-2">
                            <p className="text-sm text-gray-500 font-medium">상품을 선택하세요 (복수 선택 가능)</p>
                            {products.length === 0 && (
                                <p className="text-center text-gray-400 py-8 text-sm">등록된 상품이 없습니다.</p>
                            )}
                            {products.map(product => {
                                const cartItem = cart.find(c => c.product.id === product.id);
                                return (
                                    <div key={product.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-gray-800 text-sm truncate">{product.product_name}</p>
                                            <p className="text-xs text-gray-400">{product.category} · {product.unit}</p>
                                            <p className="text-sm font-bold text-blue-600">{product.price.toLocaleString()}원</p>
                                        </div>
                                        {cartItem ? (
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => updateQty(product.id, -1)} className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center">
                                                    <Minus className="w-3 h-3" />
                                                </button>
                                                <span className="w-6 text-center font-bold text-sm">{cartItem.quantity}</span>
                                                <button onClick={() => updateQty(product.id, 1)} className="w-7 h-7 bg-blue-500 text-white rounded-full flex items-center justify-center">
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                                <button onClick={() => removeFromCart(product.id)} className="w-7 h-7 bg-red-100 text-red-500 rounded-full flex items-center justify-center ml-1">
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={() => addToCart(product)} className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg hover:bg-blue-100">
                                                + 추가
                                            </button>
                                        )}
                                    </div>
                                );
                            })}

                            {/* 장바구니 요약 */}
                            {cart.length > 0 && (
                                <div className="bg-blue-50 rounded-xl p-3 mt-2">
                                    <p className="text-xs font-bold text-blue-700 mb-1">선택 항목 {cart.length}건</p>
                                    {cart.map(c => (
                                        <p key={c.product.id} className="text-xs text-blue-600">
                                            · {c.product.product_name} × {c.quantity}{c.product.unit} = {(c.product.price * c.quantity).toLocaleString()}원
                                        </p>
                                    ))}
                                    <p className="text-sm font-bold text-blue-800 mt-1 pt-1 border-t border-blue-200">
                                        합계: {totalAmount.toLocaleString()}원
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: 발주서 확인 */}
                    {step === 'confirm' && (
                        <div className="space-y-4">
                            {/* 발주 정보 */}
                            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                                <p className="font-bold text-gray-700 flex items-center gap-1">
                                    <FileText className="w-4 h-4" /> 발주 정보
                                </p>
                                <div className="flex justify-between text-gray-600">
                                    <span>업체명</span>
                                    <span className="font-bold">{selectedVendor?.company_name}</span>
                                </div>
                                <div className="flex justify-between text-gray-600">
                                    <span>납품 장소</span>
                                    <span className="font-bold">{caseData?.location || '미정'}</span>
                                </div>
                                <div className="flex justify-between text-gray-600">
                                    <span>고인명</span>
                                    <span className="font-bold">{caseData?.deceased_name || '미입력'}</span>
                                </div>
                                <div className="flex justify-between text-gray-600">
                                    <span>입관 일시</span>
                                    <span className="font-bold">{caseData?.encoffinment_time ? new Date(caseData.encoffinment_time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '미정'}</span>
                                </div>
                                <div className="flex justify-between text-gray-600">
                                    <span>발인 일시</span>
                                    <span className="font-bold">{caseData?.funeral_end_time ? new Date(caseData.funeral_end_time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '미정'}</span>
                                </div>
                            </div>

                            {/* 발주 항목 */}
                            <div className="space-y-2">
                                <p className="font-bold text-gray-700 text-sm flex items-center gap-1">
                                    <ShoppingCart className="w-4 h-4" /> 발주 항목
                                </p>
                                {cart.map(c => (
                                    <div key={c.product.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg text-sm">
                                        <span className="text-gray-700">{c.product.product_name} × {c.quantity}{c.product.unit}</span>
                                        <span className="font-bold">{(c.product.price * c.quantity).toLocaleString()}원</span>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                                    <span className="font-bold text-blue-800">총 발주금액</span>
                                    <span className="font-black text-blue-700 text-lg">{totalAmount.toLocaleString()}원</span>
                                </div>
                            </div>

                            {/* 특이사항 */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 block mb-1">납품 특이사항 (선택)</label>
                                <textarea
                                    value={deliveryNote}
                                    onChange={e => setDeliveryNote(e.target.value)}
                                    placeholder={`고인명: ${caseData?.deceased_name || '-'}\n장례식장: ${caseData?.location || '-'}\n입관: ${caseData?.encoffinment_time ? new Date(caseData.encoffinment_time).toLocaleString() : '미정'}\n발인: ${caseData?.funeral_end_time ? new Date(caseData.funeral_end_time).toLocaleString() : '미정'}\n기타 납품 시 참고사항을 입력하세요.`}
                                    rows={4}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="p-5 border-t border-gray-100 space-y-2">
                    {step === 'vendor' && (
                        <button onClick={onClose} className="w-full py-3 bg-gray-100 text-gray-600 font-bold rounded-xl">취소</button>
                    )}
                    {step === 'products' && (
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => { setStep('vendor'); setCart([]); }} className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm">← 업체 변경</button>
                            <button
                                onClick={() => { if (cart.length === 0) return showToast('error', '상품 없음', '상품을 선택해주세요.'); setStep('confirm'); }}
                                className="py-3 bg-blue-600 text-white font-bold rounded-xl text-sm"
                            >
                                발주서 확인 →
                            </button>
                        </div>
                    )}
                    {step === 'confirm' && (
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setStep('products')} className="py-3 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm">← 수정</button>
                            <button
                                onClick={handleSubmitOrder}
                                disabled={submitting}
                                className="py-3 bg-blue-600 text-white font-bold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-1"
                            >
                                <Truck className="w-4 h-4" />
                                {submitting ? '발주 중...' : '발주서 전송'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
