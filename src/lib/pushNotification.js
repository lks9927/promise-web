import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/**
 * Base64 URL → Uint8Array 변환 (VAPID 공개키 변환용)
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * 서비스 워커 등록 + 푸시 구독 요청
 * - 알림 권한 요청
 * - 구독 정보를 Supabase profiles.push_subscription 에 저장
 */
export async function registerPushSubscription(userId) {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('[Push] 브라우저가 Web Push를 지원하지 않습니다.');
            return null;
        }

        // 1. 서비스 워커 등록
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('[Push] Service Worker 등록 완료');

        // 2. 알림 권한 요청
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[Push] 알림 권한이 거부되었습니다.');
            return null;
        }

        // 3. 기존 구독 확인 또는 신규 구독
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
        }

        console.log('[Push] 구독 완료:', subscription.endpoint.slice(-20) + '...');

        // 4. Supabase에 구독 정보 저장
        const subscriptionJson = subscription.toJSON();
        const { error } = await supabase
            .from('profiles')
            .update({ push_subscription: subscriptionJson })
            .eq('id', userId);

        if (error) {
            console.error('[Push] 구독 저장 실패:', error);
        } else {
            console.log('[Push] ✅ 구독 정보 저장 완료');
        }

        return subscriptionJson;
    } catch (err) {
        console.error('[Push] 등록 실패:', err);
        return null;
    }
}

/**
 * 대상 유저들의 push_subscription 가져오기
 */
export async function fetchPushSubscriptions(userIds) {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, push_subscription')
        .in('id', userIds)
        .not('push_subscription', 'is', null);

    if (error) {
        console.error('[Push] 구독 조회 실패:', error);
        return [];
    }

    return data
        .filter(p => p.push_subscription)
        .map(p => p.push_subscription);
}

/**
 * Web Push 발송 (Vercel API 통해서)
 */
export async function sendWebPush(userIds, title, body, url = '/') {
    try {
        const subscriptions = await fetchPushSubscriptions(userIds);
        if (subscriptions.length === 0) {
            console.log('[Push] 구독자 없음 - 스킵');
            return;
        }

        const res = await fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscriptions, title, body, url }),
        });

        const result = await res.json();
        console.log(`[Push] 발송 결과:`, result);
    } catch (err) {
        console.error('[Push] 발송 실패:', err);
    }
}
