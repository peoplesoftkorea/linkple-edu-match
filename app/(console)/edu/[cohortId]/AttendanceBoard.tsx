'use client'
import { useState, useTransition } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { CopyToExcel, PasteFromExcel } from '@/components/ExcelClipboard'

// 출결 입력 — 엑셀 양방향(대표님 지시 2026-10-12).
//   현장 운영자는 출석부를 엑셀로 들고 다닌다. 한 명씩 라디오를 누르게 하면 50명 기수에서 50번을 누른다.
//   ⇒ 엑셀에서 「이름·출결」 두 열을 복사해 붙여넣으면 일괄 반영되고, 반대로 현재 표를 엑셀로 내보낸다.
// ⛔붙여넣기가 곧 저장은 아니다 — 표에 «채우기»만 하고, 저장은 기존 「출결 저장」이 한다(되돌릴 여지).

export type Enrollee = { id: string; name: string; email: string; status: string }
const ATT = [
  { v: 'present', label: '출석' },
  { v: 'late', label: '지각' },
  { v: 'excused', label: '공결' },
  { v: 'absent', label: '결석' },
  { v: 'none', label: '미입력' },
]
const LABEL_TO_V = new Map(ATT.map((o) => [o.label, o.v]))

export function AttendanceBoard({ rows, action }: { rows: Enrollee[]; action: (fd: FormData) => Promise<void> }) {
  const [state, setState] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.status])))
  const [pasted, setPasted] = useState<{ hit: number; miss: string[] } | null>(null)
  const [pending, start] = useTransition()

  // 엑셀 → 표: 이름으로 맞춘다(이메일이 있으면 이메일 우선 — 동명이인 방어).
  function apply(tsv: string[][]) {
    const next = { ...state }
    let hit = 0; const miss: string[] = []
    for (const [key, val] of tsv) {
      const v = LABEL_TO_V.get(val) ?? (ATT.some((o) => o.v === val) ? val : null)
      const row = rows.find((r) => r.email === key) ?? rows.find((r) => r.name === key)
      if (!row || !v) { miss.push(key); continue }
      next[row.id] = v; hit++
    }
    setState(next); setPasted({ hit, miss })
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData()
    for (const r of rows) fd.set(`att:${r.id}`, state[r.id] ?? 'none')
    start(() => { void action(fd) })
  }

  return (
    <form onSubmit={submit}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <CopyToExcel
          headers={['수강생', '이메일', '출결']}
          rows={rows.map((r) => [r.name, r.email, ATT.find((o) => o.v === (state[r.id] ?? 'none'))!.label])}
        />
        <PasteFromExcel
          headers={['이름 또는 이메일', '출결']}
          expectCols={2}
          hint="출결은 출석·지각·공결·결석·미입력 중 하나로 적습니다."
          onApply={apply}
        />
        {pasted && (
          <span role="status" className="text-xs text-muted-foreground">
            {pasted.hit}명 반영{pasted.miss.length > 0 && <strong className="text-destructive"> · 못 찾은 {pasted.miss.length}건: {pasted.miss.slice(0, 3).join(', ')}{pasted.miss.length > 3 ? '…' : ''}</strong>}
          </span>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow><TableHead>수강생</TableHead><TableHead>출결</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => (
            <TableRow key={e.id}>
              <TableCell>
                <div className="font-medium">{e.name}</div>
                <div className="text-xs text-muted-foreground">{e.email}</div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-3">
                  {ATT.map((o) => (
                    <label key={o.v} className="text-xs flex items-center gap-1 cursor-pointer">
                      <input type="radio" name={`att:${e.id}`} value={o.v}
                        checked={(state[e.id] ?? 'none') === o.v}
                        onChange={() => setState({ ...state, [e.id]: o.v })}
                        className="size-3.5 accent-[hsl(var(--primary))]" />
                      {o.label}
                    </label>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center gap-3 mt-4">
        <Button type="submit" disabled={pending}>{pending ? '저장 중' : '출결 저장'}</Button>
        <span className="text-xs text-muted-foreground">
          「미입력」은 결석이 아니라 <strong>기록 없음</strong>입니다 — 고르면 기존 기록을 지웁니다.
        </span>
      </div>
    </form>
  )
}
