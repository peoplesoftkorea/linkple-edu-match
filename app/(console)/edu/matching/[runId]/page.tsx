// 매칭 산출 1건 — 순위와 «그 근거», 그리고 위촉 제안.
//
// ★점수만 보이는 화면을 만들지 않는다 — 축별 점수와 사유를 함께 낸다(엔진 규율 2).
//   운영자가 발주사에게 내놓을 「배정 근거서」가 이 화면에서 나온다.
// ★「측정 불가」를 0점처럼 보이게 하지 않는다 — C축은 가치축 3개 미만이면 재지 않은 것이다.
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fmt, won } from '@/lib/admin-ui'
import { proposeEngagement, decideEngagement } from '../actions'
import { generateContract, signAsCompany, requestInstructorSignature, voidContract } from '../contract-actions'
import { TEMPLATE_APPROVED, TEMPLATE_REV } from '@/lib/contracts'

export const dynamic = 'force-dynamic'

import { RankTable } from './RankTable'

type Axis = { axis: string; label?: string; score: number; weight: number; reasons?: string[] }

const ENGAGEMENT_LABEL: Record<string, string> = {
  proposed: '제안함', applied: '지원옴', accepted: '강사 수락',
  confirmed: '확정', declined: '강사 거부', withdrawn: '철회',
}
const ENGAGEMENT_TONE: Record<string, 'default' | 'neutral' | 'warning' | 'danger' | 'success'> = {
  proposed: 'default', applied: 'default', accepted: 'warning',
  confirmed: 'success', declined: 'danger', withdrawn: 'neutral',
}
const LIVE = ['proposed', 'applied', 'accepted', 'confirmed']

export default async function MatchRunPage({
  params, searchParams,
}: {
  params: Promise<{ runId: string }>
  searchParams: Promise<{ msg?: string; view?: string }>
}) {
  const { runId } = await params
  const sp = await searchParams
  const { msg } = sp

  const { data: run } = await supabaseAdmin
    .from('edu_match_runs')
    .select('id, order_id, cohort_id, session_id, demand, weights, engine_rev, candidates_n, note, is_test, created_at')
    .eq('id', runId)
    .maybeSingle()
  if (!run) notFound()

  const { data: scores } = await supabaseAdmin
    .from('edu_match_scores')
    .select('id, instructor_id, percent, rank, axes, headline, eligible, blockers, culture_measured, instructor:edu_instructors(name, title, years, regions, contactable, day_rate, hourly_rate, source)')
    .eq('run_id', runId)
    .order('rank', { ascending: true })

  // 위촉 단위 — 발주 단위 산출에는 위촉을 걸 수 없다(e12 의 scope 제약과 같은 규율).
  const VIEWS = [
    { key: 'eligible', label: '적격', test: (r: { eligible: boolean }) => r.eligible },
    { key: 'rejected', label: '부적격', test: (r: { eligible: boolean }) => !r.eligible },
    { key: 'all', label: '전체', test: () => true },
  ] as const
  const view = VIEWS.find((v) => v.key === sp.view) ?? VIEWS[0]

  const scope: 'cohort' | 'session' | null = run.cohort_id ? 'cohort' : run.session_id ? 'session' : null
  const targetId = run.cohort_id ?? run.session_id ?? null

  let targetName = '기업 발주'
  if (run.cohort_id) {
    const { data: c } = await supabaseAdmin.from('edu_cohorts').select('title, cohort_no').eq('id', run.cohort_id).maybeSingle()
    targetName = c ? `${c.title} · ${c.cohort_no}기` : '기수'
  } else if (run.session_id) {
    const { data: s } = await supabaseAdmin.from('edu_sessions').select('session_no, title, topic, cohort_id').eq('id', run.session_id).maybeSingle()
    targetName = s ? `${s.session_no}회차 · ${s.topic || s.title || ''}` : '회차'
  } else if (run.order_id) {
    const { data: o } = await supabaseAdmin.from('edu_org_orders').select('order_no, org_name').eq('id', run.order_id).maybeSingle()
    targetName = o ? `${o.order_no} · ${o.org_name}` : '기업 발주'
  }

  // 이 대상의 위촉 현황 — 같은 자리에서 보이지 않으면 중복 제안이 난다.
  const { data: engagements } = targetId
    ? await supabaseAdmin
        .from('edu_instructor_engagements')
        .select('id, instructor_id, status, origin, fee, fee_basis, message, decided_at, decline_reason, withdrawn_reason, created_at, instructor:edu_instructors(name)')
        .eq(scope === 'cohort' ? 'cohort_id' : 'session_id', targetId)
        .order('created_at', { ascending: false })
    : { data: [] as never[] }

  // 계약·서명 — 확정 위촉에만 붙는다. 서명 상태를 한 자리에서 보이게 한다.
  const engIds = (engagements ?? []).map((e) => e.id)
  const { data: contracts } = engIds.length
    ? await supabaseAdmin.from('edu_contracts')
        .select('id, engagement_id, status, template_rev, body, created_at, void_reason')
        .in('engagement_id', engIds)
    : { data: [] as never[] }
  const contractBy = new Map((contracts ?? []).map((c) => [c.engagement_id, c]))
  const { data: signatures } = (contracts ?? []).length
    ? await supabaseAdmin.from('edu_contract_signatures')
        .select('contract_id, party, signer_name, signed_at')
        .in('contract_id', (contracts ?? []).map((c) => c.id))
    : { data: [] as never[] }
  const signsBy = new Map<string, { party: string; signer_name: string; signed_at: string }[]>()
  for (const s of signatures ?? []) signsBy.set(s.contract_id, [...(signsBy.get(s.contract_id) ?? []), s])

  const liveBy = new Map<string, string>()
  for (const e of engagements ?? []) if (LIVE.includes(e.status)) liveBy.set(e.instructor_id, e.status)

  // 강사 평점 — ★운영자와 본인만 본다(범위 확정서 결정 8). 발주사 화면에는 내보내지 않는다.
  //   ⛔평점으로 «정렬»하지 않는다 — 순위를 매기는 축은 5축 적합도 하나뿐이다.
  const instructorIds = [...new Set((scores ?? []).map((s) => s.instructor_id))]
  const { data: reviews } = instructorIds.length
    ? await supabaseAdmin.from('edu_reviews')
        .select('instructor_id, rating').eq('subject', 'instructor').is('withdrawn_at', null)
        .in('instructor_id', instructorIds)
    : { data: [] as never[] }
  const ratingBy = new Map<string, { n: number; avg: number }>()
  for (const id of instructorIds) {
    const mine = (reviews ?? []).filter((r) => r.instructor_id === id)
    // ⛔평가가 없을 때 「0.0점」을 내지 않는다 — 없는 것과 낮은 것은 다른 사실이다
    if (mine.length) ratingBy.set(id, { n: mine.length, avg: mine.reduce((a, r) => a + r.rating, 0) / mine.length })
  }

  const d = (run.demand ?? {}) as { topics?: string[]; methods?: string[]; audience?: string[]; minYears?: number | null; region?: string; values?: Record<string, number> }
  const rows = scores ?? []
  const eligible = rows.filter((r) => r.eligible)
  const cultureMeasured = rows.filter((r) => r.culture_measured).length

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-md border bg-muted px-3 py-2 text-sm">{msg}</div>}

      <div>
        <Link href="/edu/matching" className="text-sm text-muted-foreground underline underline-offset-2">← 강사 배정</Link>
        <h1 className="text-xl font-semibold tracking-tight mt-1">
          {targetName} {run.is_test && <Badge tone="neutral" className="ml-2 align-middle">테스트</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {fmt(run.created_at)} 산출 · 재어 본 강사 <strong>{run.candidates_n}명</strong> · 적격 <strong>{eligible.length}명</strong> ·
          부적격 <strong>{rows.length - eligible.length}명</strong>
          {run.note && <> · {run.note}</>}
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>이 산출의 입력</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <p><span className="text-muted-foreground">요구 주제 K</span> · {(d.topics ?? []).join(', ') || '—'}</p>
          <p><span className="text-muted-foreground">강의 방식 S</span> · {(d.methods ?? []).join(', ') || '—'}</p>
          <p><span className="text-muted-foreground">대상 층 A</span> · {(d.audience ?? []).join(', ') || '—'}</p>
          <p><span className="text-muted-foreground">최소 경력</span> · {d.minYears != null ? `${d.minYears}년` : '요건 없음'}</p>
          <p><span className="text-muted-foreground">출강 권역</span> · {d.region || '지정 안 함'}{d.region && ' (필수 요건)'}</p>
          <p>
            <span className="text-muted-foreground">교육 지향 C</span> ·{' '}
            {Object.keys(d.values ?? {}).length >= 3
              ? Object.entries(d.values ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')
              : '측정하지 않음 — 발주사 가치축이 3개 미만입니다'}
          </p>
          <p className="text-muted-foreground">
            가중치 {Object.entries((run.weights ?? {}) as Record<string, number>).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(' · ')} ·
            엔진 {run.engine_rev ?? '—'}
          </p>
          {Object.keys(d.values ?? {}).length >= 3 && cultureMeasured === 0 && (
            <p className="text-warn">
              발주사 가치축은 적었으나 <strong>강사 쪽 교육 지향이 전원 비어 있어</strong> C축을 재지 못했습니다 — 위촉 협의에서 받습니다.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 순위 — 공용 DataTable(TanStack). 축을 «열»로 두어 강사 간 비교가 되게 한다.
          🔴[대표님 지적 2026-10-10] 종전엔 서술형 카드를 세로로 늘어놓아 정렬·검색·비교가 불가능했다
            — MTOS 화면표준이 폐기한 「읽는 문서」 구조였다. 근거는 행을 펼치면 그대로 있다. */}
      {/* ★화면을 만들었으면 «가는 문»까지가 한 묶음이다 — 링크가 없으면 아무도 찾지 못한다. */}
      {rows.length > 0 && (
        <div className="flex justify-end">
          <Link href={`/edu/matching/${run.id}/rationale`}
            className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-surface">
            배정 근거서 보기 <span className="font-normal text-faint">· 발주 기업 제출용</span>
          </Link>
        </div>
      )}

      {/* 보기 칩 — URL 쿼리가 상태 정본(MTOS 표준 불변규칙 4).
          🔴[2026-10-11 캡처에서 눈으로 봤다] 적격·부적격을 한 표에 섞으니 12위 61% 가 1위 56% 보다
            높아 보였다. 순위는 「적격 먼저, 그 다음 점수」인데 표에서는 그 규칙이 보이지 않는다.
            ⇒ 기본은 적격만 본다. 부적격은 칩으로 넘어가 그들끼리 비교한다. */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {VIEWS.map((v) => {
            const n = rows.filter(v.test).length
            const on = v.key === view.key
            return (
              <Link key={v.key} href={v.key === 'eligible' ? `?` : `?view=${v.key}`}
                className={`rounded-full border px-3 py-1 text-sm ${on ? 'bg-foreground text-background border-line' : 'bg-background hover:bg-surface'}`}>
                {v.label} <span className={on ? 'text-faint' : 'text-faint'}>{n}</span>
              </Link>
            )
          })}
        </div>
      )}

      {rows.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            산출이 없습니다 — 재어 본 강사가 {run.candidates_n ?? 0}명입니다.
          </CardContent>
        </Card>
      )}
      {rows.length > 0 && <RankTable
        runId={run.id}
        scope={scope}
        targetId={targetId}
        rows={rows.filter(view.test).map((s) => {
          const who = (Array.isArray(s.instructor) ? s.instructor[0] : s.instructor) as
            { name: string; title: string | null; years: number | null; regions: string[] | null; contactable: boolean; day_rate: number | null; hourly_rate: number | null; source: string | null } | null
          const live = liveBy.get(s.instructor_id) ?? null
          return {
            id: s.id, rank: s.rank, percent: s.percent, eligible: s.eligible,
            instructor_id: s.instructor_id,
            name: who?.name ?? '—', title: who?.title ?? null, years: who?.years ?? null,
            regions: who?.regions ?? null, contactable: who?.contactable ?? false,
            source: who?.source ?? null, dayRate: who?.day_rate ?? null,
            axes: (s.axes ?? []) as Axis[],
            cultureMeasured: s.culture_measured, blockers: (s.blockers ?? []) as string[],
            headline: s.headline ?? null,
            // 🔴ratingBy 를 «계산만 하고» 행에 싣지 않아 화면에 평점이 끝내 나오지 않았다
            //   [reviewguard 8) 적발 2026-10-11]. 원자를 만든 것과 «쓰이게» 한 것은 다른 일이다.
            rating: ratingBy.get(s.instructor_id) ?? null,
            live, liveLabel: live ? ENGAGEMENT_LABEL[live] ?? live : null,
            liveTone: live ? ENGAGEMENT_TONE[live] ?? 'neutral' : null,
          }
        })}
      />}

      {scope && (
        <Card>
          <CardHeader><CardTitle>이 대상의 위촉</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(engagements ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">위촉 건이 없습니다.</p>
            ) : (engagements ?? []).map((e) => {
              const who = Array.isArray(e.instructor) ? e.instructor[0] : e.instructor
              return (
                <div key={e.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    {who?.name ?? '—'} <Badge tone={ENGAGEMENT_TONE[e.status] ?? 'neutral'} className="ml-1">{ENGAGEMENT_LABEL[e.status] ?? e.status}</Badge>
                    <span className="ml-2 font-normal text-muted-foreground">
                      {e.origin === 'applied' ? '강사 지원' : '당사 제안'} · {fmt(e.created_at)}
                      {e.fee != null && <> · {won(e.fee)}</>}
                    </span>
                  </p>
                  {e.fee_basis && <p className="text-muted-foreground mt-0.5">{e.fee_basis}</p>}
                  {e.decline_reason && <p className="text-destructive mt-0.5">거부 사유 — {e.decline_reason}</p>}
                  {e.withdrawn_reason && <p className="text-muted-foreground mt-0.5">철회 — {e.withdrawn_reason}</p>}
                  {LIVE.includes(e.status) && e.status !== 'confirmed' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {['accept', 'confirm', 'decline', 'withdraw'].map((act) => (
                        <form key={act} action={decideEngagement}>
                          <input type="hidden" name="runId" value={run.id} />
                          <input type="hidden" name="engagementId" value={e.id} />
                          <input type="hidden" name="act" value={act} />
                          <button type="submit" className="rounded-md border px-3 py-1.5 text-xs font-semibold">
                            {act === 'accept' ? '강사 수락' : act === 'confirm' ? '확정' : act === 'decline' ? '강사 거부' : '철회'}
                          </button>
                        </form>
                      ))}
                    </div>
                  )}
                  {e.status === 'confirmed' && (
                    <p className="text-muted-foreground mt-1">확정 건입니다 — 같은 대상의 다른 활성 건은 자동 철회되었습니다.</p>
                  )}

                  {/* 계약서 — 확정된 위촉에서만 만든다 */}
                  {e.status === 'confirmed' && (() => {
                    const c = contractBy.get(e.id)
                    const signs = c ? (signsBy.get(c.id) ?? []) : []
                    const signedCompany = signs.find((x) => x.party === 'company')
                    const signedInstructor = signs.find((x) => x.party === 'instructor')
                    if (!c) {
                      return (
                        <form action={generateContract} className="mt-3 border-t pt-3 space-y-2">
                          <input type="hidden" name="runId" value={run.id} />
                          <input type="hidden" name="engagementId" value={e.id} />
                          <p className="text-xs text-muted-foreground">
                            계약서를 만들려면 아래 칸이 필요합니다. <strong>한 칸이라도 비면 만들지 않습니다</strong> —
                            빈칸이 남은 계약서는 「추후 협의」를 쓰지 않는다는 규율을 이미 깨뜨린 문서입니다.
                          </p>
                          <div className="grid sm:grid-cols-2 gap-2">
                            <Input name="instructorAddress" placeholder="강사 주소" />
                            <Input name="instructorContact" placeholder="강사 연락처" />
                            <Input name="instructorBizNo" placeholder="사업자등록번호 · 없으면 비우면 「해당 없음」" />
                            <Input name="bankAccount" placeholder="지급 계좌 — 은행·계좌번호·예금주" />
                            <Input name="priorClients" placeholder="기존 거래 기업 · 비우면 「없음」" />
                            <Input name="orgName" placeholder="발주사명 — 발주가 연결돼 있으면 비워도 됩니다" />
                          </div>
                          <button type="submit" className="rounded-md border px-3 py-1.5 text-xs font-semibold">위촉계약서 만들기</button>
                        </form>
                      )
                    }
                    return (
                      <div className="mt-3 border-t pt-3 space-y-2">
                        <p>
                          <span className="font-medium">위촉계약서</span>
                          <Badge tone={c.status === 'executed' ? 'success' : c.status === 'void' ? 'neutral' : 'default'} className="ml-2">
                            {c.status === 'draft' ? '작성됨' : c.status === 'sent' ? '서명 요청함' : c.status === 'executed' ? '체결' : '무효'}
                          </Badge>
                          <span className="ml-2 text-xs text-muted-foreground">문안 {c.template_rev} · {fmt(c.created_at)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          당사 {signedCompany ? `서명 ${signedCompany.signer_name} · ${fmt(signedCompany.signed_at)}` : '미서명'}
                          {' · '}
                          강사 {signedInstructor ? `서명 ${signedInstructor.signer_name} · ${fmt(signedInstructor.signed_at)}` : '미서명'}
                        </p>
                        <details>
                          <summary className="text-xs cursor-pointer text-muted-foreground">계약서 전문 보기</summary>
                          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-xs">{c.body}</pre>
                        </details>
                        {c.void_reason && <p className="text-xs text-muted-foreground">무효 사유 — {c.void_reason}</p>}
                        {c.status !== 'void' && (
                          <div className="flex flex-wrap items-end gap-2">
                            {!signedCompany && (
                              <form action={signAsCompany} className="flex items-end gap-2">
                                <input type="hidden" name="runId" value={run.id} />
                                <input type="hidden" name="contractId" value={c.id} />
                                <Input name="signerName" placeholder="당사 서명자 성명" className="w-44" />
                                <button type="submit" className="rounded-md border px-3 py-1.5 text-xs font-semibold">당사 서명</button>
                              </form>
                            )}
                            {c.status === 'draft' && (
                              <form action={requestInstructorSignature}>
                                <input type="hidden" name="runId" value={run.id} />
                                <input type="hidden" name="contractId" value={c.id} />
                                <button type="submit" className="rounded-md border px-3 py-1.5 text-xs font-semibold">강사 서명 요청</button>
                              </form>
                            )}
                            <form action={voidContract}>
                              <input type="hidden" name="runId" value={run.id} />
                              <input type="hidden" name="contractId" value={c.id} />
                              <button type="submit" className="rounded-md border px-3 py-1.5 text-xs">무효</button>
                            </form>
                          </div>
                        )}
                        {!TEMPLATE_APPROVED && c.status === 'draft' && (
                          <p className="text-xs text-warn">
                            문안이 아직 승인 전이라 <strong>강사에게는 보낼 수 없습니다</strong> — 생성과 내부 확인까지만 됩니다.
                          </p>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
