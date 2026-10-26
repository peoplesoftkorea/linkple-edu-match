'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdmin } from '@/lib/guard'
import { rankInstructors, INSTRUCTOR_WEIGHTS, type InstructorRow, type DemandProfile } from '@/lib/matching/instructor'
import { VALUE_AXES } from '@/lib/matching/vocab'
import { toDemand, explainDemand, type ClientProfile } from '@/lib/matching/client'

// 강사 배정 보조 — 운영자가 수요를 적으면 5축으로 재서 순위와 «근거»를 낸다.
//
// ★이 화면의 지위 = 당사 PM 의 보조 자료다. 발주사가 강사 후보를 순위로 열람하고 고르는
//   경로를 만들지 않는다(범위 확정서 §1 · e12 §6 의 RLS 와 같은 규율).
// ★산출을 반드시 남긴다 — 수요·가중치·재어 본 인원을 적어야 몇 달 뒤 「왜 이 사람이
//   1위였나」를 재현할 수 있다. 화면에만 띄우고 버리면 배정 근거서를 쓸 수 없다.
// ⛔강사 표와 구직자 표를 조인하지 않는다. 공용하는 것은 산식뿐이다.
//
// 🔴fail-to-zero 금지 3곳
//   1) 강사 조회가 실패하면 「후보 0명」으로 바꾸지 않는다 — 실행을 거절하고 그대로 말한다
//   2) 재어 본 인원(candidates_n)을 반드시 함께 적는다 — 산출 0건과 대상 0명은 다른 말이다
//   3) C축 미측정을 0점으로 저장하지 않는다 — culture_measured=false 로 사실을 적는다

// ★never 를 «변수 쪽»에 적는다 — 화살표 함수에만 적으면 검사기가 이 뒤를 계속 도달 가능으로
//   보고, 거절한 뒤의 코드가 null 을 들고 그대로 흐른다[2026-10-07 실측].
const back: (msg: string, to?: string) => never =
  (msg, to = '/edu/matching') => redirect(`${to}?msg=${encodeURIComponent(msg)}`)

const list = (fd: FormData, k: string) =>
  fd.getAll(k).map((v) => String(v).trim()).filter(Boolean).slice(0, 30)

const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim()
  if (!v) return null
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? Math.trunc(n) : NaN
}

/** 대상 1개를 고르게 한다 — e12 의 check 제약(order/cohort/session 중 최소 하나)과 같은 규율. */
function parseTarget(fd: FormData): { kind: 'order' | 'cohort' | 'session'; id: string } | null {
  const raw = String(fd.get('target') ?? '')
  const [kind, id] = raw.split(':')
  if (!id || !['order', 'cohort', 'session'].includes(kind)) return null
  return { kind: kind as 'order' | 'cohort' | 'session', id }
}

/** 교육 지향(C축) — 적어 낸 축만 담는다. 3개 미만이면 엔진이 「측정 불가」를 낸다. */
function parseValues(fd: FormData): Record<string, number> {
  const out: Record<string, number> = {}
  for (const axis of VALUE_AXES) {
    const v = String(fd.get(`value_${axis}`) ?? '').trim()
    if (!v) continue
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) out[axis] = Math.min(1, n)
  }
  return out
}

/**
 * 의뢰사 기반정보로 수요 칸을 «채운다» — 매칭을 돌리지 않는다.
 * ★왜 [대표님 지시 2026-10-10] 종전엔 운영자가 「임원 24명이니 최소 경력 몇 년으로 할까」를
 *   머리로 계산해 넣었다. 그 판단이 사람마다 다르면 산출을 비교할 수 없다.
 *   ⇒ 규칙(lib/matching/client.ts)이 밀고, 운영자는 «고친다».
 * ★채우기와 실행을 가른다 — 자동으로 돌려 버리면 운영자가 규칙을 검토할 자리가 없어진다.
 */
export async function fillFromClient(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const industry = String(fd.get('c_industry') ?? '').trim()
  const region = String(fd.get('c_region') ?? '').trim()
  const level = String(fd.get('c_level') ?? '').trim()
  const headcount = num(fd, 'c_headcount')
  const size = num(fd, 'c_size')
  const prior = String(fd.get('c_prior') ?? 'basic').trim()
  const goals = list(fd, 'c_goals')
  const topics = list(fd, 'c_topics')

  // ⛔빈칸을 기본값으로 메우지 않는다 — 모르는 것을 숫자로 바꾸면 그 숫자가 근거가 된다.
  if (!region || !level) back('소재지와 교육생 직급은 규칙의 입력입니다 — 비우면 축을 밀 수 없습니다.')
  if (headcount == null || Number.isNaN(headcount) || headcount <= 0) back('임직원 수를 숫자로 적으십시오 — 최소 경력을 미는 값입니다.')
  if (size == null || Number.isNaN(size) || size <= 0) back('교육생 인원을 숫자로 적으십시오 — 강의 방식을 가르는 값입니다.')
  if (goals.length === 0) back('교육 목표를 하나 이상 고르십시오 — 비우면 교육 지향(C축)이 측정 불가가 됩니다.')
  if (topics.length === 0) back('과정 주제를 하나 이상 고르십시오 — 업종은 주제를 «대신하지» 않습니다.')

  const client: ClientProfile = {
    name: String(fd.get('c_name') ?? '').trim() || '이름 미기재',
    industry, region: region as ClientProfile['region'], headcount,
    cohort: { level: level as ClientProfile['cohort']['level'], size, prior: prior as ClientProfile['cohort']['prior'] },
    goals: goals as ClientProfile['goals'],
    venue: (String(fd.get('c_venue') ?? 'onsite').trim() || 'onsite') as ClientProfile['venue'],
  }
  const d = toDemand(client, topics)

  const q = new URLSearchParams()
  for (const t of d.topics as string[]) q.append('topics', t)
  for (const m of d.methods as string[]) q.append('methods', m)
  for (const a of d.audience as string[]) q.append('audience', a)
  if (d.region) q.set('region', d.region)
  if (d.minYears != null) q.set('minYears', String(d.minYears))
  for (const [k, v] of Object.entries(d.values ?? {})) q.set(`value_${k}`, String(Math.round(v * 10) / 10))
  // ★「왜 이렇게 채워졌는가」를 함께 넘긴다 — 근거 없는 자동 채움은 운영자가 검토할 수 없다.
  for (const line of explainDemand(client)) q.append('why', line)
  // 🔴[자가적발 2026-10-10 캡처에서 눈으로 봤다] 채우고 나면 의뢰사 폼이 «통째로 비워졌다».
  //   운영자가 「인원만 30명으로 바꿔 다시」를 하려면 여덟 칸을 처음부터 다시 쳐야 했다.
  //   그것이 실무에서 가장 흔한 동작이다 ⇒ 적어 낸 값을 그대로 돌려준다.
  q.set('cname', client.name)
  q.set('c_industry', industry)
  q.set('c_region', region)
  q.set('c_level', level)
  q.set('c_headcount', String(headcount))
  q.set('c_size', String(size))
  q.set('c_prior', prior)
  q.set('c_venue', client.venue)
  for (const t of topics) q.append('c_topics', t)
  for (const g of goals) q.append('c_goals', g)
  redirect(`/edu/matching?${q.toString()}`)
}

export async function runMatch(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')

  const target = parseTarget(fd)
  if (!target) back('매칭 대상을 고르십시오 — 기수·회차·발주 중 하나가 있어야 산출을 남길 수 있습니다.')

  const demand: DemandProfile = {
    topics: list(fd, 'topics'),
    methods: list(fd, 'methods'),
    audience: list(fd, 'audience'),
    region: String(fd.get('region') ?? '').trim() || undefined,
    values: parseValues(fd),
  }
  const minYears = num(fd, 'minYears')
  if (Number.isNaN(minYears)) back('최소 강의 경력은 숫자로 적으십시오.')
  if (minYears != null) demand.minYears = minYears

  if (demand.topics.length === 0) back('요구 주제를 하나 이상 고르십시오 — K축이 비면 점수는 나오지만 주제를 재지 않은 것입니다.')

  // 🔴[대표님 캡처 지적 2026-10-10] 종전엔 풀 «전체»를 읽어 칸 검증용 「테스트강사1」이
  //   실제 후보처럼 3위에 섰다. 샘플풀 23명과 테스트 시드 5명은 성격이 다른 데이터다.
  //   ⇒ 어느 풀로 재는지를 운영자가 고른다. 실명부가 오면 같은 자리에서 그쪽으로 바꾼다.
  const source = String(fd.get('source') ?? '').trim()
  let q = supabaseAdmin
    .from('edu_instructors')
    .select('id, name, expertise, methods, audience, years, value_profile, regions, contactable, deleted_at, is_test, source, created_at')
    .is('deleted_at', null)
  if (source === '__real__') q = q.eq('is_test', false)        // 실명부만
  else if (source) q = q.eq('source', source)
  // ★조회 실패와 「강사 0명」을 가른다. error 를 빈 배열로 읽으면 운영자는 풀이 빈 줄 안다.
  const { data: rows, error } = await q
  if (error) back(`강사풀을 읽지 못했습니다 — ${error.message}. 산출을 남기지 않았습니다.`)
  const pool = (rows ?? []) as (InstructorRow & { is_test: boolean; source: string | null })[]
  if (pool.length === 0) back(source ? `「${source === '__real__' ? '실명부' : source}」 에 강사가 없습니다 — 다른 풀을 고르거나 명부를 적재하십시오.` : '강사풀이 비어 있습니다 — 명부를 먼저 적재하십시오.')

  const { ranked, examined, excluded } = rankInstructors(demand, pool)

  // 산출이 테스트인가 = 대상과 강사풀 중 하나라도 테스트면 테스트다. ⛔실적으로 섞지 않는다.
  const everyTest = pool.every((r) => r.is_test)
  const { data: tgt } = await supabaseAdmin
    .from(target.kind === 'order' ? 'edu_org_orders' : target.kind === 'cohort' ? 'edu_cohorts' : 'edu_sessions')
    .select(target.kind === 'session' ? 'id, cohort_id' : 'id, is_test')
    .eq('id', target.id)
    .maybeSingle()
  let targetTest = false
  if (target.kind === 'session') {
    const cohortId = (tgt as { cohort_id?: string } | null)?.cohort_id
    if (cohortId) {
      const { data: c } = await supabaseAdmin.from('edu_cohorts').select('is_test').eq('id', cohortId).maybeSingle()
      targetTest = !!c?.is_test
    }
  } else {
    targetTest = !!(tgt as { is_test?: boolean } | null)?.is_test
  }

  const { data: run, error: runErr } = await supabaseAdmin
    .from('edu_match_runs')
    .insert({
      order_id: target.kind === 'order' ? target.id : null,
      cohort_id: target.kind === 'cohort' ? target.id : null,
      session_id: target.kind === 'session' ? target.id : null,
      demand: { ...demand, minYears: demand.minYears ?? null, source: source || '전체' },
      weights: INSTRUCTOR_WEIGHTS,
      engine_rev: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'local',
      candidates_n: examined,                                   // ⛔0 을 「후보 없음」으로 읽지 않게 함께 남긴다
      note: excluded.length ? `제외 ${excluded.map((e) => `${e.reason} ${e.n}`).join(', ')}` : null,
      is_test: everyTest || targetTest,
    })
    .select('id')
    .single()
  if (runErr || !run) back(`산출을 남기지 못했습니다 — ${runErr?.message ?? '원인 미상'}`)

  if (ranked.length) {
    const { error: scoreErr } = await supabaseAdmin.from('edu_match_scores').insert(
      ranked.map((m, i) => ({
        run_id: run.id,
        instructor_id: m.instructor.id,
        percent: m.match.percent,
        rank: i + 1,
        axes: m.match.axes,                      // 설명 없는 점수는 DB 가 거부한다(e12 §4)
        headline: m.match.headline,
        eligible: m.match.eligible,
        blockers: m.match.blockers,
        culture_measured: m.cultureMeasured,
      })),
    )
    // 점수를 못 남겼으면 run 만 남은 «반쪽 산출»이 된다 — 지우고 사실대로 말한다.
    if (scoreErr) {
      await supabaseAdmin.from('edu_match_runs').delete().eq('id', run.id)
      back(`축별 근거를 남기지 못해 산출을 취소했습니다 — ${scoreErr.message}`)
    }
  }

  redirect(`/edu/matching/${run.id}`)
}

/** 위촉 제안 — 상대는 «항상 당사»다. 발주사와 강사 사이에 계약 경로를 만들지 않는다. */
export async function proposeEngagement(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const runId = String(fd.get('runId') ?? '')
  const to = `/edu/matching/${runId}`

  const instructorId = String(fd.get('instructorId') ?? '')
  const scopeRaw = String(fd.get('scope') ?? '')
  const targetId = String(fd.get('targetId') ?? '')
  if (!instructorId || !targetId || !['session', 'cohort'].includes(scopeRaw)) {
    back('위촉 단위가 없습니다 — 회차 또는 기수에만 위촉합니다. 발주 단위 매칭은 기수를 연 뒤 제안하십시오.', to)
  }
  const scope = scopeRaw as 'session' | 'cohort'

  const fee = num(fd, 'fee')
  if (Number.isNaN(fee)) back('강사료는 숫자로 적으십시오.', to)

  // ★1순위가 아닌 배정에는 사유를 받는다 — 근거서가 「왜 이 사람인지」를 말해야 한다.
  //   ⛔화면의 required 는 «문»일 뿐이다(붙여넣기·개발자도구로 넘는다). 제출 경로에서 다시 본다.
  const rank = num(fd, 'rank')
  const message = String(fd.get('message') ?? '').trim()
  if (rank != null && !Number.isNaN(rank) && rank > 1 && message.length < 5) {
    back('1순위가 아닌 강사를 배정하려면 «배정 사유»를 적으십시오 — 근거서에 그대로 실립니다.', to)
  }

  const { error } = await supabaseAdmin.from('edu_instructor_engagements').insert({
    instructor_id: instructorId,
    scope,
    session_id: scope === 'session' ? targetId : null,
    cohort_id: scope === 'cohort' ? targetId : null,
    origin: 'proposed',
    status: 'proposed',
    fee,
    fee_basis: String(fd.get('feeBasis') ?? '').trim() || null,
    message: message || null,
    match_score_id: String(fd.get('scoreId') ?? '') || null,
    is_test: String(fd.get('isTest') ?? '') === '1',
  })
  if (error) {
    // 같은 대상에 같은 강사의 활성 건은 하나뿐이다(부분 유니크 인덱스). 그 사실을 사람 말로 돌려준다.
    const dup = error.code === '23505'
    back(dup ? '이미 진행 중인 위촉 건이 있습니다 — 기존 건을 처리한 뒤 다시 제안하십시오.' : `제안하지 못했습니다 — ${error.message}`, to)
  }
  revalidatePath(to)
  back('위촉을 제안했습니다.', to)
}

/** 위촉 상태 전환 — 확정 시 같은 대상의 다른 활성 건은 «트리거»가 철회한다(화면이 아니다). */
export async function decideEngagement(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const runId = String(fd.get('runId') ?? '')
  const to = runId ? `/edu/matching/${runId}` : '/edu/matching'

  const id = String(fd.get('engagementId') ?? '')
  const act = String(fd.get('act') ?? '')
  if (!id) back('대상 위촉 건이 없습니다.', to)

  const patch: Record<string, unknown> =
    act === 'confirm' ? { status: 'confirmed', decided_at: new Date().toISOString() }
    : act === 'accept' ? { status: 'accepted', decided_at: new Date().toISOString() }
    : act === 'decline' ? { status: 'declined', decided_at: new Date().toISOString(), decline_reason: String(fd.get('reason') ?? '').trim() || '사유 미기재' }
    : act === 'withdraw' ? { status: 'withdrawn', withdrawn_reason: String(fd.get('reason') ?? '').trim() || '운영자 철회' }
    : {}
  if (Object.keys(patch).length === 0) back('알 수 없는 처리입니다.', to)

  const { error } = await supabaseAdmin.from('edu_instructor_engagements').update(patch).eq('id', id)
  if (error) back(`처리하지 못했습니다 — ${error.message}`, to)
  revalidatePath(to)
  back(
    act === 'confirm' ? '위촉을 확정했습니다 — 같은 대상의 다른 활성 건은 자동 철회됩니다.'
    : act === 'accept' ? '강사 수락을 기록했습니다.'
    : act === 'decline' ? '강사 거부를 기록했습니다.'
    : '위촉을 철회했습니다.',
    to,
  )
}
