import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";

  // Supabase admin client (service_role key for full access)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ──────────────────────────────────────
  // 1. API 키 추출
  // ──────────────────────────────────────
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return jsonResponse(401, { error: "API 키가 필요합니다. x-api-key 헤더를 포함해주세요." }, corsHeaders);
  }

  // ──────────────────────────────────────
  // 2. 키 검증
  // ──────────────────────────────────────
  const { data: keyData, error: keyError } = await supabase
    .from("api_keys")
    .select("*")
    .eq("api_key", apiKey)
    .single();

  if (keyError || !keyData) {
    return jsonResponse(403, { error: "유효하지 않은 API 키입니다." }, corsHeaders);
  }

  if (keyData.status !== "active") {
    return jsonResponse(403, { error: `API 키가 비활성 상태입니다. (상태: ${keyData.status})` }, corsHeaders);
  }

  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return jsonResponse(403, { error: "만료된 API 키입니다." }, corsHeaders);
  }

  // ──────────────────────────────────────
  // 3. 요청 파싱
  // ──────────────────────────────────────
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "유효한 JSON 요청 본문이 필요합니다." }, corsHeaders);
  }

  const { action, params } = body;
  // action 예시: "cases.read", "cases.write", "photos.read", "status.read"

  if (!action) {
    return jsonResponse(400, { error: "action 필드가 필요합니다. (예: 'cases.read')" }, corsHeaders);
  }

  // ──────────────────────────────────────
  // 4. 권한 체크
  // ──────────────────────────────────────
  const permissions: string[] = keyData.permissions || [];
  if (!permissions.includes(action)) {
    await logRequest(supabase, keyData.id, `/api/${action}`, "POST", 403, ip, body, "권한 없음", Date.now() - startTime);
    return jsonResponse(403, { error: `이 키에는 '${action}' 권한이 없습니다. 현재 권한: [${permissions.join(", ")}]` }, corsHeaders);
  }

  // ──────────────────────────────────────
  // 5. 액션 라우팅 (실제 데이터 처리)
  // ──────────────────────────────────────
  let result: any;
  let statusCode = 200;

  try {
    switch (action) {
      // ── 접수 조회 ──
      case "cases.read": {
        const query = supabase
          .from("funeral_cases")
          .select("id, status, package_name, final_price, deceased_name, funeral_hall, created_at, updated_at");
        
        if (params?.status) query.eq("status", params.status);
        if (params?.limit) query.limit(params.limit);
        else query.limit(20);
        
        query.order("created_at", { ascending: false });
        const { data, error } = await query;
        if (error) throw error;
        result = { cases: data, count: data?.length || 0 };
        break;
      }

      // ── 접수 등록 ──
      case "cases.write": {
        if (!params?.customer_name || !params?.customer_phone) {
          throw new Error("customer_name, customer_phone은 필수 항목입니다.");
        }
        
        const { data, error } = await supabase
          .from("funeral_cases")
          .insert([{
            customer_name: params.customer_name,
            customer_phone: params.customer_phone,
            deceased_name: params.deceased_name || null,
            funeral_hall: params.funeral_hall || null,
            status: "requested",
            source: `api:${keyData.name}`, // API 출처 기록
            memo: params.memo || null,
          }])
          .select()
          .single();
        
        if (error) throw error;
        result = { success: true, case_id: data.id, message: "접수가 등록되었습니다." };
        statusCode = 201;
        break;
      }

      // ── 사진 조회 ──
      case "photos.read": {
        if (!params?.case_id) {
          throw new Error("case_id는 필수 항목입니다.");
        }
        const { data, error } = await supabase
          .from("case_photos")
          .select("id, url, category, uploaded_at")
          .eq("case_id", params.case_id)
          .order("uploaded_at", { ascending: false });
        
        if (error) throw error;
        result = { photos: data, count: data?.length || 0 };
        break;
      }

      // ── 파트너 조회 ──
      case "partners.read": {
        const { data, error } = await supabase
          .from("partners")
          .select("user_id, region, grade, status, current_status, profiles:user_id (name, phone, role)")
          .eq("status", "approved");
        
        if (error) throw error;
        result = { partners: data, count: data?.length || 0 };
        break;
      }

      // ── 정산 조회 ──
      case "settlements.read": {
        const query = supabase
          .from("settlements")
          .select("id, amount, status, created_at, profiles:recipient_id (name, role)")
          .order("created_at", { ascending: false });
        
        if (params?.status) query.eq("status", params.status);
        if (params?.limit) query.limit(params.limit);
        else query.limit(20);
        
        const { data, error } = await query;
        if (error) throw error;
        result = { settlements: data, count: data?.length || 0 };
        break;
      }

      // ── 진행상황 조회 ──
      case "status.read": {
        if (!params?.case_id) {
          throw new Error("case_id는 필수 항목입니다.");
        }
        const { data, error } = await supabase
          .from("funeral_cases")
          .select("id, status, package_name, deceased_name, funeral_hall, created_at, updated_at")
          .eq("id", params.case_id)
          .single();
        
        if (error) throw error;
        result = { case_status: data };
        break;
      }

      default:
        statusCode = 400;
        result = { error: `지원하지 않는 액션입니다: ${action}` };
    }
  } catch (err) {
    statusCode = 500;
    result = { error: err.message || "서버 내부 오류가 발생했습니다." };
  }

  // ──────────────────────────────────────
  // 6. 사용 기록 저장 + 카운터 증가
  // ──────────────────────────────────────
  const duration = Date.now() - startTime;
  await logRequest(supabase, keyData.id, `/api/${action}`, "POST", statusCode, ip, params, 
    statusCode < 400 ? "success" : result?.error, duration);

  // 요청 카운터 + 마지막 사용 시간 갱신
  await supabase
    .from("api_keys")
    .update({
      request_count: (keyData.request_count || 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", keyData.id);

  return jsonResponse(statusCode, result, corsHeaders);
});

// ── Helper Functions ──

function jsonResponse(status: number, body: any, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function logRequest(
  supabase: any, keyId: string, endpoint: string, method: string,
  statusCode: number, ip: string, requestBody: any, responseSummary: string, durationMs: number
) {
  try {
    await supabase.from("api_logs").insert([{
      api_key_id: keyId,
      endpoint,
      method,
      status_code: statusCode,
      ip_address: ip,
      request_body: requestBody || {},
      response_summary: responseSummary,
      duration_ms: durationMs,
    }]);
  } catch (e) {
    console.error("Failed to log API request:", e);
  }
}
