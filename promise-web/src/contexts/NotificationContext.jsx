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

    const handleNewNotification = (newNotif) => {
        setNotifications((prev) => [newNotif, ...prev]);
        setUnreadCount((prev) => prev + 1);

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
