import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Download, QrCode } from 'lucide-react';
import { getMyCardCoupon } from '../../lib/preRegistration';

const download = (content, filename, type) => {
    const blob = content.startsWith('data:')
        ? (() => { const [header, encoded] = content.split(','); const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); return new Blob([bytes], { type: header.match(/:(.*?);/)?.[1] || type }); })()
        : new Blob([content], { type });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
};

export function CardQrModal({ open, onClose, dealerId }) {
    const [code, setCode] = useState(null);
    const [png, setPng] = useState('');
    const [svg, setSvg] = useState('');

    useEffect(() => {
        if (!open) return;
        let active = true;
        setCode(null); setPng(''); setSvg('');
        getMyCardCoupon(dealerId).then(async ({ data, error }) => {
            if (!active || error || !data) return;
            const link = `${window.location.origin}/coupon/${data}`;
            const [nextPng, nextSvg] = await Promise.all([
                QRCode.toDataURL(link, { width: 1200, margin: 2, errorCorrectionLevel: 'M' }),
                QRCode.toString(link, { type: 'svg', margin: 2 })
            ]);
            if (active) { setCode(data); setPng(nextPng); setSvg(nextSvg); }
        }).catch(() => {});
        return () => { active = false; };
    }, [open, dealerId]);

    if (!open) return null;
    const link = code ? `${typeof window === 'undefined' ? '' : window.location.origin}/coupon/${code}` : '';
    return <div className="fixed inset-0 z-[100] bg-black/60 p-3 sm:p-6 flex items-center justify-center" role="dialog" aria-modal="true">
        <div className="bg-white w-full max-w-2xl max-h-full overflow-y-auto rounded-3xl p-5 sm:p-8 text-center shadow-2xl">
            <div className="flex justify-between items-center mb-4"><div className="flex gap-2 items-center text-xl font-black"><QrCode /> 내 명함 QR</div><button onClick={onClose} className="p-2" aria-label="닫기"><X /></button></div>
            {!code ? <div className="py-16 text-xl font-bold text-gray-600">명함 QR 을 준비 중입니다</div> : <>
                <img src={png} alt="내 명함 QR 코드" className="w-full max-w-[520px] mx-auto rounded-xl" />
                <p className="mt-5 text-3xl sm:text-4xl font-black tracking-[0.2em]">{code}</p>
                <p className="mt-3 break-all text-base sm:text-lg text-gray-600">{link}</p>
                <div className="grid sm:grid-cols-2 gap-3 mt-6">
                    <button onClick={() => download(png, '내_명함_QR.png', 'image/png')} className="py-4 rounded-xl bg-indigo-600 text-white text-lg font-black flex justify-center gap-2"><Download /> 명함용 PNG 저장</button>
                    <button onClick={() => download(svg, '내_명함_QR.svg', 'image/svg+xml')} className="py-4 rounded-xl border-2 border-indigo-600 text-indigo-700 text-lg font-black flex justify-center gap-2"><Download /> SVG 저장</button>
                </div>
            </>}
        </div>
    </div>;
}
