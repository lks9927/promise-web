import React from 'react';
import { AlertCircle } from 'lucide-react';

export function PasswordResetRequests({ passwordRequests, onApproveReset }) {
    if (!passwordRequests || passwordRequests.length === 0) return null;

    return (
        <div id="pw-requests" className="mb-8 bg-red-50 border border-red-200 rounded-xl p-6">
            <h4 className="font-bold text-red-800 flex items-center gap-2 mb-4">
                <AlertCircle className="w-5 h-5" /> 비밀번호 초기화 요청 ({passwordRequests.length})
            </h4>
            <div className="space-y-3">
                {passwordRequests.map(req => (
                    <div key={req.id} className="bg-white p-4 rounded-lg border border-red-100 flex items-center justify-between shadow-sm">
                        <div>
                            <span className="font-bold text-gray-900">{req.name}</span>
                            <span className="text-gray-500 text-sm ml-2">({req.phone})</span>
                            <span className="block text-xs text-gray-400 mt-1">{req.role}</span>
                        </div>
                        <button
                            onClick={() => onApproveReset(req.id, req.phone, req.name, req.role)}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm font-bold rounded hover:bg-red-700 transition-colors"
                        >
                            초기화 승인
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
