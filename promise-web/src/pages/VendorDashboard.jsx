import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useNotification } from '../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import {
    Package, Plus, Edit2, Trash2, Truck, CheckCircle,
    Camera, Bell, Users, LogOut, X, Save, AlertCircle, ClipboardList, Link as LinkIcon, Copy,
    Printer, Map
} from 'lucide-react';

const BUSINESS_TYPE_LABELS = {
    all: '🌟 종합 (장례용품/입관꽃/화환)',
    flowers: '🌸 입관꽃',
    wreaths: '💐 근조화환',
    goods: '📦 장례용품',
    burial: '🌿 장지업체',
    other: '🏢 기타',
};

const STATUS_LABELS = {
    pending: { text: '발주 대기', color: 'orange' },
    confirmed: { text: '확인 완료', color: 'blue' },
    shipped: { text: '배송 중', color: 'purple' },
    delivered: { text: '납품 완료', color: 'green' },
    cancelled: { text: '취소', color: 'red' },
};

export default function VendorDashboard() {
    const navigate = useNavigate();
    const { showToast } = useNotification();
    const [user, setUser] = useState(null);
    const [tab, setTab] = useState('orders'); // orders | products | drivers | profile
    const [vendorInfo, setVendorInfo] = useState(null);
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);

    // 상품 등록 폼
    const [productForm, setProductForm] = useState({ id: null, product_name: '', category: '', price: '', unit: '개', description: '' });
    const [showProductForm, setShowProductForm] = useState(false);

    // 기사 등록 폼
    const [driverForm, setDriverForm] = useState({ id: null, name: '', phone: '' });
    const [showDriverForm, setShowDriverForm] = useState(false);

    // 납품 처리 및 지도/프린트
    const [deliveryModal, setDeliveryModal] = useState({ isOpen: false, order: null, driver_id: '', notes: '' });
    const [mapModal, setMapModal] = useState({ isOpen: false, startLocation: '' });
    const [deliveryPhoto, setDeliveryPhoto] = useState(null);
    const photoRef = useRef();

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        } else {
            navigate('/login');
        }
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('user');
        navigate('/');
    };

    useEffect(() => {
        if (user?.id) fetchAll();
    }, [user?.id]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            // 업체 정보
            const { data: vendor, error: vendorError } = await supabase
                .from('vendors')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (vendorError) {
                console.error("Vendor fetch error:", vendorError);
                // Save error to state to display it temporarily for debugging
                setVendorInfo({ __isError: true, error: vendorError });
                setLoading(false);
                return;
            }

            if (!vendor) {
                setVendorInfo(null);
                setLoading(false);
                return;
            }
            setVendorInfo(vendor);

            // 주문 목록
            const { data: orderData } = await supabase
                .from('orders')
                .select(`
                    *,
                    funeral_cases ( location, deceased_name, room_number, encoffinment_time, funeral_end_time ),
                    order_items ( *, vendor_products ( product_name ) ),
                    team_leader:team_leader_id ( name, phone )
                `)
                .eq('vendor_id', vendor.id)
                .order('created_at', { ascending: false });
            setOrders(orderData || []);

            // 상품 목록
            const { data: productData } = await supabase
                .from('vendor_products')
                .select('*')
                .eq('vendor_id', vendor.id)
                .order('created_at', { ascending: false });
            setProducts(productData || []);

            // 배송기사 목록
            const { data: driverData } = await supabase
                .from('delivery_drivers')
                .select('*')
                .eq('vendor_id', vendor.id)
                .eq('is_active', true);
            setDrivers(driverData || []);

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // 상품 저장
    const handleSaveProduct = async () => {
        if (!productForm.product_name || !productForm.price) return showToast('error', '입력 오류', '상품명과 단가를 입력하세요.');
        try {
            const payload = {
                vendor_id: vendorInfo.id,
                product_name: productForm.product_name,
                category: productForm.category,
                price: parseInt(productForm.price),
                unit: productForm.unit,
                description: productForm.description,
            };
            if (productForm.id) {
                await supabase.from('vendor_products').update(payload).eq('id', productForm.id);
            } else {
                await supabase.from('vendor_products').insert(payload);
            }
            showToast('success', '저장 완료', '상품이 등록되었습니다.');
            setShowProductForm(false);
            setProductForm({ id: null, product_name: '', category: '', price: '', unit: '개', description: '' });
            fetchAll();
        } catch (err) {
            showToast('error', '저장 실패', err.message);
        }
    };

    // 상품 삭제
    const handleDeleteProduct = async (id) => {
        if (!confirm('이 상품을 삭제하시겠습니까?')) return;
        await supabase.from('vendor_products').delete().eq('id', id);
        fetchAll();
    };

    // 기사 저장
    const handleSaveDriver = async () => {
        if (!driverForm.name) return showToast('error', '입력 오류', '기사 이름을 입력하세요.');
        try {
            const payload = { vendor_id: vendorInfo.id, name: driverForm.name, phone: driverForm.phone };
            if (driverForm.id) {
                await supabase.from('delivery_drivers').update(payload).eq('id', driverForm.id);
            } else {
                await supabase.from('delivery_drivers').insert(payload);
            }
            showToast('success', '등록 완료', '배송기사가 등록되었습니다.');
            setShowDriverForm(false);
            setDriverForm({ id: null, name: '', phone: '' });
            fetchAll();
        } catch (err) {
            showToast('error', '등록 실패', err.message);
        }
    };

    // 주문 상태 변경 (확인)
    const handleConfirmOrder = async (orderId) => {
        await supabase.from('orders').update({ status: 'confirmed', confirmed_at: new Date().toISOString() }).eq('id', orderId);
        showToast('success', '주문 확인', '팀장에게 확인 알림이 전송됩니다.');
        fetchAll();
    };

    // 납품 완료 처리
    const handleDeliveryComplete = async () => {
        const { order, driver_id, notes } = deliveryModal;
        if (!driver_id) return showToast('error', '기사 선택', '배송기사를 선택하세요.');

        try {
            let photoUrl = null;

            // 사진 업로드
            if (deliveryPhoto) {
                const fileName = `delivery/${order.id}_${Date.now()}.jpg`;
                const { data: uploadData, error: uploadErr } = await supabase.storage
                    .from('reports')
                    .upload(fileName, deliveryPhoto, { upsert: true });
                if (!uploadErr) {
                    const { data: urlData } = supabase.storage.from('reports').getPublicUrl(fileName);
                    photoUrl = urlData.publicUrl;
                }
            }

            const selectedDriver = drivers.find(d => d.id === driver_id);

            // delivery 기록
            await supabase.from('deliveries').insert({
                order_id: order.id,
                driver_id,
                driver_name: selectedDriver?.name,
                status: 'delivered',
                delivery_photo_url: photoUrl,
                notes,
                completed_at: new Date().toISOString(),
            });

            // order 상태 업데이트
            await supabase.from('orders').update({
                status: 'delivered',
                delivered_at: new Date().toISOString()
            }).eq('id', order.id);

            // 팀장에게 알림
            await supabase.from('notifications').insert({
                user_id: order.team_leader_id,
                title: '납품 완료 알림 🚚',
                body: `[${order.order_number}] ${vendorInfo.company_name}에서 납품이 완료되었습니다. 배송기사: ${selectedDriver?.name}`,
                type: 'delivery',
                related_id: order.id,
            });

            showToast('success', '납품 완료', '팀장에게 완료 알림이 전송되었습니다.');
            setDeliveryModal({ isOpen: false, order: null, driver_id: '', notes: '' });
            setDeliveryPhoto(null);
            fetchAll();
        } catch (err) {
            showToast('error', '처리 실패', err.message);
        }
    };

    // 기사용 전달 링크 복사
    const handleCopyDriverLink = (orderId) => {
        const url = `${window.location.origin}/delivery/${orderId}`;
        navigator.clipboard.writeText(url);
        showToast('success', '주소 복사 완료', '배송기사용 전용 링크가 복사되었습니다.\n문자나 카카오톡으로 전달하세요.');
    };

    // 당일 발주 프린트 출력
    const handlePrintOrders = () => {
        const activeOrders = orders.filter(o => o.status !== 'cancelled');

        let content = `
        <html>
        <head>
            <title>금일 장례식장 배송/발주 목록 - ${vendorInfo.company_name}</title>
            <style>
                body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; padding: 20px; color: #222; background: #fff; }
                h1 { text-align: center; border-bottom: 2px solid #222; padding-bottom: 15px; margin-bottom: 20px; font-size: 24px; }
                .order-card { border: 2px solid #eee; border-radius: 12px; padding: 20px; margin-bottom: 20px; page-break-inside: avoid; background: #fff; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px dashed #eee; padding-bottom: 10px; margin-bottom: 15px; }
                .title { font-size: 18px; font-weight: bold; color: #1a56db;  margin-bottom: 4px; }
                .order-num { font-size: 12px; color: #888; }
                .status { font-weight: bold; font-size: 16px; padding: 4px 8px; border-radius: 4px; background: #f3f4f6;}
                table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 14px; }
                td { padding: 4px 0; }
                .items { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
                .items-title { font-weight: bold; margin-bottom: 10px; color: #334155; display: block; }
                .item-line { font-size: 14px; margin: 4px 0; display: flex; justify-content: space-between; }
                .total { font-weight: 900; text-align: right; margin-top: 15px; padding-top: 10px; border-top: 1px solid #cbd5e1; font-size: 16px; color: #0f172a;}
                .btn-print { padding: 12px 24px; font-size: 16px; font-weight: bold; cursor: pointer; margin: 0 auto 30px; display: block; background: #111; color: #fff; border:none; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                @media print {
                    body { padding: 0; background: #fff; }
                    .btn-print { display: none !important; }
                    .order-card { border: 1px solid #ccc; box-shadow: none; border-radius: 0; margin-bottom: 30px; }
                }
            </style>
        </head>
        <body>
            <button class="btn-print" onclick="window.print()">🖨️ 인쇄하기 (종이 출력)</button>
            <h1>📦 금 일 배 송 / 발 주 지 시 서 (총 ${activeOrders.length}건)</h1>
            <p style="text-align: right; color: #666; font-size: 13px;">출력일시: ${new Date().toLocaleString()}</p>
        `;

        activeOrders.forEach(order => {
            const fc = order.funeral_cases;
            const stColor = order.status === 'pending' ? 'color: #ea580c;' : (order.status === 'delivered' ? 'color: #16a34a;' : 'color: #2563eb;');

            content += `
            <div class="order-card">
                <div class="header">
                    <div>
                        <div class="title">📍 ${fc?.location || '장소 미상'} ${fc?.room_number ? '(' + fc.room_number + ')' : ''}</div>
                        <div class="order-num">발주번호: ${order.order_number}</div>
                    </div>
                    <div>
                        <span class="status" style="${stColor}">${STATUS_LABELS[order.status]?.text || ''}</span>
                    </div>
                </div>
                <table>
                    <tr>
                        <td style="width: 50%;"><strong>👤 담당 팀장:</strong> ${order.team_leader?.name} <span style="color:#666;">(${order.team_leader?.phone})</span></td>
                        <td style="width: 50%;"><strong>🕊️ 고 인 명:</strong> ${fc?.deceased_name || '미입력'}</td>
                    </tr>
                    <tr>
                        <td><strong>🕒 입관 일시:</strong> ${fc?.encoffinment_time ? new Date(fc.encoffinment_time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '미정'}</td>
                        <td><strong>🗓️ 발인 일시:</strong> ${fc?.funeral_end_time ? new Date(fc.funeral_end_time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '미정'}</td>
                    </tr>
                </table>
                <div class="items">
                    <span class="items-title">[ 납품 내역 ]</span>
                    ${order.order_items?.map(i => `
                        <div class="item-line">
                            <span>- ${i.product_name}</span>
                            <strong>${i.quantity}${i.unit}</strong>
                        </div>
                    `).join('')}
                    <div class="total">총 금액: ${order.total_amount?.toLocaleString()} 원</div>
                </div>
            </div>
            `;
        });

        content += '</body></html>';

        const printWin = window.open('', '_blank', 'width=850,height=900');
        if (printWin) {
            printWin.document.open();
            printWin.document.write(content);
            printWin.document.close();
            setTimeout(() => { printWin.print(); }, 800);
        } else {
            alert('팝업 차단을 해제해주세요.');
        }
    };

    // 업체 미승인 상태
    if (!user) return null;

    if (!vendorInfo) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl p-8 text-center max-w-sm shadow-lg">
                    <AlertCircle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
                    <h2 className="font-bold text-gray-800 text-lg mb-2">업체 정보 없음</h2>
                    <p className="text-sm text-gray-500 mb-4">관리자의 승인 후 이용 가능합니다.<br />승인 완료 알림을 기다려주세요.</p>
                    <p className="text-xs text-red-500 mb-4">Debug User ID: {user?.id}</p>
                    <button onClick={handleLogout} className="w-full py-3 bg-gray-100 text-gray-600 font-bold rounded-xl">로그아웃</button>
                </div>
            </div>
        );
    }

    if (vendorInfo.__isError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl p-8 text-center shadow-lg w-full max-w-md">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="font-bold text-gray-800 text-lg mb-2">데이터베이스 오류</h2>
                    <p className="text-sm text-gray-500 mb-4">외주업체 정보를 불러오는 중 에러가 발생했습니다.</p>
                    <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4 text-xs text-left max-h-40 overflow-y-auto w-full break-words">
                        <strong>User ID:</strong> {user?.id}<br />
                        <strong>Error code:</strong> {vendorInfo.error?.code}<br />
                        <strong>Message:</strong> {vendorInfo.error?.message}<br />
                        <strong>Details:</strong> {vendorInfo.error?.details}
                    </div>
                    <button onClick={handleLogout} className="w-full py-3 bg-gray-100 text-gray-600 font-bold rounded-xl">로그아웃</button>
                </div>
            </div>
        );
    }

    if (vendorInfo.status !== 'approved') {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl p-8 text-center max-w-sm shadow-lg">
                    <AlertCircle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
                    <h2 className="font-bold text-gray-800 text-lg mb-2">승인 대기 중</h2>
                    <p className="text-sm text-gray-500 mb-1">{vendorInfo.company_name}</p>
                    <p className="text-sm text-gray-500 mb-4">관리자 승인 완료 후 이용 가능합니다.</p>
                    {vendorInfo.status === 'rejected' && (
                        <div className="bg-red-50 rounded-xl p-3 mb-4 text-sm text-red-600">
                            반려 사유: {vendorInfo.rejection_reason || '-'}
                        </div>
                    )}
                    <button onClick={handleLogout} className="w-full py-3 bg-gray-100 text-gray-600 font-bold rounded-xl">로그아웃</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
                <div>
                    <p className="text-xs text-gray-400">외주업체 대시보드</p>
                    <h1 className="font-black text-gray-900">{vendorInfo.company_name}</h1>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                        {BUSINESS_TYPE_LABELS[vendorInfo.business_type]}
                    </span>
                </div>
                <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-gray-600">
                    <LogOut className="w-5 h-5" />
                </button>
            </div>

            <div className="p-4 space-y-4">

                {/* 주문 탭 */}
                {tab === 'orders' && (
                    <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                <ClipboardList className="w-5 h-5 text-blue-500" />
                                당일 발주 및 배송 목록
                            </h2>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => setMapModal({ isOpen: true, startLocation: '' })} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-xs font-bold rounded-xl transition-colors shadow-sm">
                                    <Map className="w-3.5 h-3.5" /> 최적경로
                                </button>
                                <button onClick={handlePrintOrders} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-900 border border-gray-900 text-white hover:bg-black text-xs font-bold rounded-xl transition-colors shadow-sm">
                                    <Printer className="w-3.5 h-3.5" /> 인쇄출력
                                </button>
                            </div>
                        </div>
                        {orders.length === 0 && (
                            <div className="bg-white rounded-2xl p-10 text-center text-gray-400">
                                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">아직 발주가 없습니다.</p>
                            </div>
                        )}
                        {orders.map(order => {
                            const st = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
                            const fc = order.funeral_cases;
                            return (
                                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 border-b border-gray-50 flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{order.order_number}</p>
                                            <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleString()}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full bg-${st.color}-100 text-${st.color}-700`}>
                                            {st.text}
                                        </span>
                                    </div>
                                    <div className="p-4 space-y-2 text-sm text-gray-600">
                                        <p>📍 <span className="font-medium">{fc?.location || '장소 미정'}</span></p>
                                        <p>🕊️ 고인: <span className="font-medium">{fc?.deceased_name || '미입력'}</span></p>
                                        <p>🕒 입관: <span className="font-medium">{fc?.encoffinment_time ? new Date(fc.encoffinment_time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '미정'}</span></p>
                                        <p>🗓️ 발인: <span className="font-medium">{fc?.funeral_end_time ? new Date(fc.funeral_end_time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '미정'}</span></p>
                                        <p>👤 팀장: {order.team_leader?.name} · {order.team_leader?.phone}</p>
                                        <div className="bg-gray-50 rounded-lg p-2 space-y-1">
                                            {order.order_items?.map((item, i) => (
                                                <p key={i} className="text-xs">· {item.product_name} × {item.quantity}{item.unit} = {item.total_price?.toLocaleString()}원</p>
                                            ))}
                                            <p className="text-xs font-bold text-blue-700 pt-1 border-t border-gray-200">합계: {order.total_amount?.toLocaleString()}원</p>
                                        </div>
                                        {/* 액션 버튼 */}
                                        <div className="space-y-2 mt-3">
                                            {order.status === 'pending' && (
                                                <button
                                                    onClick={() => handleConfirmOrder(order.id)}
                                                    className="w-full py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm mt-2"
                                                >
                                                    ✅ 주문 확인
                                                </button>
                                            )}
                                            {(order.status === 'confirmed' || order.status === 'shipped') && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        onClick={() => setDeliveryModal({ isOpen: true, order, driver_id: '', notes: '' })}
                                                        className="py-2.5 bg-green-600 hover:bg-green-700 transition-colors text-white font-bold rounded-xl text-sm flex items-center justify-center gap-1.5"
                                                    >
                                                        <CheckCircle className="w-4 h-4" /> (직접) 납품완료
                                                    </button>
                                                    <button
                                                        onClick={() => handleCopyDriverLink(order.id)}
                                                        className="py-2.5 bg-gray-100 hover:bg-gray-200 transition-colors text-gray-700 font-bold rounded-xl text-sm flex items-center justify-center gap-1.5"
                                                    >
                                                        <Copy className="w-4 h-4" /> 기사 전용링크 복사
                                                    </button>
                                                </div>
                                            )}
                                            {order.status === 'delivered' && (
                                                <div className="text-center py-2.5 bg-green-50 rounded-xl">
                                                    <p className="text-xs text-green-700 font-bold flex items-center justify-center gap-1"><CheckCircle className="w-4 h-4" /> 납품 및 확인 완료</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* 상품 탭 */}
                {tab === 'products' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-gray-800">판매 상품 관리</h2>
                            <button
                                onClick={() => { setProductForm({ id: null, product_name: '', category: '', price: '', unit: '개', description: '' }); setShowProductForm(true); }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl"
                            >
                                <Plus className="w-3 h-3" /> 상품 추가
                            </button>
                        </div>

                        {showProductForm && (
                            <div className="bg-blue-50 rounded-2xl p-4 space-y-3 border border-blue-100">
                                <input value={productForm.product_name} onChange={e => setProductForm({ ...productForm, product_name: e.target.value })} placeholder="상품명 *" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                                <div className="grid grid-cols-2 gap-2">
                                    <input value={productForm.category} onChange={e => setProductForm({ ...productForm, category: e.target.value })} placeholder="분류 (예: 수국)" className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none" />
                                    <input value={productForm.unit} onChange={e => setProductForm({ ...productForm, unit: e.target.value })} placeholder="단위 (개/세트/박스)" className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none" />
                                </div>
                                <input type="number" value={productForm.price} onChange={e => setProductForm({ ...productForm, price: e.target.value })} placeholder="단가 (원) *" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none" />
                                <textarea value={productForm.description} onChange={e => setProductForm({ ...productForm, description: e.target.value })} placeholder="설명 (선택)" rows={2} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none resize-none" />
                                <div className="flex gap-2">
                                    <button onClick={() => setShowProductForm(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm">취소</button>
                                    <button onClick={handleSaveProduct} className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-xl text-sm">저장</button>
                                </div>
                            </div>
                        )}

                        {products.length === 0 && !showProductForm && (
                            <div className="text-center py-10 text-gray-400 bg-white rounded-2xl">
                                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">등록된 상품이 없습니다.</p>
                            </div>
                        )}
                        {products.map(p => (
                            <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-4 flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-gray-800">{p.product_name}</p>
                                    <p className="text-xs text-gray-400">{p.category} · {p.unit} · {p.price.toLocaleString()}원</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { setProductForm({ id: p.id, product_name: p.product_name, category: p.category, price: String(p.price), unit: p.unit, description: p.description || '' }); setShowProductForm(true); }} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDeleteProduct(p.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 배송기사 탭 */}
                {tab === 'drivers' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-gray-800">배송기사 관리</h2>
                            <button onClick={() => { setDriverForm({ id: null, name: '', phone: '' }); setShowDriverForm(true); }}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl">
                                <Plus className="w-3 h-3" /> 기사 등록
                            </button>
                        </div>
                        {showDriverForm && (
                            <div className="bg-blue-50 rounded-2xl p-4 space-y-3 border border-blue-100">
                                <input value={driverForm.name} onChange={e => setDriverForm({ ...driverForm, name: e.target.value })} placeholder="기사 이름 *" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none" />
                                <input value={driverForm.phone} onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })} placeholder="연락처" className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none" />
                                <div className="flex gap-2">
                                    <button onClick={() => setShowDriverForm(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 font-bold rounded-xl text-sm">취소</button>
                                    <button onClick={handleSaveDriver} className="flex-1 py-2 bg-blue-600 text-white font-bold rounded-xl text-sm">등록</button>
                                </div>
                            </div>
                        )}
                        {drivers.length === 0 && !showDriverForm && (
                            <div className="text-center py-10 text-gray-400 bg-white rounded-2xl">
                                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">등록된 기사가 없습니다.</p>
                            </div>
                        )}
                        {drivers.map(d => (
                            <div key={d.id} className="bg-white rounded-xl border border-gray-100 p-4 flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-gray-800">{d.name}</p>
                                    <p className="text-xs text-gray-400">{d.phone}</p>
                                </div>
                                <button onClick={() => { setDriverForm({ id: d.id, name: d.name, phone: d.phone }); setShowDriverForm(true); }} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 납품 완료 모달 */}
            {deliveryModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
                    <div className="bg-white w-full rounded-t-3xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-gray-900">납품 완료 처리</h3>
                            <button onClick={() => setDeliveryModal({ isOpen: false, order: null, driver_id: '', notes: '' })} className="p-1 rounded-full hover:bg-gray-100">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        {/* 기사 선택 */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">배송기사 선택 *</label>
                            <select
                                value={deliveryModal.driver_id}
                                onChange={e => setDeliveryModal({ ...deliveryModal, driver_id: e.target.value })}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none"
                            >
                                <option value="">-- 기사 선택 --</option>
                                {drivers.map(d => <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>)}
                            </select>
                        </div>

                        {/* 납품 사진 */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">납품 완료 사진</label>
                            <input ref={photoRef} type="file" accept="image/*" onChange={e => setDeliveryPhoto(e.target.files[0])} className="hidden" />
                            {deliveryPhoto ? (
                                <div className="relative">
                                    <img src={URL.createObjectURL(deliveryPhoto)} alt="preview" className="w-full h-40 object-cover rounded-xl" />
                                    <button onClick={() => setDeliveryPhoto(null)} className="absolute top-2 right-2 bg-white/80 rounded-full p-1">
                                        <X className="w-4 h-4 text-gray-700" />
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => photoRef.current?.click()} className="w-full h-32 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-300 hover:text-blue-400 transition-colors">
                                    <Camera className="w-8 h-8 mb-1" />
                                    <p className="text-xs">사진 첨부 (선택)</p>
                                </button>
                            )}
                        </div>

                        {/* 메모 */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">납품 메모 (선택)</label>
                            <textarea
                                value={deliveryModal.notes}
                                onChange={e => setDeliveryModal({ ...deliveryModal, notes: e.target.value })}
                                placeholder="납품 완료 메모를 입력하세요."
                                rows={2}
                                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none outline-none"
                            />
                        </div>

                        <button
                            onClick={handleDeliveryComplete}
                            className="w-full py-3 bg-green-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"
                        >
                            <CheckCircle className="w-5 h-5" /> 납품 완료 및 팀장 알림 전송
                        </button>
                    </div>
                </div>
            )}

            {/* 지도/경로 최적화 모달 */}
            {mapModal.isOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fadeIn">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-sky-50">
                            <div>
                                <h3 className="font-bold text-gray-900 flex items-center gap-1.5"><Map className="w-5 h-5 text-sky-600" /> 금일 배송 최적 경로 안내</h3>
                                <p className="text-xs text-gray-500 mt-0.5">배송할 장례식장 위치와 최적 경로를 연결합니다.</p>
                            </div>
                            <button onClick={() => setMapModal({ isOpen: false, startLocation: '' })} className="p-1 rounded-full hover:bg-white transition-colors"><X className="w-6 h-6 text-gray-400" /></button>
                        </div>
                        <div className="p-5 space-y-5 bg-white">
                            <div>
                                <label className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">🚚 출발지 (창고 또는 자택)</label>
                                <input
                                    type="text"
                                    value={mapModal.startLocation}
                                    onChange={e => setMapModal({ ...mapModal, startLocation: e.target.value })}
                                    placeholder="출발할 주소를 입력하세요 (예: 서울 강남구 역삼로 123)"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                                />
                            </div>

                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-inner max-h-48 overflow-y-auto custom-scrollbar">
                                <p className="text-xs font-bold text-slate-500 mb-3 flex items-center justify-between">
                                    <span>경유지 목록 (미납품 장례식장)</span>
                                    <span className="bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">{orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length}곳</span>
                                </p>
                                <ul className="space-y-2 text-sm text-gray-700 font-medium">
                                    {orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').map((o, i) => (
                                        <li key={o.id} className="flex items-start gap-2 bg-white p-2 rounded-lg border border-gray-100">
                                            <span className="font-black text-sky-500 bg-sky-50 w-5 h-5 flex items-center justify-center rounded-full text-xs shrink-0">{i + 1}</span>
                                            <div>
                                                <div className="font-bold">{o.funeral_cases?.location || '주소 미상'}</div>
                                                <div className="text-[10px] text-gray-400 mt-0.5 font-normal">팀장: {o.team_leader?.name} · 발주번호: {o.order_number}</div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                {orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length === 0 && (
                                    <div className="text-center py-4 text-gray-400 text-sm">현재 배송 예루할 곳이 없습니다.</div>
                                )}
                            </div>

                            <button
                                onClick={() => {
                                    showToast('warning', '네비게이션 연결 준비', '관리자 승인 후 카카오 모빌리티 연동 시 자동 전송됩니다.\n현재는 테스트 모드이며, 실제 내비 연동은 배송기사 앱 화면의 [카카오맵] 버튼을 이용해주세요.');
                                    setTimeout(() => setMapModal({ isOpen: false }), 4000);
                                }}
                                className="w-full py-4 bg-[#FEE500] text-[#191919] font-black rounded-xl shadow-md flex items-center justify-center gap-2 hover:bg-[#F4DC00] transition-colors active:scale-95"
                            >
                                <span className="flex items-center gap-1.5"><Map className="w-5 h-5" /> 카카오내비 다중경로 전송 (준비중)</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Nav */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex">
                {[
                    { id: 'orders', icon: <ClipboardList className="w-5 h-5" />, label: '발주' },
                    { id: 'products', icon: <Package className="w-5 h-5" />, label: '상품' },
                    { id: 'drivers', icon: <Truck className="w-5 h-5" />, label: '기사' },
                ].map(item => (
                    <button
                        key={item.id}
                        onClick={() => setTab(item.id)}
                        className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors ${tab === item.id ? 'text-blue-600' : 'text-gray-400'
                            }`}
                    >
                        {item.icon}
                        <span className="text-[10px] font-bold">{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
