import React, { useState, useEffect } from 'react';
import { Mail, Send, Check, X, Bell } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';

export default function MessageInbox({ isOpen, onClose, user }) {
    const { notifications, markAsRead, markAllAsRead, fetchSentMessages } = useNotification();
    const [activeTab, setActiveTab] = useState('received'); // 'received' or 'sent'
    const [sentMessages, setSentMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen && activeTab === 'sent') {
            loadSentMessages();
        }
    }, [isOpen, activeTab]);

    const loadSentMessages = async () => {
        setIsLoading(true);
        const data = await fetchSentMessages(user.id);
        setSentMessages(data || []);
        setIsLoading(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] shadow-2xl animate-fadeIn">
                <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
                        <Mail className="w-5 h-5 text-indigo-600" />
                        메시지함
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('received')}
                        className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'received' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:bg-gray-50'
                            }`}
                    >
                        <Bell className="w-4 h-4" /> 받은 메시지
                        {notifications.filter(n => !n.is_read).length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                {notifications.filter(n => !n.is_read).length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('sent')}
                        className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'sent' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:bg-gray-50'
                            }`}
                    >
                        <Send className="w-4 h-4" /> 보낸 메시지
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-2 bg-gray-50">
                    {activeTab === 'received' && (
                        <div>
                            <div className="flex justify-end px-2 pt-2">
                                {notifications.length > 0 && (
                                    <button onClick={markAllAsRead} className="text-xs text-indigo-600 font-bold hover:underline mb-2">
                                        모두 읽음 처리
                                    </button>
                                )}
                            </div>
                            {notifications.length === 0 ? (
                                <div className="py-20 text-center text-gray-400">
                                    <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>받은 알림이나 메시지가 없습니다.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {notifications.map((notif) => (
                                        <div key={notif.id} className={`p-4 rounded-xl border transition ${notif.is_read ? 'bg-white border-gray-100 opacity-70' : 'bg-white border-indigo-100 shadow-sm ring-1 ring-indigo-50'}`}>
                                            <div className="flex justify-between items-start gap-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        {!notif.is_read && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span>}
                                                        <span className={`text-xs font-bold uppercase ${notif.type === 'error' ? 'text-red-500' : notif.type === 'success' ? 'text-green-500' : notif.type === 'warning' ? 'text-orange-500' : 'text-indigo-500'}`}>{notif.type}</span>
                                                        <span className="text-xs text-gray-400">{new Date(notif.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                    <h4 className="text-sm font-bold text-gray-900 mb-1">{notif.title}</h4>
                                                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{notif.message}</p>
                                                </div>
                                                {!notif.is_read && (
                                                    <button onClick={() => markAsRead(notif.id)} className="text-gray-300 hover:text-green-600 p-2" title="읽음">
                                                        <Check className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'sent' && (
                        <div className="p-2">
                            {isLoading ? (
                                <div className="py-20 text-center text-gray-400 animate-pulse">
                                    불러오는 중...
                                </div>
                            ) : sentMessages.length === 0 ? (
                                <div className="py-20 text-center text-gray-400">
                                    <Send className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p>보낸 메시지 내역이 없습니다.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {sentMessages.map((msg) => (
                                        <div key={msg.id} className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm relative">
                                            <div className="absolute top-4 right-4 text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded">수신자 확인 전</div>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-bold uppercase">{msg.type}</span>
                                                <span className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <h4 className="text-sm font-bold text-gray-900 mb-1">{msg.title}</h4>
                                            <p className="text-sm text-gray-600 whitespace-pre-wrap">{msg.message}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
