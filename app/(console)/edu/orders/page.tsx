// 기업 발주 — 목록과 진행. 화면 표준의 «목록·상세» 두 종을 한 화면에 둔다.
//
// ★목록의 상태 정본은 URL 이다(화면 표준) — 상태 필터·삭제분 포함 여부가 주소에 남아야
//   그 화면을 그대로 공유할 수 있다. 표 안의 검색·정렬·페이지는 공용 DataTable 이 맡는다.
// ★상태 규칙은 이 화면에 적지 않는다 — DB 트리거가 집행하고, 화면은 «지금 갈 수 있는 곳»만 그린다.
// ⛔지우기는 숨기기다. 물리 삭제 버튼을 만들지 않는다.
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { OrdersTable } from './OrdersTable'
import { STATUS_LABEL, type OrderRow } from './types'

export const dynamic = 'force-dynamic'

export default async function EduOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; status?: string; deleted?: string }>
}) {
  const sp = await searchParams
  const statusFilter = sp.status && STATUS_LABEL[sp.status] ? sp.status : ''
  const withDeleted = sp.deleted === '1'

  let q = supabaseAdmin
    .from('edu_org_orders')
    .select('id, order_no, org_name, contact_name, contact_email, contact_phone, program_slug, headcount, preferred_from, venue_type, venue_region, total, subtotal, vat, status, cancel_reason, price_basis, note, cohort_id, is_test, deleted_at, created_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (statusFilter) q = q.eq('status', statusFilter)
  if (!withDeleted) q = q.is('deleted_at', null)
  const { data: orders, error } = await q

  const ids = (orders ?? []).map((o) => o.id)
  const { data: events } = ids.length
    ? await supabaseAdmin.from('edu_order_events')
        .select('order_id, kind, from_status, to_status, reason, created_at')
        .in('order_id', ids).order('created_at', { ascending: false })
    : { data: [] as never[] }
  const evBy = new Map<string, OrderRow['events']>()
  for (const e of events ?? []) evBy.set(e.order_id, [...(evBy.get(e.order_id) ?? []), e])

  const rows: OrderRow[] = (orders ?? []).map((o) => ({ ...o, events: evBy.get(o.id) ?? [] })) as OrderRow[]

  // 상태별 건수 — 「목록이 비었다」와 「그 상태가 0건이다」를 가른다
  const { data: counts } = await supabaseAdmin
    .from('edu_org_orders').select('status, deleted_at').limit(2000)
  const live = (counts ?? []).filter((c) => !c.deleted_at)
  const byStatus = Object.keys(STATUS_LABEL).map((s) => ({ s, n: live.filter((c) => c.status === s).length }))
  const deletedN = (counts ?? []).length - live.length

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams()
    const next = { status: statusFilter, deleted: withDeleted ? '1' : '', ...patch }
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v)
    const s = p.toString()
    return s ? `/edu/orders?${s}` : '/edu/orders'
  }

  return (
    <div className="w-full">
      {sp.msg && <div className="mb-4 rounded-md border bg-muted px-3 py-2 text-sm">{sp.msg}</div>}
      <h1 className="text-2xl font-bold text-ink mb-1">기업 발주</h1>
      <p className="text-faint text-sm mb-4">
        대외 견적 폼에서 들어온 발주의 진행을 여기서 움직입니다. 상태 규칙은 데이터베이스가 집행하므로
        <strong> 갈 수 없는 단계는 애초에 보이지 않습니다</strong>. 지우기는 숨기기이고 복원할 수 있습니다.
      </p>

      {error && (
        <p className="mb-4 text-sm text-destructive">발주를 읽지 못했습니다 — {error.message}. 아래 수치를 0으로 읽지 마십시오.</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href={href({ status: '' })}
          className={`rounded-md border px-3 py-1.5 ${!statusFilter ? 'bg-foreground text-background' : ''}`}>
          전체 {live.length}
        </Link>
        {byStatus.map(({ s, n }) => (
          <Link key={s} href={href({ status: s })}
            className={`rounded-md border px-3 py-1.5 ${statusFilter === s ? 'bg-foreground text-background' : ''}`}>
            {STATUS_LABEL[s]} {n}
          </Link>
        ))}
        <Link href={href({ deleted: withDeleted ? '' : '1' })}
          className={`rounded-md border px-3 py-1.5 ${withDeleted ? 'bg-foreground text-background' : 'text-faint'}`}>
          지운 것 {deletedN}{withDeleted ? ' 보는 중' : ' 포함'}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-faint">
          {statusFilter ? `「${STATUS_LABEL[statusFilter]}」 상태의 발주가 0건입니다.` : '발주가 아직 없습니다.'}
          {' '}전체 {live.length}건 · 지운 것 {deletedN}건.
        </p>
      ) : (
        <OrdersTable rows={rows} />
      )}
    </div>
  )
}
