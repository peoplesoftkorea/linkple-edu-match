-- e12: 강사 위촉·매칭 — 두 프로파일의 입력 스키마와 매칭 산출 원장 (2026-10-06)
--
-- ★왜 지금인가
--   매칭 산식은 이미 서 있다(K·S·A·C·L 5축 엔진).
--   서 있지 않은 것은 «두 프로파일의 입력 칸»이다 — edu_instructors 에는 K축(expertise)과
--   L축(regions)만 있고 S·A·C 축의 입력 칸이 없다. 칸이 없으면 함수가 돌아도 점수가 나오지 않는다.
--
-- ★계약 구조 = 3자 수주형
--   당사가 교육을 수주하고 당사가 강사를 위촉한다. 발주사와 강사 사이에 계약이 성립하는
--   경로를 이 스키마에 두지 않는다 — 과정의 실시와 수료 판정까지가 급부이고 그 책임을 질
--   주체가 하나여야 하기 때문이다.
--   ⇒ 위촉의 상대는 «항상 당사»이고, 표에는 강사와 회차만 있다. 발주사는 회차의 상위에 있다.
--
-- ★설명 없는 점수를 저장하지 못하게 한다
--   산식 규율 2 = 「설명 없는 점수를 반환하지 않는다」. 이 표는 그 규율을 DB 제약으로 집행한다 —
--   edu_match_scores.axes 가 비면 행이 들어가지 않는다. 화면이 실수로 점수만 적을 수 없다.
--
-- ⛔하지 않는 것
--   · 채용 축 구직자 표와의 FK·조인 — 교육 축과 채용 축은 데이터·화면을 분리한다
--   · 강사 물리 삭제 — 위촉·정산의 참조가 끊기면 귀책 추적이 불가능해진다. deleted_at 로만
--   · 강사 계정 강제 — 초빙강사는 계정이 없다(e09 규율). user_id 는 nullable
--   · C축 결측을 0 으로 채우기 — 가치축 3개 미만은 측정 불가이고 null 이다

-- ════════════════════════════════════════════════════════════════════════════
-- 1) edu_instructors 확장 — 5축 입력 칸 · 연락처 · 계정 연결
-- ════════════════════════════════════════════════════════════════════════════
-- 기존 칸: name·title·expertise(K)·career·regions(L)·day_rate·contactable·source·note·is_test
alter table public.edu_instructors
  add column if not exists methods      text[]  not null default '{}',   -- S축: 강의 방식(강의·워크숍·사례연구·실습·코칭·토론)
  add column if not exists years         integer,                        -- A축: 강의 경력 연수. null = 미제출
  add column if not exists audience      text[]  not null default '{}',  -- A축: 대상 층(최고위·임원·중간관리자·실무자·신입)
  add column if not exists value_profile jsonb,                          -- C축: 강의 지향 가치 0~1. 3개 미만이면 C축은 null 로 산출된다
  add column if not exists hourly_rate   integer,                        -- 시간당 금액. day_rate(회차 금액)와 다른 축이다
  add column if not exists email         text,                           -- 🔴PII. 당사 PM 단일 창구이며 발주사에 전달하지 않는다
  add column if not exists phone         text,                           -- 🔴PII
  add column if not exists bio           text,
  add column if not exists portfolio_url text,
  add column if not exists photo_url     text,
  add column if not exists user_id       uuid references auth.users(id) on delete set null,
  add column if not exists deleted_at    timestamptz;                    -- 소프트 딜리트. 물리 삭제하지 않는다

comment on column public.edu_instructors.methods       is 'S축 입력 — 수행 가능한 강의 방식. 자유 서술은 비교가 되지 않으므로 통제 어휘로 적는다';
comment on column public.edu_instructors.value_profile is 'C축 입력 — 강의 지향 가치별 강도 0~1. 키 3개 미만이면 프로파일 상관이 의미를 갖지 못해 C축은 null 이 된다';
comment on column public.edu_instructors.email         is 'PII. 운영 담당자가 단일 창구이고 발주사에 직접 전달하지 않는다';
comment on column public.edu_instructors.user_id       is '강사 본인 계정. 초빙강사는 계정이 없으므로 nullable 이고, 계정 없는 강사도 풀에 남는다';
comment on column public.edu_instructors.deleted_at    is '소프트 딜리트 시각. 위촉·정산 참조를 끊지 않기 위해 물리 삭제를 금지한다';

create index if not exists edu_instructors_live_idx on public.edu_instructors (contactable) where deleted_at is null;
create unique index if not exists edu_instructors_user_uniq on public.edu_instructors (user_id) where user_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) edu_instructor_engagements — 위촉 제안·지원과 그 상태
-- ════════════════════════════════════════════════════════════════════════════
-- ★개시 경로가 둘이다 — 당사 제안(proposed)과 강사 지원(applied).
--   강사 지원도 알선이 아니다: 공모 대상은 «당사가 이미 수주한» 과정의 회차이고,
--   성립하는 계약은 당사–강사 위촉계약 하나다.
-- ★단위는 회차(session) 또는 기수(cohort) — 12주 전담 위촉이 실제로 흔하다.
create table if not exists public.edu_instructor_engagements (
  id            uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.edu_instructors(id) on delete restrict,

  -- 위촉의 범위. scope 에 맞는 칸 하나만 채운다.
  scope         text not null check (scope in ('session','cohort')),
  session_id    uuid references public.edu_sessions(id) on delete cascade,
  cohort_id     uuid references public.edu_cohorts(id)  on delete cascade,
  constraint edu_engagements_scope_target check (
    (scope = 'session' and session_id is not null and cohort_id is null) or
    (scope = 'cohort'  and cohort_id  is not null and session_id is null)
  ),

  origin        text not null check (origin in ('proposed','applied')),

  -- proposed/applied(개시) → accepted/declined(강사 응답) → confirmed(당사 확정)
  --   withdrawn = 다른 강사 확정으로 일괄 철회된 건. ⛔삭제하지 않는다 — 이력이 남아야 한다
  status        text not null default 'proposed'
                check (status in ('proposed','applied','accepted','declined','confirmed','withdrawn')),

  fee           integer check (fee >= 0),        -- 제안 강사료(원). 확정 시 계약서 금액의 입력이 된다
  fee_basis     text,                            -- 「시간당 ○○원 × ○시간 × ○회차」처럼 산식을 사람 말로 남긴다
  message       text,                            -- 제안·지원 사유
  decided_at    timestamptz,                     -- 강사가 응답한 시각
  decline_reason text,
  withdrawn_reason text,
  match_score_id uuid,                           -- 어떤 매칭 산출에서 나온 제안인가(FK 는 4절에서 건다)

  is_test       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.edu_instructor_engagements is
  '강사 위촉 제안·지원 원장. 위촉의 상대는 항상 당사이며 발주사–강사 간 계약은 이 표에 없다.';

-- 같은 대상에 같은 강사의 «활성» 건은 하나뿐이다. 철회·거부된 건은 다시 제안할 수 있다.
create unique index if not exists edu_engagements_live_session_uniq
  on public.edu_instructor_engagements (session_id, instructor_id)
  where status in ('proposed','applied','accepted','confirmed');
create unique index if not exists edu_engagements_live_cohort_uniq
  on public.edu_instructor_engagements (cohort_id, instructor_id)
  where status in ('proposed','applied','accepted','confirmed');

create index if not exists edu_engagements_instructor_idx on public.edu_instructor_engagements (instructor_id, status);
create index if not exists edu_engagements_session_idx    on public.edu_instructor_engagements (session_id);
create index if not exists edu_engagements_cohort_idx     on public.edu_instructor_engagements (cohort_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) 확정 시 일괄 철회 — 부수 효과를 화면이 아니라 트리거가 집행한다
-- ════════════════════════════════════════════════════════════════════════════
-- ★화면 코드에 맡기면 입구가 늘 때마다 빠진다. 같은 대상의 다른 활성 건을 여기서 닫는다.
create or replace function public.fn_edu_engagement_confirm_sweep()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' and coalesce(old.status, '') <> 'confirmed' then
    update public.edu_instructor_engagements e
       set status = 'withdrawn',
           withdrawn_reason = coalesce(e.withdrawn_reason, '다른 강사 확정으로 자동 철회'),
           updated_at = now()
     where e.id <> new.id
       and e.status in ('proposed','applied','accepted')
       and (
         (new.scope = 'session' and e.session_id = new.session_id) or
         (new.scope = 'cohort'  and e.cohort_id  = new.cohort_id)
       );
  end if;
  return new;
end;
$$;

revoke all on function public.fn_edu_engagement_confirm_sweep() from public;

drop trigger if exists edu_engagements_sweep on public.edu_instructor_engagements;
create trigger edu_engagements_sweep after update on public.edu_instructor_engagements
  for each row execute function public.fn_edu_engagement_confirm_sweep();

drop trigger if exists edu_engagements_touch on public.edu_instructor_engagements;
create trigger edu_engagements_touch before update on public.edu_instructor_engagements
  for each row execute function public.fn_edu_touch();

-- ════════════════════════════════════════════════════════════════════════════
-- 4) edu_match_runs · edu_match_scores — 매칭 산출과 축별 근거
-- ════════════════════════════════════════════════════════════════════════════
-- ★한 번의 매칭을 run 으로 남긴다. 가중치와 수요 프로파일을 함께 적어야
--   「왜 이 사람이 1위였나」를 몇 달 뒤에도 재현할 수 있다.
create table if not exists public.edu_match_runs (
  id          uuid primary key default gen_random_uuid(),

  -- 무엇을 위한 매칭인가. 셋 다 비어 있을 수 없다(견적 단계 매칭은 order 만 있다).
  order_id    uuid references public.edu_org_orders(id) on delete cascade,
  cohort_id   uuid references public.edu_cohorts(id)    on delete cascade,
  session_id  uuid references public.edu_sessions(id)   on delete cascade,
  constraint edu_match_runs_target check (order_id is not null or cohort_id is not null or session_id is not null),

  -- 수요 프로파일 원문(엔진 입력). 주제·방식·대상 층·가치축·운영 조건
  demand      jsonb not null,
  weights     jsonb not null,                  -- 그때 쓴 축 가중치. 기본값이 바뀌어도 과거 산출이 흔들리지 않는다
  engine_rev  text,                            -- 엔진 버전 표시(커밋 해시 등)
  requested_by uuid references auth.users(id) on delete set null,
  candidates_n integer not null default 0,     -- 몇 명을 재었는가. ⛔0 을 「후보 없음」으로 읽지 않게 함께 남긴다
  note        text,
  is_test     boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.edu_match_runs is
  '매칭 1회의 입력 기록. 수요 프로파일·가중치·엔진 버전을 남겨 과거 산출을 재현한다.';
comment on column public.edu_match_runs.candidates_n is
  '재어 본 강사 수. 산출 0건과 대상 0명을 구분하기 위해 반드시 적는다';

create table if not exists public.edu_match_scores (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references public.edu_match_runs(id) on delete cascade,
  instructor_id uuid not null references public.edu_instructors(id) on delete cascade,

  -- ★칸 이름과 범위를 엔진 반환값(MatchResult)과 «같게» 둔다.
  --   엔진은 percent(0~100)·eligible·blockers·headline 을 낸다. 초판에서 total(0~1)·
  --   hard_filtered 로 적었다가 어댑터 착수 직전에 어긋남을 발견해 맞췄다[2026-10-06].
  --   ⛔이름이 다르면 변환 코드가 그 자리를 메우고, 그 변환이 100배 오차의 숨을 자리가 된다.
  percent       integer not null check (percent between 0 and 100),
  rank          integer not null check (rank > 0),

  -- 엔진의 축별 산출 그대로. [{axis,label,score,weight,reasons[]}, ...]
  -- ★빈 배열을 금지한다 — 설명 없는 점수는 저장되지 않는다(엔진 규율 2의 DB 집행).
  axes          jsonb not null check (jsonb_typeof(axes) = 'array' and jsonb_array_length(axes) >= 1),
  headline      text not null,                   -- 엔진이 낸 한 줄 요약. 점수만 남기지 않는다

  -- 필수 요건 충족 여부와 그 사유. ⛔점수로 덮지 않는다 — 자격 미달을 총점으로 상쇄하면
  --   그것은 매칭이 아니다(엔진 주석과 같은 규율).
  eligible      boolean not null default true,
  blockers      text[]  not null default '{}',
  -- ⛔array_length 를 쓰지 않는다 — 빈 배열에 NULL 을 반환하고 CHECK 는 NULL 을 «통과»로 본다.
  --   초판이 그랬고 검증 시험 8이 잡았다[2026-10-06]. cardinality 는 빈 배열에 0 을 낸다.
  constraint edu_match_scores_blockers_speak check (eligible or cardinality(blockers) >= 1),

  -- C축 측정 불가 여부. ⛔0 으로 채우지 않고 사실을 적는다
  culture_measured boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (run_id, instructor_id)
);

comment on table public.edu_match_scores is
  '매칭 산출 1행 = 강사 1명. axes 가 비면 행이 들어가지 않는다 — 설명 없는 점수를 저장할 수 없다.';

create index if not exists edu_match_scores_run_idx  on public.edu_match_scores (run_id, rank);
create index if not exists edu_match_scores_inst_idx on public.edu_match_scores (instructor_id);

-- ★이미 만들어진 표에도 제약 교정이 닿게 한다 — create table if not exists 는 기존 표를
--   건드리지 않으므로, 제약을 고칠 때는 여기에 멱등 교체를 함께 적는다.
alter table public.edu_match_scores drop constraint if exists edu_match_scores_blockers_speak;
alter table public.edu_match_scores add  constraint edu_match_scores_blockers_speak
  check (eligible or cardinality(blockers) >= 1);

-- 2절에서 미룬 FK
alter table public.edu_instructor_engagements
  drop constraint if exists edu_engagements_match_score_fk;
alter table public.edu_instructor_engagements
  add constraint edu_engagements_match_score_fk
  foreign key (match_score_id) references public.edu_match_scores(id) on delete set null;

-- ════════════════════════════════════════════════════════════════════════════
-- 5) 강사 본인 조회 — 계정이 있는 강사만
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.fn_edu_instructor_self()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'id', i.id, 'name', i.name, 'title', i.title,
    'expertise', i.expertise, 'methods', i.methods, 'audience', i.audience,
    'years', i.years, 'regions', i.regions, 'value_profile', i.value_profile,
    'day_rate', i.day_rate, 'hourly_rate', i.hourly_rate,
    'bio', i.bio, 'portfolio_url', i.portfolio_url, 'photo_url', i.photo_url,
    'contactable', i.contactable,
    'engagements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'scope', e.scope, 'origin', e.origin, 'status', e.status,
               'fee', e.fee, 'fee_basis', e.fee_basis, 'message', e.message,
               'decided_at', e.decided_at, 'created_at', e.created_at)
             order by e.created_at desc)
        from public.edu_instructor_engagements e where e.instructor_id = i.id), '[]'::jsonb)
  )
    from public.edu_instructors i
   where i.user_id = auth.uid()
     and i.deleted_at is null
   limit 1;
$$;

revoke all on function public.fn_edu_instructor_self() from public;
grant execute on function public.fn_edu_instructor_self() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6) RLS — 매칭 산출은 운영자 전용이다
-- ════════════════════════════════════════════════════════════════════════════
-- ★발주사가 강사 후보를 순위로 열람하는 경로를 만들지 않는다.
--   매칭 결과를 보는 것은 운영자이고, 강사는 «자기에게 온 위촉»만 본다.
alter table public.edu_instructor_engagements enable row level security;
alter table public.edu_match_runs            enable row level security;
alter table public.edu_match_scores          enable row level security;

revoke all on public.edu_instructor_engagements from public, anon, authenticated;
revoke all on public.edu_match_runs            from public, anon, authenticated;
revoke all on public.edu_match_scores          from public, anon, authenticated;

grant select on public.edu_instructor_engagements to authenticated;
grant select on public.edu_match_runs            to authenticated;
grant select on public.edu_match_scores          to authenticated;

drop policy if exists edu_engagements_admin_all on public.edu_instructor_engagements;
create policy edu_engagements_admin_all on public.edu_instructor_engagements
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- 강사 본인 — 자기에게 온 위촉만 본다. 수락·거부는 서버 경로에서 처리한다(직접 update 금지)
drop policy if exists edu_engagements_self_select on public.edu_instructor_engagements;
create policy edu_engagements_self_select on public.edu_instructor_engagements
  for select to authenticated
  using (exists (
    select 1 from public.edu_instructors i
     where i.id = instructor_id and i.user_id = auth.uid() and i.deleted_at is null));

drop policy if exists edu_match_runs_admin_all on public.edu_match_runs;
create policy edu_match_runs_admin_all on public.edu_match_runs
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

drop policy if exists edu_match_scores_admin_all on public.edu_match_scores;
create policy edu_match_scores_admin_all on public.edu_match_scores
  for all to authenticated using (public.fn_is_admin()) with check (public.fn_is_admin());

-- 강사 본인 프로파일 수정 — 운영자 칸(source·is_test·deleted_at)은 손대지 못하게 서버 경로로만 받는다
drop policy if exists edu_instructors_self_select on public.edu_instructors;
create policy edu_instructors_self_select on public.edu_instructors
  for select to authenticated using (user_id = auth.uid() and deleted_at is null);
