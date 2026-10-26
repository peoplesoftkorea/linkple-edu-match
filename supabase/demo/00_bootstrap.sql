-- 시연 데이터베이스 부트스트랩 — 공개 미러가 붙는 DB 에만 적용한다.
--
--
-- ⛔운영 데이터베이스에 적용하지 않는다. 운영에는 정본 표가 이미 있고, 이 스텁이
--   그것을 가리면 참조 무결성이 조용히 헐거워진다.
-- ⛔이 파일에 시연 «데이터»를 넣지 않는다 — 여기는 «자리»만 만든다(데이터는 10_seed).

-- 1:1 안내 스레드(SRM). 시연에서는 쓰지 않으므로 참조 대상이 되는 열만 둔다.
-- edu 쪽 참조는 `edu_enrollments.srm_request_id … on delete set null` 하나이고 nullable 이다.
create table if not exists public.srm_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

comment on table public.srm_requests is
  '시연 DB 전용 스텁 — 운영의 SRM 요청 표를 대신해 참조만 받는다. 시연에서 행을 만들지 않는다.';

-- SRM 요청 분류. `e01` 이 자기 분류 행을 여기에 insert 한다(참조가 아니라 «쓰기»다).
-- ★컬럼은 운영 정본에서 edu 가 쓰는 것만 추린 게 아니라 «그대로» 둔다 — 일부만 두면
--   운영이 열을 늘릴 때 시연 DB 가 조용히 어긋난다.
create table if not exists public.srm_categories (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  title               text not null,
  parent_id           uuid references public.srm_categories(id) on delete set null,
  default_assignee_id uuid,
  knowledge_tag       text,
  requires_validation boolean not null default false,
  sort_order          integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);

comment on table public.srm_categories is
  '시연 DB 전용 스텁 — 운영의 SRM 분류 표를 대신한다. edu 가 자기 분류 행을 넣는다.';

-- 운영자 판정. edu 의 RLS 정책이 부르므로 «정책을 만들려면» 먼저 있어야 한다.
--
-- ★운영 정본은 `profiles.role='admin'` 을 본다. 시연 DB 에는 그 표가 없다.
-- ★**항상 false 를 돌려준다** — 시연에서 이 함수로 문이 열리는 일을 만들지 않는다.
--   콘솔은 service_role 로 붙어 RLS 를 지나가므로 화면은 그대로 돈다.
--   ⛔true 로 두지 않는다. 그러면 anon 키를 쥔 누구나 운영자 경로로 들어온다.
create or replace function public.fn_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select false;
$$;

revoke execute on function public.fn_is_admin() from public, anon;

comment on function public.fn_is_admin() is
  '시연 DB 전용 스텁 — 항상 false. 운영 정본은 profiles.role 을 본다.';
