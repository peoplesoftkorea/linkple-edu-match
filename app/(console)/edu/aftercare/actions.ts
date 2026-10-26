'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'

// 피드백 공개 처리 — ★동의만으로 공개되지 않는다. 사람이 한 번 «읽고» 넘긴다.
//   자동 공개로 두면 대외 화면에 무엇이 실릴지 아무도 모르는 상태가 된다.
const back = (msg: string) => redirect(`/edu/aftercare?msg=${encodeURIComponent(msg)}`)

export async function publishFeedback(fd: FormData) {
  const id = String(fd.get('id') || '')
  if (!id) back('요청이 올바르지 않습니다.')

  // 되읽어 «조건»을 서버에서 다시 본다 — 화면이 보여 준 것을 믿지 않는다.
  const { data: row, error: e1 } = await supabaseAdmin
    .from('edu_feedback')
    .select('id, consent_public, public_quote, published_at')
    .eq('id', id)
    .maybeSingle()
  if (e1 || !row) back('해당 피드백을 찾지 못했습니다.')
  if (!row!.consent_public) back('공개 동의가 없는 피드백입니다. 공개할 수 없습니다.')
  if (!row!.public_quote) back('공개할 문장이 비어 있습니다.')

  const { error } = await supabaseAdmin
    .from('edu_feedback')
    .update({ published_at: new Date().toISOString() })
    .eq('id', id)
  if (error) { console.error('[admin/edu] 공개 처리 실패', error); back('공개하지 못했습니다.') }
  revalidatePath('/edu/aftercare')
  back('공개했습니다. 과정 안내에 실립니다.')
}

export async function unpublishFeedback(fd: FormData) {
  const id = String(fd.get('id') || '')
  if (!id) back('요청이 올바르지 않습니다.')
  const { error } = await supabaseAdmin
    .from('edu_feedback')
    .update({ published_at: null })
    .eq('id', id)
  if (error) { console.error('[admin/edu] 공개 해제 실패', error); back('내리지 못했습니다.') }
  revalidatePath('/edu/aftercare')
  back('공개를 내렸습니다.')
}
