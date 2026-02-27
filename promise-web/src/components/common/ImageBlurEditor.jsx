import React, { useState, useRef, useEffect } from 'react';
import { X, Save, Undo, Info } from 'lucide-react';

export default function ImageBlurEditor({ imageUrl, onSave, onCancel }) {
    const canvasRef = useRef(null);
    const [image, setImage] = useState(null);
    const [blurRects, setBlurRects] = useState([]);
    const [isDrawing, setIsDrawing] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            setImage(img);
        };
        img.src = imageUrl;
    }, [imageUrl]);

    useEffect(() => {
        if (!image || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Set canvas matches image aspect ratio but fits inside max 600px width
        const maxWidth = 600;
        const scale = Math.min(1, maxWidth / image.width);
        canvas.width = image.width * scale;
        canvas.height = image.height * scale;

        drawCanvas(ctx, canvas.width, canvas.height, scale);
    }, [image, blurRects, currentPos, isDrawing]);

    const drawCanvas = (ctx, width, height, scale) => {
        ctx.clearRect(0, 0, width, height);

        // 1. Draw base image
        ctx.filter = 'none';
        ctx.drawImage(image, 0, 0, width, height);

        // 2. Apply saved blurs
        blurRects.forEach(rect => {
            applyBlurToRect(ctx, rect.x, rect.y, rect.w, rect.h, width, height);
        });

        // 3. Draw current dragging blur
        if (isDrawing) {
            const rx = Math.min(startPos.x, currentPos.x);
            const ry = Math.min(startPos.y, currentPos.y);
            const rw = Math.abs(currentPos.x - startPos.x);
            const rh = Math.abs(currentPos.y - startPos.y);

            // Preview blur
            applyBlurToRect(ctx, rx, ry, rw, rh, width, height);

            // Draw a semi-transparent guide box
            ctx.strokeStyle = '#4f46e5'; // indigo-600
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.setLineDash([]);
        }
    };

    const applyBlurToRect = (ctx, x, y, w, h, width, height) => {
        if (w <= 0 || h <= 0) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        ctx.filter = 'blur(10px)'; // High blur for masking
        ctx.drawImage(image, 0, 0, width, height);

        ctx.restore();
    };

    const getMousePos = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        // Handle touch and mouse events
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const handleStart = (e) => {
        // e.preventDefault(); // Sometimes prevents touch scrolling if needed, but we use touch-none class on canvas
        const pos = getMousePos(e);
        setStartPos(pos);
        setCurrentPos(pos);
        setIsDrawing(true);
    };

    const handleMove = (e) => {
        if (!isDrawing) return;
        // e.preventDefault();
        setCurrentPos(getMousePos(e));
    };

    const handleEnd = (e) => {
        if (!isDrawing) return;
        setIsDrawing(false);
        const rx = Math.min(startPos.x, currentPos.x);
        const ry = Math.min(startPos.y, currentPos.y);
        const rw = Math.abs(currentPos.x - startPos.x);
        const rh = Math.abs(currentPos.y - startPos.y);

        if (rw > 10 && rh > 10) {
            setBlurRects([...blurRects, { x: rx, y: ry, w: rw, h: rh }]);
        }
    };

    const handleUndo = () => {
        setBlurRects(blurRects.slice(0, -1));
    };

    const handleSave = () => {
        if (!canvasRef.current) return;

        // Output at original resolution!
        // We create a temporary hidden canvas with the original image dimensions
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = image.width;
        offscreenCanvas.height = image.height;
        const offCtx = offscreenCanvas.getContext('2d');

        // Draw original
        offCtx.filter = 'none';
        offCtx.drawImage(image, 0, 0);

        // Calculate scale ratio between preview canvas and original image
        const maxWidth = 600;
        const scaleRatio = image.width / Math.min(image.width, maxWidth);

        // Apply all blurs scaled up
        blurRects.forEach(rect => {
            const scaledW = rect.w * scaleRatio;
            const scaledH = rect.h * scaleRatio;
            if (scaledW <= 0 || scaledH <= 0) return;

            offCtx.save();
            offCtx.beginPath();
            offCtx.rect(rect.x * scaleRatio, rect.y * scaleRatio, scaledW, scaledH);
            offCtx.clip();

            // Adjust blur radius for upscale
            offCtx.filter = `blur(${10 * scaleRatio}px)`;
            offCtx.drawImage(image, 0, 0, image.width, image.height);

            offCtx.restore();
        });

        // Output as blob
        offscreenCanvas.toBlob((blob) => {
            onSave(blob);
        }, 'image/jpeg', 0.9);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
            <div className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <span>보안 마스킹 에디터</span>
                    </h3>
                    <button onClick={onCancel} className="text-gray-400 hover:text-gray-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 bg-blue-50 text-blue-800 text-sm flex gap-2 items-start border-b border-blue-100 flex-shrink-0">
                    <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-600" />
                    <p>주민등록번호 뒷자리, 연락처 등 민감한 개인정보 영역을 <strong className="font-bold">마우스나 손가락으로 드래그</strong>하여 블러(모자이크) 처리해주세요.</p>
                </div>

                <div className="flex-1 overflow-auto p-4 flex justify-center items-center bg-gray-200">
                    {!image ? (
                        <div className="text-gray-500">이미지 로딩 중...</div>
                    ) : (
                        <div className="relative shadow-xl ring-1 ring-black/5 bg-white">
                            <canvas
                                ref={canvasRef}
                                onMouseDown={handleStart}
                                onMouseMove={handleMove}
                                onMouseUp={handleEnd}
                                onMouseLeave={handleEnd}
                                onTouchStart={handleStart}
                                onTouchMove={handleMove}
                                onTouchEnd={handleEnd}
                                className="cursor-crosshair w-full h-auto touch-none"
                            />
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
                    <button
                        onClick={handleUndo}
                        disabled={blurRects.length === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                        <Undo className="w-4 h-4" /> 되돌리기
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm"
                    >
                        <Save className="w-4 h-4" /> 완료 및 저장
                    </button>
                </div>
            </div>
        </div>
    );
}
