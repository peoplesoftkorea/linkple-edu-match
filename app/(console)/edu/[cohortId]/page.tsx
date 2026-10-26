// 기수 상세 — 회차 등록 · 출결 입력 · 수료 판정과 발급.
// ★한 화면에서 「회차를 만들고 → 그 회차의 출결을 찍고 → 수료를 판정한다」가 끝나야 한다.
//   화면을 나누면 운영자가 세 번 이동하고, 그 사이에 기록이 빠진다.
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { addSession, saveAttendance, issueCredential, openCall, closeCall } from './actions'
import { updateCohort } from '../actions'
import { CohortFields } from '../CohortFields'
import { AttendanceBoard } from './AttendanceBoard'

export const dynamic = 'force-dynamic'

const ATT = [
  { v: 'present', label: '출석' },
  { v: 'late', label: '지각' },
  { v: 'absent', label: '결석' },
  { v: 'excused', label: '공결' },
  { v: 'none', label: '미입력' },
] as const

export default async function EduCohortPage({
  params, searchParams,
}: {
  params: Promise<{ cohortId: string }>
  searchParams: Promise<{ s?: string; msg?: string }>
}) {
  const { cohortId } = await params
  const { s: selectedSessionId, msg } = await searchParams

  const { data: cohort } = await supabaseAdmin
    .from('edu_cohorts')
    .select('id, program_slug, cohort_no, title, subtitle, status, attend_pct_required, starts_on, ends_on, recruit_from, recruit_to, capacity, price, price_note, venue, venue_confirmed, venue_note, payment_method, is_test')
    .eq('id', cohortId)
    .single()

  if (!cohort) {
    return <p className="text-sm text-muted-foreground">기수를 찾을 수 없습니다. <Link href="/edu" className="underline">목록으로</Link></p>
  }

  const [{ data: sessions }, { data: enrollments }, { data: creds }] = await Promise.all([
    supabaseAdmin.from('edu_sessions')
      // ★공모 칸을 함께 읽는다 — 「열려 있는가」를 화면이 조건으로 다시 쓰지 않고 DB 함수에 묻는다.
      .select('id, session_no, title, held_on, instructor, counts_for_attendance, open_call_at, open_call_closed_at, open_call_fee, open_call_note')
      .eq('cohort_id', cohortId).order('session_no'),
    supabaseAdmin.from('edu_enrollments').select('id, applicant_name, applicant_email, status, payment_status')
      .eq('cohort_id', cohortId).order('applicant_name'),
    supabaseAdmin.from('edu_credentials').select('enrollment_id, public_id, revoked_at').eq('cohort_id', cohortId),
  ])

  const ses = sessions ?? []
  const enr = enrollments ?? []
  const credBy = new Map((creds ?? []).map((c) => [c.enrollment_id, c]))
  const current = selectedSessionId ? ses.find((x) => x.id === selectedSessionId) : ses[0]

  // 선택 회차의 기존 출결
  const { data: att } = current
    ? await supabaseAdmin.from('edu_attendance').select('enrollment_id, status').eq('session_id', current.id)
    : { data: [] }
  const attBy = new Map((att ?? []).map((a) => [a.enrollment_id, a.status]))

  // ── 공모와 위촉 (e25) ──────────────────────────────────────────────────
  // ★「공모 중인가」를 화면이 판정하지 않는다 — 조건이 셋이고(열렸다·닫히지 않았다·확정자 없다)
  //   그중 하나만 빠뜨리면 닫힌 회차가 열려 보인다. 정본은 `fn_edu_session_open_call` 한 곳이다.
  const { data: openNow } = current
    ? await supabaseAdmin.rpc('fn_edu_session_open_call', { p_session_id: current.id })
    : { data: false }

  // 이 회차에 들어온 제안·지원. ⛔철회·거절도 보여 준다 — 이력이 없으면 판단 근거가 없다.
  const { data: engRows } = current
    ? await supabaseAdmin.from('edu_instructor_engagements')
        .select('id, origin, status, fee, fee_basis, message, decided_at, created_at, withdrawn_reason, edu_instructors(id, name, title)')
        .eq('session_id', current.id).order('created_at', { ascending: false })
    : { data: [] }
  const engs = (engRows ?? []) as Array<{
    id: string; origin: string; status: string; fee: number | null; fee_basis: string | null
    message: string | null; decided_at: string | null; created_at: string; withdrawn_reason: string | null
    // ★PostgREST 조인은 «배열»로 온다 — 단건처럼 쓰면 이름 칸이 조용히 빈다.
    edu_instructors: { id: string; name: string; title: string | null }[] | null
  }>

  // 운영자가 읽는 한 줄 — 「누구의 몫이 남았는가」로 적는다.
  const ENG_LABEL: Record<string, string> = {
    proposed: '강사 응답 대기', applied: '우리 검토 대기', accepted: '강사 수락 — 확정 가능',
    confirmed: '위촉 확정', declined: '강사 거절', withdrawn: '자동 철회',
  }
  const wonKR = (n: number | null) =>
    typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('ko-KR') + '원' : '미정'

  // 수료 판정 — ★앱이 다시 계산하지 않고 DB 함수를 부른다(판정 정본 한 곳).
  const checks = new Map<string, Record<string, unknown>>()
  for (const e of enr) {
    const { data } = await supabaseAdmin.rpc('fn_edu_completion_check', { p_enrollment_id: e.id })
    if (data) checks.set(e.id, data as Record<string, unknown>)
  }

  const title = cohort.title || `${cohort.program_slug} ${cohort.cohort_no}기`

  return (
    <div className="space-y-6">
      {msg && (
        <div className="rounded-md border bg-muted px-3 py-2 text-sm">{msg}</div>
      )}
      <div>
        <Link href="/edu" className="text-xs text-muted-foreground hover:underline">← 교육 기수</Link>
        <h1 className="text-xl font-semibold tracking-tight mt-1">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          등록 {enr.length}명 · 회차 {ses.length}개 · 수료 요건 출석 {cohort.attend_pct_required}% 이상
          {' · '}
          {cohort.status === 'recruiting' ? '대외 공개(모집중)' : cohort.status === 'draft' ? '대외 비공개(준비)' : `상태 ${cohort.status}`}
          {cohort.is_test && ' · 테스트 공고'}
          {/* ⛔미확정을 0원으로 적지 않는다. */}
          {cohort.price === null ? ' · 수강료 미확정' : ` · ${Number(cohort.price).toLocaleString()}원`}
        </p>
      </div>

      {/* 기수 설정 — ★2026-09-26 신설. 개설 후 상태·기간·정원·실행가·출석요건을 고치는 자리.
          종전에는 수정 경로가 없어 SQL 로만 고칠 수 있었다. */}
      <Card>
        <CardHeader><CardTitle>기수 설정</CardTitle></CardHeader>
        <CardContent>
          <CohortFields
              action={updateCohort.bind(null, cohortId)}
              mode="edit"
              defaults={{
                title: cohort.title,
                subtitle: cohort.subtitle,
                status: cohort.status,
                recruit_from: cohort.recruit_from,
                recruit_to: cohort.recruit_to,
                starts_on: cohort.starts_on,
                ends_on: cohort.ends_on,
                capacity: cohort.capacity,
                price: cohort.price,
                price_note: cohort.price_note,
                venue: cohort.venue,
                venue_confirmed: cohort.venue_confirmed,
                venue_note: cohort.venue_note,
                attend_pct_required: cohort.attend_pct_required,
                payment_method: cohort.payment_method,
                is_test: cohort.is_test,
              }}
              submitLabel="기수 설정 저장"
            />
          
        </CardContent>
      </Card>

      {/* 회차 추가 */}
      <Card>
        <CardHeader><CardTitle>회차</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form action={addSession.bind(null, cohortId)} className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">
              회차<Input name="session_no" type="number" min={1} defaultValue={ses.length + 1} className="w-20 mt-1" required />
            </label>
            <label className="text-xs text-muted-foreground">
              주제<Input name="title" placeholder="예: AI 도구 실습" className="w-56 mt-1" />
            </label>
            <label className="text-xs text-muted-foreground">
              일자<Input name="held_on" type="date" className="w-40 mt-1" />
            </label>
            <label className="text-xs text-muted-foreground">
              강사<Input name="instructor" className="w-32 mt-1" />
            </label>
            <label className="text-xs text-muted-foreground flex items-center gap-1.5 pb-2">
              <input type="checkbox" name="counts" defaultChecked className="size-3.5" />
              출결 분모 포함
            </label>
            <Button type="submit" className="mb-0.5">회차 추가</Button>
          </form>

          {ses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              회차가 없습니다. <strong>회차가 0건이면 수료 판정은 「미달」이 아니라 「측정 불가」</strong>로 나옵니다.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ses.map((x) => (
                <Link key={x.id} href={`/edu/${cohortId}?s=${x.id}`}
                  className={`rounded-md border px-2.5 py-1 text-xs ${current?.id === x.id ? 'border-foreground font-semibold' : 'text-muted-foreground'}`}>
                  {x.session_no}회 {x.held_on ? `· ${x.held_on}` : ''}
                  {x.counts_for_attendance ? '' : ' · 분모 제외'}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 강사 공모 — e25. ★강사 창구(edu /instructor)가 보여 주는 것은 «여기서 연 회차»뿐이다.
          ⛔「열었다」를 선언으로 두지 않는다 — 열림 판정은 DB 함수가 하고, 화면은 그 답을 적는다. */}
      {current && (
        <Card>
          <CardHeader>
            <CardTitle>
              {current.session_no}회차 강사 공모
              {openNow === true
                ? <Badge className="ml-2">모집 중</Badge>
                : <Badge tone="neutral" className="ml-2">모집 안 함</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              열면 강사 창구에 이 회차가 나타나고, 강사가 직접 지원합니다.
              {current.open_call_at && openNow !== true && (
                <strong className="block mt-1">
                  {current.open_call_closed_at
                    ? '공모를 닫았습니다 — 이미 들어온 지원은 아래에 남아 있습니다.'
                    : '이 회차는 강사가 확정되어 더 받지 않습니다.'}
                </strong>
              )}
            </p>

            <form action={openCall.bind(null, cohortId, current.id)} className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                예상 강사료(원)
                <Input name="fee" inputMode="numeric" className="w-36 mt-1"
                       defaultValue={current.open_call_fee ?? ''} placeholder="비우면 협의" />
              </label>
              <label className="text-sm flex-1 min-w-56">
                강사에게 보일 한 줄
                <Input name="note" className="mt-1" defaultValue={current.open_call_note ?? ''}
                       placeholder="예: 마케팅 실무자 대상 · 사례 중심" />
              </label>
              <Button type="submit" className="mb-0.5">
                {current.open_call_at && !current.open_call_closed_at ? '공모 내용 수정' : '공모 열기'}
              </Button>
            </form>

            {current.open_call_at && !current.open_call_closed_at && (
              <form action={closeCall.bind(null, cohortId, current.id)}>
                <Button type="submit" variant="secondary" size="sm">공모 닫기</Button>
              </form>
            )}

            {/* 들어온 제안·지원 */}
            {engs.length === 0 ? (
              // 🔴fail-to-zero 금지 — 「지원 0건」을 결과로 적지 않는다. 열지 않았으면 그 사실을 적는다.
              <p className="text-sm text-muted-foreground">
                {current.open_call_at
                  ? '아직 지원이 들어오지 않았습니다. 강사가 창구에서 지원하면 여기에 쌓입니다.'
                  : '공모를 열지 않았습니다 — 지원을 받을 창구가 아직 없습니다.'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>강사</TableHead>
                    <TableHead>경로</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>강사료</TableHead>
                    <TableHead>전한 말</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {engs.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">
                        {e.edu_instructors?.[0]?.name ?? '—'}
                        {e.edu_instructors?.[0]?.title && (
                          <span className="block text-xs text-muted-foreground">{e.edu_instructors[0].title}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {e.origin === 'applied' ? '강사 지원' : '당사 제안'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {ENG_LABEL[e.status] ?? e.status}
                        {e.withdrawn_reason && (
                          <span className="block text-xs text-muted-foreground">{e.withdrawn_reason}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {wonKR(e.fee)}
                        {e.fee_basis && <span className="block text-xs text-muted-foreground">{e.fee_basis}</span>}
                      </TableCell>
                      <TableCell className="text-sm">{e.message ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* 출결 입력 */}
      {current && (
        <Card>
          <CardHeader>
            <CardTitle>{current.session_no}회차 출결 {current.title ? `· ${current.title}` : ''}</CardTitle>
          </CardHeader>
          <CardContent>
            {enr.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">등록자가 없습니다.</p>
            ) : (
              <AttendanceBoard
                action={saveAttendance.bind(null, cohortId, current.id)}
                rows={enr.map((e) => ({ id: e.id, name: e.applicant_name, email: e.applicant_email, status: attBy.get(e.id) ?? 'none' }))}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* 수료 판정·발급 */}
      <Card>
        <CardHeader><CardTitle>수료 판정</CardTitle></CardHeader>
        <CardContent>
          {enr.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">등록자가 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>수강생</TableHead>
                  <TableHead>출석</TableHead>
                  <TableHead>판정</TableHead>
                  <TableHead>수료증</TableHead>
                  <TableHead className="text-right">발급</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enr.map((e) => {
                  const c = checks.get(e.id) ?? {}
                  const measurable = c.measurable === true
                  const eligible = c.eligible === true
                  const cred = credBy.get(e.id)
                  const reasons = Array.isArray(c.reasons) ? (c.reasons as string[]) : []
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="font-medium">{e.applicant_name}</div>
                        <div className="text-xs text-muted-foreground">{e.applicant_email}</div>
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {measurable ? `${c.sessions_attended}/${c.sessions_denom} · ${c.attendance_pct}%` : '—'}
                      </TableCell>
                      <TableCell>
                        {!measurable ? (
                          <Badge tone="neutral">측정 불가</Badge>
                        ) : eligible ? (
                          <Badge tone="success">요건 충족</Badge>
                        ) : (
                          <Badge tone="warning">미충족</Badge>
                        )}
                        {reasons.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">{reasons.join(' · ')}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {cred ? (
                          <a href={`https://linkple-edu-match.vercel.app/credentials/${cred.public_id}`}
                             target="_blank" rel="noreferrer" className="underline">
                            {cred.revoked_at ? '철회됨' : '발급됨'}
                          </a>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {!cred && (
                          <form action={issueCredential.bind(null, cohortId, e.id)}>
                            <Button type="submit" variant="secondary" size="sm" disabled={!eligible}>발급</Button>
                          </form>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
