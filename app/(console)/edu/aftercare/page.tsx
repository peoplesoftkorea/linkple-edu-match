// 교육 — 수료 이후 (과정 피드백 · 90일 성과 확인)
//
// ★이 화면이 생긴 이유 = 「화면이 날짜를 보여 주기만 하고 아무 일도 없었다」.
//   수료자 쪽에 창구를 열어도, 운영자가 «오늘 누구에게 여쭤야 하는지» 모르면
//   그 창구는 아무도 안 여는 문이 된다. 명단이 있어야 사람이 행동한다.
//
// ⛔집계를 «0건»으로 흘려보내지 않는다 — 아직 아무도 수료하지 않은 것과
//   수료했는데 답이 없는 것은 다른 상태다. 화면에서 갈라 적는다.
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { publishFeedback, unpublishFeedback } from './actions'

export const dynamic = 'force-dynamic'

const VERDICT: Record<string, { label: string; tone: 'default' | 'neutral' | 'warning' | 'success' }> = {
  continued: { label: '계속', tone: 'success' },
  adjusted: { label: '방향 수정', tone: 'default' },
  stopped: { label: '접음', tone: 'warning' },
  undecided: { label: '판단 중', tone: 'neutral' },
}

export default async function EduAftercarePage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>
}) {
  const { msg } = await searchParams

  const [{ data: due }, { data: fb }, { data: out }, { data: inst }] = await Promise.all([
    // 90일이 «이미 지났거나 30일 안에 오는» 수료자 중 아직 안 낸 사람.
    supabaseAdmin.rpc('fn_edu_outcome_due_list', { p_within_days: 30 }),
    supabaseAdmin
      .from('edu_feedback')
      .select('id, rating, recommend, helped, lacked, consent_public, public_display, public_quote, submitted_at, published_at, edu_cohorts(program_slug, cohort_no)')
      .order('submitted_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('edu_outcomes')
      .select('id, due_on, baseline, current_state, verdict, note, submitted_at, edu_cohorts(program_slug, cohort_no)')
      .order('submitted_at', { ascending: false })
      .limit(200),
    // 강사 원장 — 「강사의 역량이 플랫폼 자산으로 남는다」(협업제안 8쪽)의 실물.
    supabaseAdmin.rpc('fn_edu_instructor_stats'),
  ] as const)

  const dueRows = (due ?? []) as any[]
  const fbRows = (fb ?? []) as any[]
  const outRows = (out ?? []) as any[]
  const instRows = (inst ?? []) as any[]
  // ★분모를 «유효 수료증 수»로 잡는다. 수료자가 0명이면 회수율은 0% 가 아니라 «잴 수 없다».
  const { count: issuedCount } = await supabaseAdmin
    .from('edu_credentials').select('id', { count: 'exact', head: true }).is('revoked_at', null)
  const denom = issuedCount ?? 0

  const avg = fbRows.length
    ? (fbRows.reduce((a, r) => a + Number(r.rating || 0), 0) / fbRows.length).toFixed(1)
    : null

  const label = (r: any) => {
    const c = r.edu_cohorts
    return c ? `${c.program_slug} ${c.cohort_no}기` : '—'
  }
  const overdue = dueRows.filter((r) => Number(r.days_left) <= 0)
  const upcoming = dueRows.filter((r) => Number(r.days_left) > 0)

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-md border bg-muted px-3 py-2 text-sm">{msg}</div>}
      <div>
        <Link href="/edu" className="text-xs text-muted-foreground hover:underline">← 교육 기수</Link>
        <h1 className="text-xl font-semibold tracking-tight mt-1">수료 이후</h1>
        <p className="text-sm text-muted-foreground mt-1">
          과정 피드백과 90일 성과 확인. <strong>수료자는 edu 앱 「내 수강 현황」에서 직접 남깁니다.</strong>{' '}
          여기서는 <strong>누구에게 여쭐 차례인지</strong> 보고, 공개해도 좋다고 한 문장을 <strong>확인한 뒤</strong> 과정 안내에 싣습니다.
        </p>
      </div>

      {/* ─ 한 줄 요약 ─ ⛔분모가 0이면 「0%」가 아니라 «잴 수 없다» */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">유효 수료증</p>
          <p className="text-2xl font-semibold mt-1">{denom}건</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">피드백 회수</p>
          <p className="text-2xl font-semibold mt-1">
            {denom === 0 ? <span className="text-base text-muted-foreground">잴 수 없음 (수료자 0)</span>
              : `${fbRows.length} / ${denom}`}
          </p>
          {avg && <p className="text-xs text-muted-foreground mt-1">평균 {avg} / 5</p>}
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-xs text-muted-foreground">90일 성과 회수</p>
          <p className="text-2xl font-semibold mt-1">
            {denom === 0 ? <span className="text-base text-muted-foreground">잴 수 없음 (수료자 0)</span>
              : `${outRows.length} / ${denom}`}
          </p>
        </CardContent></Card>
      </div>

      {/* ─ 오늘 여쭐 사람 ─ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            여쭐 차례 {overdue.length > 0 && <Badge tone="warning" className="ml-2">지났음 {overdue.length}</Badge>}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {/* ⛔JSX 줄바꿈은 공백을 먹는다 — 같은 병을 이 화면에서 두 번째 잡았다(#63 머리말·오늘 이 문단). */}
            수료 90일이 지났거나 30일 안에 오는데 아직 답을 주지 않은 분입니다.{' '}
            메일 발송은 아직 이 화면에 없습니다. 안내는 현재 SRM 스레드로 나갑니다.
          </p>
        </CardHeader>
        <CardContent>
          {dueRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {denom === 0 ? '아직 수료자가 없습니다. 수료증이 발급되면 90일 뒤 이 목록에 섭니다.'
                           : '여쭐 차례인 분이 없습니다.'}
            </p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>수료자</TableHead><TableHead>기수</TableHead>
                <TableHead>발급일</TableHead><TableHead>90일</TableHead><TableHead>남은 일수</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {[...overdue, ...upcoming].map((r) => (
                  <TableRow key={r.enrollment_id}>
                    <TableCell>
                      <span className="font-medium">{r.applicant_name}</span>
                      <span className="block text-xs text-muted-foreground">{r.applicant_email}</span>
                    </TableCell>
                    <TableCell className="text-sm">{r.program_slug} {r.cohort_no}기</TableCell>
                    <TableCell className="text-sm">{r.issued_on}</TableCell>
                    <TableCell className="text-sm">{r.due_on}</TableCell>
                    <TableCell>
                      {Number(r.days_left) <= 0
                        ? <Badge tone="warning">{-Number(r.days_left)}일 지남</Badge>
                        : <span className="text-sm text-muted-foreground">{r.days_left}일</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─ 강사별 축적 ─ ★협업제안 8쪽 「강사 단위 축적·노출」의 실물 [2026-09-27 신설].
          귀속 = «담당 기수»의 집계다 — 회차에 이름이 선 강사에게 그 기수의 평가·수료가 귀속된다.
          한 기수에 강사가 여럿이면 각자에게 같은 기수 집계가 보인다(함께 만든 기수다).
          ⛔개인 성과처럼 쪼개 보이지 않는다 — 화면이 귀속 규칙을 그대로 말한다. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">강사별 축적</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            회차에 이름이 오른 강사 기준으로 <strong>담당 기수의 기록</strong>이 강사 이름으로 쌓입니다.
            한 기수를 여러 분이 맡으면 각자에게 같은 기수 집계가 보입니다.
          </p>
        </CardHeader>
        <CardContent>
          {instRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">회차에 강사 이름이 오른 기수가 아직 없습니다. 회차를 등록하면 여기부터 쌓입니다.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>강사</TableHead><TableHead>기수</TableHead><TableHead>회차</TableHead>
                <TableHead>수강생</TableHead><TableHead>수료</TableHead>
                <TableHead>피드백</TableHead><TableHead>평균 평점</TableHead><TableHead>공개 문장</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {instRows.map((r) => (
                  <TableRow key={r.instructor}>
                    <TableCell className="font-medium">{r.instructor}</TableCell>
                    <TableCell className="text-sm">{r.cohorts_taught}</TableCell>
                    <TableCell className="text-sm">{r.sessions_taught}</TableCell>
                    <TableCell className="text-sm">{r.learners}</TableCell>
                    <TableCell className="text-sm">{r.credentials}</TableCell>
                    <TableCell className="text-sm">{r.feedback_count}</TableCell>
                    <TableCell>
                      {/* ⛔0건을 0점으로 적지 않는다 — 재지 않은 것과 낮은 것은 다르다 */}
                      {r.avg_rating === null
                        ? <span className="text-xs text-muted-foreground">아직 없음</span>
                        : <span className="text-sm font-medium">{r.avg_rating} / 5</span>}
                    </TableCell>
                    <TableCell className="text-sm">{r.public_quotes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ─ 과정 피드백 ─ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">과정 피드백</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            「부족했던 점」은 <strong>대외에 나가지 않습니다</strong>. 공개되는 것은 본인이 적은 한 문장뿐입니다.
          </p>
        </CardHeader>
        <CardContent>
          {fbRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 받은 피드백이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {fbRows.map((r) => (
                <div key={r.id} className="rounded-md border p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone="neutral">{label(r)}</Badge>
                    <span className="text-sm font-medium">도움 {r.rating}/5</span>
                    {r.recommend !== null && <span className="text-xs text-muted-foreground">추천 {r.recommend}/10</span>}
                    <span className="text-xs text-muted-foreground">{String(r.submitted_at).slice(0, 10)}</span>
                    {r.published_at
                      ? <Badge tone="success">공개 중</Badge>
                      : r.consent_public ? <Badge tone="warning">공개 동의 · 미게시</Badge>
                      : <Badge tone="neutral">비공개</Badge>}
                  </div>
                  {r.helped && <p className="text-sm mt-2"><span className="text-muted-foreground">도움된 것 · </span>{r.helped}</p>}
                  {r.lacked && <p className="text-sm mt-1"><span className="text-muted-foreground">부족했던 것(내부) · </span>{r.lacked}</p>}
                  {r.consent_public && r.public_quote && (
                    <div className="mt-3 rounded-md bg-muted px-3 py-2">
                      <p className="text-xs text-muted-foreground">공개 예정 문장</p>
                      <p className="text-sm mt-1">“{r.public_quote}”</p>
                      <p className="text-xs text-muted-foreground mt-1">— {r.public_display || '이름 없음'}</p>
                      <form action={r.published_at ? unpublishFeedback : publishFeedback} className="mt-2">
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-xs underline">
                          {r.published_at ? '공개 내리기' : '확인했습니다 — 공개하기'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─ 90일 성과 ─ */}
      <Card>
        <CardHeader><CardTitle className="text-base">90일 성과 확인</CardTitle></CardHeader>
        <CardContent>
          {outRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 받은 성과 확인이 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {outRows.map((r) => {
                const v = VERDICT[r.verdict] ?? VERDICT.undecided
                return (
                  <div key={r.id} className="rounded-md border p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone="neutral">{label(r)}</Badge>
                      <Badge tone={v.tone}>{v.label}</Badge>
                      <span className="text-xs text-muted-foreground">기한 {r.due_on} · 제출 {String(r.submitted_at).slice(0, 10)}</span>
                    </div>
                    {r.baseline && <p className="text-sm mt-2"><span className="text-muted-foreground">그때 기준값 · </span>{r.baseline}</p>}
                    {r.current_state && <p className="text-sm mt-1"><span className="text-muted-foreground">지금 · </span>{r.current_state}</p>}
                    {r.note && <p className="text-sm mt-1 text-muted-foreground">{r.note}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
