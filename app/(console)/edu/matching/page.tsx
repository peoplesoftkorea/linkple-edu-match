// 강사 배정 — 수요를 적고 5축으로 재서 배정 근거를 만든다.
//
// ★왜 운영자 화면인가 = 발주사가 후보를 순위로 보고 고르는 경로를 만들지 않기 때문이다.
//   당사가 교육을 수주하고 당사가 강사를 위촉하는 3자 수주형이며, 이 화면은 그 배정의 «보조»다.
// ★화면 신설은 «가는 문»까지가 한 묶음이다 — 메뉴는 nav-data.ts 에 함께 넣었다.
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectNative } from '@/components/ui/select-native'
import { CheckChip } from '@/components/ui/check-chip'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fmt } from '@/lib/admin-ui'
import { EXPERTISE, METHODS, AUDIENCES, VALUE_AXES, REGIONS } from '@/lib/matching/vocab'
import { GOALS, INDUSTRIES } from '@/lib/matching/client'
import { runMatch, fillFromClient } from './actions'

export const dynamic = 'force-dynamic'

const ENGAGEMENT_TONE: Record<string, 'default' | 'neutral' | 'warning' | 'danger' | 'success'> = {
  proposed: 'default', applied: 'default', accepted: 'warning',
  confirmed: 'success', declined: 'danger', withdrawn: 'neutral',
}
const ENGAGEMENT_LABEL: Record<string, string> = {
  proposed: '제안함', applied: '지원옴', accepted: '강사 수락',
  confirmed: '확정', declined: '강사 거부', withdrawn: '철회',
}

export default async function EduMatchingPage({
  searchParams,
}: {
  // ★단가 분석(/edu/pricing)이 회차 태그를 이 주소로 넘긴다 — 두 화면이 같은 통제 어휘를 쓴다.
  searchParams: Promise<{ msg?: string; topics?: string | string[]; methods?: string | string[];
    audience?: string | string[]; region?: string; minYears?: string; why?: string | string[]; cname?: string;
    c_industry?: string; c_region?: string; c_level?: string; c_headcount?: string; c_size?: string;
    c_prior?: string; c_venue?: string; c_topics?: string | string[]; c_goals?: string | string[];
    [k: `value_${string}`]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const { msg } = sp
  const pre = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : [])
  const preset = {
    topics: pre(sp.topics), methods: pre(sp.methods), audience: pre(sp.audience), region: sp.region ?? '',
    minYears: sp.minYears ?? '',
    // ★채워 넣은 C축 값 — 종전엔 넘기지 못해 의뢰사로 채워도 교육 지향이 비었다.
    values: Object.fromEntries(VALUE_AXES.map((v) => [v, String(sp[`value_${v}`] ?? '')])) as Record<string, string>,
    why: pre(sp.why), cname: sp.cname ?? '',
    // ★적어 낸 의뢰사 값을 그대로 되살린다 — 「인원만 바꿔 다시」가 실무의 기본 동작이다.
    c: {
      industry: sp.c_industry ?? '', region: sp.c_region ?? '', level: sp.c_level ?? '',
      headcount: sp.c_headcount ?? '', size: sp.c_size ?? '', prior: sp.c_prior ?? 'basic',
      venue: sp.c_venue ?? 'onsite', topics: pre(sp.c_topics), goals: pre(sp.c_goals),
    },
  }
  const prefilled = preset.topics.length + preset.methods.length + preset.audience.length > 0

  const [{ data: instructors, error: poolErr }, { data: cohorts }, { data: sessions }, { data: orders }, { data: runs }, { data: engagements }] =
    await Promise.all([
      supabaseAdmin.from('edu_instructors')
        .select('id, name, expertise, methods, audience, years, value_profile, regions, contactable, source, is_test')
        .is('deleted_at', null),
      supabaseAdmin.from('edu_cohorts').select('id, title, cohort_no, status, is_test').order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('edu_sessions').select('id, cohort_id, session_no, title, topic, held_on').order('held_on', { ascending: true }).limit(200),
      supabaseAdmin.from('edu_org_orders').select('id, order_no, org_name, program_slug, status, is_test').order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('edu_match_runs').select('id, order_id, cohort_id, session_id, demand, candidates_n, is_test, created_at').order('created_at', { ascending: false }).limit(10),
      supabaseAdmin.from('edu_instructor_engagements')
        .select('id, status, scope, fee, created_at, instructor:edu_instructors(name)')
        .order('created_at', { ascending: false }).limit(10),
    ])

  const pool = instructors ?? []
  // ★어느 풀로 잴지 운영자가 고른다 — 샘플풀과 칸 검증용 테스트 시드는 성격이 다른 데이터다.
  const bySource = [...pool.reduce((m, r) => m.set(r.source ?? '(출처 없음)', (m.get(r.source ?? '(출처 없음)') ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
  const cohortTitle = new Map((cohorts ?? []).map((c) => [c.id, `${c.title} (${c.cohort_no}기)`]))

  // 축별 «입력 충족률» — 칸이 비면 점수는 나오지만 그 축은 재지 않은 것이다.
  // ⛔이 표를 빼면 화면은 「매칭이 된다」만 말하고 「5축이 작동한다」는 말하지 않는다.
  const filled = pool.length === 0 ? [] : [
    { axis: 'K', label: '전문 분야', n: pool.filter((r) => (r.expertise ?? []).length > 0).length, effect: '비면 주제 적합 0' },
    { axis: 'S', label: '강의 방식', n: pool.filter((r) => (r.methods ?? []).length > 0).length, effect: '비면 방식 적합 0' },
    { axis: 'A', label: '대상 층', n: pool.filter((r) => (r.audience ?? []).length > 0).length, effect: '비면 우대요건 0' },
    { axis: 'A', label: '강의 경력 연수', n: pool.filter((r) => r.years != null).length, effect: '비면 최소 경력을 적용하지 못한다' },
    { axis: 'C', label: '교육 지향 3축 이상', n: pool.filter((r) => Object.keys(r.value_profile ?? {}).length >= 3).length, effect: '비면 중립 — 재지 않은 것이다' },
    { axis: '—', label: '출강 권역', n: pool.filter((r) => (r.regions ?? []).length > 0).length, effect: '비면 권역 지정 발주에서 전부 탈락' },
  ]
  const reachable = pool.filter((r) => r.contactable).length
  const realPool = pool.filter((r) => !r.is_test).length

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-md border bg-muted px-3 py-2 text-sm">{msg}</div>}

      <div>
        <h1 className="text-xl font-semibold tracking-tight">강사 배정</h1>
        <p className="text-sm text-muted-foreground mt-1">
          과정의 수요를 적으면 강사풀을 <strong>K·S·A·C 네 축</strong>으로 재서 순위와 근거를 냅니다.
          배정은 당사가 하고, 이 화면은 그 <strong>근거</strong>를 남기는 자리입니다. 산출은 발주사에게 순위로 제시하지 않습니다.
        </p>
      </div>

      {/* 강사풀 현황 — 「후보 0명」과 「잴 대상이 0명」을 가르기 위해 항상 먼저 보인다 */}
      <Card>
        <CardHeader><CardTitle>강사풀 현황</CardTitle></CardHeader>
        <CardContent>
          {poolErr ? (
            <p className="text-sm text-destructive">강사풀을 읽지 못했습니다 — {poolErr.message}. 아래 수치를 0으로 읽지 마십시오.</p>
          ) : pool.length === 0 ? (
            <p className="text-sm text-muted-foreground">강사풀이 비어 있습니다 — 명부를 적재하면 매칭을 돌릴 수 있습니다.</p>
          ) : (
            <>
              <p className="text-sm">
                총 <strong>{pool.length}명</strong> · 연락 가능 <strong>{reachable}명</strong> ·
                실명부 <strong>{realPool}명</strong> · 샘플·테스트 <strong>{pool.length - realPool}명</strong>
              </p>
              {realPool === 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  현재 풀은 전부 샘플입니다. 실명부를 적재하면 <code>source</code> 로 갈라 교체합니다.
                </p>
              )}
              {/* ★축별 채움은 «항상 보일» 것이 아니라 «필요할 때 볼» 것이다 —
                  표준: 대시보드는 집계 홈이고 본문이 아니다. 요약 한 줄은 위에 남긴다. */}
              <details className="mt-3" open>
                <summary className="cursor-pointer text-sm text-muted-foreground">축별 입력 충족률</summary>
              <Table className="mt-2">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>축</TableHead>
                    <TableHead>입력 칸</TableHead>
                    <TableHead className="text-center">채워진 인원</TableHead>
                    <TableHead>비면 어떻게 되는가</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filled.map((f) => (
                    <TableRow key={`${f.axis}-${f.label}`}>
                      <TableCell className="font-medium">{f.axis}</TableCell>
                      <TableCell>{f.label}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        {f.n}/{pool.length}
                        {f.n === 0 && <span className="ml-2 text-destructive">재지 않음</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{f.effect}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      {/* 의뢰사 기반정보 — 다섯 축을 «규칙»이 민다. 운영자의 암산을 대신한다 */}
      <Card>
        <CardHeader><CardTitle>1 · 의뢰사로 채우기</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            적으면 아래 <strong>2</strong> 의 조건이 규칙으로 채워집니다. 채우기만 하고 실행은 따로 합니다.
          </p>
          <form action={fillFromClient} className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="c_name">의뢰사</Label>
                <Input id="c_name" name="c_name" placeholder="예: 가칭 한빛유통" defaultValue={preset.cname} />
              </div>
              <div>
                <Label htmlFor="c_industry">업종</Label>
                <SelectNative id="c_industry" name="c_industry" defaultValue={preset.c.industry ?? ''}>
                  <option value="">지정 안 함</option>
                  {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
                </SelectNative>
                <p className="mt-1.5 text-xs text-muted-foreground">동점을 가르는 데 씁니다.</p>
              </div>
              <div>
                <Label htmlFor="c_region">소재지</Label>
                <SelectNative id="c_region" name="c_region" required defaultValue={preset.c.region}>
                  {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </SelectNative>
                <p className="mt-1.5 text-xs text-muted-foreground">출강 권역이 됩니다.</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="c_headcount">임직원 수</Label>
                <Input id="c_headcount" name="c_headcount" type="number" min={1} placeholder="예: 1800" required defaultValue={preset.c.headcount} />
                <p className="mt-1.5 text-xs text-muted-foreground">최소 경력을 밉니다.</p>
              </div>
              <div>
                <Label htmlFor="c_level">교육생 직급</Label>
                <SelectNative id="c_level" name="c_level" required defaultValue={preset.c.level}>
                  {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
                </SelectNative>
              </div>
              <div>
                <Label htmlFor="c_size">교육생 인원</Label>
                <Input id="c_size" name="c_size" type="number" min={1} placeholder="예: 24" required defaultValue={preset.c.size} />
                <p className="mt-1.5 text-xs text-muted-foreground">강의 방식을 가릅니다.</p>
              </div>
              <div>
                <Label htmlFor="c_prior">사전지식</Label>
                <SelectNative id="c_prior" name="c_prior" defaultValue={preset.c.prior}>
                  {[["none","없음"],["basic","기초"],["advanced","상급"]].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </SelectNative>
              </div>
            </div>

            <CheckGroup name="c_topics" label="과정 주제" axis="K" values={EXPERTISE} checked={preset.c.topics}
              hint="발주한 과정의 «그 회차» 주제입니다. 업종으로 대신하지 않습니다." />
            <CheckGroup name="c_goals" label="교육 목표" axis="C" values={GOALS} checked={preset.c.goals}
              hint="발주 협의에서 들은 말을 고릅니다. 비우면 교육 지향(C축)이 측정 불가가 됩니다." />

            <div className="flex items-end gap-4">
              <div className="w-48">
                <Label htmlFor="c_venue">실시 형태</Label>
                <SelectNative id="c_venue" name="c_venue" defaultValue={preset.c.venue}>
                  {[["onsite","사내 출강"],["offsite","외부 장소"],["online","온라인"]].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </SelectNative>
              </div>
              <button type="submit" className="rounded-md border px-4 py-2 text-sm font-semibold">
                아래 수요 칸 채우기
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 수요 입력 — 통제 어휘로만 받는다. 자유 서술은 비교가 되지 않는다 */}
      <Card>
        <CardHeader><CardTitle>2 · 조건 확인하고 매칭 실행</CardTitle></CardHeader>
        <CardContent>
          {prefilled && (
            <div className="mb-4 rounded-md border bg-muted px-3 py-2 text-sm">
              {preset.why.length > 0 ? (
                <>
                  <p>
                    <strong>{preset.cname || '의뢰사'}</strong> 의 기반정보로 수요를 채웠습니다 — 규칙이 민 값이고,
                    <strong> 운영자가 고치는 것이 정상</strong>입니다.
                  </p>
                  {/* ⛔근거 없이 채우지 않는다 — 「왜 이 값인가」를 함께 보여야 운영자가 검토할 수 있다 */}
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {preset.why.map((w, i) => <li key={i}>· {w}</li>)}
                  </ul>
                </>
              ) : (
                <p>단가 분석의 회차 태그로 수요가 <strong>미리 채워졌습니다</strong>. 그대로 실행하거나 고쳐서 실행하십시오.</p>
              )}
            </div>
          )}
          <form action={runMatch} className="space-y-5">
            <div>
              <Label htmlFor="target">대상</Label>
              <SelectNative id="target" name="target" required>
                <option value="">— 고르십시오 —</option>
                {(cohorts ?? []).length > 0 && (
                  <optgroup label="기수">
                    {(cohorts ?? []).map((c) => (
                      <option key={c.id} value={`cohort:${c.id}`}>{c.title} · {c.cohort_no}기{c.is_test ? ' · 테스트' : ''}</option>
                    ))}
                  </optgroup>
                )}
                {(sessions ?? []).length > 0 && (
                  <optgroup label="회차">
                    {(sessions ?? []).map((s) => (
                      <option key={s.id} value={`session:${s.id}`}>
                        {cohortTitle.get(s.cohort_id) ?? '기수 미상'} · {s.session_no}회차 {s.topic || s.title || ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {(orders ?? []).length > 0 && (
                  <optgroup label="기업 발주">
                    {(orders ?? []).map((o) => (
                      <option key={o.id} value={`order:${o.id}`}>{o.order_no} · {o.org_name}{o.is_test ? ' · 테스트' : ''}</option>
                    ))}
                  </optgroup>
                )}
              </SelectNative>
              <p className="mt-1.5 text-xs text-muted-foreground">위촉 제안은 기수·회차에만 할 수 있습니다.</p>
            </div>

            <div>
              <Label htmlFor="source">잴 강사풀</Label>
              {/* 🔴[대표님 캡처 지적 2026-10-10] 종전엔 풀 전체를 재서 칸 검증용 「테스트강사1」이
                  실제 후보처럼 3위에 섰다. 실명부가 오면 같은 자리에서 그쪽으로 바꾼다. */}
              <SelectNative id="source" name="source" defaultValue={realPool === 0 ? '샘플풀-2026-10' : ''}>
                {realPool > 0 && <option value="__real__">실명부만 · {realPool}명</option>}
                {bySource.map(([src, n]) => (
                  <option key={src} value={src}>{src} · {n}명</option>
                ))}
                <option value="">전체 · {pool.length}명 (테스트 시드 포함)</option>
              </SelectNative>
              <p className="mt-1.5 text-xs text-muted-foreground">산출에 함께 남습니다.</p>
            </div>

            <CheckGroup name="topics" label="요구 주제" axis="K" values={EXPERTISE} checked={preset.topics}
              hint="커리큘럼의 회차 주제에서 뽑습니다. 하나 이상 골라야 실행됩니다." />
            <CheckGroup name="methods" label="요구 강의 방식" axis="S" values={METHODS} checked={preset.methods} />
            <CheckGroup name="audience" label="대상 층" axis="A" values={AUDIENCES} checked={preset.audience} />

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="minYears">최소 강의 경력</Label>
                <Input id="minYears" name="minYears" type="number" min={0} max={60} placeholder="예: 10"
                  defaultValue={preset.minYears} />
                <p className="mt-1.5 text-xs text-muted-foreground">비우면 걸지 않습니다. 경력 미제출자에게도 적용하지 않습니다.</p>
              </div>
              <div>
                <Label htmlFor="region">출강 권역</Label>
                <SelectNative id="region" name="region" defaultValue={preset.region}>
                  <option value="">지정 안 함</option>
                  {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </SelectNative>
                <p className="mt-1.5 text-xs text-muted-foreground">지정하면 <strong>필수 요건</strong>입니다 — 불가한 강사는 점수와 무관하게 부적격이 됩니다.</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium">교육 지향 <span className="text-muted-foreground font-normal">C축 · 0~1</span></p>
              <p className="text-xs text-muted-foreground mb-2">
                <strong>3개 미만이면 측정하지 않습니다</strong> — 0점이 아니라 「측정 불가」입니다.{' '}
                <span className="text-faint">여섯 축을 다 적을수록 변별이 정확해집니다.</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {VALUE_AXES.map((v) => (
                  <div key={v}>
                    <Label className="text-xs text-muted-foreground" htmlFor={`value_${v}`}>{v}</Label>
                    <Input id={`value_${v}`} name={`value_${v}`} type="number" min={0} max={1} step={0.1} placeholder="—"
                      defaultValue={preset.values[v] ?? ''}
                      />
                  </div>
                ))}
              </div>
            </div>

            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              매칭 실행
            </button>
          </form>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>최근 매칭 산출</CardTitle></CardHeader>
          <CardContent>
            {(runs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">아직 산출이 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>일시</TableHead>
                    <TableHead>대상</TableHead>
                    <TableHead>요구 주제</TableHead>
                    <TableHead className="text-center">재어 본 인원</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(runs ?? []).map((r) => {
                    const d = (r.demand ?? {}) as { topics?: string[] }
                    const target = r.cohort_id ? cohortTitle.get(r.cohort_id) ?? '기수' : r.session_id ? '회차' : '기업 발주'
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">
                          <Link href={`/edu/matching/${r.id}`} className="underline underline-offset-2">{fmt(r.created_at)}</Link>
                        </TableCell>
                        <TableCell>{target}{r.is_test && <Badge tone="neutral" className="ml-2">테스트</Badge>}</TableCell>
                        <TableCell className="text-muted-foreground">{(d.topics ?? []).join(' · ') || '—'}</TableCell>
                        <TableCell className="text-center tabular-nums">{r.candidates_n}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>최근 위촉</CardTitle></CardHeader>
          <CardContent>
            {(engagements ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">위촉 건이 없습니다.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>일시</TableHead>
                    <TableHead>강사</TableHead>
                    <TableHead className="text-center">단위</TableHead>
                    <TableHead className="text-center">상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(engagements ?? []).map((e) => {
                    const who = Array.isArray(e.instructor) ? e.instructor[0] : e.instructor
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap">{fmt(e.created_at)}</TableCell>
                        <TableCell>{who?.name ?? '—'}</TableCell>
                        <TableCell className="text-center">{e.scope === 'cohort' ? '기수' : '회차'}</TableCell>
                        <TableCell className="text-center">
                          <Badge tone={ENGAGEMENT_TONE[e.status] ?? 'neutral'}>{ENGAGEMENT_LABEL[e.status] ?? e.status}</Badge>
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
    </div>
  )
}

/** 통제 어휘 체크 묶음 — 자유 입력을 받지 않는다. 사전에 없는 말은 비교가 되지 않는다. */
function CheckGroup({
  name, label, axis, values, hint, checked = [],
}: { name: string; label: string; axis: string; values: readonly string[]; hint?: string; checked?: string[] }) {
  return (
    <div>
      <p className="text-sm font-medium">{label} <span className="text-muted-foreground font-normal">{axis}축</span></p>
      {hint && <p className="text-xs text-muted-foreground mb-1">{hint}</p>}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {values.map((v) => (
          <CheckChip key={v} name={name} value={v} defaultChecked={checked.includes(v)} />
        ))}
      </div>
    </div>
  )
}
