'use server'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdmin } from '@/lib/guard'
import { serverClient } from '@/lib/supabase/server'
import { instructorWithholding, type InstructorIncomeKind } from '@/lib/labor/withholding'

// 강사료 정산 — 실시한 회차에 대해 얼마를 지급하는가.
//
// ★세율은 여기 적지 않는다 — `@/lib/labor/withholding` 가 정본이다.
//   이 파일은 「몇 회차를 실시했는가」와 「소득 구분이 무엇인가」만 받아 그 모듈에 묻는다.
// ★계산 근거를 함께 저장한다 — 강사가 「얼마가 왜 빠졌나」를 물을 때 답할 수 있어야 한다.
// ⛔지급 뒤 금액 수정은 DB 가 막는다. 화면은 그 사유를 사람 말로 돌려줄 뿐이다.

const back: (msg: string, to?: string) => never =
  (msg, to = '/edu/payouts') => redirect(`${to}?msg=${encodeURIComponent(msg)}`)

const num = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? '').trim()
  if (!v) return null
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? Math.trunc(n) : NaN
}
const dbReason = (m: string) => m.replace(/^.*?:\s*/, '').slice(0, 300)

export async function createPayout(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const contractId = String(fd.get('contractId') ?? '')
  if (!contractId) back('대상 계약이 없습니다.')

  const { data: c } = await supabaseAdmin
    .from('edu_contracts')
    .select('id, status, fields, is_test, engagement:edu_instructor_engagements(instructor_id, fee)')
    .eq('id', contractId).maybeSingle()
  if (!c) back('계약을 찾지 못했습니다.')
  if (c.status !== 'executed') back('체결된 계약에서만 정산을 만듭니다 — 양측 서명이 끝나야 합니다.')

  const eng = (Array.isArray(c.engagement) ? c.engagement[0] : c.engagement) as { instructor_id: string; fee: number | null } | null
  if (!eng) back('위촉 정보를 읽지 못했습니다.')

  const sessionsDone = num(fd, 'sessionsDone')
  if (sessionsDone == null || Number.isNaN(sessionsDone) || sessionsDone < 1) {
    back('실시한 회차 수를 1 이상으로 적으십시오 — 실시하지 않은 회차는 정산하지 않습니다.')
  }
  const feeRaw = num(fd, 'feePerSession')
  const feePerSession = feeRaw != null && !Number.isNaN(feeRaw) && feeRaw > 0 ? feeRaw : (eng.fee ?? 0)
  if (feePerSession <= 0) back('회당 강사료가 없습니다 — 계약의 금액을 먼저 확인하십시오.')

  // 소득 구분은 계약서에 이미 적혀 있다 — 거기서 읽는다(두 곳에서 고르지 않는다)
  const fields = (c.fields ?? {}) as { incomeType?: string }
  const kind: InstructorIncomeKind = (fields.incomeType ?? '').includes('사업소득') ? 'business' : 'other'

  const w = instructorWithholding(sessionsDone * feePerSession, kind)
  const { error } = await supabaseAdmin.from('edu_instructor_payouts').insert({
    contract_id: contractId,
    instructor_id: eng.instructor_id,
    sessions_done: sessionsDone,
    fee_per_session: feePerSession,
    period_label: String(fd.get('periodLabel') ?? '').trim() || null,
    gross: w.gross, income_kind: w.kind, tax_base: w.taxBase,
    income_tax: w.incomeTax, local_tax: w.localTax, net: w.net, basis: w.basis,
    is_test: c.is_test,
  })
  if (error) back(`정산을 만들지 못했습니다 — ${dbReason(error.message)}`)
  back(`정산을 만들었습니다 — 실지급 ${w.net.toLocaleString()}원.`)
}

export async function decidePayout(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const id = String(fd.get('payoutId') ?? '')
  const act = String(fd.get('act') ?? '')
  if (!id) back('대상 정산이 없습니다.')

  const uid = (await (await serverClient()).auth.getUser()).data.user?.id ?? null
  const patch: Record<string, unknown> =
    act === 'approve' ? { status: 'approved', approved_at: new Date().toISOString(), approved_by: uid }
    : act === 'pay' ? { status: 'paid', paid_at: new Date().toISOString(), paid_note: String(fd.get('paidNote') ?? '').trim() || null }
    : act === 'cancel' ? { status: 'cancelled', cancel_reason: String(fd.get('reason') ?? '').trim() }
    : {}
  if (Object.keys(patch).length === 0) back('알 수 없는 처리입니다.')
  if (act === 'cancel' && String(fd.get('reason') ?? '').trim().length < 2) {
    back('취소 사유를 적으십시오 — 「왜 취소됐나」가 비면 기록이 아닙니다.')
  }

  const { error } = await supabaseAdmin.from('edu_instructor_payouts').update(patch).eq('id', id)
  if (error) back(`처리하지 못했습니다 — ${dbReason(error.message)}`)
  back(act === 'approve' ? '정산을 승인했습니다 — 금액이 확정됐습니다.'
     : act === 'pay' ? '지급으로 표시했습니다.'
     : '정산을 취소했습니다.')
}
