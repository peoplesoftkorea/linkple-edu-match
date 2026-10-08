-- e12 제약·트리거 검증 — 실패를 «주입해» 거부되는지 잰다. 재실행 안전.
--
-- 실행: kps-migrate.sh supabase/verify/constraints.sql core
--   스키마를 고친 뒤 다시 돌린다. 7항 중 1건이라도 실패하면 예외를 던져 전부 되돌린다.
--
-- ★남의 데이터를 빌려 쓰지 않는다 — 검증 전용 기수·회차를 «스스로 만들고» 끝에 지운다.
--   ⛔운영 중인 회차를 대상으로 잡으면 시험3(확정)이 트리거를 깨워 그 회차의 실제
--     위촉을 철회한다. 검증기가 측정 대상을 오염시키는 전형이다.
-- ★0건을 통과로 읽지 않는다 — 대상을 못 잡으면 예외를 던진다.

do $$
declare
  v_sess   uuid; v_cohort uuid;
  v_i1     uuid; v_i2 uuid;
  v_e1     uuid; v_e2 uuid;
  v_run    uuid;
  v_status text;
  v_reason text;
  v_pass   int := 0;
  v_fail   int := 0;
begin
  -- 검증 전용 기수·회차를 만든다. 운영 중인 회차를 빌리지 않는다.
  -- 재실행 안전 — 앞선 실행의 잔여가 있으면 먼저 지운다
  delete from public.edu_sessions where cohort_id in (select id from public.edu_cohorts where program_slug = 'e12-verify');
  delete from public.edu_cohorts  where program_slug = 'e12-verify';
  insert into public.edu_cohorts (program_slug, cohort_no, status, is_test)
  values ('e12-verify', 1, 'draft', true)
  returning id into v_cohort;
  insert into public.edu_sessions (cohort_id, session_no, title, counts_for_attendance)
  values (v_cohort, 1, 'e12 검증 회차', false)
  returning id into v_sess;
  if v_sess is null then
    raise exception '🔴 검증 회차를 만들지 못했다 — 0건을 통과로 읽지 않는다';
  end if;
  raise notice '검증 전용 회차 = % (기수 %)', v_sess, v_cohort;

  insert into public.edu_instructors (name, expertise, methods, years, audience, value_profile,
                                      regions, source, is_test)
  values ('검증강사A(검증)', '{마케팅전략}', '{워크숍}', 10, '{중간관리자}',
          '{"실무적용":0.9,"사례중심":0.8,"참여유도":0.6}', '{서울}', 'e12-검증-2026-10-06', true)
  returning id into v_i1;
  insert into public.edu_instructors (name, expertise, methods, years, audience, value_profile,
                                      regions, source, is_test)
  values ('검증강사B(검증)', '{마케팅전략}', '{강의}', 7, '{실무자}',
          '{"실무적용":0.5,"사례중심":0.9,"참여유도":0.4}', '{서울}', 'e12-검증-2026-10-06', true)
  returning id into v_i2;

  -- ── 시험 1) scope 제약 — scope='session' 인데 cohort_id 를 채우면 거부되는가
  begin
    insert into public.edu_instructor_engagements (instructor_id, scope, session_id, cohort_id, origin, is_test)
    values (v_i1, 'session', v_sess, (select cohort_id from public.edu_sessions where id = v_sess), 'proposed', true);
    v_fail := v_fail + 1; raise notice '🔴 시험1 scope 제약 — 거부되지 않았다';
  exception when check_violation then
    v_pass := v_pass + 1; raise notice '✅ 시험1 scope 제약 — 거부됨';
  end;

  -- 정상 제안 2건
  insert into public.edu_instructor_engagements (instructor_id, scope, session_id, origin, fee, fee_basis, is_test)
  values (v_i1, 'session', v_sess, 'proposed', 240000, '3시간 1회차 기준', true) returning id into v_e1;
  insert into public.edu_instructor_engagements (instructor_id, scope, session_id, origin, fee, is_test)
  values (v_i2, 'session', v_sess, 'applied', 210000, true) returning id into v_e2;

  -- ── 시험 2) 같은 대상·같은 강사의 «활성» 중복이 막히는가
  begin
    insert into public.edu_instructor_engagements (instructor_id, scope, session_id, origin, is_test)
    values (v_i1, 'session', v_sess, 'proposed', true);
    v_fail := v_fail + 1; raise notice '🔴 시험2 활성 중복 — 막히지 않았다';
  exception when unique_violation then
    v_pass := v_pass + 1; raise notice '✅ 시험2 활성 중복 — 막힘';
  end;

  -- ── 시험 3) 확정 시 다른 활성 건이 트리거로 철회되는가
  update public.edu_instructor_engagements set status = 'confirmed' where id = v_e1;
  select status, withdrawn_reason into v_status, v_reason
    from public.edu_instructor_engagements where id = v_e2;
  if v_status = 'withdrawn' and v_reason is not null then
    v_pass := v_pass + 1; raise notice '✅ 시험3 일괄 철회 — B 가 % / 사유 «%»', v_status, v_reason;
  else
    v_fail := v_fail + 1; raise notice '🔴 시험3 일괄 철회 — B 상태가 % (기대 withdrawn)', v_status;
  end if;

  -- ── 시험 4) 철회된 건은 다시 제안할 수 있는가(부분 유니크의 의도)
  begin
    insert into public.edu_instructor_engagements (instructor_id, scope, session_id, origin, is_test)
    values (v_i2, 'session', v_sess, 'proposed', true);
    v_pass := v_pass + 1; raise notice '✅ 시험4 재제안 — 허용됨(철회 건은 활성이 아니다)';
  exception when unique_violation then
    v_fail := v_fail + 1; raise notice '🔴 시험4 재제안 — 막혔다. 철회 후 재위촉이 불가능하다';
  end;

  -- ── 시험 5) 설명 없는 점수가 저장되지 않는가 (axes 빈 배열)
  insert into public.edu_match_runs (session_id, demand, weights, candidates_n, is_test)
  values (v_sess, '{"topic":["마케팅전략"],"methods":["워크숍"]}',
          '{"K":0.3,"S":0.2,"A":0.2,"C":0.15,"L":0.15}', 2, true) returning id into v_run;
  begin
    insert into public.edu_match_scores (run_id, instructor_id, percent, rank, axes, headline)
    values (v_run, v_i1, 81, 1, '[]'::jsonb, '주제 일치, 조직 성향 측정 불가');
    v_fail := v_fail + 1; raise notice '🔴 시험5 설명 없는 점수 — 저장됐다';
  exception when check_violation then
    v_pass := v_pass + 1; raise notice '✅ 시험5 설명 없는 점수 — 거부됨';
  end;

  -- ── 시험 6) 축 근거가 있으면 저장되는가 + C축 측정 불가 표기
  insert into public.edu_match_scores (run_id, instructor_id, percent, rank, axes, headline, culture_measured)
  values (v_run, v_i1, 81, 1,
          '[{"axis":"K","label":"강의 주제","score":1,"weight":0.3,"reasons":["마케팅전략 일치"]},
            {"axis":"C","label":"조직 성향","score":0,"weight":0.15,"reasons":["가치축 3개 미만 — 측정 불가"]}]'::jsonb,
          '주제 일치, 조직 성향 측정 불가', false);
  v_pass := v_pass + 1; raise notice '✅ 시험6 근거 동반 점수 — 저장됨';

  -- ── 시험 8) 부적격인데 사유가 없으면 거부되는가(점수로 덮지 못하게)
  begin
    insert into public.edu_match_scores (run_id, instructor_id, percent, rank, axes, headline, eligible)
    values (v_run, v_i2, 30, 2,
            '[{"axis":"K","label":"강의 주제","score":0.2,"weight":0.3,"reasons":["부분 일치"]}]'::jsonb,
            '주제 부분 일치', false);
    v_fail := v_fail + 1; raise notice '🔴 시험8 사유 없는 부적격 — 저장됐다';
  exception when check_violation then
    v_pass := v_pass + 1; raise notice '✅ 시험8 사유 없는 부적격 — 거부됨';
  end;

  -- ── 시험 7) 강사 물리 삭제가 위촉 참조를 끊지 못하는가(restrict)
  begin
    delete from public.edu_instructors where id = v_i1;
    v_fail := v_fail + 1; raise notice '🔴 시험7 강사 물리 삭제 — 위촉이 있는데 지워졌다';
  exception when foreign_key_violation then
    v_pass := v_pass + 1; raise notice '✅ 시험7 강사 물리 삭제 — 위촉 참조로 거부됨';
  end;

  -- ── 정리: 이 검증이 만든 것만 지운다
  delete from public.edu_match_scores where run_id = v_run;
  delete from public.edu_match_runs   where id = v_run;
  delete from public.edu_instructor_engagements where instructor_id in (v_i1, v_i2);
  delete from public.edu_instructors where source = 'e12-검증-2026-10-06';
  delete from public.edu_sessions where cohort_id = v_cohort;
  delete from public.edu_cohorts  where id = v_cohort;

  raise notice '── 결과: 통과 % · 실패 %', v_pass, v_fail;
  if v_fail > 0 then
    raise exception '🔴 실패 %건 — 적용 상태를 통과로 적지 않는다', v_fail;
  end if;
end $$;

-- 잔여 0 확인(같은 트랜잭션 안에서 되읽기)
select
  (select count(*) from public.edu_instructors where source = 'e12-검증-2026-10-06') as left_instructors,
  (select count(*) from public.edu_cohorts where program_slug = 'e12-verify')        as left_cohorts,
  (select count(*) from public.edu_instructor_engagements where is_test)             as left_test_engagements,
  (select count(*) from public.edu_match_runs   where is_test)                       as left_test_runs,
  (select count(*) from public.edu_match_scores) as left_scores;
