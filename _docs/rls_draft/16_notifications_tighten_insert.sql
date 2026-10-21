-- ============================================================================
-- 16_notifications_tighten_insert.sql  (DRAFT - 새 코드 배포 "후")
-- 선행: 12 (notifications 의 RLS 와 정책). 새 코드는 알림을 만들 때 발신자(sender_id)를 항상 본인으로 채운다.
--
-- 지금 정책(12): 발신자를 "비우거나 본인"으로만 만들 수 있다.
--   -> 다른 사람 이름으로 위조는 막혀 있지만, 발신자를 비우면 "시스템 알림"처럼 보이는 가짜 알림을 만들 수 있다.
--   -> link(눌렀을 때 이동 경로)에 외부 주소를 넣어 피싱 링크를 보낼 수 있다.
-- 변경: 관리자가 아니면 (1) 발신자는 반드시 본인, (2) link 는 비우거나 앱 안의 경로('/...')만.
-- DB 함수/트리거(DEFINER)가 만드는 시스템 알림은 영향 없음.
-- 하나의 트랜잭션. 되돌리기는 파일 맨 아래.
-- ============================================================================
begin;

drop policy if exists notifications_insert on public.notifications;

create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      sender_id = (select auth.uid())
      and (link is null or (link like '/%' and link not like '//%'))
    )
  );

commit;

-- ============================================================================
-- 되돌리기 (12 의 원래 정책):
--   begin;
--   drop policy if exists notifications_insert on public.notifications;
--   create policy notifications_insert on public.notifications
--     for insert to authenticated
--     with check ((select public.is_admin()) or sender_id is null or sender_id = (select auth.uid()));
--   commit;
-- ============================================================================
