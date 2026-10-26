import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdmin } from '@/lib/guard'
import { CorpLine } from '@/lib/ui'

// 배정 근거서 — 발주 기업에 «제출하는» 문서.
//
//
// ★왜 PDF 생성기가 아니라 «인쇄용 화면»인가
//   데이터가 실시간이고, 생성기를 따로 두면 화면과 문서가 갈라진다(판본 둘).
//   운영자는 이 화면에서 바로 인쇄(PDF로 저장)한다.
//
// ⛔강사의 연락처·단가를 싣지 않는다 — 발주사에 내는 문서다(위촉계약서 제5조제5항: 당사 PM 이 창구).
// ⛔「측정 불가」를 0점으로 바꾸지 않는다. 못 잰 것은 못 쟀다고 적는다.

type Axis = { axis: string; label?: string; score: number; weight: number; reasons?: string[] }
const pct = (v: number) => Math.round(v * 100)

export default async function RationalePage({ params }: { params: Promise<{ runId: string }> }) {
  if (!(await isAdmin())) notFound()
  const { runId } = await params

  const { data: run } = await supabaseAdmin
    .from('edu_match_runs')
    .select('id, order_id, cohort_id, session_id, demand, weights, engine_rev, candidates_n, note, is_test, created_at')
    .eq('id', runId).maybeSingle()
  if (!run) notFound()

  const { data: scores } = await supabaseAdmin
    .from('edu_match_scores')
    .select('id, instructor_id, percent, rank, axes, eligible, blockers, culture_measured, instructor:edu_instructors(name, title, years, regions, source)')
    .eq('run_id', runId).order('rank', { ascending: true })
  const rows = scores ?? []

  // 확정된 위촉이 있으면 «배정된 강사»가 정해진 것이다. 없으면 1위를 후보로 적는다.
  const scope = run.cohort_id ? 'cohort_id' : run.session_id ? 'session_id' : null
  const targetId = run.cohort_id ?? run.session_id ?? null
  let confirmedId: string | null = null
  let pickReason = ''
  let orgName = '', cohortTitle = ''
  if (scope && targetId) {
    const { data: eng } = await supabaseAdmin.from('edu_instructor_engagements')
      .select('instructor_id, status, message').eq(scope, targetId).eq('status', 'confirmed').maybeSingle()
    confirmedId = eng?.instructor_id ?? null
    pickReason = (eng?.message ?? '').trim()
    if (run.cohort_id) {
      const { data: c } = await supabaseAdmin.from('edu_cohorts').select('title, cohort_no').eq('id', run.cohort_id).maybeSingle()
      cohortTitle = c ? `${c.title} · ${c.cohort_no}기` : ''
    }
  }
  if (run.order_id) {
    const { data: o } = await supabaseAdmin.from('edu_org_orders').select('org_name, order_no').eq('id', run.order_id).maybeSingle()
    orgName = o?.org_name ?? ''
  }

  const who = (r: typeof rows[number]) => (Array.isArray(r.instructor) ? r.instructor[0] : r.instructor) as
    { name: string; title: string | null; years: number | null; regions: string[] | null; source: string | null } | null
  const eligible = rows.filter((r) => r.eligible)
  const picked = rows.find((r) => r.instructor_id === confirmedId) ?? eligible[0]
  const others = eligible.filter((r) => r.id !== picked?.id).slice(0, 4)
  const d = (run.demand ?? {}) as { topics?: string[]; methods?: string[]; audience?: string[]; minYears?: number | null; region?: string; values?: Record<string, number>; source?: string }
  const issued = new Date(run.created_at as string)
  const docNo = `KPS-배정-${issued.toISOString().slice(0, 10).replace(/-/g, '')}-${String(run.id).slice(0, 6).toUpperCase()}`

  return (
    <div className="admin-bleed mx-auto max-w-[210mm] bg-card p-10 text-[13px] leading-relaxed text-ink print:p-0">
      {/* 화면에서만 보이는 머리 — 인쇄하면 사라진다 */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/edu/matching/${run.id}`} className="text-sm text-faint">← 산출로</Link>
        <p className="text-sm text-faint">브라우저 인쇄(⌘P)로 PDF 저장 · 발주 기업 제출용</p>
      </div>

      <header className="border-b-2 border-line pb-3">
        <h1 className="text-xl font-bold">강사 배정 근거서</h1>
        <p className="mt-1 text-xs text-faint">
          문서번호 {docNo} · 산출 {issued.toLocaleString('ko-KR')} · 엔진 {String(run.engine_rev ?? '—')}
          {run.is_test && <span className="ml-2 rounded bg-warn-bg px-1.5 py-0.5 text-warn">테스트 산출</span>}
        </p>
      </header>

      <section className="mt-5">
        <h2 className="font-semibold">1. 대상</h2>
        <table className="mt-2 w-full border-collapse text-[12.5px]">
          <tbody>
            <tr className="border-b"><td className="w-28 bg-surface px-3 py-1.5 text-faint">발주 기업</td><td className="px-3 py-1.5">{orgName || '—'}</td></tr>
            <tr className="border-b"><td className="bg-surface px-3 py-1.5 text-faint">과정·기수</td><td className="px-3 py-1.5">{cohortTitle || '—'}</td></tr>
            <tr className="border-b"><td className="bg-surface px-3 py-1.5 text-faint">재어 본 강사</td><td className="px-3 py-1.5">{run.candidates_n ?? 0}명 · 적격 {eligible.length}명{run.note ? ` · ${run.note}` : ''}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="mt-5">
        <h2 className="font-semibold">2. 무엇을 기준으로 쟀는가</h2>
        <p className="mt-1 text-xs text-faint">아래 기준은 발주 협의에서 받은 정보로 정했습니다. 모든 후보에게 같게 적용했습니다.</p>
        <table className="mt-2 w-full border-collapse text-[12.5px]">
          <tbody>
            <tr className="border-b"><td className="w-28 bg-surface px-3 py-1.5 text-faint">강의 주제</td><td className="px-3 py-1.5">{(d.topics ?? []).join(' · ') || '—'}</td></tr>
            <tr className="border-b"><td className="bg-surface px-3 py-1.5 text-faint">강의 방식</td><td className="px-3 py-1.5">{(d.methods ?? []).join(' · ') || '—'}</td></tr>
            <tr className="border-b"><td className="bg-surface px-3 py-1.5 text-faint">대상 층</td><td className="px-3 py-1.5">{(d.audience ?? []).join(' · ') || '—'}</td></tr>
            <tr className="border-b"><td className="bg-surface px-3 py-1.5 text-faint">필수 요건</td><td className="px-3 py-1.5">{[d.region && `출강 ${d.region}`, d.minYears != null && `최소 강의 경력 ${d.minYears}년`].filter(Boolean).join(' · ') || '—'}<span className="ml-2 text-xs text-rose-700">미충족 시 점수와 무관하게 제외</span></td></tr>
            <tr className="border-b"><td className="bg-surface px-3 py-1.5 text-faint">교육 지향</td><td className="px-3 py-1.5">{Object.entries(d.values ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '제시받지 않음 — 이 축은 재지 않았습니다'}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="mt-5">
        <h2 className="font-semibold">3. 배정한 강사</h2>
        {!picked ? (
          <p className="mt-2 text-sm">적격 후보가 없어 배정하지 못했습니다. 요건을 조정해 다시 산출합니다.</p>
        ) : (
          <>
            <p className="mt-2">
              <b className="text-base">{who(picked)?.name}</b>
              {who(picked)?.title && <span className="ml-2 text-faint">{who(picked)?.title}</span>}
              <span className="ml-3">적합도 <b>{picked.percent}%</b></span>
              <span className="ml-3 text-faint">강의 경력 {who(picked)?.years != null ? `${who(picked)?.years}년` : '미제출'}</span>
              {confirmedId ? <span className="ml-3 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">위촉 확정</span>
                           : <span className="ml-3 rounded bg-muted px-1.5 py-0.5 text-xs text-faint">1순위 후보</span>}
            </p>
            {picked.rank > 1 && (
              <p className="mt-2 rounded-md bg-warn-bg px-3 py-2 text-[12.5px] text-warn">
                적합도 순위 <b>{picked.rank}위</b> 강사를 배정했습니다. 순위는 담당자의 보조 자료이며,
                배정은 과정 운영 사정을 함께 고려해 <b>사람이 결정</b>합니다. 상위 후보는 아래 4항에 적었습니다.
                {pickReason && <><br /><b>배정 사유</b> — {pickReason}</>}
              </p>
            )}
            {picked.rank === 1 && pickReason && (
              <p className="mt-2 text-[12.5px]"><b>배정 사유</b> — {pickReason}</p>
            )}
            <table className="mt-3 w-full border-collapse text-[12.5px]">
              <thead><tr className="border-b bg-surface"><th className="w-28 px-3 py-1.5 text-left">기준</th><th className="w-16 px-3 py-1.5 text-left">점수</th><th className="w-16 px-3 py-1.5 text-left">비중</th><th className="px-3 py-1.5 text-left">판단 근거</th></tr></thead>
              <tbody>
                {((picked.axes ?? []) as Axis[]).filter((a) => a.weight > 0).map((a) => (
                  <tr key={a.axis} className="border-b align-top">
                    <td className="px-3 py-1.5">{a.label ?? a.axis}</td>
                    <td className="px-3 py-1.5 tabular-nums">{a.axis === 'C' && !picked.culture_measured ? '—' : pct(a.score)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-faint">{a.weight}</td>
                    <td className="px-3 py-1.5">{(a.reasons ?? []).join(' / ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {others.length > 0 && (
        <section className="mt-5">
          <h2 className="font-semibold">4. 함께 검토한 후보</h2>
          <p className="mt-1 text-xs text-faint">적합도 순입니다. 배정되지 않은 이유를 함께 적습니다.</p>
          <table className="mt-2 w-full border-collapse text-[12.5px]">
            <thead><tr className="border-b bg-surface"><th className="w-32 px-3 py-1.5 text-left">강사</th><th className="w-20 px-3 py-1.5 text-left">적합도</th><th className="px-3 py-1.5 text-left">배정하지 않은 이유</th></tr></thead>
            <tbody>
              {others.map((r) => {
                const ax = ((r.axes ?? []) as Axis[]).filter((a) => a.weight > 0)
                const low = [...ax].sort((a, b) => a.score - b.score)[0]
                return (
                  <tr key={r.id} className="border-b align-top">
                    <td className="px-3 py-1.5">{who(r)?.name}</td>
                    <td className="px-3 py-1.5 tabular-nums">{r.percent}%</td>
                    {/* 🔴[자가적발 2026-10-11] 1위가 아닌 강사를 배정하면 차이가 «음수»가 되어
                        「-7%p 낮습니다」가 찍혔다. 담당자가 1위 아닌 사람을 고르는 것은 정상이고,
                        근거서는 바로 그 경우에 «왜 그랬는지»를 말해야 한다. */}
                    <td className="px-3 py-1.5">
                      {!picked ? '' : r.percent > picked.percent
                        ? `적합도는 배정 강사보다 ${r.percent - picked.percent}%p 높으나, 담당자 판단으로 배정하지 않았습니다`
                        : r.percent === picked.percent
                        ? '적합도가 배정 강사와 같습니다 — 담당자 판단으로 배정하지 않았습니다'
                        : `적합도가 배정 강사보다 ${picked.percent - r.percent}%p 낮습니다`}
                      {low && ` — ${low.label ?? low.axis} ${pct(low.score)}점이 가장 낮았습니다`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-5">
        <h2 className="font-semibold">5. 재지 못한 것</h2>
        {/* ⛔못 잰 것을 0점으로 바꾸지 않는다 — 문서가 그 사실을 말한다. */}
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px]">
          {picked && !picked.culture_measured && <li><b>교육 지향(C축)</b> — 발주 기업과 강사가 함께 적은 가치 항목이 3개 미만이라 측정하지 않았습니다. <b>0점이 아니라 «재지 않음»</b>입니다</li>}
          {picked && who(picked)?.years == null && <li><b>강의 경력</b> — 강사가 연수를 제출하지 않아 최소 경력 요건을 적용하지 않았습니다</li>}
          <li>수료 만족도와의 대조는 <b>발주 실적이 쌓인 뒤</b> 수행합니다. 현재 기준 비중은 운영 기본값입니다</li>
          <li>성별·연령·출신지·학교명·사진은 <b>산출에 사용하지 않았습니다</b> — 입력에서 뺐을 뿐 아니라 <b>다른 칸을 타고 들어오는지</b>를 반사실 검사로 정기 측정합니다(이름을 바꿔도 적합도가 같고, 경력은 요건을 넘으면 더 오르지 않으며, 동점은 이름이 아니라 등록 순으로 가릅니다)</li>
        </ul>
      </section>

      <footer className="mt-8 border-t pt-3 text-[12px] text-faint">
        <p>본 근거서는 발행 주체가 작성했습니다. 순위는 담당자의 보조 자료이며 <b>배정은 사람이 결정</b>했습니다.</p>
        {/* ★법인 facts 는 손으로 적지 않는다 — SSOT(brand/offering.json) 에서만 파생한다.
            종전에는 이 자리에 직접 박혀 있었고 **이미 드리프트했다**: 상호 표기가 달랐고
            상호 표기가 SSOT 와 달랐고, 주소는 2026-09-03 사업자등록증 정본으로 정정한
            동·건물명 부분이 빠져 있었다.
            대외로 나가는 배정 근거서에 등록증과 다른 주소가 찍히고 있었다. */}
        <CorpLine className="mt-1" mailOrder={false} />
      </footer>
    </div>
  )
}
