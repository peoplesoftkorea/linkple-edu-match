'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createColumnHelper } from '@tanstack/react-table'
import { DataTable } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { proposeEngagement } from '../actions'

// 매칭 순위 — 공용 DataTable 을 쓴다(검색·정렬·행 상세).
//
// 🔴[대표님 지적 2026-10-10] *"화면상 체계가 결여되어 있고, crud 컴포넌트는 되감기 되고 있으며,
//   화면 구성은 최악임."* — 종전 이 화면은 강사 26명을 «서술형 카드»로 세로로 늘어놓았다.
//   MTOS 화면표준이 2026-09-03 에 폐기한 바로 그 「읽는 문서」 구조다.
//   표준의 진단: 「ERP 와의 격차는 시각 완성도가 아니라 **정보 구조**다. 읽는 문서 → 레코드로.」
//   ⛔표를 또 만들지 않는다 — @/lib/ui 의 DataTable(TanStack)이 이미 있고
//     같은 콘솔의 발주·리드·구독 화면이 모두 그것을 쓴다. 이 화면만 안 쓰고 있었다.
//
// ★축을 «열»로 둔다 — 서술로 적으면 강사 간 비교가 불가능하다. 표의 값은 비교하라고 있는 것이다.

export type RankRow = {
  id: string
  rank: number
  percent: number
  eligible: boolean
  instructor_id: string
  name: string
  title: string | null
  years: number | null
  regions: string[] | null
  contactable: boolean
  source: string | null
  dayRate: number | null
  axes: { axis: string; label?: string; score: number; weight: number; reasons?: string[] }[]
  cultureMeasured: boolean
  blockers: string[]
  headline: string | null
  /** 수강생 평가 — 운영자와 본인만 본다(범위 확정서 결정 8). null = 평가 없음(0.0점이 아니다). */
  rating: { n: number; avg: number } | null
  live: string | null
  liveLabel: string | null
  liveTone: 'default' | 'neutral' | 'warning' | 'danger' | 'success' | null
}

const col = createColumnHelper<RankRow>()
const ax = (r: RankRow, a: string) => r.axes.find((x) => x.axis === a)
const pct = (v?: number) => (v == null ? null : Math.round(v * 100))

/** 축 한 칸 — 숫자만 둔다. 「왜 이 점수인가」는 행을 펼치면 나온다. */
function AxisCell({ r, a }: { r: RankRow; a: string }) {
  const x = ax(r, a)
  if (!x || x.weight === 0) return <span className="text-faint">—</span>
  if (a === 'C' && !r.cultureMeasured) return <span className="text-warn text-xs">미측정</span>
  const v = pct(x.score)!
  return <span className={`tabular-nums ${v >= 67 ? 'font-semibold text-ink' : v <= 33 ? 'text-faint' : ''}`}>{v}</span>
}

export function RankTable({ rows, scope, targetId, runId }:
  { rows: RankRow[]; scope: 'session' | 'cohort' | null; targetId: string | null; runId: string }) {
  const columns = [
    col.accessor('rank', { header: '순위', cell: (c) => <span className="tabular-nums text-faint">{c.getValue()}</span> }),
    col.accessor('name', {
      header: '강사',
      cell: (c) => (
        <span className="whitespace-nowrap">
          <span className="font-medium">{c.getValue()}</span>
          {!c.row.original.eligible && <Badge tone="danger" className="ml-1">부적격</Badge>}
          {c.row.original.liveLabel && <Badge tone={c.row.original.liveTone ?? 'neutral'} className="ml-1">{c.row.original.liveLabel}</Badge>}
          {!c.row.original.contactable && <Badge tone="neutral" className="ml-1">연락 불가</Badge>}
          {/* ★평점은 «표시»만 한다 — 정렬 축을 늘리지 않는다(순위는 5축 적합도 하나뿐·결정 8).
              ⛔평가가 없으면 아무것도 적지 않는다. 「0.0점」은 «낮다»는 사실 주장이 된다. */}
          {c.row.original.rating && (
            <span className="ml-2 text-xs text-faint whitespace-nowrap">
              수강생 평가 {c.row.original.rating.avg.toFixed(1)}점({c.row.original.rating.n}건)
            </span>
          )}
        </span>
      ),
    }),
    col.accessor('percent', {
      header: '매칭율',
      cell: (c) => <span className="tabular-nums font-semibold">{c.getValue()}%</span>,
    }),
    col.accessor((r) => pct(ax(r, 'K')?.score) ?? -1, { id: 'K', header: '강의 주제 K', cell: (c) => <AxisCell r={c.row.original} a="K" /> }),
    col.accessor((r) => pct(ax(r, 'S')?.score) ?? -1, { id: 'S', header: '강의 방식 S', cell: (c) => <AxisCell r={c.row.original} a="S" /> }),
    col.accessor((r) => pct(ax(r, 'A')?.score) ?? -1, { id: 'A', header: '경력·대상 A', cell: (c) => <AxisCell r={c.row.original} a="A" /> }),
    col.accessor((r) => (r.cultureMeasured ? pct(ax(r, 'C')?.score) ?? -1 : -1), { id: 'C', header: '교육 지향 C', cell: (c) => <AxisCell r={c.row.original} a="C" /> }),
    col.accessor((r) => r.years ?? -1, {
      id: 'years', header: '경력',
      cell: (c) => (c.getValue() < 0 ? <span className="text-warn text-xs">미제출</span> : <span className="tabular-nums">{c.getValue()}년</span>),
    }),
    col.accessor((r) => (r.regions ?? []).join('·'), { id: 'regions', header: '권역', cell: (c) => <span className="text-xs text-faint">{c.getValue() || '—'}</span> }),
  ]

  // ★표와 카드가 «다른 것»을 보이면 안 된다 — 상세를 한 곳에서 만들어 둘 다 쓴다.
  // ⛔모바일·데스크톱 양쪽에 렌더되므로 id 가 겹친다 — 접두사로 가른다.
  //   (CSS 로 숨긴 쪽도 DOM 에 남는다. 「안 보인다」와 「없다」는 다른 말이다.)
  const Detail = ({ r, ns }: { r: RankRow; ns: 'm' | 'd' }) => (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid gap-2 md:grid-cols-2">
        {r.axes.filter((a) => a.weight > 0).map((a) => (
          <div key={a.axis} className="rounded-md bg-surface px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{a.label ?? a.axis}</span>
              <span className="tabular-nums text-faint">
                {a.axis === 'C' && !r.cultureMeasured ? '측정 불가' : `${Math.round(a.score * 100)}점`}
                <span className="ml-1 text-xs text-faint">가중치 {a.weight}</span>
              </span>
            </div>
            {(a.reasons ?? []).map((why, i) => <p key={i} className="mt-1 text-xs text-faint">{why}</p>)}
          </div>
        ))}
      </div>
      {!r.cultureMeasured && (
        <p className="text-xs text-warn">교육 지향(C축)을 재지 못했습니다 — <strong>0점이 아니라 재지 않은 것</strong>입니다.</p>
      )}
      {r.blockers.length > 0 && <p className="text-xs text-rose-700">필수 요건 미충족 — {r.blockers.join(' · ')}</p>}
      {scope && targetId && r.eligible && !r.live && r.contactable ? (
        <form action={proposeEngagement} className="flex flex-wrap items-end gap-2 border-t pt-3">
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="scoreId" value={r.id} />
          <input type="hidden" name="instructorId" value={r.instructor_id} />
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="targetId" value={targetId} />
          <div>
            <Label className="block text-xs text-faint" htmlFor={`${ns}-fee-${r.id}`}>강사료</Label>
            <Input id={`${ns}-fee-${r.id}`} name="fee" type="number" min={0} placeholder={String(r.dayRate ?? '')} className="w-36" />
          </div>
          <div className="min-w-[16rem] flex-1">
            <Label className="block text-xs text-faint" htmlFor={`${ns}-basis-${r.id}`}>산식</Label>
            <Input id={`${ns}-basis-${r.id}`} name="feeBasis" placeholder="예시: 시간당 50만원 × 3시간 × 2회차" className="w-full" />
          </div>
          {/* ★배정 사유 — 1위가 아니면 «필수»다. 근거서가 그 자리를 비우면 발주사에게 「왜?」가 남는다.
              우리 규율이 「설명 없는 점수를 내지 않는다」인데, 사람의 판단에도 같은 규율을 건다. */}
          <input type="hidden" name="rank" value={r.rank} />
          <div className="w-full">
            <Label className="block text-xs text-faint" htmlFor={`${ns}-msg-${r.id}`}>
              배정 사유 {r.rank > 1 && <b className="text-rose-600">· 1순위가 아니므로 필수</b>}
            </Label>
            <Input id={`${ns}-msg-${r.id}`} name="message" required={r.rank > 1}
              placeholder={r.rank > 1 ? '예: 해당 업종 강의 이력이 많아 현장 사례가 풍부합니다' : '선택 — 근거서에 그대로 실립니다'}
              className="w-full" />
          </div>
          <button type="submit" className="min-h-[44px] rounded-md border px-3 py-2 text-sm font-semibold">위촉 제안</button>
        </form>
      ) : scope && r.eligible && !r.live && !r.contactable ? (
        <p className="text-xs text-faint">연락 불가로 표시된 강사입니다.</p>
      ) : null}
    </div>
  )

  return (
    <>
    {/* 모바일(<md) — ⛔표를 가로 스크롤로 축소하지 않는다(MTOS 표준 불변규칙 5).
        핵심 네 가지(순위·강사·매칭율·가장 낮은 축)만 보이고, 누르면 같은 상세가 펼쳐진다. */}
    <div className="flex flex-col gap-2 md:hidden">
      {rows.map((r) => (
        <details key={r.id} className="rounded-lg border bg-background">
          <summary className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="text-xs text-faint">{r.rank}위</span>
              <span className="ml-2 font-medium">{r.name}</span>
              {!r.eligible && <Badge tone="danger" className="ml-1">부적격</Badge>}
              {r.liveLabel && <Badge tone={r.liveTone ?? 'neutral'} className="ml-1">{r.liveLabel}</Badge>}
              <span className="mt-0.5 block truncate text-xs text-faint">
                {r.years != null ? `경력 ${r.years}년` : '경력 미제출'} · {(r.regions ?? []).join('·') || '권역 —'}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block tabular-nums text-base font-semibold">{r.percent}%</span>
              <span className="block text-xs text-faint">{r.headline?.split('·')[1]?.trim() ?? ''}</span>
            </span>
          </summary>
          <div className="border-t p-3"><Detail r={r} ns="m" /></div>
        </details>
      ))}
    </div>

    {/* 데스크톱(md+) — 공유 DataTable(TanStack) */}
    <div className="hidden md:block">
    <DataTable
      rows={rows}
      columns={columns as any}
      searchPlaceholder="강사명·권역 검색"
      searchFn={(r, q) => {
        const s = q.toLowerCase()
        return [r.name, r.title, (r.regions ?? []).join(' '), r.source].some((v) => (v || '').toLowerCase().includes(s))
      }}
      initialSort={[{ id: 'rank', desc: false }]}
      renderDetail={(r) => <Detail r={r} ns="d" />}
    />
    </div>
    </>
  )
}
