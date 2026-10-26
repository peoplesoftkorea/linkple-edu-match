'use server'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdmin } from '@/lib/guard'
import { serverClient } from '@/lib/supabase/server'

// 기업 발주 — 운영자가 진행을 «움직이는» 자리.
//
// ★상태 규칙은 여기서 복제하지 않는다 — DB 트리거(e15)가 집행한다.
//   이 파일이 하는 일은 사람의 뜻을 전달하고, 거부되면 그 사유를 사람 말로 돌려주는 것이다.
//   ⛔화면에 규칙을 또 적으면 두 판본이 되고, 늘어나는 입구마다 어긋난다.
// ★행위자를 남긴다 — 「누가 취소했나」가 비면 귀책을 추적할 수 없다.
// ⛔물리 삭제하지 않는다. 지우는 것은 «목록에서 빼는 것»이고 복원할 수 있다.

const back: (msg: string, to?: string) => never =
  (msg, to = '/edu/orders') => redirect(`${to}?msg=${encodeURIComponent(msg)}`)

const actorId = async () => (await (await serverClient()).auth.getUser()).data.user?.id ?? null

/** 트리거가 던진 사유를 그대로 보여 준다 — 우리말로 쓰여 있고, 바꿔 적으면 뜻이 흐려진다. */
const dbReason = (msg: string) => msg.replace(/^.*?:\s*/, '').slice(0, 300)

export async function changeOrderStatus(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const id = String(fd.get('orderId') ?? '')
  const to = String(fd.get('to') ?? '')
  const reason = String(fd.get('reason') ?? '').trim()
  if (!id || !to) back('대상 발주와 바꿀 상태가 필요합니다.')

  const patch: Record<string, unknown> = { status: to }
  if (to === 'cancelled') {
    if (reason.length < 2) back('취소 사유를 적으십시오 — 「왜 취소됐나」가 비면 기록이 아닙니다.')
    patch.cancel_reason = reason
  }

  const { error } = await supabaseAdmin.from('edu_org_orders').update(patch).eq('id', id)
  if (error) back(`상태를 바꾸지 못했습니다 — ${dbReason(error.message)}`)

  // 이력의 행위자는 트리거가 모른다(서버 세션을 DB 가 보지 못한다) — 여기서 채운다
  const actor = await actorId()
  if (actor) {
    const { data: last } = await supabaseAdmin.from('edu_order_events')
      .select('id').eq('order_id', id).eq('kind', 'status').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (last) await supabaseAdmin.from('edu_order_events').update({ actor }).eq('id', last.id)
  }
  back('발주 상태를 바꿨습니다.')
}

export async function addOrderNote(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const id = String(fd.get('orderId') ?? '')
  const note = String(fd.get('note') ?? '').trim()
  if (!id || note.length < 2) back('메모 내용을 적으십시오.')
  const { error } = await supabaseAdmin.from('edu_order_events')
    .insert({ order_id: id, kind: 'note', reason: note.slice(0, 1000), actor: await actorId() })
  if (error) back(`메모를 남기지 못했습니다 — ${error.message}`)
  back('메모를 남겼습니다.')
}

export async function softDeleteOrder(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const id = String(fd.get('orderId') ?? '')
  const reason = String(fd.get('reason') ?? '').trim() || '운영자 정리'
  if (!id) back('대상 발주가 없습니다.')
  const { error } = await supabaseAdmin.from('edu_org_orders').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) back(`지우지 못했습니다 — ${dbReason(error.message)}`)
  await supabaseAdmin.from('edu_order_events').insert({ order_id: id, kind: 'deleted', reason, actor: await actorId() })
  back('발주를 목록에서 뺐습니다. 지워진 것이 아니라 숨긴 것이고 복원할 수 있습니다.')
}

export async function restoreOrder(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const id = String(fd.get('orderId') ?? '')
  if (!id) back('대상 발주가 없습니다.')
  const { error } = await supabaseAdmin.from('edu_org_orders').update({ deleted_at: null }).eq('id', id)
  if (error) back(`복원하지 못했습니다 — ${dbReason(error.message)}`)
  await supabaseAdmin.from('edu_order_events').insert({ order_id: id, kind: 'restored', actor: await actorId() })
  back('발주를 복원했습니다.')
}
