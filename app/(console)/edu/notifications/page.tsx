// 교육 알림 — 무슨 일이 있었는지 한 자리에서 본다.
//
// ★알림은 «기록»이다 — 지금은 보내지 않는다(sent_at 이 늘 비어 있다). 그 사실을 화면이 말한다.
//   ⛔쌓이는 것을 「보냈다」로 읽으면, 강사는 못 받았는데 우리는 보냈다고 믿는다.
// ★강사에게 갈 알림도 함께 보인다 — 발송을 붙이기 전까지는 운영자가 대신 전한다.
import { supabaseAdmin } from '@/lib/supabase-admin'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { fmt } from '@/lib/admin-ui'
import { markRead } from './actions'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = {
  engagement_proposed: '위촉 제안',
  engagement_decided: '강사 응답',
  contract_sign_requested: '서명 요청',
  contract_executed: '계약 체결',
  payout_paid: '강사료 지급',
}
const AUDIENCE_LABEL: Record<string, string> = { operator: '운영자', instructor: '강사', org: '발주사' }

export default async function EduNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>
}) {
  const { msg } = await searchParams
  const { data: rows, error } = await supabaseAdmin
    .from('edu_notifications')
    .select('id, audience, kind, title, body, read_at, sent_at, is_test, created_at, instructor:edu_instructors(name)')
    .order('created_at', { ascending: false })
    .limit(200)

  const list = rows ?? []
  const unreadOperator = list.filter((r) => r.audience === 'operator' && !r.read_at).length
  const pendingToInstructor = list.filter((r) => r.audience === 'instructor' && !r.sent_at).length

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-md border bg-muted px-3 py-2 text-sm">{msg}</div>}

      <div>
        <h1 className="text-xl font-semibold tracking-tight">교육 알림</h1>
        <p className="text-sm text-muted-foreground mt-1">
          위촉·계약·정산에서 일어난 일이 여기에 쌓입니다. <strong>아직 자동 발송은 붙이지 않았습니다</strong> —
          강사에게 갈 알림은 운영자가 전합니다. 쌓인 것을 「보냈다」로 읽지 마십시오.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>현황</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {error ? (
            <p className="text-destructive">알림을 읽지 못했습니다 — {error.message}. 아래 수치를 0으로 읽지 마십시오.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <p>
                운영자 미확인 <strong>{unreadOperator}건</strong> · 강사에게 아직 전하지 않은 것 <strong>{pendingToInstructor}건</strong> ·
                전체 <strong>{list.length}건</strong>
              </p>
              {unreadOperator > 0 && (
                <form action={markRead}>
                  <input type="hidden" name="all" value="1" />
                  <button type="submit" className="rounded-md border px-3 py-1.5 text-xs font-semibold">운영자 알림 모두 읽음</button>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>알림</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 알림이 없습니다 — 위촉·계약·정산이 움직이면 여기에 쌓입니다.</p>
          ) : list.map((n) => {
            const who = Array.isArray(n.instructor) ? n.instructor[0] : n.instructor
            return (
              <div key={n.id} className={`rounded-lg border p-3 text-sm ${n.read_at ? 'opacity-60' : ''}`}>
                <p className="font-medium">
                  {n.title}
                  <Badge tone={n.audience === 'operator' ? 'default' : 'neutral'} className="ml-2">{AUDIENCE_LABEL[n.audience] ?? n.audience}</Badge>
                  <Badge tone="neutral" className="ml-1">{KIND_LABEL[n.kind] ?? n.kind}</Badge>
                  {n.is_test && <Badge tone="neutral" className="ml-1">테스트</Badge>}
                </p>
                {n.body && <p className="text-muted-foreground mt-0.5">{n.body}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  {fmt(n.created_at)} · {who?.name ? `${who.name} 강사` : '대상 미지정'} ·
                  {n.audience === 'instructor' ? (n.sent_at ? ` 발송 ${fmt(n.sent_at)}` : ' 아직 발송하지 않음') : n.read_at ? ` 확인 ${fmt(n.read_at)}` : ' 미확인'}
                </p>
                {n.audience === 'operator' && !n.read_at && (
                  <form action={markRead} className="mt-2">
                    <input type="hidden" name="notificationId" value={n.id} />
                    <button type="submit" className="rounded-md border px-2 py-1 text-xs">읽음</button>
                  </form>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
