import React from 'react';
import { X, Check, Bell, ExternalLink, Trash2 } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';

export default function NotificationCenter({ onClose }) {
    const { notifications, markAsRead, markAllAsRead } = useNotification();
    const navigate = useNavigate();

    const handleLink = (link) => {
        if (link) {
            navigate(link);
            onClose();
        }
    };

    return (
        <div className="absolute top-12 right-0 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-fadeIn origin-top-right">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-indigo-600 fill-current" />
                    알림 센터
                </h3>
                <div className="flex items-center gap-2">
                    {notifications.length > 0 && (
                        <button onClick={markAllAsRead} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-2 py-1 hover:bg-indigo-50 rounded transition-colors">
                            모두 읽음
                        </button>
                    )}
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
                {notifications.length === 0 ? (
                    <div className="py-12 text-center text-gray-400">
                        <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>새로운 알림이 없습니다.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {notifications.map((notif) => (
                            <div
                                key={notif.id}
                                className={`p-4 hover:bg-gray-50 transition-colors relative group ${notif.is_read ? 'opacity-60 bg-gray-50/50' : 'bg-white'}`}
                            >
                                <div className="flex justify-between items-start gap-3">
                                    <div className="flex-1 cursor-pointer" onClick={() => handleLink(notif.link)}>
                                        <div className="flex items-center gap-2 mb-1">
                                            {!notif.is_read && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 animate-pulse"></span>}
                                            <span className={`text-xs font-bold uppercase tracking-wider ${notif.type === 'error' ? 'text-red-600' :
                                                    notif.type === 'success' ? 'text-green-600' :
                                                        notif.type === 'warning' ? 'text-orange-600' : 'text-blue-600'
                                                }`}>{notif.type}</span>
                                            <span className="text-xs text-gray-400">{new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <h4 className="text-sm font-bold text-gray-900 mb-1">{notif.title}</h4>
                                        <p className="text-sm text-gray-600 leading-snug">{notif.message}</p>
                                        {notif.link && (
                                            <div className="mt-2 flex items-center gap-1 text-xs text-indigo-600 font-medium group-hover:underline">
                                                바로가기 <ExternalLink className="w-3 h-3" />
                                            </div>
                                        )}
                                    </div>
                                    {!notif.is_read && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); markAsRead(notif.id); }}
                                            className="text-gray-300 hover:text-green-600 transition-colors p-1"
                                            title="읽음 처리"
                                        >
                                            <Check className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="p-2 border-t border-gray-100 bg-gray-50 text-center text-xs text-gray-400">
                최근 30일 간의 알림만 보관됩니다.
            </div>
        </div>
    );
}
