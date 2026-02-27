import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [user, setUser] = useState(null);

    // Toast State
    const [toast, setToast] = useState(null); // { type, message, duration }

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    useEffect(() => {
        if (!user) return;

        // 1. Initial Fetch
        fetchNotifications();

        // 2. Realtime Subscription
        const subscription = supabase
            .channel('public:notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`,
                },
                (payload) => {
                    console.log('New Notification:', payload.new);
                    handleNewNotification(payload.new);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [user]);

    const fetchNotifications = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (!error && data) {
            setNotifications(data);
            setUnreadCount(data.filter((n) => !n.is_read).length);
        }
    };

    const playNotificationSound = () => {
        try {
            // Base64 encoded short 'ding' sound (mp3 format) to ensure it plays across all devices (Windows/Android/iOS)
            // without needing external network requests or complex Web Audio API initialization which is often blocked.
            const dingSound = 'data:audio/mp3;base64,//OExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//OExEAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//OExIAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//OExMAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

            // A more standard and reliable way to play a simple notification sound.
            // Using a distinct, very short base64 string for a notification chime to save space.
            // This is a minimal valid MP3 frame, actual sound will need a real base64 string,
            // so we will fallback to a generated beep if we don't have a real mp3.

            // Actually, let's use a very reliable Web Audio API approach but with user-interaction unlock handling,
            // or just simple HTML5 Audio. Since we don't have a raw MP3 string handy, let's refine the Web Audio API
            // which DOES work on Android/Windows if we ensure it's not muted. 

            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();

            // Try to resume the audio context in case it was suspended by browser autoplay policy
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc.type = 'sine';

            // Two-tone chime for better audibility
            osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5

            // Volumn envelope
            gainNode.gain.setValueAtTime(0, ctx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        } catch (e) {
            console.warn("Audio play failed", e);
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
    const sendNotification = async (targetUserId, type, title, message, link = null) => {
        try {
            await supabase.from('notifications').insert([
                { user_id: targetUserId, type, title, message, link }
            ]);
        } catch (error) {
            console.error('Failed to send notification:', error);
        }
    };

    return (
        <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, toast, showToast, sendNotification }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    return useContext(NotificationContext);
}
