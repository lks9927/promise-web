// 10년의 약속 - Service Worker for Web Push Notifications
const CACHE_NAME = 'promise-sw-v1';

self.addEventListener('install', (event) => {
    console.log('[SW] 설치 완료');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('[SW] 활성화 완료');
    event.waitUntil(self.clients.claim());
});

// 푸시 이벤트: 백그라운드/대기 상태에서 수신
self.addEventListener('push', (event) => {
    console.log('[SW] 푸시 수신:', event);

    let data = {
        title: '10년의 약속',
        body: '새 알림이 도착했습니다.',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'promise-notification',
        renotify: true,
    };

    if (event.data) {
        try {
            const parsed = event.data.json();
            data = { ...data, ...parsed };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/favicon.ico',
        badge: data.badge || '/favicon.ico',
        tag: data.tag || 'promise-notification',
        renotify: true,
        vibrate: [200, 100, 200, 100, 200], // 진동 패턴
        data: { url: data.url || '/' },
        actions: [
            { action: 'open', title: '확인하기' },
            { action: 'close', title: '닫기' },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// 알림 클릭: 앱 열기
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close') return;

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // 이미 열린 탭이 있으면 포커스
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // 새 탭 열기
            if (self.clients.openWindow) {
                return self.clients.openWindow(urlToOpen);
            }
        })
    );
});
