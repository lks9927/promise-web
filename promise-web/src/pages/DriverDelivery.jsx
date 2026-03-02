import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Camera, CheckCircle, Package, MapPin, Phone, Truck, AlertCircle, Navigation } from 'lucide-react';
import { useNotification } from '../contexts/NotificationContext';

export default function DriverDelivery() {
    const { orderId } = useParams();
    const { showToast } = useNotification();
    const [order, setOrder] = useState(null);
    const [drivers, setDrivers] = useState([]);
    const [vendorUser, setVendorUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('loading'); // loading | ready | completing | success | error | not_found

    // Form states
    const [selectedDriverId, setSelectedDriverId] = useState('');
    const [deliveryPhoto, setDeliveryPhoto] = useState(null);
    const [notes, setNotes] = useState('');
    const photoRef = useRef();

    useEffect(() => {
        fetchOrderData();
    }, [orderId]);

    const fetchOrderData = async () => {
        try {
            const { data: orderData, error: orderErr } = await supabase
                .from('orders')
                .select(`
                    *,
                    funeral_cases ( location, deceased_name, room_number, encoffinment_time, funeral_end_time ),
                    vendor:vendor_id ( id, company_name, user_id, phone ),
                    team_leader:team_leader_id ( name, phone )
                `)
                .eq('id', orderId)
                .single();

            if (orderErr) throw orderErr;
            if (!orderData) {
                setStatus('not_found');
                return;
            }

            setOrder(orderData);
            setVendorUser(orderData.vendor.user_id);

            if (orderData.status === 'delivered') {
                setStatus('success');
            } else {
                setStatus('ready');
                // Fetch drivers for this vendor
                const { data: driverData } = await supabase
                    .from('delivery_drivers')
                    .select('*')
                    .eq('vendor_id', orderData.vendor.id)
                    .eq('is_active', true);
                setDrivers(driverData || []);
            }
        } catch (err) {
            console.error(err);
            setStatus('error');
        } finally {
            setLoading(false);
        }
    };

    const handleNavigation = () => {
        if (!order?.funeral_cases?.location) {
            return showToast('error', '길찾기 오류', '장례식장 주소 정보가 없습니다.');
        }
        const address = encodeURIComponent(order.funeral_cases.location);
        const url = `https://map.kakao.com/link/search/${address}`;
        window.open(url, '_blank');
    };

    const handleComplete = async () => {
        if (!selectedDriverId && drivers.length > 0) return showToast('error', '기사 선택', '본인의 이름을 선택해주세요.');
        if (!deliveryPhoto) return showToast('error', '사진 등록', '배송 완료 증빙 사진을 등록해주세요.');

        setStatus('completing');
        try {
            let photoUrl = null;

            // 1. 배송 사진 업로드
            const fileName = `delivery/${order.id}_${Date.now()}.jpg`;
            const { data: uploadData, error: uploadErr } = await supabase.storage
                .from('reports')
                .upload(fileName, deliveryPhoto, { upsert: true });

            if (uploadErr) throw uploadErr;

            const { data: urlData } = supabase.storage.from('reports').getPublicUrl(fileName);
            photoUrl = urlData.publicUrl;

            // 선택된 기사 정보 (없으면 직접입력 형태가 될 수 있으나 현재는 드롭다운만 제공)
            const selectedDriver = drivers.find(d => d.id === selectedDriverId);

            // 2. 납품(배송) 기록 인서트
            await supabase.from('deliveries').insert({
                order_id: order.id,
                driver_id: selectedDriver ? selectedDriver.id : null,
                driver_name: selectedDriver ? selectedDriver.name : '미확인 기사',
                status: 'delivered',
                delivery_photo_url: photoUrl,
                notes,
                completed_at: new Date().toISOString(),
            });

            // 3. 발주서 상태 업데이트
            await supabase.from('orders').update({
                status: 'delivered',
                delivered_at: new Date().toISOString()
            }).eq('id', order.id);

            // 4. 팀장 및 외주업체 대표에게 알람 발송
            const driverNameForNotif = selectedDriver ? selectedDriver.name : '배송기사';
            const notifications = [
                {
                    user_id: order.team_leader_id, // 팀장
                    title: '납품 완료 알림 🚚',
                    body: `[${order.order_number}] ${order.vendor.company_name}에서 장례식장으로 납품이 완료되었습니다. (배송완료: ${driverNameForNotif})`,
                    type: 'delivery',
                    related_id: order.id,
                },
                {
                    user_id: vendorUser, // 외주업체 대표
                    title: '배송기사 납품 완료 확인 ✅',
                    body: `[${order.order_number}] 배송기사(${driverNameForNotif})가 납품 완료 처리를 하였습니다.`,
                    type: 'delivery',
                    related_id: order.id,
                }
            ];

            await supabase.from('notifications').insert(notifications);

            setStatus('success');
            showToast('success', '배송 완료', '수고하셨습니다! 처리가 완료되었습니다.');
        } catch (err) {
            console.error(err);
            showToast('error', '처리 실패', err.message);
            setStatus('ready');
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500 font-bold">로딩 중...</p></div>;
    }

    if (status === 'error' || status === 'not_found') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
                <div className="bg-white p-8 rounded-2xl shadow text-center max-w-sm w-full">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="font-bold text-gray-800 text-lg mb-2">접근 오류</h2>
                    <p className="text-gray-500 text-sm">유효하지 않은 배송 링크입니다.</p>
                </div>
            </div>
        );
    }

    if (status === 'success') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
                <div className="bg-white p-8 rounded-2xl shadow text-center max-w-sm w-full">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h2 className="font-bold text-gray-800 text-xl mb-2">배송이 완료되었습니다</h2>
                    <p className="text-gray-500 text-sm">팀장 및 소속 업체 대표에게<br />알림이 성공적으로 발송되었습니다.</p>
                    <p className="text-xs font-bold text-blue-500 mt-6 mt-4">수고하셨습니다 👏</p>
                </div>
            </div>
        );
    }

    const { funeral_cases: fc, vendor, team_leader } = order;

    return (
        <div className="min-h-screen bg-gray-100 pb-20">
            {/* Header */}
            <div className="bg-white shadow-sm p-4 sticky top-0 z-10 flex items-center justify-between">
                <div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mb-1 inline-block">외주업체 배송 업무</span>
                    <h1 className="font-black text-gray-900 text-lg">{vendor?.company_name}</h1>
                </div>
                <Truck className="w-6 h-6 text-gray-400" />
            </div>

            <div className="p-4 space-y-4 max-w-lg mx-auto">
                {/* 배송지 정보 */}
                <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2 border-b border-gray-100 pb-3">
                        <MapPin className="w-5 h-5 text-red-500" />
                        배송지 정보
                    </h2>
                    <div className="space-y-4 text-sm mt-1">
                        <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                            <p className="flex items-start gap-2 text-gray-700 flex-1">
                                <span className="font-bold min-w-[55px] text-gray-500 mt-0.5">장례식장</span>
                                <strong className="text-base text-gray-900 leading-snug">{fc?.location || '미정'}</strong>
                            </p>
                            <button onClick={handleNavigation} className="flex shrink-0 items-center justify-center gap-1.5 px-3 py-2 bg-[#FEE500] hover:bg-[#F4DC00] text-[#191919] text-xs font-black rounded-xl transition-transform active:scale-95 shadow-sm">
                                <Navigation className="w-3.5 h-3.5 fill-[#191919]" />
                                길찾기
                            </button>
                        </div>
                        <p className="flex items-start gap-2 text-gray-700 mt-3 pt-1">
                            <span className="font-bold min-w-[60px] text-gray-500">고인명</span>
                            <span>{fc?.deceased_name || '미입력'}</span>
                        </p>
                        <p className="flex items-start gap-2 text-gray-700">
                            <span className="font-bold min-w-[60px] text-gray-500">입관일시</span>
                            <span className="text-blue-600 font-bold">{fc?.encoffinment_time ? new Date(fc.encoffinment_time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '미정'}</span>
                        </p>
                        <p className="flex items-start gap-2 text-gray-700">
                            <span className="font-bold min-w-[60px] text-gray-500">도착메모</span>
                            <span className="text-red-600 bg-red-50 px-2 py-1 flex-1 rounded text-xs whitespace-pre-wrap">{order.delivery_note || '-'}</span>
                        </p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                        <div className="text-sm">
                            <p className="text-gray-500 font-bold text-xs mb-0.5">현장 담당 팀장</p>
                            <p className="font-bold text-gray-800">{team_leader?.name} <span className="text-gray-500 font-normal">({team_leader?.phone})</span></p>
                        </div>
                        <a href={`tel:${team_leader?.phone}`} className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0">
                            <Phone className="w-4 h-4" /> 통화
                        </a>
                    </div>
                </div>

                {/* 주문 번호 및 금액 */}
                <div className="flex bg-white rounded-2xl p-4 shadow-sm items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-400 font-bold">발주번호</p>
                        <p className="font-bold text-gray-800 text-sm">{order.order_number}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-400 font-bold">결제 금액(총액)</p>
                        <p className="font-black text-blue-600 text-lg">{order.total_amount?.toLocaleString()}원</p>
                    </div>
                </div>

                {/* 배송 완료 폼 */}
                <div className="bg-white rounded-2xl p-5 shadow-sm space-y-5">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2 border-b border-gray-100 pb-3">
                        <Package className="w-5 h-5 text-blue-500" />
                        배송 완료 처리
                    </h2>

                    {drivers.length > 0 && (
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">1. 배송기사 확인</label>
                            <select
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-gray-800 text-sm appearance-none"
                                value={selectedDriverId}
                                onChange={e => setSelectedDriverId(e.target.value)}
                            >
                                <option value="">본인 이름을 선택해주세요</option>
                                {drivers.map(d => (
                                    <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">2. 배송 완료 증빙 (필수)</label>
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            ref={photoRef}
                            onChange={(e) => setDeliveryPhoto(e.target.files[0])}
                        />
                        {deliveryPhoto ? (
                            <div className="relative rounded-xl overflow-hidden border border-gray-200 h-40">
                                <img src={URL.createObjectURL(deliveryPhoto)} alt="배송 완료" className="w-full h-full object-cover" />
                                <button
                                    onClick={() => setDeliveryPhoto(null)}
                                    className="absolute top-2 right-2 bg-black/60 text-white px-3 py-1 text-xs font-bold rounded-full"
                                >
                                    다시 찍기
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => photoRef.current?.click()}
                                className="w-full p-6 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-blue-400 transition-colors"
                            >
                                <Camera className="w-10 h-10 mb-2 text-gray-400" />
                                <span className="font-bold text-sm">카메라 아이콘을 눌러주세요</span>
                                <span className="text-xs text-gray-400 mt-1">현장 사진을 촬영하여 첨부합니다</span>
                            </button>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">3. 특이사항 메모 (선택)</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="예: 201호 빈소 앞에 두었습니다."
                            className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
                            rows={3}
                        />
                    </div>

                    <button
                        onClick={handleComplete}
                        disabled={status === 'completing'}
                        className="w-full py-4 mt-2 bg-blue-600 text-white font-black text-lg rounded-xl shadow-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {status === 'completing' ? '처리 중...' : (
                            <>
                                <CheckCircle className="w-6 h-6" /> 완료 보고 및 알람 전송
                            </>
                        )}
                    </button>
                    <p className="text-center text-xs text-gray-400 mt-3 flex items-center justify-center gap-1">
                        <AlertCircle className="w-4 h-4" /> 버튼을 누르면 팀장 및 소속 업체 대표에게 즉시 알림이 갑니다
                    </p>
                </div>
            </div>
        </div>
    );
}
