-- 시연 데이터 — 공개 미러가 붙는 DB 에만 적용한다.
--
-- ★RFP §9 가 「시연 가능한 시드 데이터」와 「배포 URL 종단간 동작」을 요구한다.
--   화면이 비어 있으면 기능이 있어도 «없는 것»으로 읽힌다.
-- ★어디까지 깔고 어디부터 누르게 할 것인가 — **상태의 «다양성»까지만 깐다.**
--   발주를 단계별로 하나씩 두어 목록이 비지 않게 하고, 배정·계약·정산은 심사자가
--   화면에서 직접 실행하게 둔다. 그래야 「동작한다」가 화면에서 증명된다.
-- ⛔실재하는 기업·사람을 쓰지 않는다. 상호와 담당자는 가공이고 주소는 example.com 이다.
-- ⛔운영 데이터베이스에 적용하지 않는다.
--
-- 재적용 가능하게 쓴다(on conflict do nothing) — 시연 중 다시 돌릴 수 있어야 한다.

-- ── 과정 2개 ────────────────────────────────────────────────────────────────
insert into public.edu_cohorts
  (program_slug, cohort_no, title, status, starts_on, ends_on, capacity, attend_pct_required, is_test)
values
  -- 상태값은 edu_cohorts_status_check 의 허용 집합에서만 고른다
  --   draft · recruiting · closed · running · completed · cancelled [실측 2026-10-26]
  ('marketing-amp', 1, '마케팅 사내 MBA 1기', 'running',
   current_date - 14, current_date + 42, 20, 80, false),
  ('leader-lab', 1, '리더십 랩 1기', 'recruiting',
   current_date + 21, current_date + 63, 16, 80, false)
on conflict do nothing;

-- ── 회차 (마케팅 사내 MBA 1기 · 6회) ────────────────────────────────────────
insert into public.edu_sessions (cohort_id, session_no, title, topic, held_on, counts_for_attendance)
select c.id, v.no, v.title, v.topic, current_date - 14 + (v.no - 1) * 7, true
from public.edu_cohorts c
cross join (values
  (1, '시장과 고객을 다시 정의한다', '시장 정의·세그먼트'),
  (2, '포지셔닝과 메시지', '포지셔닝'),
  (3, '가격과 수익 구조',          '가격 전략'),
  (4, '채널과 유통',                '채널 설계'),
  (5, '성과 측정과 지표',          '마케팅 계측'),
  (6, '사업계획으로 옮기기',       '실행 계획')
) as v(no, title, topic)
where c.program_slug = 'marketing-amp' and c.cohort_no = 1
on conflict do nothing;

-- ── 발주 3건 — 단계를 흩어 둔다(견적·확정·완료) ─────────────────────────────
--   금액은 시연용 예시값이다. 운영의 기준 단가와 무관하다.
insert into public.edu_org_orders
  (order_no, org_name, contact_name, contact_email, contact_dept,
   program_slug, headcount, venue_type, venue_region,
   unit_price, subtotal, vat, total, price_basis, status, is_test)
values
  ('DEMO-0001', '가온테크 주식회사', '정하늘', 'demo-order1@example.com', '인재개발팀',
   'marketing-amp', 20, 'onsite', '수도권',
   45000, 27000000, 2700000, 29700000,
   '예시 산식 — 인당·시간당 45,000원 × 30시간 × 20명', 'confirmed', false),
  ('DEMO-0002', '한빛물산 주식회사', '문서현', 'demo-order2@example.com', '경영지원실',
   'leader-lab', 16, 'offsite', '충청·강원',
   52000, 24960000, 2496000, 27456000,
   '예시 산식 — 인당·시간당 52,000원 × 30시간 × 16명', 'quoted', false),
  ('DEMO-0003', '새별엔지니어링 주식회사', '배준우', 'demo-order3@example.com', '총무팀',
   'marketing-amp', 18, 'online', '수도권',
   38000, 20520000, 2052000, 22572000,
   '예시 산식 — 인당·시간당 38,000원 × 30시간 × 18명', 'completed', false)
on conflict (order_no) do nothing;

-- 확정된 발주를 진행 중인 과정에 묶는다 — 콘솔에서 회차·배정으로 이어진다
update public.edu_org_orders o
   set cohort_id = c.id
  from public.edu_cohorts c
 where o.order_no = 'DEMO-0001'
   and c.program_slug = 'marketing-amp' and c.cohort_no = 1
   and o.cohort_id is null;
