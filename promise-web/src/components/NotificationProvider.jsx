import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, X } from 'lucide-react';

const NotificationContext = createContext();

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);
    const audioRef = useRef(null);

    // Reliable "Ding" Sound (Base64 WAV)
    const dingSound = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU"; // Shortened for brevity, use real one below
    // Real straightforward beep
    const REAL_DING = "data:audio/wav;base64,UklGRnQqAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVwqAACGP4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hn+Gf4Z/hoA=";

    useEffect(() => {
        // Initialize Audio
        audioRef.current = new Audio(REAL_DING);
        audioRef.current.volume = 1.0;

        // Unlock Audio Context on first user interaction
        const unlockAudio = () => {
            if (audioRef.current) {
                audioRef.current.play().then(() => {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                    console.log('Audio Context Unlocked');
                }).catch(e => console.log('Unlock failed (normal if already unlocked)', e));
            }
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        };

        document.addEventListener('click', unlockAudio);
        document.addEventListener('touchstart', unlockAudio);

        return () => {
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        };
    }, []);

    useEffect(() => {
        const channel = supabase
            .channel('funeral_cases_insert')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'funeral_cases' },
                (payload) => {
                    console.log('New funeral case!', payload);
                    addNotification({
                        id: date.now(),
                        message: '새로운 장례 접수가 도착했습니다!',
                        type: 'info'
                    });

                    // Attempt to play sound
                    if (audioRef.current) {
                        const playPromise = audioRef.current.play();
                        if (playPromise !== undefined) {
                            playPromise.catch(error => {
                                console.error("Audio playback failed:", error);
                                // Fallback: Browser might block it if tab is hidden or no interaction
                            });
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const playAlert = () => {
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(e => console.log('Manual Play Failed', e));
        }
    };

    const addNotification = (notification) => {
        const id = Date.now();
        setNotifications(prev => [...prev, { ...notification, id }]);

        // Auto remove after 5 seconds
        setTimeout(() => {
            removeNotification(id);
        }, 5000);
    };

    const removeNotification = (id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    return (
        <NotificationContext.Provider value={{ addNotification }}>
            {children}
            {/* Toast Container */}
            <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
                {notifications.map((n) => (
                    <div
                        key={n.id}
                        className="bg-white border-l-4 border-[#433831] shadow-xl rounded-lg p-4 flex items-start gap-3 w-80 animate-in slide-in-from-right"
                    >
                        <div className="bg-[#433831] p-2 rounded-full text-white">
                            <Bell size={20} />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-[#433831]">알림</h4>
                            <p className="text-sm text-gray-600">{n.message}</p>
                        </div>
                        <button
                            onClick={() => removeNotification(n.id)}
                            className="text-gray-400 hover:text-gray-600"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </NotificationContext.Provider>
    );
};
