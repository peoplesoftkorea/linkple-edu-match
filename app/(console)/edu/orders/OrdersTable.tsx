'use client'
import { Input } from '@/components/ui/input'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { fmt, won } from '@/lib/admin-ui'
import { changeOrderStatus, addOrderNote, softDeleteOrder, restoreOrder } from './actions'
import { NEXT_STATUS, STATUS_LABEL, type OrderRow } from './types'

// 발주 목록 — 공용 DataTable 을 쓴다(검색·정렬·페이지·행 상세).
// ⛔표를 또 만들지 않는다. 이미 쓰는 것이 있으면 그것을 쓴다.

const TONE: Record<string, 'default' | 'neutral' | 'warning' | 'danger' | 'success'> = {
  quoted: 'neutral', ordered: 'default', confirmed: 'warning', invoiced: 'warning',
  completed: 'success', cancelled: 'danger',
}
const KIND_LABEL: Record<string, string> = {
  status: '상태', note: '메모', deleted: '숨김', restored: '복원',
}

const col = createColumnHelper<OrderRow>()

export function OrdersTable({ rows }: { rows: OrderRow[] }) {
  const columns = [
    col.accessor('created_at', {
      header: '접수일',
      cell: (c) => <span className="text-xs text-faint whitespace-nowrap">{fmt(c.getValue())}</span>,
    }),
    col.accessor('order_no', {
      header: '발주번호',
      cell: (c) => (
        <span className="whitespace-nowrap text-xs">
          {c.getValue()}
          {c.row.original.is_test && <Badge tone="neutral" className="ml-1">테스트</Badge>}
          {c.row.original.deleted_at && <Badge tone="neutral" className="ml-1">숨김</Badge>}
        </span>
      ),
    }),
    col.accessor('org_name', { header: '발주사', cell: (c) => <span className="font-medium">{c.getValue()}</span> }),
    col.accessor((r) => r.headcount ?? 0, { id: 'headcount', header: '인원', cell: (c) => <span className="tabular-nums">{c.getValue() || '—'}</span> }),
    col.accessor((r) => r.total ?? 0, { id: 'total', header: '합계', cell: (c) => <span className="tabular-nums whitespace-nowrap">{c.getValue() ? won(c.getValue()) : '—'}</span> }),
    col.accessor('status', {
      header: '상태',
      cell: (c) => <Badge tone={TONE[c.getValue()] ?? 'neutral'}>{STATUS_LABEL[c.getValue()] ?? c.getValue()}</Badge>,
    }),
  ]

  return (
    <DataTable
      rows={rows}
      columns={columns as any}
      searchPlaceholder="발주번호·발주사·담당자 검색"
      searchFn={(r, q) => {
        const s = q.toLowerCase()
        return [r.order_no, r.org_name, r.contact_name, r.contact_email, r.program_slug].some((v) => (v || '').toLowerCase().includes(s))
      }}
      initialSort={[{ id: 'created_at', desc: true }]}
      renderDetail={(r) => {
        const next = r.deleted_at ? [] : (NEXT_STATUS[r.status] ?? [])
        return (
          <div className="flex flex-col gap-4 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><div className="text-xs text-faint">담당자</div>{r.contact_name || '—'}</div>
              <div><div className="text-xs text-faint">연락처</div>{r.contact_email || r.contact_phone || '—'}</div>
              <div><div className="text-xs text-faint">과정</div>{r.program_slug || '—'}</div>
              <div><div className="text-xs text-faint">희망 시기</div>{r.preferred_from || '—'}</div>
              <div><div className="text-xs text-faint">진행 형태</div>{r.venue_type || '—'}{r.venue_region ? ` · ${r.venue_region}` : ''}</div>
              <div><div className="text-xs text-faint">공급가액</div>{r.subtotal ? won(r.subtotal) : '—'}</div>
              <div><div className="text-xs text-faint">부가세</div>{r.vat ? won(r.vat) : '—'}</div>
              <div><div className="text-xs text-faint">합계</div>{r.total ? won(r.total) : '—'}</div>
            </div>

            {r.price_basis && (
              <div><div className="text-xs text-faint">금액 산식</div><div className="text-slate">{r.price_basis}</div></div>
            )}
            {r.cancel_reason && (
              <div><div className="text-xs text-faint">취소 사유</div><div className="text-rose-700">{r.cancel_reason}</div></div>
            )}

            {/* 진행 — 갈 수 있는 곳만 보인다 */}
            <div>
              <div className="text-xs text-faint mb-1">진행</div>
              {r.deleted_at ? (
                <form action={restoreOrder} className="flex items-center gap-2">
                  <input type="hidden" name="orderId" value={r.id} />
                  <span className="text-faint">숨긴 발주입니다 — 복원하면 다시 진행할 수 있습니다.</span>
                  <button type="submit" className="rounded-md border px-3 py-1.5 text-xs font-semibold">복원</button>
                </form>
              ) : next.length === 0 ? (
                <span className="text-faint">
                  {r.status === 'completed' ? '완료된 발주입니다 — 더 갈 곳이 없습니다.' : '취소된 발주입니다 — 다시 진행하려면 새 발주를 받습니다.'}
                </span>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  {next.filter((s) => s !== 'cancelled').map((s) => (
                    <form key={s} action={changeOrderStatus}>
                      <input type="hidden" name="orderId" value={r.id} />
                      <input type="hidden" name="to" value={s} />
                      <button type="submit" className="rounded-md bg-[#147B58] px-3 py-1.5 text-xs font-semibold text-white">
                        {STATUS_LABEL[s]}로
                      </button>
                    </form>
                  ))}
                  <form action={changeOrderStatus} className="flex items-end gap-1">
                    <input type="hidden" name="orderId" value={r.id} />
                    <input type="hidden" name="to" value="cancelled" />
                    <Input name="reason" placeholder="취소 사유" className="h-8 w-44 text-xs" />
                    <button type="submit" className="rounded-md border px-3 py-1.5 text-xs">취소</button>
                  </form>
                  <form action={softDeleteOrder} className="flex items-end gap-1">
                    <input type="hidden" name="orderId" value={r.id} />
                    <Input name="reason" placeholder="숨기는 이유" className="h-8 w-36 text-xs" />
                    <button type="submit" className="rounded-md border px-3 py-1.5 text-xs text-faint">목록에서 빼기</button>
                  </form>
                </div>
              )}
            </div>

            {/* 이력 — 누가 언제 무엇을 왜 */}
            <div>
              <div className="text-xs text-faint mb-1">진행 이력 {r.events.length}건</div>
              {r.events.length === 0 ? (
                <span className="text-faint">아직 이력이 없습니다 — 접수 뒤 움직인 적이 없습니다.</span>
              ) : (
                <ul className="space-y-1">
                  {r.events.map((e, i) => (
                    <li key={i} className="text-xs text-faint">
                      <span className="text-faint">{fmt(e.created_at)}</span>{' · '}
                      <span className="font-medium">{KIND_LABEL[e.kind] ?? e.kind}</span>
                      {e.kind === 'status' && ` ${STATUS_LABEL[e.from_status ?? ''] ?? e.from_status} → ${STATUS_LABEL[e.to_status ?? ''] ?? e.to_status}`}
                      {e.reason && ` · ${e.reason}`}
                    </li>
                  ))}
                </ul>
              )}
              <form action={addOrderNote} className="mt-2 flex items-end gap-2">
                <input type="hidden" name="orderId" value={r.id} />
                <Input name="note" placeholder="진행 메모 — 통화·협의 내용을 남깁니다" className="h-8 w-full max-w-md text-xs" />
                <button type="submit" className="rounded-md border px-3 py-1.5 text-xs font-semibold">메모</button>
              </form>
            </div>
          </div>
        )
      }}
    />
  )
}
