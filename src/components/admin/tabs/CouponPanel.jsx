import React, { useState, useEffect } from 'react';
import { DollarSign, Search, Download, Gift, Leaf, Award, Crown, Phone } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useNotification } from '../../../contexts/NotificationContext';
import { formatPhoneNumber } from '../../../utils/formatters';

export default function CouponPanel({ coupons, onUpdate, supabase, isReadonly }) {
    const { showToast } = useNotification();
    const [amount, setAmount] = useState('30000');
    const [debugMsg, setDebugMsg] = useState('');

    useEffect(() => {
        setDebugMsg(`Loaded Coupons: ${coupons ? coupons.length : 'null'}`);
    }, [coupons]);
    const [phone, setPhone] = useState('');
    const [generatedCoupon, setGeneratedCoupon] = useState(null);
    const [mode, setMode] = useState('single');
    const [quantity, setQuantity] = useState(1);
    const [memo, setMemo] = useState('');
    const [generatedBatch, setGeneratedBatch] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [recipientName, setRecipientName] = useState('');
    const [recipientPhone, setRecipientPhone] = useState('');
    const [linkAmount, setLinkAmount] = useState('30000');
    const [sendingLink, setSendingLink] = useState(false);

    const SITE_URL = 'https://10promise.com';

    const issuanceStats = coupons ? Object.values(coupons.reduce((acc, curr) => {
        const issuer = curr.profiles?.name || '본사';
        if (!acc[issuer]) acc[issuer] = { name: issuer, count: 0, total: 0 };
        acc[issuer].count += 1;
        acc[issuer].total += curr.amount;
        return acc;
    }, {})).sort((a, b) => b.count - a.count) : [];

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await onUpdate();
        setTimeout(() => setIsRefreshing(false), 500);
    };

    const filteredCoupons = coupons ? coupons.filter(c =>
        c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.issued_to && c.issued_to.includes(searchTerm)) ||
        (c.batch_name && c.batch_name.toLowerCase().includes(searchTerm.toLowerCase()))
    ) : [];

    const handleIssue = async (e) => {
        e.preventDefault();

        if (mode === 'single') {
            if (!confirm(`${phone}님께 ${Number(amount).toLocaleString()}원 쿠폰을 발행하시겠습니까?`)) return;
            const code = Math.random().toString(36).substring(2, 10).toUpperCase();
            try {
                const { error } = await supabase.from('coupons').insert([{
                    code: code,
                    amount: parseInt(amount),
                    status: 'issued',
                    issued_to: phone,
                    batch_name: '개별발행'
                }]);
                if (error) throw error;
                setGeneratedCoupon({ code, amount, phone });
                onUpdate();
                setPhone('');
                showToast('success', '발급 완료', '쿠폰이 발급되었습니다.');
            } catch (error) {
                console.error(error);
                showToast('error', '오류', '쿠폰 발행 중 오류가 발생했습니다.');
            }
        } else {
            if (!confirm(`${Number(amount).toLocaleString()}원 쿠폰 ${quantity}장을 대량 발행하시겠습니까?`)) return;

            const newCoupons = [];
            const batchName = memo || `대량발행_${new Date().toLocaleDateString()}`;

            for (let i = 0; i < quantity; i++) {
                newCoupons.push({
                    code: Math.random().toString(36).substring(2, 10).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase(),
                    amount: parseInt(amount),
                    status: 'issued',
                    issued_to: null,
                    batch_name: batchName
                });
            }

            try {
                const { error } = await supabase.from('coupons').insert(newCoupons);
                if (error) throw error;

                const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
                    + "쿠폰번호,금액,발행일\n"
                    + newCoupons.map(c => `${c.code},${c.amount},${new Date().toLocaleDateString()}`).join("\n");

                const encodedUri = encodeURI(csvContent);
                setGeneratedBatch({ count: quantity, amount, csvUrl: encodedUri });

                onUpdate();
                setMemo('');
                showToast('success', '대량 발급 완료', `${quantity}장의 쿠폰이 발급되었습니다.`);
            } catch (error) {
                console.error(error);
                showToast('error', '오류', '대량 발행 중 오류가 발생했습니다.');
            }
        }
    };

    return (
        <div className="p-6">
            <div className="flex gap-4 mb-8 overflow-x-auto pb-2 custom-scrollbar">
                {issuanceStats.map(stat => (
                    <div key={stat.name} className="bg-white p-5 rounded-2xl border border-indigo-50 shadow-sm min-w-[200px] flex-shrink-0 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-bold">
                                {stat.name.charAt(0)}
                            </div>
                            <p className="text-sm text-gray-600 font-bold">{stat.name} 발행</p>
                        </div>
                        <h4 className="text-3xl font-black text-gray-900 tracking-tight">{stat.count.toLocaleString()}장</h4>
                        <p className="text-xs text-indigo-500 font-bold mt-2">총 ₩ {stat.total.toLocaleString()}</p>
                    </div>
                ))}
            </div>

            {isReadonly && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 mb-6 flex items-center gap-2 text-sm text-amber-700 font-bold">
                    🔒 열람 전용 모드: 쿠폰 발행은 슬룰퍼 관리자만 가능합니다.
                </div>
            )}

            {!isReadonly && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-xl border border-indigo-100 mb-8 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-indigo-900 flex items-center gap-2">
                        <DollarSign className="w-5 h-5" /> 쿠폰 발행 (v2.1)
                    </h4>
                    <div className="flex bg-white rounded-lg p-1 border border-indigo-100">
                        <button
                            onClick={() => setMode('single')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${mode === 'single' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            개별 발송 (문자)
                        </button>
                        <button
                            onClick={() => setMode('link')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${mode === 'link' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            📩 링크 발송
                        </button>
                        <button
                            onClick={() => setMode('bulk')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${mode === 'bulk' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                        >
                            대량 발행 (파일)
                        </button>
                    </div>
                </div>

                {mode === 'link' ? (
                    /* 링크 발송 폼 */
                    <div className="space-y-4">
                        <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 mb-2">
                            <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                                📱 예비상주에게 쿠폰 링크를 생성합니다. 링크를 클릭하면 <strong>원클릭 장례 접수</strong>가 가능합니다.
                            </p>
                        </div>
                        <div className="flex gap-4 items-end flex-wrap">
                            <div className="flex-1 min-w-[150px]">
                                <label className="block text-xs font-bold text-gray-500 mb-1">예비상주 성함</label>
                                <input
                                    type="text"
                                    placeholder="성함"
                                    className="w-full px-4 py-2 border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                    value={recipientName}
                                    onChange={e => setRecipientName(e.target.value)}
                                />
                            </div>
                            <div className="flex-1 min-w-[150px]">
                                <label className="block text-xs font-bold text-gray-500 mb-1">예비상주 연락처</label>
                                <input
                                    type="tel"
                                    placeholder="010-0000-0000"
                                    maxLength={13}
                                    className="w-full px-4 py-2 border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                    value={recipientPhone}
                                    onChange={e => setRecipientPhone(formatPhoneNumber(e.target.value))}
                                />
                            </div>
                            <div className="w-40">
                                <label className="block text-xs font-bold text-gray-500 mb-1">캐시백 금액</label>
                                <select
                                    className="w-full px-4 py-2 border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                    value={linkAmount}
                                    onChange={e => setLinkAmount(e.target.value)}
                                >
                                    <option value="30000">30,000</option>
                                    <option value="50000">50,000</option>
                                    <option value="70000">70,000</option>
                                    <option value="100000">100,000</option>
                                </select>
                            </div>
                            <button
                                type="button"
                                disabled={sendingLink}
                                onClick={async () => {
                                    if (!recipientName.trim() || !recipientPhone.trim()) {
                                        showToast('error', '입력 오류', '예비상주 이름과 연락처를 입력해주세요.');
                                        return;
                                    }
                                    if (!confirm(`${recipientName}님 (${recipientPhone})에게\n${Number(linkAmount).toLocaleString()}원 쿠폰 링크를 생성하시겠습니까?`)) return;

                                    setSendingLink(true);
                                    try {
                                        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
                                        const { error } = await supabase.from('coupons').insert([{
                                            code,
                                            amount: parseInt(linkAmount),
                                            status: 'issued',
                                            batch_name: '링크발송(본사)',
                                            recipient_name: recipientName.trim(),
                                            recipient_phone: recipientPhone.trim(),
                                            link_sent_at: new Date().toISOString()
                                        }]);
                                        if (error) throw error;

                                        // SMS 자동 발송 (send-coupon-sms Edge Function)
                                        try {
                                        const smsRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-coupon-sms`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
                                        body: JSON.stringify({ phone: recipientPhone.trim(), name: recipientName.trim(), couponCode: code, amount: parseInt(linkAmount) })
                                        });
                                        console.log('SMS result:', await smsRes.json());
                                        } catch (smsErr) { console.error('SMS 발송 실패:', smsErr); }

                                        showToast('success', '발송 완료', `${recipientName}님에게 쿠폰 링크 문자가 발송되었습니다.`);
                                        setRecipientName('');
                                        setRecipientPhone('');
                                        setLinkAmount('30000');
                                        onUpdate?.();
                                    } catch (err) {
                                        console.error(err);
                                        showToast('error', '실패', '쿠폰 생성 중 오류가 발생했습니다.');
                                    } finally {
                                        setSendingLink(false);
                                    }
                                }}
                                className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-95 h-10 flex items-center gap-1"
                            >
                                <Phone className="w-4 h-4" /> {sendingLink ? '생성 중...' : '링크 생성'}
                            </button>
                        </div>
                    </div>
                ) : (
                <form onSubmit={handleIssue} className="flex gap-4 items-end flex-wrap">
                    {mode === 'single' ? (
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs font-bold text-gray-500 mb-1">고객 연락처</label>
                            <input
                                type="tel"
                                placeholder="010-0000-0000"
                                className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                value={phone}
                                onChange={e => setPhone(formatPhoneNumber(e.target.value))}
                                required
                            />
                        </div>
                    ) : (
                        <>
                            <div className="w-32">
                                <label className="block text-xs font-bold text-gray-500 mb-1">발행 수량 (장)</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                    value={quantity}
                                    onChange={e => setQuantity(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-xs font-bold text-gray-500 mb-1">발행 메모 (예: 제휴 행사용)</label>
                                <input
                                    type="text"
                                    placeholder="식별용 메모 입력"
                                    className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                    value={memo}
                                    onChange={e => setMemo(e.target.value)}
                                />
                            </div>
                        </>
                    )}
                    <div className="w-40">
                        <label className="block text-xs font-bold text-gray-500 mb-1">금액 (원)</label>
                        <select
                            className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                        >
                            <option value="30000">30,000</option>
                            <option value="50000">50,000</option>
                            <option value="70000">70,000</option>
                            <option value="100000">100,000</option>
                        </select>
                    </div>
                    <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95 h-10">
                        발행하기
                    </button>
                </form>
                )}
            </div>
            )}

            {generatedCoupon && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-bounce-in">
                        <div className="bg-gray-900 text-white p-4 flex justify-between items-center">
                            <span className="font-bold">문자 발송 시뮬레이션</span>
                            <button onClick={() => setGeneratedCoupon(null)} className="text-gray-400 hover:text-white">&times;</button>
                        </div>
                        <div className="p-6">
                            <div className="bg-gray-100 p-4 rounded-lg mb-4 text-sm whitespace-pre-line border border-gray-200">
                                <p className="font-bold text-indigo-600 mb-2">[10년의 약속] 쿠폰 도착 🎁</p>
                                <p>{generatedCoupon.phone} 고객님, 감사합니다.</p>
                                <p>{Number(generatedCoupon.amount).toLocaleString()}원 캐시백 쿠폰이 발급되었습니다.</p>
                                <br />
                                <p className="bg-white p-2 rounded border border-dashed border-gray-300 font-mono text-center font-bold text-lg select-all">
                                    {generatedCoupon.code}
                                </p>
                                <br />
                                <p className="text-gray-500 text-xs">
                                    * 사용방법: 로그인 {'>'} 마이페이지 {'>'} 쿠폰 등록<br />
                                    * 문의: 1544-1234
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    const msg = `[10년의 약속] ${Number(generatedCoupon.amount).toLocaleString()}원 쿠폰코드: ${generatedCoupon.code}`;
                                    navigator.clipboard.writeText(msg);
                                    showToast('success', '복사 완료', '문자 내용이 복사되었습니다!');
                                }}
                                className="w-full py-3 bg-gray-900 text-white rounded-lg font-bold hover:bg-black transition-colors"
                            >
                                문자 내용 복사하기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {generatedBatch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-bounce-in">
                        <div className="bg-indigo-900 text-white p-4 flex justify-between items-center">
                            <span className="font-bold">대량 발행 완료</span>
                            <button onClick={() => setGeneratedBatch(null)} className="text-indigo-200 hover:text-white">&times;</button>
                        </div>
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <DollarSign className="w-8 h-8" />
                            </div>
                            <h3 className="font-bold text-gray-900 text-lg mb-2">{generatedBatch.count}장 발행 성공!</h3>
                            <p className="text-gray-500 text-sm mb-6">
                                총 {Number(generatedBatch.amount * generatedBatch.count).toLocaleString()}원 규모의 쿠폰이 생성되었습니다.<br />
                                아래 버튼을 눌러 엑셀(CSV) 파일을 다운로드하세요.
                            </p>

                            <a
                                href={generatedBatch.csvUrl}
                                download={`coupons_${new Date().toISOString().slice(0, 10)}.csv`}
                                className="block w-full py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                            >
                                📥 쿠폰 파일 다운로드
                            </a>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                    <h4 className="font-bold text-gray-800">발행 내역</h4>
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="쿠폰번호, 연락처, 메모 검색..."
                            className="pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 transition-all"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <button
                    onClick={handleRefresh}
                    className={`text-xs text-indigo-500 underline flex items-center gap-1 ${isRefreshing ? 'opacity-50 cursor-not-allowed' : 'hover:text-indigo-700'}`}
                    disabled={isRefreshing}
                >
                    {isRefreshing ? '불러오는 중...' : '새로고침'}
                </button>
            </div>

            {/* 쿠폰 이미지 다운로드용 히든 템플릿 (Option A: 웜 아이보리 & 그린) */}
            <div id="coupon-template" className="hidden" style={{ position: 'absolute', left: '-9999px' }}>
                <div style={{ width: 450, height: 220, background: 'linear-gradient(to right, #cfad6f, #f5deb3, #cfad6f)', padding: 4, position: 'relative' }}>
                    <div style={{ width: '100%', height: '100%', background: '#fcfbf9', position: 'relative', display: 'flex', overflow: 'hidden' }}>
                        {/* 안쪽 라운드 테두리 */}
                        <div style={{ position: 'absolute', top: 10, left: 10, right: 10, bottom: 10, border: '1px solid #b89758', borderRadius: 8, pointerEvents: 'none' }}></div>
                        
                        {/* 좌측: 브랜드 + 코드 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingLeft: 30, paddingRight: 16, position: 'relative', zIndex: 10 }}>
                            {/* 로고 + 브랜드명 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <img src="/promise_logo_transparent.png" alt="logo" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                                <span style={{ color: '#2E4A3D', fontSize: 11, fontWeight: 700, letterSpacing: 3 }}>10년의 약속</span>
                            </div>
                            {/* 캐시백 쿠폰 타이틀 */}
                            <div style={{ color: '#333333', fontSize: 24, fontWeight: 900, letterSpacing: 4, fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif', marginBottom: 12 }}>캐시백 쿠폰</div>
                            {/* 설명 */}
                            <div style={{ color: '#888888', fontSize: 10, marginBottom: 8 }}>프리미엄 장례지원 캐시백</div>
                            {/* 코드 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ background: '#2E4A3D', color: '#fcfbf9', fontSize: 9, padding: '2px 8px', fontWeight: 700, letterSpacing: 2 }}>CODE</div>
                                <div id="coupon-code" style={{ color: '#2E4A3D', fontSize: 16, fontFamily: 'Consolas, monospace', fontWeight: 700, letterSpacing: 3 }}></div>
                            </div>
                        </div>
                        
                        {/* 우측: 금액 + 날짜 */}
                        <div style={{ width: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid #d4c39e', position: 'relative', zIndex: 10 }}>
                            <div style={{ color: '#8c6f37', fontSize: 10, letterSpacing: 2, marginBottom: 6, fontWeight: 600 }}>CASHBACK</div>
                            <div style={{ display: 'flex', alignItems: 'baseline' }}>
                                <span style={{ color: '#333333', fontSize: 13, marginRight: 2 }}>₩</span>
                                <span id="coupon-amount" style={{ color: '#333333', fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif' }}></span>
                            </div>
                            <div id="coupon-date" style={{ color: '#999999', fontSize: 11, marginTop: 14, fontWeight: 500 }}></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[70vh] relative">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-6 py-4">쿠폰 코드</th>
                            <th className="px-6 py-4">대상 연락처</th>
                            <th className="px-6 py-4">수신자</th>
                            <th className="px-6 py-4">발행자</th>
                            <th className="px-6 py-4">금액</th>
                            <th className="px-6 py-4 text-center">상태</th>
                            <th className="px-6 py-4">발행일</th>
                            <th className="px-6 py-4 text-right">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredCoupons.length === 0 && (
                            <tr>
                                <td colSpan="8" className="px-6 py-8 text-center text-gray-400">
                                    {searchTerm ? '검색 결과가 없습니다.' : '발행된 쿠폰이 없습니다.'}
                                </td>
                            </tr>
                        )}
                        {filteredCoupons.map(coupon => (
                            <tr key={coupon.code} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-mono font-bold text-indigo-600">{coupon.code}</td>
                                <td className="px-6 py-4 text-gray-900">
                                    {coupon.issued_to ? (
                                        coupon.issued_to
                                    ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                            {coupon.batch_name || '대량발행'}
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    {coupon.recipient_name ? (
                                        <div>
                                            <div className="font-bold text-emerald-700 text-xs">{coupon.recipient_name}</div>
                                            <div className="text-[10px] text-gray-400">{coupon.recipient_phone}</div>
                                        </div>
                                    ) : (
                                        <span className="text-gray-300 text-xs">—</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 font-medium text-gray-900">{coupon.profiles?.name || <span className="text-indigo-600 font-bold">본사</span>}</td>
                                <td className="px-6 py-4 font-bold">₩ {coupon.amount.toLocaleString()}</td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${coupon.status === 'used' ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                                        {coupon.status === 'used' ? '사용 완료' : '발급됨'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-500 text-xs">{new Date(coupon.created_at).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={async () => {
                                            const template = document.getElementById('coupon-template');
                                            const amountEl = document.getElementById('coupon-amount');
                                            const codeEl = document.getElementById('coupon-code');
                                            const dateEl = document.getElementById('coupon-date');

                                            if (template && amountEl && codeEl && dateEl) {
                                                amountEl.innerText = coupon.amount.toLocaleString();
                                                codeEl.innerText = coupon.code;
                                                dateEl.innerText = new Date(coupon.created_at).toLocaleDateString();
                                                
                                                // 렌더링 버그 수정을 위해 hidden 대신 위치만 오프셋
                                                template.classList.remove('hidden');
                                                template.style.left = '0px';

                                                try {
                                                    await document.fonts.ready;
                                                    await new Promise(r => setTimeout(r, 100)); // reflow 대기

                                                    const canvas = await html2canvas(template, { 
                                                        scale: 3,
                                                        useCORS: true,
                                                        backgroundColor: null,
                                                        scrollX: 0,
                                                        scrollY: 0,
                                                        x: 0,
                                                        y: 0,
                                                        width: 450,
                                                        height: 220 
                                                    });
                                                    
                                                    const link = document.createElement('a');
                                                    link.download = `10년의약속_쿠폰_${coupon.code}.jpg`;
                                                    link.href = canvas.toDataURL('image/jpeg', 0.95);
                                                    link.click();
                                                    showToast('success', '다운로드 완료', '쿠폰 이미지가 저장되었습니다.');
                                                } catch (err) {
                                                    console.error('Image Gen Error', err);
                                                    showToast('error', '오류', '이미지 생성 실패');
                                                } finally {
                                                    template.classList.add('hidden');
                                                    template.style.left = '-9999px';
                                                }
                                            }
                                        }}
                                        className="text-gray-400 hover:text-indigo-600 transition-colors p-2"
                                        title="이미지로 다운로드"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
