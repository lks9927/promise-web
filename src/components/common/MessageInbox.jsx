import React, { useState, useEffect } from 'react';
import { Mail, Send, Check, X, Bell, Edit3 } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';
import { supabase } from '../../lib/supabase';

export default function MessageInbox({ isOpen, onClose, user }) {
    const { notifications, markAsRead, markAllAsRead, fetchSentMessages, showToast } = useNotification();
    const [activeTab, setActiveTab] = useState('received'); // 'received' or 'sent' or 'compose'
    const [sentMessages, setSentMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const [replyTarget, setReplyTarget] = useState(null);

    // Compose State
    const [teamProfiles, setTeamProfiles] = useState([]);
    const [composeData, setComposeData] = useState({ recipientId: '', title: '', message: '' });
    const [isSending, setIsSending] = useState(false);

    const [hasLoadedProfiles, setHasLoadedProfiles] = useState(false);

    useEffect(() => {
        if (isOpen && activeTab === 'sent') {
            loadSentMessages();
        }
        if (isOpen && activeTab === 'compose' && !hasLoadedProfiles) {
            loadTeamProfiles();
        }
    }, [isOpen, activeTab, hasLoadedProfiles]);

    const loadSentMessages = async () => {
        setIsLoading(true);
        const data = await fetchSentMessages(user.id);
        setSentMessages(data || []);
        setIsLoading(false);
    };

    const loadTeamProfiles = async () => {
        try {
            // 1. Fetch current user's profile to know exact role
            const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            const myRole = myProfile?.role;
            let allowedIds = [];
            let includeAdminAll = false;

            // 2. Add relational connections based on role
            if (myRole === 'dealer' || myRole === 'leader' || myRole === 'vendor') {
                // Find my master
                const { data: myPartner } = await supabase.from('partners').select('master_id').eq('user_id', user.id).single();
                if (myPartner?.master_id) allowedIds.push(myPartner.master_id);
                includeAdminAll = true;
            } else if (myRole === 'master') {
                // Find my team members
                const { data: myTeam } = await supabase.from('partners').select('user_id').eq('master_id', user.id);
                if (myTeam) allowedIds.push(...myTeam.map(t => t.user_id));
                includeAdminAll = true;
            } else if (myRole === 'admin') {
                // Admin can message anyone
                const { data: allProfiles } = await supabase.from('profiles').select('id, name, role').neq('id', user.id);
                setTeamProfiles(allProfiles || []);
                return;
            }

            if (allowedIds.length > 0) {
                // Avoid fetching self if admin was added or something
                const filteredIds = allowedIds.filter(id => id !== user.id);
                const { data } = await supabase.from('profiles').select('id, name, role').in('id', filteredIds);
                
                let combinedProfiles = data || [];
                if (includeAdminAll) {
                    combinedProfiles = [{ id: 'admin_all', name: '👑 전체 관리자 (공통)', role: 'virtual_admin' }, ...combinedProfiles];
                }
                setTeamProfiles(combinedProfiles);
            } else {
                setTeamProfiles(includeAdminAll ? [{ id: 'admin_all', name: '👑 전체 관리자 (공통)', role: 'virtual_admin' }] : []);
            }
        } catch (error) {
            console.error('Error loading team profiles:', error);
            setTeamProfiles([]);
        } finally {
            setHasLoadedProfiles(true);
        }
    };

    const handleComposeSubmit = async (e) => {
        e.preventDefault();
        if (!composeData.recipientId || !composeData.title.trim() || !composeData.message.trim()) {
            showToast('warning', '작성 오류', '수신자, 제목, 내용을 모두 입력해주세요.');
            return;
        }

        setIsSending(true);
        try {
            let recipients = [];

            if (composeData.recipientId === 'admin' || composeData.recipientId === 'admin_all') {
                const { data: adminProfiles } = await supabase.from('profiles').select('id, phone').eq('role', 'admin');
                if (adminProfiles && adminProfiles.length > 0) {
                    recipients = adminProfiles.map(p => ({ id: p.id, phone: p.phone }));
                } else throw new Error('관리자를 찾을 수 없습니다.');
            } else {
                const { data: profile } = await supabase.from('profiles').select('id, phone').eq('id', composeData.recipientId).single();
                if (profile) recipients = [{ id: profile.id, phone: profile.phone }];
            }

            const notificationsToInsert = recipients.map(r => ({
                user_id: r.id,
                sender_id: user.id,
                type: 'info',
                title: composeData.title,
                message: composeData.message
            }));

            const { error } = await supabase.from('notifications').insert(notificationsToInsert);

            if (error) throw error;
            
            const phonesToText = recipients.filter(r => r.phone).map(r => r.phone);
            if (phonesToText.length > 0) {
                // Send SMS to all
                Promise.allSettled(
                    phonesToText.map(phone => 
                        fetch('/api/send-message', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                to: phone,
                                subject: `[10년의 약속 알림] ${composeData.title}`,
                                text: composeData.message
                            })
                        })
                    )
                ).catch(err => console.error("SMS Request Error:", err));
            }

            showToast('success', '발송 완료', '메시지가 성공적으로 전송되었습니다.');
            setComposeData({ recipientId: '', title: '', message: '' });
            setActiveTab('sent');
        } catch (error) {
            console.error('Send message error:', error);
            showToast('error', '발송 실패', error.message || '알 수 없는 오류가 발생했습니다.');
        } finally {
            setIsSending(false);
        }
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
                        <button
                            onClick={() => setActiveTab('compose')}
                            className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'compose' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:bg-gray-50'
                                }`}
                        >
                            <Edit3 className="w-4 h-4" /> 메시지 보내기
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
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex justify-between items-start gap-3">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                {!notif.is_read && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span>}
                                                                <span className={`text-xs font-bold uppercase ${notif.type === 'error' ? 'text-red-500' : notif.type === 'success' ? 'text-green-500' : notif.type === 'warning' ? 'text-orange-500' : 'text-indigo-500'}`}>
                                                                    {notif.type}
                                                                </span>
                                                                <span className="text-xs text-gray-400">
                                                                    {new Date(notif.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                                {notif.sender && (
                                                                    <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded ml-1">
                                                                        보낸사람: {notif.sender.name}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <h4 className="text-sm font-bold text-gray-900 mb-1">{notif.title}</h4>
                                                            <p className="text-sm text-gray-600 whitespace-pre-wrap">{notif.message}</p>
                                                        </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Action Button Area */}
                                                    <div className="mt-2 text-right">
                                                        {!notif.is_read ? (
                                                            <button 
                                                                onClick={() => markAsRead(notif.id)} 
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded text-xs font-bold transition-colors"
                                                            >
                                                                <Check className="w-3 h-3" />
                                                                확인 완료
                                                            </button>
                                                        ) : (
                                                            notif.sender_id && (
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        let repId = notif.sender_id;
                                                                        if (!notif.sender || notif.sender?.role === 'admin') repId = 'admin_all';
                                                                        
                                                                        setComposeData({
                                                                            recipientId: repId,
                                                                            title: `Re: ${notif.title.replace(/^Re: /i, '')}`,
                                                                            message: ''
                                                                        });
                                                                        setActiveTab('compose');
                                                                    }}
                                                                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded text-xs font-bold transition-colors"
                                                                >
                                                                    <Send className="w-3 h-3" />
                                                                    답장하기
                                                                </button>
                                                            )
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

                    {activeTab === 'compose' && (
                        <div className="p-4 bg-white m-2 rounded-xl border border-gray-100 shadow-sm animate-fadeIn">
                            <form onSubmit={handleComposeSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1 flex justify-between">
                                        <span>받는 사람</span>
                                        <span className="text-xs text-indigo-500 font-normal">팀원 목록에서 선택하세요</span>
                                    </label>
                                    <select
                                        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                                        value={composeData.recipientId}
                                        onChange={(e) => setComposeData({ ...composeData, recipientId: e.target.value })}
                                    >
                                        <option value="">수신자를 선택해주세요</option>
                                        {teamProfiles.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.role === 'virtual_admin' ? p.name : `${p.name} (${p.role === 'admin' ? '최고관리자' : (p.role === 'master' ? '본부장' : (p.role === 'leader' ? '팀장' : '딜러'))})`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">제목</label>
                                    <input
                                        type="text"
                                        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                        placeholder="제목을 입력하세요"
                                        value={composeData.title}
                                        onChange={(e) => setComposeData({ ...composeData, title: e.target.value })}
                                        maxLength={50}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">내용</label>
                                    <textarea
                                        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none text-sm"
                                        placeholder="메시지 내용을 입력하세요"
                                        value={composeData.message}
                                        onChange={(e) => setComposeData({ ...composeData, message: e.target.value })}
                                        maxLength={500}
                                    ></textarea>
                                </div>

                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={isSending}
                                        className="w-full bg-indigo-600 text-white font-bold text-base py-3.5 rounded-xl shadow-md hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        <Send className="w-5 h-5" />
                                        {isSending ? '전송 중...' : '보내기'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
