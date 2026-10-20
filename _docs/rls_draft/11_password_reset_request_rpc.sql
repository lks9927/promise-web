-- ============================================================================
-- 11_password_reset_request_rpc.sql  (DRAFT - 추가만 하는 SQL, 새 코드 배포 "전에" 적용)
-- 로그인 화면의 "비밀번호를 잊으셨나요? (초기화 요청)"이 로그인 없이 profiles 를 이름+전화로
-- 직접 조회하고(select) 직접 수정(update)하던 것을 서버 함수 하나로 바꾼다.
-- 결과값: 'ok' (요청 접수, 관리자 포함) | 'not_found'
-- 이름과 전화번호가 모두 일치해야 한다(앞뒤 공백은 무시). 대량 호출 방어는 서버 앞단(IP 제한)에서 한다.
-- 이 함수가 쓰이게 되면
-- profiles 에 RLS 를 켤 때 로그인 없는 직접 조회를 막을 수 있다.
-- ============================================================================
create or replace function public.request_password_reset(p_name text, p_phone text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid;
  v_role text;
begin
  if p_name is null or p_phone is null
     or char_length(btrim(p_name)) < 1 or char_length(p_name) > 50
     or char_length(p_phone) < 3 or char_length(p_phone) > 40 then
    return 'not_found';
  end if;

  select p.id, p.role into v_id, v_role
    from public.profiles p
   where p.name = btrim(p_name) and p.phone = btrim(p_phone)
   limit 1;

  if v_id is null then
    return 'not_found';
  end if;

  -- 관리자 계정도 일반 계정과 같은 응답('ok')을 준다: 익명 호출자가 "이 이름/번호는 관리자"임을
  -- 알아내지 못하게 한다. 요청 표시가 남으면 다른 관리자가 승인 화면에서 임시 비밀번호를 발급한다.
  update public.profiles set password_reset_requested = true where id = v_id;
  return 'ok';
end;
$$;

revoke all on function public.request_password_reset(text, text) from public;
grant execute on function public.request_password_reset(text, text) to anon, authenticated;

-- 되돌리기: drop function if exists public.request_password_reset(text, text);
