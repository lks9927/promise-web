import React, { useState } from 'react';
import { Package, CheckCircle, XCircle } from 'lucide-react';
import { translateError } from '../../../lib/errorHandler';

const BUSINESS_TYPE_LABELS_ADMIN = {
    flowers: '🌸 입관꽃',
    goods: '📦 장례용품',
    burial: '🌿 장지업체',
    other: '🏢 기타',
};

export default function VendorPanel({ vendors, onRefresh, supabase, showToast, isReadonly }) {
    const [filter, setFilter] = useState('pending');
    const [rejectModal, setRejectModal] = useState({ isOpen: false, vendorId: null, reason: '' });
    const [approveModal, setApproveModal] = useState({ isOpen: false, vendorId: null, taxType: 'vat_10' });

    const filtered = filter === 'all' ? vendors : vendors.filter(v => v.status === filter);

    const handleApprove = async () => {
        const { vendorId, taxType } = approveModal;
        const { error } = await supabase
            .from('vendors')
            .update({ status: 'approved', approved_at: new Date().toISOString(), tax_type: taxType })
            .eq('id', vendorId);
        if (error) return showToast('error', '오류', translateError(error));
        showToast('success', '승인 완료', `외주업체가 ${taxType === 'tax_free' ? '면세' : '부가세(10%)'} 업체로 승인되었습니다.`);
        setApproveModal({ isOpen: false, vendorId: null, taxType: 'vat_10' });
        onRefresh();
    };

    const handleReject = async () => {
        const { error } = await supabase
            .from('vendors')
            .update({ status: 'rejected', rejection_reason: rejectModal.reason })
            .eq('id', rejectModal.vendorId);
        if (error) return showToast('error', '오류', translateError(error));
        showToast('success', '반려 완료', '업체 신청이 반려되었습니다.');
        setRejectModal({ isOpen: false, vendorId: null, reason: '' });
        onRefresh();
    };

    const handleSuspend = async (vendorId) => {
        if (!confirm('이 업체를 일시정지 하시겠습니까?')) return;
        await supabase.from('vendors').update({ status: 'suspended' }).eq('id', vendorId);
        showToast('success', '정지', '업체가 일시정지 처리되었습니다.');
        onRefresh();
    };

    return (
        <div className="p-6 space-y-4">
            {/* 필터 탭 */}
            <div className="flex gap-2 flex-wrap">
                {[
                    { id: 'pending', label: '⏳ 승인 대기', color: 'orange' },
                    { id: 'approved', label: '✅ 승인됨', color: 'green' },
                    { id: 'rejected', label: '❌ 반려됨', color: 'red' },
                    { id: 'suspended', label: '🚫 정지됨', color: 'gray' },
                    { id: 'all', label: '전체', color: 'indigo' },
                ].map(f => (
                    <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${filter === f.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        {f.label}
                        {f.id === 'pending' && vendors.filter(v => v.status === 'pending').length > 0 && (
                            <span className="ml-2 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">
                                {vendors.filter(v => v.status === 'pending').length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {filtered.length === 0 && (
                <div className="text-center py-14 text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">해당 상태의 업체가 없습니다.</p>
                </div>
            )}

            <div className="space-y-3">
                {filtered.map(vendor => (
                    <div key={vendor.id} className="bg-gray-50 rounded-xl border border-gray-200 p-5">
                        <div className="flex justify-between items-start flex-wrap gap-3">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-bold text-gray-900 text-lg">{vendor.company_name}</h4>
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                                        {BUSINESS_TYPE_LABELS_ADMIN[vendor.business_type] || vendor.business_type}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${vendor.tax_type === 'tax_free' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {vendor.tax_type === 'tax_free' ? '🌿 면세' : '🧾 부가세(10%)'}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${vendor.status === 'approved' ? 'bg-green-100 text-green-700' :
                                        vendor.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                                            vendor.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-600'
                                        }`}>
                                        {vendor.status === 'approved' ? '✅ 승인' :
                                            vendor.status === 'pending' ? '⏳ 대기' :
                                                vendor.status === 'rejected' ? '❌ 반려' : '🚫 정지'}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500">
                                    담당자: {vendor.profiles?.name || '-'} · {vendor.phone || vendor.profiles?.phone || '-'}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    신청일: {new Date(vendor.created_at).toLocaleDateString()}
                                    {vendor.address && ` · ${vendor.address}`}
                                </p>
                                {vendor.rejection_reason && (
                                    <p className="text-xs text-red-500 mt-1">반려 사유: {vendor.rejection_reason}</p>
                                )}
                            </div>

                            <div className="flex gap-2 flex-wrap">
                                {!isReadonly && vendor.status === 'pending' && (
                                    <>
                                        <button
                                            onClick={() => setApproveModal({ isOpen: true, vendorId: vendor.id, taxType: vendor.business_type === 'flowers' ? 'tax_free' : 'vat_10' })}
                                            className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1"
                                        >
                                            <CheckCircle className="w-4 h-4" /> 승인
                                        </button>
                                        <button
                                            onClick={() => setRejectModal({ isOpen: true, vendorId: vendor.id, reason: '' })}
                                            className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 text-sm font-bold rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1"
                                        >
                                            <XCircle className="w-4 h-4" /> 반려
                                        </button>
                                    </>
                                )}
                                {!isReadonly && vendor.status === 'approved' && (
                                    <button
                                        onClick={() => handleSuspend(vendor.id)}
                                        className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-bold rounded-lg hover:bg-gray-200 transition-colors"
                                    >
                                        🚫 일시정지
                                    </button>
                                )}
                                {!isReadonly && (vendor.status === 'rejected' || vendor.status === 'suspended') && (
                                    <button
                                        onClick={() => setApproveModal({ isOpen: true, vendorId: vendor.id, taxType: vendor.tax_type || 'vat_10' })}
                                        className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 text-sm font-bold rounded-lg hover:bg-green-100 transition-colors"
                                    >
                                        ✅ 재승인
                                    </button>
                                )}
                                {isReadonly && (
                                    <span className="text-xs text-gray-400 flex items-center gap-1">🔒 열람 전용</span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* 반려 사유 모달 */}
            {rejectModal.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
                        <h3 className="font-bold text-gray-900">반려 사유 입력</h3>
                        <textarea
                            value={rejectModal.reason}
                            onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
                            placeholder="반려 사유를 입력하세요 (업체에게 안내됩니다)"
                            rows={3}
                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none outline-none"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => setRejectModal({ isOpen: false, vendorId: null, reason: '' })}
                                className="flex-1 py-2.5 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleReject}
                                className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl text-sm"
                            >
                                반려 처리
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 승인 모달 (세금 유형 선택) */}
            {approveModal.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
                        <h3 className="font-bold text-gray-900 text-lg">🏢 업체 승인 — 세금 유형 선택</h3>
                        <p className="text-sm text-gray-500">이 업체의 세금 유형을 선택해주세요. 이후 정산 시 자동으로 적용됩니다.</p>
                        
                        <div className="space-y-2">
                            <label 
                                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                    approveModal.taxType === 'vat_10' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'
                                }`}
                                onClick={() => setApproveModal({...approveModal, taxType: 'vat_10'})}
                            >
                                <input type="radio" name="taxType" checked={approveModal.taxType === 'vat_10'} readOnly className="accent-amber-600" />
                                <div>
                                    <div className="font-bold text-gray-900">🧾 부가세 10% (일반과세)</div>
                                    <div className="text-xs text-gray-500">장례용품, 리무진, 영정사진 등 일반 사업자</div>
                                </div>
                            </label>
                            <label 
                                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                    approveModal.taxType === 'tax_free' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                                }`}
                                onClick={() => setApproveModal({...approveModal, taxType: 'tax_free'})}
                            >
                                <input type="radio" name="taxType" checked={approveModal.taxType === 'tax_free'} readOnly className="accent-emerald-600" />
                                <div>
                                    <div className="font-bold text-gray-900">🌿 면세 (0%)</div>
                                    <div className="text-xs text-gray-500">꽃집, 화환, 근조 바구니 등 면세 사업자</div>
                                </div>
                            </label>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setApproveModal({ isOpen: false, vendorId: null, taxType: 'vat_10' })}
                                className="flex-1 py-2.5 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleApprove}
                                className="flex-1 py-2.5 bg-green-600 text-white font-bold rounded-xl text-sm hover:bg-green-700"
                            >
                                ✅ 승인 완료
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
