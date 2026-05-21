import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { registerPushSubscription } from '../lib/pushNotification';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [user, setUser] = useState(null);
    const fetchNotificationsRef = useRef(null);

    // Toast State
    const [toast, setToast] = useState(null); // { type, message, duration }

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    // 📱 모바일 크롬: 탭 전환 후 포그라운드 복귀 시 새 알림 즉시 동기화
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && fetchNotificationsRef.current) {
                console.log('[Visibility] 탭 복귀 감지 → 알림 재동기화');
                fetchNotificationsRef.current();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    useEffect(() => {
        if (!user) return;

        // 1. Initial Fetch
        fetchNotifications();

        // 3. Web Push 구독 등록 (백그라운드/대기 상태 알림)
        registerPushSubscription(user.id).catch(e =>
            console.warn('[Push] 구독 등록 실패 (무시 가능):', e)
        );

        // 2. Realtime Subscription - 채널명을 유저ID로 고유하게 생성해 충돌 방지
        const channelName = `notifications:user:${user.id}`;
        const subscription = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    console.log('[Realtime] New Notification:', payload.new);
                    handleNewNotification(payload.new);
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[Realtime] ✅ notifications 구독 시작 (user: ${user.id})`);
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.warn(`[Realtime] ⚠️ 구독 실패 (${status}), 재연결 시도...`, err);
                    // Supabase 클라이언트가 자동으로 재연결 시도
                }
            });

        return () => {
            console.log(`[Realtime] 🔌 구독 해제 (${channelName})`);
            supabase.removeChannel(subscription);
        };
    }, [user?.id]); // user 객체 전체 대신 id만 deps로 사용해 불필요한 재구독 방지

    const fetchNotifications = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('notifications')
            .select('*, sender:profiles!sender_id(name, role)')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (!error && data) {
            setNotifications(data);
            setUnreadCount(data.filter((n) => !n.is_read).length);
        }
    };

    // ref 업데이트: visibility 이벤트에서 최신 함수를 호출할 수 있도록
    fetchNotificationsRef.current = fetchNotifications;

    const playNotificationSound = () => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') ctx.resume();

            // 🔔 업링크 상승음 × 3회 연속 (삐요~ 삐요~ 삐요~)
            const INTERVAL = 0.6; // 각 음 간격(초)
            for (let i = 0; i < 3; i++) {
                const startTime = ctx.currentTime + i * INTERVAL;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'sine';
                // 400Hz → 1600Hz 로 빠르게 상승
                osc.frequency.setValueAtTime(400, startTime);
                osc.frequency.exponentialRampToValueAtTime(1600, startTime + 0.3);

                // 볼륨 엔벨로프: 빠르게 올라가서 유지 후 감쇠
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(1.0, startTime + 0.05);
                gain.gain.setValueAtTime(1.0, startTime + 0.25);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

                osc.start(startTime);
                osc.stop(startTime + 0.55);
            }
        } catch (e) {
            console.warn('Audio play failed', e);
        }
    };

    const handleNewNotification = (newNotif) => {
        setNotifications((prev) => [newNotif, ...prev]);
        setUnreadCount((prev) => prev + 1);

        // Play Sound
        playNotificationSound();

        // Show Toast
        showToast(newNotif.type, newNotif.title, newNotif.message);
    };

    const markAsRead = async (id) => {
        // Optimistic Update
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));

        // DB Update
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    };

    const markAllAsRead = async () => {
        // Optimistic Update
        setNotifications((prev) =>
            prev.map((n) => ({ ...n, is_read: true }))
        );
        setUnreadCount(0);

        // DB Update (Batch)
        if (user) {
            await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
        }
    };

    const showToast = (type, title, message) => {
        setToast({ type, title, message, id: Date.now() });
        // Toast auto-dismiss is handled in the Toast component or via setTimeout here
        setTimeout(() => setToast(null), 4000);
    };

    // Helper to send notification (In a real app, this is mostly done by Backend triggers, 
    // but for this MVP, client triggers are fine)
    const sendNotification = async (targetUserId, type, title, message, link = null, senderId = null) => {
        try {
            await supabase.from('notifications').insert([
                { user_id: targetUserId, sender_id: senderId, type, title, message, link }
            ]);

            // Attempt to send Kakao/SMS via Solapi API
            const { data: profile } = await supabase
                .from('profiles')
                .select('phone')
                .eq('id', targetUserId)
                .single();

            if (profile && profile.phone) {
                await fetch('/api/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: profile.phone,
                        subject: `[10년의 약속 알림] ${title}`,
                        text: message
                    })
                });
            }
        } catch (error) {
            console.error('Failed to send notification or SMS:', error);
        }
    };

    // Helper to fetch sent messages
    const fetchSentMessages = async (senderId) => {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*, receiver:profiles!user_id(name, role)')
                .eq('sender_id', senderId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Failed to fetch sent messages:', error);
            return [];
        }
    };

    return (
        <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, toast, showToast, sendNotification, fetchSentMessages }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    return useContext(NotificationContext);
}
