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

    try {
        const { phone, name, couponCode, amount } = await req.json();

        if (!phone || !name || !couponCode || !amount) {
            return new Response(
                JSON.stringify({ error: "phone, name, couponCode, amount 모두 필수입니다." }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const SITE_URL = "https://10promise.co.kr";
        const linkUrl = `${SITE_URL}/coupon/${couponCode}`;

        const smsContent = `[10년의약속] ${name}님, 캐시백 ${Number(amount).toLocaleString()}원 쿠폰이 도착했습니다.\n\n급한 일이 생기면 아래 링크를 눌러 바로 접수하세요.\n${linkUrl}`;

        // Naver SENS API로 SMS 발송
        const result = await sendNaverSms({
            phone,
            content: smsContent,
        });

        // 발송 결과를 coupons 테이블에도 기록
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const supabase = createClient(supabaseUrl, supabaseKey);

        await supabase
            .from("coupons")
            .update({ link_sent_at: new Date().toISOString() })
            .eq("code", couponCode);

        return new Response(
            JSON.stringify({ success: true, message: `${name}님에게 SMS 발송 완료`, result }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("send-coupon-sms error:", err);
        return new Response(
            JSON.stringify({ error: err.message || "SMS 발송 실패" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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
