// Supabase Edge Function: send-alert
// To deploy: supabase functions deploy send-alert
// Requirements: You need to set NCP_SERVICE_ID, NCP_ACCESS_KEY, NCP_SECRET_KEY, NCP_SENDER_NUMBER in your Supabase project's secrets.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

// FCM config
const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY") || "";

// ============================================================
// 🔧 테스트 모드 설정
// 실제 운영 시 TEST_MODE = false 로 변경하세요
// ============================================================
const TEST_MODE = false;
const TEST_PHONE_DEALER = "01096751474";    // 딜러/마스터딜러 알림 → 이 번호로
const TEST_PHONE_LEADER = "01056541474";    // 팀장/마스터팀장 알림 → 이 번호로
const TEST_PHONE_ADMIN = "01052549927";    // 관리자/기타 알림 → 이 번호로

serve(async (req) => {
    try {
        // 1. Webhook Payload 파싱
        const payload = await req.json();
        const { type, table, record } = payload;

        console.log(`[Webhook Alert] Table: ${table}, Type: ${type}`);
        console.log(record);

        // 2. Supabase 클라이언트 및 설정 조회
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: configs } = await supabase
            .from('system_config')
            .select('key, value')
            .in('key', [
                'ios_bidding_sms_only', 'all_users_bidding_sms',
                'sms_alert_signup', 'sms_alert_funeral', 'sms_alert_emergency',
                'sms_alert_phones'
            ]);

        let iosBiddingSmsOnly = true;
        let allUsersBiddingSms = true;
        let smsAlertSignup = false;
        let smsAlertFuneral = false;
        let smsAlertEmergency = false;
        let smsAlertPhones: string[] = [];

        if (configs) {
            const conf1 = configs.find(c => c.key === 'ios_bidding_sms_only');
            if (conf1) iosBiddingSmsOnly = conf1.value !== 'false';

            const conf2 = configs.find(c => c.key === 'all_users_bidding_sms');
            if (conf2) allUsersBiddingSms = conf2.value !== 'false';

            const confSignup = configs.find(c => c.key === 'sms_alert_signup');
            if (confSignup) smsAlertSignup = confSignup.value === 'true';

            const confFuneral = configs.find(c => c.key === 'sms_alert_funeral');
            if (confFuneral) smsAlertFuneral = confFuneral.value === 'true';

            const confEmergency = configs.find(c => c.key === 'sms_alert_emergency');
            if (confEmergency) smsAlertEmergency = confEmergency.value === 'true';

            const confPhones = configs.find(c => c.key === 'sms_alert_phones');
            if (confPhones && confPhones.value) {
                smsAlertPhones = confPhones.value.split(',').map((p: string) => p.trim().replace(/[^0-9]/g, '')).filter((p: string) => p.length > 0);
            }
        }

        // 3. 알림 대상자 조회 (역할 포함)
        const { data: targets, error } = await supabase
            .from('profiles')
            .select('id, phone, name, os_type, fcm_token, role')
            .in('role', ['admin', 'leader', 'master', 'dealer']);

        if (error) throw error;
        if (!targets || targets.length === 0) {
            return new Response(JSON.stringify({ message: "No target users found." }), { status: 200 });
        }

        // INSERT 시에는 current_bidder_id가 아직 없음 (AFTER INSERT 트리거가 UPDATE로 채움)
        // 따라서 INSERT는 무시하고, AFTER INSERT 트리거가 발생시키는 UPDATE 이벤트만 처리
        const isNewBidding = false; // INSERT는 무시 — UPDATE로 자동 감지됨
        const oldBidder = payload?.old_record?.current_bidder_id;
        const newBidder = record?.current_bidder_id;
        const oldPings = payload?.old_record?.current_bidder_pings || 0;
        const newPings = record?.current_bidder_pings || 1;
        const previousBiddersCount = record?.previous_bidders?.length || 0;

        // 최초 배정: bidder가 null → 값이 들어올 때 (AFTER INSERT 트리거의 결과)
        const isFirstAssignment = (table === 'funeral_cases') && (type === 'UPDATE') && !oldBidder && newBidder;
        // 순번 변경: bidder가 A → B로 바뀔 때
        const isTurnChanged = (table === 'funeral_cases') && (type === 'UPDATE') && oldBidder && (oldBidder !== newBidder) && newBidder;
        // 핑 증가: 같은 bidder인데 핑 카운트만 올라갈 때
        const isPingIncreased = (table === 'funeral_cases') && (type === 'UPDATE') && (oldBidder === newBidder) && newBidder && (newPings > oldPings);
        
        const isBiddingAlarm = isFirstAssignment || isTurnChanged || isPingIncreased;

        // 신규 회원 가입 처리 (profiles INSERT)
        if ((table === 'profiles') && (type === 'INSERT')) {
            if (smsAlertSignup && smsAlertPhones.length > 0) {
                for (const phone of smsAlertPhones) {
                    await sendNaverSms({
                        phone,
                        name: "관리자",
                        title: "신규 회원 가입",
                        content: `[10년의약속] 새로운 회원이 가입했습니다. (이름: ${record.name || '이름 없음'}, 연락처: ${record.phone || '번호 없음'})`
                    });
                }
                console.log(`[Webhook Alert] Signup SMS sent to ${smsAlertPhones.length} numbers`);
            }
            return new Response(
                JSON.stringify({ success: true, message: `Signup alert: ${smsAlertSignup ? smsAlertPhones.length + ' SMS sent' : 'disabled'}` }),
                { headers: { "Content-Type": "application/json" } }
            );
        }

        // 장례 접수 알림 (funeral_cases INSERT) - 설정된 번호로 문자 발송 후 종료
        if ((table === 'funeral_cases') && (type === 'INSERT')) {
            if (smsAlertFuneral && smsAlertPhones.length > 0) {
                for (const phone of smsAlertPhones) {
                    await sendNaverSms({
                        phone,
                        name: "관리자",
                        title: "신규 장례 접수",
                        content: `[10년의약속] 새로운 장례가 접수되었습니다. (고인명: ${record.deceased_name || '미상'})`
                    });
                }
                console.log(`[Webhook Alert] Funeral SMS sent to ${smsAlertPhones.length} numbers`);
            }
            return new Response(
                JSON.stringify({ success: true, message: `Funeral alert: ${smsAlertFuneral ? smsAlertPhones.length + ' SMS sent' : 'disabled'}` }),
                { headers: { "Content-Type": "application/json" } }
            );
        }

        let msgTitle = "🔔 시스템 알림";
        let msgBody = "알림이 도착했습니다. 관리자 페이지를 확인해주세요.";

        // --- 수신 대상자 필터링 (Target User IDs) ---
        const targetUserIds = new Set<string>();

        if (isBiddingAlarm && newBidder) {
            msgTitle = "장례접수";
            msgBody = "새 장례 접수 1건. 앱에서 확인하세요.";
            
            // 1. 현재 팀장은 무조건 알람 대상
            targetUserIds.add(newBidder);

            // 2. 3번째 핑이거나 2순위 팀장 이후부터는 마스터 팀장과 관리자 동시 발송
            // 관리자 비상 알람 발동 기준: 3명 누락(27분 경과) 시점부터 관리자 및 마스터에게 동시 발송
            const shouldIncludeMasterAndAdmin = (previousBiddersCount >= 3);

            if (shouldIncludeMasterAndAdmin) {
                // 비상 알람 토글이 켜져 있고 알림 번호가 설정되어 있으면 → 설정된 번호로 발송
                if (smsAlertEmergency && smsAlertPhones.length > 0) {
                    for (const phone of smsAlertPhones) {
                        await sendNaverSms({
                            phone,
                            name: "관리자",
                            title: "🚨 비상 알람",
                            content: `[10년의약속] ${previousBiddersCount}명 누락 - 장례 접수 미응답 비상 알림입니다. 관리자 페이지를 확인해주세요.`
                        });
                    }
                    console.log(`[Webhook Alert] Emergency SMS sent to ${smsAlertPhones.length} numbers`);
                }
                
                // 현재 팀장의 마스터 팀장 아이디 찾기 (DB 추가 조회)
                const { data: partnerInfo } = await supabase
                    .from('partners')
                    .select('master_id')
                    .eq('user_id', newBidder)
                    .single();
                    
                if (partnerInfo?.master_id) {
                    targetUserIds.add(partnerInfo.master_id);
                }
            }
        } else if (table !== 'funeral_cases') {
            // funeral_cases가 아닌 다른 테이블의 알림은 기존대로 전체 발송
            msgTitle = "알림";
            msgBody = "새 알림이 도착했습니다. 앱에서 확인하세요.";
            targets.forEach(t => targetUserIds.add(t.id));
        } else {
            // funeral_cases UPDATE인데 bidding 관련이 아닌 경우 (status 변경 등) → 무시
            return new Response(
                JSON.stringify({ success: true, message: "Non-bidding UPDATE ignored" }),
                { headers: { "Content-Type": "application/json" } }
            );
        }

        let pushCount = 0;
        let smsCount = 0;
        const dbNotifications = [];

        // 4. 기기 및 설정 기반 알림 분기 발송
        for (const user of targets) {
            // 필터링된 대상자가 아니면 스킵
            if (!targetUserIds.has(user.id)) continue;
            let shouldSendSms = false;
            let shouldSendPush = (user.os_type === 'android' && user.fcm_token) ? true : false;

            // 입찰(장례 접수) 알람 → OS 무관 무조건 문자 + 푸시
            if (isBiddingAlarm) {
                shouldSendSms = true;
                if (user.fcm_token) shouldSendPush = true;
            }
            // 일반 알람인 경우
            else {
                if (user.os_type === 'ios') {
                    if (!iosBiddingSmsOnly) shouldSendSms = true;
                }
            }

            if (shouldSendSms || shouldSendPush) {
                dbNotifications.push({
                    user_id: user.id,
                    type: isBiddingAlarm ? 'bidding' : 'system',
                    title: msgTitle,
                    message: msgBody,
                    is_read: false
                });
            }

            if (shouldSendSms && user.phone) {
                // 🔧 테스트 모드: 실제 번호 대신 테스트 번호로 발송
                let targetPhone = user.phone;
                if (TEST_MODE) {
                    if (user.role === 'dealer') {
                        targetPhone = TEST_PHONE_DEALER;
                    } else if (user.role === 'leader' || user.role === 'master') {
                        targetPhone = TEST_PHONE_LEADER;
                    } else {
                        targetPhone = TEST_PHONE_ADMIN;
                    }
                }

                await sendNaverSms({
                    phone: targetPhone,
                    name: user.name,
                    title: msgTitle,
                    content: `[10년의약속] ${user.name}님, ${msgBody}`
                });
                smsCount++;
            }

            if (shouldSendPush) {
                await sendFCMPush({
                    token: user.fcm_token,
                    title: msgTitle,
                    body: msgBody
                });
                pushCount++;
            }
        }

        // 5. 알림 내역 DB(메시지 함) 저장
        if (dbNotifications.length > 0) {
            await supabase.from('notifications').insert(dbNotifications);
            console.log(`[Webhook Alert] DB notifications inserted: ${dbNotifications.length}`);
        }

        // 6. 턴 넘어갈 때 → 떠나는 팀장에게 안내 문자 발송
        if (isTurnChanged && oldBidder) {
            const oldUser = targets.find(t => t.id === oldBidder);
            if (oldUser && oldUser.phone) {
                let oldPhone = oldUser.phone;
                if (TEST_MODE) {
                    if (oldUser.role === 'leader' || oldUser.role === 'master') {
                        oldPhone = TEST_PHONE_LEADER;
                    } else {
                        oldPhone = TEST_PHONE_ADMIN;
                    }
                }
                await sendNaverSms({
                    phone: oldPhone,
                    name: oldUser.name,
                    title: '⏰ 배정 시간 초과',
                    content: `[10년의약속] ${oldUser.name}님, 미응답으로 다음 순번에게 배정이 넘어갔습니다.`
                });
                smsCount++;
                console.log(`[Webhook Alert] Timeout SMS sent to old bidder: ${oldUser.name}`);
            }
        }

        return new Response(
            JSON.stringify({ success: true, message: `Alert sent. FCM: ${pushCount}, SMS: ${smsCount}, DB: ${dbNotifications.length}, TestMode: ${TEST_MODE}` }),
            { headers: { "Content-Type": "application/json" } }
        );
    } catch (e) {
        console.error(e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});

// --- 알림 발송 도우미 함수 --- //

async function sendFCMPush(data: { token: string, title: string, body: string }) {
    if (!FCM_SERVER_KEY) {
        console.log("FCM_SERVER_KEY is missing. Skipping Push.");
        return;
    }

    const response = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `key=${FCM_SERVER_KEY}`
        },
        body: JSON.stringify({
            to: data.token,
            notification: {
                title: data.title,
                body: data.body,
                sound: "default"
            },
            data: {
                click_action: "FLUTTER_NOTIFICATION_CLICK",
            }
        })
    });

    return response.json();
}

async function generateNaverSignature(serviceId: string, accessKey: string, secretKey: string, timestamp: string) {
    const method = "POST";
    const url = `/sms/v2/services/${serviceId}/messages`;
    const message = `${method} ${url}\n${timestamp}\n${accessKey}`;

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const msgData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signatureBuf = await crypto.subtle.sign("HMAC", cryptoKey, msgData);

    const signatureArr = Array.from(new Uint8Array(signatureBuf));
    const base64Str = btoa(signatureArr.map(b => String.fromCharCode(b)).join(''));

    return base64Str;
}

async function sendNaverSms(data: { phone: string, name: string, title: string, content: string }) {
    const NCP_SERVICE_ID = Deno.env.get("NCP_SERVICE_ID") || "";
    const NCP_ACCESS_KEY = Deno.env.get("NCP_ACCESS_KEY") || "";
    const NCP_SECRET_KEY = Deno.env.get("NCP_SECRET_KEY") || "";
    const NCP_SENDER_NUMBER = Deno.env.get("NCP_SENDER_NUMBER") || "";

    if (!NCP_SERVICE_ID || !NCP_ACCESS_KEY || !NCP_SECRET_KEY || !NCP_SENDER_NUMBER) {
        console.log("NCP SENS configs are missing. Skipping SMS.");
        return;
    }

    const receiverPhone = data.phone.replace(/[^0-9]/g, '');
    const senderPhone = NCP_SENDER_NUMBER.replace(/[^0-9]/g, '');

    console.log(`Sending Naver SENS SMS to ${data.name} (${receiverPhone}): ${data.content}`);

    try {
        const timestamp = Date.now().toString();
        const signature = await generateNaverSignature(NCP_SERVICE_ID, NCP_ACCESS_KEY, NCP_SECRET_KEY, timestamp);

        // 80byte 이상이면 LMS로 변경
        const contentBytes = new TextEncoder().encode(data.content).length;
        const msgType = contentBytes > 80 ? "LMS" : "SMS";

        const payload = {
            type: msgType,
            contentType: "COMM",
            countryCode: "82",
            from: senderPhone,
            subject: data.title,
            content: data.content,
            messages: [
                {
                    to: receiverPhone
                }
            ]
        };

        const response = await fetch(`https://sens.apigw.ntruss.com/sms/v2/services/${NCP_SERVICE_ID}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "x-ncp-apigw-timestamp": timestamp,
                "x-ncp-iam-access-key": NCP_ACCESS_KEY,
                "x-ncp-apigw-signature-v2": signature
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('Naver SENS API Response:', result);
    } catch (e) {
        console.error('Naver SENS API Fetch Error:', e);
    }
}
