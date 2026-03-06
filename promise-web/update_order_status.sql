-- orders 테이블의 status 제약조건에서 'completed' 상태를 추가합니다.
ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_status_check";
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_status_check" CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'completed', 'cancelled'));
