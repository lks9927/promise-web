import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Download, QrCode } from 'lucide-react';
import { getMyCardCoupon } from '../../lib/preRegistration';

const FONT = '"Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const escapeXml = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
const download = (content, filename, type) => {
    const blob = content.startsWith('data:') ? (() => { const [header, encoded] = content.split(','); const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); return new Blob([bytes], { type: header.match(/:(.*?);/)?.[1] || type }); })() : new Blob([content], { type });
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = filename; anchor.click(); URL.revokeObjectURL(anchor.href);
};
const dealerFontSize = (name) => name && name.length > 10 ? 58 : name && name.length > 7 ? 70 : 82;
const makeSvg = (qrSvg, code, link, dealerName) => {
    const qrBody = qrSvg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''); const name = dealerName?.trim();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1700" viewBox="0 0 1200 1700"><rect width="1200" height="1700" fill="#fff"/><text x="600" y="150" text-anchor="middle" fill="#1f2937" font-family="${FONT}" font-size="64" font-weight="700">10년의 약속</text><g transform="translate(150 270) scale(27.2727)">${qrBody}</g>${name ? `<text x="600" y="1290" text-anchor="middle" fill="#111827" font-family="${FONT}" font-size="${dealerFontSize(name)}" font-weight="700">담당 ${escapeXml(name)}</text>` : ''}<text x="600" y="${name ? 1385 : 1325}" text-anchor="middle" fill="#4b5563" font-family="${FONT}" font-size="42">가족 안심 등록</text><text x="600" y="1540" text-anchor="middle" fill="#6b7280" font-family="${FONT}" font-size="25">${escapeXml(code)}</text><text x="600" y="1585" text-anchor="middle" fill="#6b7280" font-family="${FONT}" font-size="20">${escapeXml(link)}</text></svg>`;
};
const makePng = async (qrDataUrl, code, link, dealerName) => {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1700; const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.textAlign = 'center'; ctx.fillStyle = '#1f2937'; ctx.font = `700 64px ${FONT}`; ctx.fillText('10년의 약속', 600, 150);
    const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = qrDataUrl; }); ctx.drawImage(image, 150, 270, 900, 900);
    const name = dealerName?.trim(); if (name) { ctx.fillStyle = '#111827'; ctx.font = `700 ${dealerFontSize(name)}px ${FONT}`; ctx.fillText(`담당 ${name}`, 600, 1290); }
    ctx.fillStyle = '#4b5563'; ctx.font = `42px ${FONT}`; ctx.fillText('가족 안심 등록', 600, name ? 1385 : 1325); ctx.fillStyle = '#6b7280'; ctx.font = `25px ${FONT}`; ctx.fillText(code, 600, 1540); ctx.font = `20px ${FONT}`; ctx.fillText(link, 600, 1585);
    return canvas.toDataURL('image/png');
};

export function CardQrModal({ open, onClose, dealerId, dealerName }) {
    const [code, setCode] = useState(null); const [png, setPng] = useState(''); const [svg, setSvg] = useState('');
    useEffect(() => { if (!open) return; let active = true; setCode(null); setPng(''); setSvg(''); getMyCardCoupon(dealerId).then(async ({ data, error }) => { if (!active || error || !data) return; const link = `${window.location.origin}/coupon/${data}`; const [qrPng, qrSvg] = await Promise.all([QRCode.toDataURL(link, { width: 900, margin: 2, errorCorrectionLevel: 'M' }), QRCode.toString(link, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' })]); const [nextPng, nextSvg] = await Promise.all([makePng(qrPng, data, link, dealerName), makeSvg(qrSvg, data, link, dealerName)]); if (active) { setCode(data); setPng(nextPng); setSvg(nextSvg); } }).catch(() => {}); return () => { active = false; }; }, [open, dealerId, dealerName]);
    if (!open) return null;
    const link = code ? `${typeof window === 'undefined' ? '' : window.location.origin}/coupon/${code}` : '';
    return <div className="fixed inset-0 z-[100] bg-black/60 p-3 sm:p-6 flex items-center justify-center" role="dialog" aria-modal="true"><div className="bg-white w-full max-w-2xl max-h-full overflow-y-auto rounded-3xl p-5 sm:p-8 text-center shadow-2xl"><div className="flex justify-between items-center mb-4"><div className="flex gap-2 items-center text-xl font-black"><QrCode /> 내 명함 QR</div><button onClick={onClose} className="p-2" aria-label="닫기"><X /></button></div>{!code ? <div className="py-16 text-xl font-bold text-gray-600">명함 QR 을 준비 중입니다</div> : <><img src={png} alt="담당 딜러 이름이 포함된 내 명함 QR 코드" className="w-full max-w-[520px] mx-auto rounded-xl border" /><p className="mt-5 text-3xl sm:text-4xl font-black tracking-[0.2em]">{code}</p><p className="mt-3 break-all text-base sm:text-lg text-gray-600">{link}</p><div className="grid sm:grid-cols-2 gap-3 mt-6"><button onClick={() => download(png, '내_명함_QR.png', 'image/png')} className="py-4 rounded-xl bg-indigo-600 text-white text-lg font-black flex justify-center gap-2"><Download /> 명함용 PNG 저장</button><button onClick={() => download(svg, '내_명함_QR.svg', 'image/svg+xml')} className="py-4 rounded-xl border-2 border-indigo-600 text-indigo-700 text-lg font-black flex justify-center gap-2"><Download /> SVG 저장</button></div></>}</div></div>;
}
