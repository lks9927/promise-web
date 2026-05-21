export function translateError(error) {
    if (!error) return "알 수 없는 오류가 발생했습니다.";
    
    const msg = typeof error === 'string' ? error : (error.message || error.code || "");
    const lowerMsg = msg.toLowerCase();

    // Supabase & Postgres Common Errors
    if (lowerMsg.includes("row-level security") || lowerMsg.includes("rls")) {
        return "접근 권한이 없습니다. (로그인 상태를 확인해주세요)";
    }
    if (lowerMsg.includes("foreign key violation") || lowerMsg.includes("reference")) {
        return "참조할 수 없는 데이터입니다. (이미 삭제되었거나 존재하지 않음)";
    }
    if (lowerMsg.includes("unique constraint") || lowerMsg.includes("duplicate")) {
        return "이미 존재하거나 중복된 데이터입니다.";
    }
    if (lowerMsg.includes("not null constraint") || lowerMsg.includes("missing")) {
        return "필수 입력값이 누락되었습니다.";
    }
    if (lowerMsg.includes("jwt") || lowerMsg.includes("token") || lowerMsg.includes("auth")) {
        return "인증이 만료되었거나 올바르지 않습니다. 다시 로그인해주세요.";
    }
    if (lowerMsg.includes("failed to fetch") || lowerMsg.includes("network")) {
        return "인터넷 연결이 불안정하거나 서버에 접속할 수 없습니다.";
    }
    if (lowerMsg.includes("timeout")) {
        return "처리 시간이 너무 오래 걸려 취소되었습니다. 다시 시도해주세요.";
    }
    if (lowerMsg.includes("not acceptable") || lowerMsg.includes("pgrst116")) {
        return "데이터를 찾을 수 없습니다. (결과가 없거나 너무 많음)";
    }

    // Custom App Errors (if already translated or passed explicitly)
    if (lowerMsg.includes("유효하지 않은 쿠폰") || lowerMsg.includes("이미 사용되었거")) {
        return msg; // Preserve already translated custom throw errors
    }

    // Fallback for unknown errors (Still show original to help debugging, but wrapped)
    return `요청 처리 중 오류가 발생했습니다. (${msg})`;
}
