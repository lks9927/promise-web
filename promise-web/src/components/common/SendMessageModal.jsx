import React, { useState } from 'react';
import { Send, X } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';

export default function SendMessageModal({ isOpen, onClose, recipientId, recipientName, recipientRoleClass }) {
    const { showToast } = useNotification();
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    if (!isOpen) return null;

    const handleSend = async (e) => {
        e.preventDefault();

        if (!title.trim() || !message.trim()) {
            showToast('warning', '작성 오류', '제목과 내용을 모두 입력해주세요.');
            return;
        }

        if (!confirm(`${recipientName}님에게 메시지를 보내시겠습니까?`)) return;

        setIsSending(true);

        try {
            const { error } = await supabase.from('notifications').insert([{
                user_id: recipientId,
                type: 'info',
                title: title,
                message: message
            }]);

            if (error) throw error;

            // Attempt to send Kakao/SMS via Solapi API
            const { data: profile } = await supabase
                .from('profiles')
                .select('phone')
                .eq('id', recipientId)
                .single();

            if (profile && profile.phone) {
                // Send SMS asynchronously 
                fetch('/api/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: profile.phone,
                        subject: `[10년의 약속 알림] ${title}`,
                        text: message
                    })
                }).catch(err => console.error("SMS Request Error:", err));
            }

            showToast('success', '발송 완료', '메시지 및 알림이 성공적으로 전송되었습니다.');
            onClose();
            setTitle('');
            setMessage('');
        } catch (error) {
            console.error('Send message error:', error);
            showToast('error', '발송 실패', error.message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50">
                    <div>
                        <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                            <Send className="w-5 h-5 text-indigo-600" /> 메시지 보내기
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            <span className="font-bold text-indigo-600">{recipientName}</span> {recipientRoleClass}님에게 알림을 보냅니다.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <form onSubmit={handleSend} className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">제목</label>
                        <input
                            type="text"
                            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                            placeholder="제목을 입력하세요"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={50}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">내용</label>
                        <textarea
                            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none text-sm"
                            placeholder="메시지 내용을 입력하세요"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            maxLength={500}
                        ></textarea>
                    </div>

                    <button
                        type="submit"
                        disabled={isSending}
                        className="w-full bg-indigo-600 text-white font-bold text-base py-3.5 rounded-xl shadow-md hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                    >
                        {isSending ? '전송 중...' : '보내기'}
                    </button>
                </form>
            </div>
        </div>
    );
}
