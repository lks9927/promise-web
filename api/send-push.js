const webpush = require('web-push');

webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@10promise.co.kr',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { subscriptions, title, body, url } = req.body;

    if (!subscriptions || !Array.isArray(subscriptions) || subscriptions.length === 0) {
        return res.status(400).json({ error: 'subscriptions 배열이 필요합니다.' });
    }

    const payload = JSON.stringify({
        title: title || '10년의 약속',
        body: body || '새 알림이 도착했습니다.',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        url: url || '/',
        tag: 'promise-notification',
    });

    const results = await Promise.allSettled(
        subscriptions.map((subscription) =>
            webpush.sendNotification(subscription, payload)
        )
    );

    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`[Push] 발송 완료: 성공 ${succeeded}, 실패 ${failed}`);

    return res.status(200).json({ succeeded, failed });
};
