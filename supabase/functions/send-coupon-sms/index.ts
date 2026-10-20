// Supabase Edge Function: send-coupon-sms
// 쿠폰 링크 SMS 발송 전용
// Deploy: supabase functions deploy send-coupon-sms

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    try {
        // 1) 로그인한 사용자만. (공개 키만으로는 호출할 수 없다)
        const bearer = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
        if (!bearer) return json({ error: "Unauthorized" }, 401);

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") || "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
        );
        const { data: authData, error: authError } = await supabase.auth.getUser(bearer[1]);
        if (authError || !authData?.user?.id) return json({ error: "Unauthorized" }, 401);
        const callerId = authData.user.id;

        const { couponCode } = await req.json();
        if (typeof couponCode !== "string" || !/^[A-Za-z0-9]{4,32}$/.test(couponCode)) {
            return json({ error: "couponCode 가 올바르지 않습니다." }, 400);
        }

        // 2) 수신번호/이름/금액은 요청값이 아니라 DB 의 쿠폰에서 가져온다 (임의 번호로 발송 불가)
        const { data: coupon, error: couponError } = await supabase
            .from("coupons")
            .select("code, amount, status, issued_by, recipient_name, recipient_phone, created_at")
            .eq("code", couponCode.toUpperCase())
            .maybeSingle();
        if (couponError || !coupon || !coupon.recipient_phone || !coupon.recipient_name) {
            return json({ error: "쿠폰을 찾을 수 없습니다." }, 404);
        }

        // 3) 발급자 본인 또는 관리자만, 발급 직후(10분 이내)에만 발송
        const { data: callerProfile } = await supabase.from("profiles").select("role").eq("id", callerId).maybeSingle();
        const isAdmin = callerProfile?.role === "admin";
        if (!isAdmin && coupon.issued_by !== callerId) return json({ error: "Forbidden" }, 403);
        if (coupon.status !== "issued") return json({ error: "발송할 수 없는 쿠폰입니다." }, 409);
        if (!isAdmin && Date.now() - new Date(coupon.created_at).getTime() > 10 * 60 * 1000) {
            return json({ error: "발급 후 10분이 지나 발송할 수 없습니다." }, 409);
        }

        const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://10promise.co.kr").replace(/\/+$/, "");
        const linkUrl = `${SITE_URL}/coupon/${coupon.code}`;

        const smsContent = `[10년의약속] ${coupon.recipient_name}님, 캐시백 ${Number(coupon.amount).toLocaleString()}원 쿠폰이 도착했습니다.

급한 일이 생기면 아래 링크를 눌러 바로 접수하세요.
${linkUrl}`;

        // Naver SENS API로 SMS 발송
        const result = await sendNaverSms({
            phone: coupon.recipient_phone,
            content: smsContent,
        });

        // 발송 결과를 coupons 테이블에도 기록
        await supabase
            .from("coupons")
            .update({ link_sent_at: new Date().toISOString() })
            .eq("code", coupon.code);

        return json({ success: true, message: `${coupon.recipient_name}님에게 SMS 발송 완료`, result });
    } catch (err) {
        console.error("send-coupon-sms error:", err);
        return json({ error: "SMS 발송 실패" }, 500);
    }
});

// ── Naver SENS SMS 발송 ──
async function sendNaverSms(data: { phone: string; content: string }) {
    const NCP_SERVICE_ID = Deno.env.get("NCP_SERVICE_ID") || "";
    const NCP_ACCESS_KEY = Deno.env.get("NCP_ACCESS_KEY") || "";
    const NCP_SECRET_KEY = Deno.env.get("NCP_SECRET_KEY") || "";
    const NCP_SENDER_NUMBER = Deno.env.get("NCP_SENDER_NUMBER") || "";

    if (!NCP_SERVICE_ID || !NCP_ACCESS_KEY || !NCP_SECRET_KEY || !NCP_SENDER_NUMBER) {
        console.log("NCP SENS configs are missing. Skipping SMS.");
        return { skipped: true, reason: "NCP config missing" };
    }

    const receiverPhone = data.phone.replace(/[^0-9]/g, "");
    const senderPhone = NCP_SENDER_NUMBER.replace(/[^0-9]/g, "");

    console.log(`Sending coupon SMS to ${receiverPhone}`);

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
        subject: "[10년의약속] 캐시백 쿠폰",
        content: data.content,
        messages: [{ to: receiverPhone }],
    };

    const response = await fetch(
        `https://sens.apigw.ntruss.com/sms/v2/services/${NCP_SERVICE_ID}/messages`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "x-ncp-apigw-timestamp": timestamp,
                "x-ncp-iam-access-key": NCP_ACCESS_KEY,
                "x-ncp-apigw-signature-v2": signature,
            },
            body: JSON.stringify(payload),
        }
    );

    const result = await response.json();
    console.log("Naver SENS Response:", result);
    return result;
}

// ── HMAC-SHA256 서명 생성 ──
async function generateNaverSignature(
    serviceId: string,
    accessKey: string,
    secretKey: string,
    timestamp: string
) {
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
    return btoa(signatureArr.map((b) => String.fromCharCode(b)).join(""));
}
