// 교육 edu — 기수 목록과 수료 현황.
// ★출결 입력이 «운영자 화면»에 있는 이유 = 출결은 LMS 기능이 아니라 등록 행정이다.
//   수강생은 자기 출결을 edu 앱에서 «보고», 입력은 여기서 «한다». 보는 곳과 쓰는 곳을 가른다.
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createCohort } from './actions'
import { loadPrograms } from './catalog'
import { CohortFields } from './CohortFields'

export const dynamic = 'force-dynamic'

const STATUS: Record<string, { label: string; tone: 'default' | 'neutral' | 'warning' | 'danger' | 'success' }> = {
  draft: { label: '준비', tone: 'neutral' },
  recruiting: { label: '모집 중', tone: 'success' },
  closed: { label: '모집 마감', tone: 'warning' },
  running: { label: '운영 중', tone: 'default' },
  completed: { label: '종료', tone: 'neutral' },
  cancelled: { label: '취소', tone: 'danger' },
}

export default async function EduCohortsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>
}) {
  const { msg } = await searchParams
  const programs = await loadPrograms()
  const { data: cohorts } = await supabaseAdmin
    .from('edu_cohorts')
    .select('id, program_slug, cohort_no, title, status, starts_on, ends_on, capacity, attend_pct_required, price, is_test')
    .order('created_at', { ascending: false })
    .limit(100)

  const rows = cohorts ?? []
  const ids = rows.map((c) => c.id)

  // 등록·회차·수료 집계 — 목록 한 줄이 「지금 어디까지 왔는가」를 답해야 한다.
  const [{ data: enr }, { data: ses }, { data: cred }] = await Promise.all([
    ids.length ? supabaseAdmin.from('edu_enrollments').select('cohort_id, status').in('cohort_id', ids) : { data: [] },
    ids.length ? supabaseAdmin.from('edu_sessions').select('cohort_id').in('cohort_id', ids) : { data: [] },
    ids.length ? supabaseAdmin.from('edu_credentials').select('cohort_id, revoked_at').in('cohort_id', ids) : { data: [] },
  ] as const)

  const count = (arr: { cohort_id: string }[] | null, id: string) => (arr ?? []).filter((r) => r.cohort_id === id).length

  // 과정별 «다음» 기수 번호 — 중복 번호는 개설에서 가장 흔한 실수다. 기본값으로 막는다.
  const nextNoBySlug: Record<string, number> = {}
  for (const p of programs ?? []) nextNoBySlug[p.slug] = 1
  for (const c of rows) {
    const n = Number(c.cohort_no) + 1
    if (!nextNoBySlug[c.program_slug] || nextNoBySlug[c.program_slug] < n) nextNoBySlug[c.program_slug] = n
  }

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-md border bg-muted px-3 py-2 text-sm">{msg}</div>}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">교육 기수</h1>
        <p className="text-sm text-muted-foreground mt-1">
          과정을 여기서 <strong>개설</strong>하고, 회차와 출결도 여기서 입력합니다. 수강생은 edu 앱에서 자기 출결만 조회합니다.
        </p>
      </div>

      {/* 기수 개설 — ★2026-09-26 신설. 종전에는 이 자리가 없어 개설이 SQL 뿐이었다
          (화면은 「기수는 edu 운영 경로에서 생성합니다」라고 적어 두었는데 그 경로가 없었다). */}
      <Card>
        <CardHeader>
          <CardTitle>기수 개설</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            과정 정의(커리큘럼·정가)는 코드가 갖고, 여기서 정하는 것은 <strong>이번에 실제로 여는 것</strong> —
            몇 기인지, 언제 모집하고 언제 여는지, 이번 회차 가격은 얼마인지입니다.
          </p>
        </CardHeader>
        <CardContent>
          <CohortFields
              action={createCohort}
              mode="create"
              programs={programs}
              nextNoBySlug={nextNoBySlug}
              submitLabel="기수 개설"
            />
          
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>기수 {rows.length}건</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              아직 개설된 기수가 없습니다. 위 「기수 개설」로 첫 기수를 여십시오.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>기수</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>일정</TableHead>
                  <TableHead className="text-right">등록</TableHead>
                  <TableHead className="text-right">회차</TableHead>
                  <TableHead className="text-right">수료증</TableHead>
                  <TableHead className="text-right">출석 요건</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const s = STATUS[c.status] ?? { label: c.status, tone: 'neutral' as const }
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/edu/${c.id}`} className="font-medium hover:underline">
                          {c.title || `${c.program_slug} ${c.cohort_no}기`}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {c.program_slug}
                          {c.is_test && <span className="ml-1.5 text-warn">· 테스트 공고</span>}
                          {/* ⛔null 을 0원으로 적지 않는다 — 미확정과 무료는 다른 사실이다. */}
                          {c.price === null ? ' · 수강료 미확정' : ` · ${Number(c.price).toLocaleString()}원`}
                        </div>
                      </TableCell>
                      <TableCell><Badge tone={s.tone}>{s.label}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {/* ★1회 과정은 시작=종료다. 「10-30 ~ 10-30」은 기간처럼 보여 읽는 사람을
                            헷갈리게 한다 — edu 화면이 이미 「일시」로 가른다. 같은 규칙을 쓴다. */}
                        {!c.starts_on
                          ? '미정'
                          : c.ends_on && c.ends_on !== c.starts_on
                            ? `${c.starts_on} ~ ${c.ends_on}`
                            : `일시 ${c.starts_on}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{count(enr, c.id)}</TableCell>
                      <TableCell className="text-right tabular-nums">{count(ses, c.id)}</TableCell>
                      <TableCell className="text-right tabular-nums">{count(cred, c.id)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.attend_pct_required}%</TableCell>
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
