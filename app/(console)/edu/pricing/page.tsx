// 단가 분석 — 발주 요구를 회차로 분해하고 금액을 원가에서 쌓는다.
//
// ★모델이 하는 일은 «분해»이고 금액은 우리 산식이 정한다. 화면도 그렇게 말한다.
// ★화면 신설은 «가는 문»까지가 한 묶음이다 — 메뉴는 nav-data.ts 에 함께 넣었다.
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { fmt, won } from '@/lib/admin-ui'
import { VENUE_LABEL, TRAVEL_FEE } from '@/lib/pricing/edu'
import { INSTRUCTOR_FEE_PER_SESSION, TARGET_DIRECT_RATIO, catalogControl } from '@/lib/pricing/custom'
import { PricingForm } from './PricingForm'
import { runPricing } from './actions'

export const dynamic = 'force-dynamic'
// ★분해 호출은 모델 응답을 기다린다 — 기본 제한 시간 안에 못 끝나면 사람에게는 «그냥 실패»로 보인다
export const maxDuration = 120

export default async function EduPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>
}) {
  const { msg } = await searchParams
  const [{ data: orders }, { data: runs }] = await Promise.all([
    supabaseAdmin.from('edu_org_orders').select('id, order_no, org_name, headcount, status, is_test')
      .order('created_at', { ascending: false }).limit(30),
    supabaseAdmin.from('edu_pricing_runs').select('id, request, headcount, venue_type, quote, decomposition, dropped_money_fields, is_test, created_at')
      .order('created_at', { ascending: false }).limit(10),
  ])
  const control = catalogControl('onsite')

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-md border bg-muted px-3 py-2 text-sm">{msg}</div>}

      <div>
        <h1 className="text-xl font-semibold tracking-tight">단가 분석</h1>
        <p className="text-sm text-muted-foreground mt-1">
          카탈로그에 없는 발주를 <strong>회차로 분해</strong>하고 <strong>원가에서 금액을 쌓습니다</strong>.
          회차 구성은 AI가 분해하고, <strong>금액은 당사 산식이 정합니다</strong> — 모델이 적은 금액은 서버가 버립니다.
        </p>
      </div>

      {/* ★대조군을 «먼저» 보인다 — 식이 아는 사례에서 얼마나 빗나가는지 모르고 모르는 사례에 쓰지 않는다 */}
      <Card>
        <CardHeader><CardTitle>이 산식을 운영 3과정에 되돌리면</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            같은 식에 운영 중인 세 과정의 회차·시간·초빙 수를 넣어 본 값입니다. 확정 단가와의 차이가 이 산식의 오차 폭입니다.
            맞춤 견적의 숫자도 같은 폭으로 흔들립니다.
          </p>
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
                  <TableCell className="font-medium">{r.programSlug}<span className="ml-2 text-xs text-muted-foreground">{r.label}</span></TableCell>
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
            인당·시간당 단가 기준 · 사내 출강 · 최소 청구 인원 기준. 목표 직접비율 {Math.round(TARGET_DIRECT_RATIO * 100)}%는
            이 세 과정의 실제 구조에서 역산한 값입니다.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>요구 입력</CardTitle></CardHeader>
        <CardContent>
          <PricingForm
            action={runPricing}
            venueLabels={VENUE_LABEL}
            regions={TRAVEL_FEE}
            orders={(orders ?? []).map((o) => ({ id: o.id, order_no: o.order_no, org_name: o.org_name, headcount: o.headcount }))}
            feeDefault={INSTRUCTOR_FEE_PER_SESSION}
            ratioDefault={TARGET_DIRECT_RATIO}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>최근 분석</CardTitle></CardHeader>
        <CardContent>
          {(runs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 분석이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>일시</TableHead>
                  <TableHead>요구</TableHead>
                  <TableHead className="text-center">회차</TableHead>
                  <TableHead className="text-right">합계</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runs ?? []).map((r) => {
                  const q = (r.quote ?? {}) as { total?: number }
                  const d = (r.decomposition ?? {}) as { sessions?: unknown[]; title?: string }
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        <Link href={`/edu/pricing/${r.id}`} className="underline underline-offset-2">{fmt(r.created_at)}</Link>
                      </TableCell>
                      <TableCell>
                        {d.title || r.request.slice(0, 40)}
                        {r.is_test && <Badge tone="neutral" className="ml-2">테스트</Badge>}
                        {r.dropped_money_fields > 0 && <Badge tone="warning" className="ml-2">모델 금액 {r.dropped_money_fields}칸 버림</Badge>}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{(d.sessions ?? []).length}</TableCell>
                      <TableCell className="text-right tabular-nums">{won(q.total)}</TableCell>
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
