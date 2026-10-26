'use server'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { isAdmin } from '@/lib/guard'

// 알림 읽음 처리 — 「봤다」는 사실만 적는다.
// ⛔알림을 지우지 않는다. 지우면 「안 왔다」와 「봤다」를 구분할 수 없다.

const back: (msg: string) => never = (msg) => redirect(`/edu/notifications?msg=${encodeURIComponent(msg)}`)

export async function markRead(fd: FormData) {
  if (!(await isAdmin())) back('권한이 없습니다.')
  const id = String(fd.get('notificationId') ?? '')
  const all = String(fd.get('all') ?? '') === '1'
  const now = new Date().toISOString()
  if (all) {
    const { error } = await supabaseAdmin.from('edu_notifications')
      .update({ read_at: now }).eq('audience', 'operator').is('read_at', null)
    if (error) back(`처리하지 못했습니다 — ${error.message}`)
    back('운영자 알림을 모두 읽음으로 표시했습니다.')
  }
  if (!id) back('대상 알림이 없습니다.')
  const { error } = await supabaseAdmin.from('edu_notifications').update({ read_at: now }).eq('id', id)
  if (error) back(`처리하지 못했습니다 — ${error.message}`)
  back('읽음으로 표시했습니다.')
}
