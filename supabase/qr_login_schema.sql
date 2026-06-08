-- DEPRECATED: supabase/migrate_once.sql 에 QR 로그인 테이블이 포함되어 있습니다.

do $$
begin
  raise exception using
    message = 'Use supabase/migrate_once.sql instead of qr_login_schema.sql';
end $$;
