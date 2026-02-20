import React, { useEffect } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export default function Toast({ type, title, message, onClose }) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const getTypeStyles = () => {
        switch (type) {
            case 'success':
                return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: <CheckCircle className="w-5 h-5 text-green-500" /> };
            case 'error':
                return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: <XCircle className="w-5 h-5 text-red-500" /> };
            case 'warning':
                return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', icon: <AlertTriangle className="w-5 h-5 text-yellow-500" /> };
            default:
                return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: <Info className="w-5 h-5 text-blue-500" /> };
        }
    };

    const styles = getTypeStyles();

    return (
        <div className={`fixed top-4 right-4 z-[100] max-w-sm w-full bg-white rounded-xl shadow-2xl border ${styles.border} flex overflow-hidden animate-slideIn`}>
            <div className={`w-1.5 ${styles.bg.replace('bg-', 'bg-').replace('50', '500')}`}></div>
            <div className="flex-1 p-4 flex items-start gap-3">
                <div className="mt-0.5">{styles.icon}</div>
                <div>
                    <h4 className={`font-bold text-sm ${styles.text}`}>{title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{message}</p>
                </div>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors ml-auto">
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
