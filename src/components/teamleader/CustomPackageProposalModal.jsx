import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { translateError } from '../../lib/errorHandler';
import { XCircle, Plus, Trash2, CheckCircle, Save, AlertCircle } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';

export default function CustomPackageProposalModal({ isOpen, onClose, user, onSaved }) {
    const { showToast } = useNotification();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [feeAmount, setFeeAmount] = useState('');
    const [items, setItems] = useState([
        { id: 1, name: '', qty: 1, price: 0, total: 0 }
    ]);
    const [loading, setLoading] = useState(false);

    // 새 모달 열릴 때 초기화
    useEffect(() => {
        if (isOpen) {
            setName('');
            setDescription('');
            setFeeAmount('');
            setItems([{ id: 1, name: '', qty: 1, price: 0, total: 0 }]);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        let parsedValue = value;
        
        if (field === 'qty' || field === 'price') {
            parsedValue = parseInt(value.replace(/[^0-9]/g, ''), 10) || 0;
        }

        newItems[index] = { ...newItems[index], [field]: parsedValue };
        
        // Recalculate total if qty or price changed
        if (field === 'qty' || field === 'price') {
            newItems[index].total = newItems[index].qty * newItems[index].price;
        }
        
        setItems(newItems);
    };

    const handleAddItem = () => {
        setItems([...items, { id: Date.now(), name: '', qty: 1, price: 0, total: 0 }]);
    };

    const handleRemoveItem = (index) => {
        if (items.length <= 1) {
            showToast('warning', '삭제 불가', '최소 1개의 항목은 필요합니다.');
            return;
        }
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    const totalPrice = items.reduce((sum, item) => sum + item.total, 0);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!name.trim()) return showToast('warning', '제안 실패', '패키지 이름을 입력해주세요.');
        if (!description.trim()) return showToast('warning', '제안 실패', '패키지 설명을 입력해주세요.');
        if (items.some(item => !item.name.trim() || item.price <= 0)) {
            return showToast('warning', '제안 실패', '모든 항목의 이름과 단가를 정확히 입력해주세요.');
        }

        const fee = parseInt(feeAmount.toString().replace(/[^0-9]/g, ''), 10) || 0;
        if (fee <= 0) return showToast('warning', '제안 실패', '본사 납입 수수료를 입력해주세요.');
        if (fee >= totalPrice) return showToast('warning', '제안 실패', '납입 수수료가 총 판매액보다 클 수 없습니다.');

        if (!confirm(`총 판매가: ${totalPrice.toLocaleString()}원\n본사 수수료: ${fee.toLocaleString()}원\n\n위 내용으로 내 상품을 본사에 승인 제안하시겠습니까?`)) {
            return;
        }

        setLoading(true);
        try {
            // DB 항목에는 id 속성 없이 저장하기 위해 필터링
            const cleanItems = items.map(item => ({
                name: item.name,
                qty: item.qty,
                price: item.price,
                total: item.total
            }));

            const { error } = await supabase
                .from('custom_packages')
                .insert([{
                    team_leader_id: user.id,
                    name: name,
                    description: description,
                    items: cleanItems,
                    total_price: totalPrice,
                    fee_amount: fee,
                    status: 'pending' // 승인 대기
                }]);

            if (error) throw error;

            showToast('success', '제안 완료', '본사에 상품 승인을 요청했습니다. 승인 후 사용 가능합니다.');
            onSaved && onSaved();
            onClose();
        } catch (error) {
            console.error('Custom Package Insert Error:', error);
            showToast('error', '요청 실패', translateError(error));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-auto relative">
                
                {/* Header */}
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-indigo-600 text-white sticky top-0 z-10">
                    <div>
                        <h3 className="font-bold text-lg flex items-center gap-2">
                            <Plus className="w-5 h-5 text-indigo-200" />
                            내 상품 제안하기 (커스텀 패키지)
                        </h3>
                        <p className="text-xs text-indigo-200 mt-1">본사에 나만의 장례 상품을 역제안하고 승인 후 판매할 수 있습니다.</p>
                    </div>
                    <button onClick={onClose} disabled={loading} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                        <XCircle className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 bg-gray-50 flex flex-col gap-6 max-h-[75vh] overflow-y-auto">
                    
                    {/* Basic Info */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <h4 className="font-bold text-gray-800 border-b pb-2">기본 정보</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">패키지 이름</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="예: 무빈소 초가성비 패키지"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 mb-1">본사 납입 수수료 (원)</label>
                                <input
                                    type="text"
                                    value={feeAmount ? Number(feeAmount).toLocaleString() : ''}
                                    onChange={(e) => setFeeAmount(e.target.value)}
                                    placeholder="예: 300,000"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                />
                                <p className="text-[10px] text-gray-400 mt-1">제안 승인의 기준이 되며 딜러에겐 노출되지 않습니다.</p>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-600 mb-1">한 줄 설명</label>
                                <input
                                    type="text"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="예: 꼭 필요한 빈소 설치물만 제공하여 가성비를 높인 안심 패키지"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Excel-like Items Table */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-center border-b pb-2 mb-4">
                            <h4 className="font-bold text-gray-800">품목 구성표 (엑셀 형식)</h4>
                            <button
                                type="button"
                                onClick={handleAddItem}
                                className="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" /> 행 추가
                            </button>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead>
                                    <tr className="bg-gray-100/50 text-gray-600 border-b border-gray-200 text-xs">
                                        <th className="py-2 px-3 font-bold rounded-tl-lg">품목명 / 내역</th>
                                        <th className="py-2 px-3 font-bold w-full max-w-[80px]">수량</th>
                                        <th className="py-2 px-3 font-bold w-full max-w-[120px]">단가(원)</th>
                                        <th className="py-2 px-3 font-bold w-full max-w-[120px]">총 금액(원)</th>
                                        <th className="py-2 px-3 align-middle text-center rounded-tr-lg">삭제</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, index) => (
                                        <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.name}
                                                    onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                                                    placeholder="품목명 입력"
                                                    className="w-full min-w-[150px] border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.qty ? Number(item.qty).toLocaleString() : ''}
                                                    onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                                                    className="w-20 border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none font-mono text-right"
                                                />
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={item.price ? Number(item.price).toLocaleString() : ''}
                                                    onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                                                    className="w-28 border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none font-mono text-right"
                                                />
                                            </td>
                                            <td className="p-2 text-right font-mono font-bold text-indigo-700 bg-indigo-50/30">
                                                {item.total ? Number(item.total).toLocaleString() : '0'}
                                            </td>
                                            <td className="p-2 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveItem(index)}
                                                    className="text-gray-400 hover:text-red-500 p-1 bg-white hover:bg-red-50 rounded transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4 mx-auto" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Summary Footer */}
                        <div className="mt-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-2 text-indigo-800">
                                <AlertCircle className="w-5 h-5" />
                                <span className="text-sm font-bold">고객에게 노출되는 총 판매 가격</span>
                            </div>
                            <div className="text-xl font-black text-indigo-700 font-mono">
                                {totalPrice.toLocaleString()} <span className="text-sm font-bold">원</span>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 sticky bottom-0 bg-gray-50 pb-2">
                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all 
                                ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-[0.98]'}`}
                        >
                            {loading ? (
                                <span className="animate-pulse">처리 중...</span>
                            ) : (
                                <>
                                    <Save className="w-5 h-5" />
                                    [본사 검토 요청] 상품 제안 완료하기
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
