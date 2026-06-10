-- DEPRECATED: supabase/migrate_once.sql 을 사용하세요.
--
-- 이 파일은 더 이상 스키마를 생성하지 않습니다.
-- Supabase SQL Editor 에서 migrate_once.sql 전체를 1회 실행하세요.

do $$
begin
  raise exception using
    message = 'Use supabase/migrate_once.sql instead of migration.sql';
end $$;
