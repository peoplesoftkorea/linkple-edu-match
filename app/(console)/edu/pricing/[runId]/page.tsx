// 단가 분석 1건 — 회차 분해와 금액의 «근거», 그리고 강사 배정으로 가는 길.
//
// ★합계만 보이는 화면을 만들지 않는다 — 줄마다 어디서 나온 금액인지 적는다.
//   담당자가 품의서에 그대로 붙일 수 있어야 이 화면이 일을 한 것이다.
// ★분해의 태그는 그대로 «강사 배정»의 수요가 된다 — 같은 통제 어휘를 쓰기 때문이다.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fmt, won } from '@/lib/admin-ui'
import { VENUE_LABEL } from '@/lib/pricing/edu'
import type { VenueType } from '@/lib/pricing/edu'

export const dynamic = 'force-dynamic'

type Line = { label: string; amount: number; basis: string }
type Session = { no: number; topic: string; hours: number; outcome: string; expertise: string[]; methods: string[]; audience: string[] }

export default async function PricingRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const { data: run } = await supabaseAdmin
    .from('edu_pricing_runs')
    .select('id, order_id, request, headcount, venue_type, region, provider, model, decomposition, pricing_input, quote, control, dropped_money_fields, is_test, created_at')
    .eq('id', runId)
    .maybeSingle()
  if (!run) notFound()

  const d = (run.decomposition ?? {}) as { title?: string; summary?: string; sessions?: Session[]; notes?: string[]; stray?: string[] }
  const q = (run.quote ?? {}) as {
    hours?: number; sessions?: number; hourlyRate?: number; unitPrice?: number; billable?: number
    subtotal?: number; vat?: number; total?: number; perPerson?: number; directRatio?: number
    costLines?: Line[]; priceLines?: Line[]; priceBasis?: string; minBilled?: boolean
  }
  const pi = (run.pricing_input ?? {}) as { outsourcedSessions?: number; feePerSession?: number; targetDirectRatio?: number; hoursPerSession?: number }
  const control = (run.control ?? []) as { programSlug: string; approvedRate: number; derivedRate: number; gapPct: number }[]
  const sessions = d.sessions ?? []

  // 분해의 태그를 모아 강사 배정 화면의 수요로 넘긴다 — 두 화면이 같은 통제 어휘를 쓴다
  const uniq = (xs: string[]) => [...new Set(xs)]
  const topics = uniq(sessions.flatMap((s) => s.expertise ?? []))
  const methods = uniq(sessions.flatMap((s) => s.methods ?? []))
  const audience = uniq(sessions.flatMap((s) => s.audience ?? []))
  const matchHref = `/edu/matching?${new URLSearchParams([
    ...topics.map((t) => ['topics', t] as [string, string]),
    ...methods.map((t) => ['methods', t] as [string, string]),
    ...audience.map((t) => ['audience', t] as [string, string]),
    ...(run.region ? [['region', run.region] as [string, string]] : []),
  ]).toString()}`

  return (
    <div className="space-y-6">
      <div>
        <Link href="/edu/pricing" className="text-sm text-muted-foreground underline underline-offset-2">← 단가 분석</Link>
        <h1 className="text-xl font-semibold tracking-tight mt-1">
          {d.title || '맞춤 과정'}
          {run.is_test && <Badge tone="neutral" className="ml-2 align-middle">테스트</Badge>}
          {run.dropped_money_fields > 0 && <Badge tone="warning" className="ml-2 align-middle">모델 금액 {run.dropped_money_fields}칸 버림</Badge>}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {fmt(run.created_at)} · {run.headcount}명 · {VENUE_LABEL[run.venue_type as VenueType]}
          {run.region && ` · ${run.region}`} · 분해 {run.provider ?? '—'}/{run.model ?? '—'}
        </p>
        {d.summary && <p className="text-sm mt-2">{d.summary}</p>}
      </div>

      <Card>
        <CardHeader><CardTitle>발주사 요구 — 적어 보낸 그대로</CardTitle></CardHeader>
        <CardContent><p className="text-sm whitespace-pre-wrap">{run.request}</p></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>회차 분해 — AI가 나눈 구성</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12">회차</TableHead>
                <TableHead>주제와 결과</TableHead>
                <TableHead className="text-center w-20">시간</TableHead>
                <TableHead>태그</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.no}>
                  <TableCell className="tabular-nums">{s.no}</TableCell>
                  <TableCell>
                    <span className="font-medium">{s.topic}</span>
                    {s.outcome && <span className="block text-muted-foreground">{s.outcome}</span>}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{s.hours}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[...(s.expertise ?? []), ...(s.methods ?? []), ...(s.audience ?? [])].join(' · ') || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm mt-3">
            총 <strong>{sessions.length}회차 · {q.hours}시간</strong> · 초빙 <strong>{pi.outsourcedSessions ?? sessions.length}회차</strong>로 산정했습니다.
          </p>
          {(d.stray ?? []).length > 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              사전에 없어 태그로 못 붙인 말 — {(d.stray ?? []).join(', ')}.
              매칭에 쓰려면 통제 어휘에 추가해야 합니다.
            </p>
          )}
          {(d.notes ?? []).length > 0 && (
            <ul className="text-sm text-muted-foreground mt-2 list-disc pl-5">
              {(d.notes ?? []).map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>원가 — 이 견적이 덮는 것</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {(q.costLines ?? []).map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <span className="font-medium">{l.label}</span>
                      <span className="block text-xs text-muted-foreground">{l.basis}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{won(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-2">
              공급가 대비 강사 직접비 <strong>{((q.directRatio ?? 0) * 100).toFixed(1)}%</strong>
              {' '}(목표 {Math.round((pi.targetDirectRatio ?? 0) * 100)}%) · 회당 강사료 {won(pi.feePerSession)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">⛔이 표는 내부 숫자입니다. 발주사에 나가는 것은 오른쪽 청구 분해입니다.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>청구 — 담당자에게 나가는 분해</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {(q.priceLines ?? []).map((l, i) => (
                  <TableRow key={i} className={l.label === '합계' ? 'font-semibold' : ''}>
                    <TableCell>
                      <span>{l.label}</span>
                      <span className="block text-xs text-muted-foreground font-normal">{l.basis}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{won(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-sm mt-2">1인 실부담 <strong>{won(q.perPerson)}</strong> (부가세 포함)</p>
            {q.minBilled && <p className="text-sm text-warn mt-1">최소 청구 인원이 적용된 견적입니다.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>품의서에 붙일 한 줄</CardTitle></CardHeader>
        <CardContent><p className="text-sm">{q.priceBasis}</p></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>이 산식의 오차 — 운영 3과정 대조</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>과정</TableHead>
                <TableHead className="text-right">확정 단가</TableHead>
                <TableHead className="text-right">이 식의 값</TableHead>
                <TableHead className="text-right">차이</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {control.map((r) => (
                <TableRow key={r.programSlug}>
                  <TableCell>{r.programSlug}</TableCell>
                  <TableCell className="text-right tabular-nums">{won(r.approvedRate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{won(r.derivedRate)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${Math.abs(r.gapPct) > 0.2 ? 'text-destructive' : ''}`}>
                    {r.gapPct >= 0 ? '+' : ''}{(r.gapPct * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-2">
            이 값은 산출 당시 그대로 저장된 것입니다 — 나중에 단가 정책이 바뀌어도 이 분석의 근거는 흔들리지 않습니다.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>다음 단계</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {topics.length > 0 ? (
            <p className="text-sm">
              <Link href={matchHref} className="underline underline-offset-2 font-medium">이 분해로 강사 배정 열기</Link>
              {' '}— 회차 태그({topics.join(' · ')})가 수요로 채워진 채 열립니다.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              분해에 통제 어휘 태그가 붙지 않아 강사 배정으로 넘길 수요가 없습니다 — 사전을 늘리거나 요구를 더 구체적으로 적으십시오.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {run.order_id ? '발주에 연결된 분석입니다.' : '발주에 연결하지 않아 테스트 산출로 남았습니다 — 실제 발주가 생기면 다시 돌려 연결하십시오.'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
