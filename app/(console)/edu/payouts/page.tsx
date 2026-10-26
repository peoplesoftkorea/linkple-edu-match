// 강사료 정산 — 체결된 계약에 대해 실시분을 정산하고 지급까지 적는다.
//
// ★한 화면에 둘을 둔다 — 「정산을 기다리는 계약」과 「이미 만든 정산」.
//   기다리는 것이 안 보이면 운영자는 지급을 잊고, 강사가 먼저 묻는다.
// ★세액은 계산 모듈이 내고 화면은 «근거»를 그대로 보인다. 숫자만 보이면 설명할 수 없다.
import { Input } from '@/components/ui/input'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { fmt, won } from '@/lib/admin-ui'
import { INCOME_KIND_LABEL } from '@/lib/labor/withholding'
import { PayoutForm } from './PayoutForm'
import { createPayout, decidePayout } from './actions'

export const dynamic = 'force-dynamic'

const STATUS: Record<string, { label: string; tone: 'default' | 'neutral' | 'warning' | 'danger' | 'success' }> = {
  draft: { label: '산출', tone: 'neutral' },
  approved: { label: '승인', tone: 'warning' },
  paid: { label: '지급', tone: 'success' },
  cancelled: { label: '취소', tone: 'danger' },
}

export default async function EduPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>
}) {
  const { msg } = await searchParams

  const [{ data: contracts }, { data: payouts }] = await Promise.all([
    supabaseAdmin.from('edu_contracts')
      .select('id, status, fields, created_at, engagement:edu_instructor_engagements(id, fee, scope, instructor:edu_instructors(id, name))')
      .eq('status', 'executed').order('created_at', { ascending: false }).limit(100),
    supabaseAdmin.from('edu_instructor_payouts')
      .select('id, contract_id, sessions_done, fee_per_session, period_label, gross, income_kind, tax_base, income_tax, local_tax, net, basis, status, cancel_reason, approved_at, paid_at, paid_note, is_test, created_at, instructor:edu_instructors(name)')
      .order('created_at', { ascending: false }).limit(100),
  ])

  const paidBy = new Map<string, number>()
  for (const p of payouts ?? []) if (p.status !== 'cancelled') paidBy.set(p.contract_id, (paidBy.get(p.contract_id) ?? 0) + p.sessions_done)

  const live = (payouts ?? []).filter((p) => p.status !== 'cancelled')
  const sum = (f: (p: typeof live[number]) => number) => live.reduce((a, p) => a + f(p), 0)

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-md border bg-muted px-3 py-2 text-sm">{msg}</div>}

      <div>
        <h1 className="text-xl font-semibold tracking-tight">강사료 정산</h1>
        <p className="text-sm text-muted-foreground mt-1">
          체결된 계약의 <strong>실시한 회차</strong>를 정산합니다. 원천징수는 소득 구분에 따라 계산되고,
          <strong> 계산 근거가 함께 저장</strong>됩니다 — 강사가 「얼마가 왜 빠졌나」를 물으면 그대로 보여 드리면 됩니다.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>지급 현황</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {live.length === 0 ? (
            <p className="text-muted-foreground">아직 정산이 없습니다. 체결된 계약 {(contracts ?? []).length}건이 정산을 기다립니다.</p>
          ) : (
            <p>
              정산 <strong>{live.length}건</strong> · 지급액 합계 <strong>{won(sum((p) => p.gross))}</strong> ·
              원천징수 <strong>{won(sum((p) => p.income_tax + p.local_tax))}</strong> ·
              실지급 <strong>{won(sum((p) => p.net))}</strong>
              <span className="text-muted-foreground"> (취소분 제외)</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* 정산을 기다리는 계약 */}
      <Card>
        <CardHeader><CardTitle>정산을 기다리는 계약</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(contracts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">체결된 계약이 없습니다 — 양측 서명이 끝나야 정산할 수 있습니다.</p>
          ) : (contracts ?? []).map((c) => {
            const eng = Array.isArray(c.engagement) ? c.engagement[0] : c.engagement
            const who = eng && (Array.isArray(eng.instructor) ? eng.instructor[0] : eng.instructor)
            const f = (c.fields ?? {}) as { incomeType?: string; sessionCount?: number | string; programTitle?: string; feePerSession?: string }
            const done = paidBy.get(c.id) ?? 0
            const total = Number(f.sessionCount ?? 0)
            return (
              <div key={c.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {who?.name ?? '—'}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {f.programTitle || '과정 미상'} · 계약 회차 {total || '—'} · 정산된 회차 {done}
                    {' · '}{(f.incomeType ?? '').includes('사업소득') ? '사업소득' : '기타소득'}
                  </span>
                </p>
                <PayoutForm
                  action={createPayout}
                  contractId={c.id}
                  remaining={total && done < total ? total - done : undefined}
                  feePlaceholder={eng?.fee ? String(eng.fee) : undefined}
                />
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>정산 내역</CardTitle></CardHeader>
        <CardContent>
          {(payouts ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">정산 내역이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>산출일</TableHead>
                  <TableHead>강사</TableHead>
                  <TableHead className="text-center">회차</TableHead>
                  <TableHead className="text-right">지급액</TableHead>
                  <TableHead className="text-right">원천징수</TableHead>
                  <TableHead className="text-right">실지급</TableHead>
                  <TableHead className="text-center">상태</TableHead>
                  <TableHead>처리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(payouts ?? []).map((p) => {
                  const who = Array.isArray(p.instructor) ? p.instructor[0] : p.instructor
                  const st = STATUS[p.status] ?? { label: p.status, tone: 'neutral' as const }
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{fmt(p.created_at)}</TableCell>
                      <TableCell>
                        {who?.name ?? '—'}
                        {p.is_test && <Badge tone="neutral" className="ml-1">테스트</Badge>}
                        <span className="block text-xs text-muted-foreground">
                          {INCOME_KIND_LABEL[p.income_kind as 'business' | 'other']} · {p.period_label || '기간 미표기'}
                        </span>
                        <span className="block text-xs text-muted-foreground">{p.basis}</span>
                        {p.cancel_reason && <span className="block text-xs text-destructive">취소 — {p.cancel_reason}</span>}
                        {p.paid_note && <span className="block text-xs text-muted-foreground">지급 — {p.paid_note}</span>}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{p.sessions_done}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{won(p.gross)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{won(p.income_tax + p.local_tax)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold">{won(p.net)}</TableCell>
                      <TableCell className="text-center"><Badge tone={st.tone}>{st.label}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-end gap-1">
                          {p.status === 'draft' && (
                            <form action={decidePayout}>
                              <input type="hidden" name="payoutId" value={p.id} />
                              <input type="hidden" name="act" value="approve" />
                              <button type="submit" className="rounded-md border px-2 py-1 text-xs font-semibold">승인</button>
                            </form>
                          )}
                          {p.status === 'approved' && (
                            <form action={decidePayout} className="flex items-end gap-1">
                              <input type="hidden" name="payoutId" value={p.id} />
                              <input type="hidden" name="act" value="pay" />
                              <Input name="paidNote" placeholder="이체 메모" className="h-8 w-28 text-xs" />
                              <button type="submit" className="rounded-md border px-2 py-1 text-xs font-semibold">지급</button>
                            </form>
                          )}
                          {(p.status === 'draft' || p.status === 'approved') && (
                            <form action={decidePayout} className="flex items-end gap-1">
                              <input type="hidden" name="payoutId" value={p.id} />
                              <input type="hidden" name="act" value="cancel" />
                              <Input name="reason" placeholder="취소 사유" className="h-8 w-28 text-xs" />
                              <button type="submit" className="rounded-md border px-2 py-1 text-xs">취소</button>
                            </form>
                          )}
                          {p.status === 'paid' && <span className="text-xs text-muted-foreground">{fmt(p.paid_at ?? undefined)} 지급</span>}
                        </div>
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
