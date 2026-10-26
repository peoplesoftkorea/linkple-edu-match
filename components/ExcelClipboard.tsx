'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Copy, ClipboardPaste, Check } from 'lucide-react'

// 엑셀 양방향 분자(대표님 지시 2026-10-12 「엑셀에서의 복사와 엑셀로의 붙여넣기」).
//
// ★왜 TSV 인가 — 엑셀·구글시트·넘버스의 «클립보드 공통 포맷»이 탭 구분 텍스트다.
//   셀 범위를 복사하면 TSV 가 클립보드에 담기고, TSV 를 붙여넣으면 셀로 흩어진다.
//   ⇒ 별도 라이브러리 없이 양방향이 된다(AG Grid Enterprise $999 없이 1차 요구 충족).
// ⛔줄바꿈이 든 셀(따옴표로 감싼 값)은 이 1차 구현이 다루지 않는다 — 출결·정산 같은
//   «짧은 값 격자»가 대상이다. 긴 텍스트 일괄 입력이 필요해지면 그때 파서를 올린다.

export type PasteRow = string[]

/** 표를 엑셀로 — 선택 없이 «보이는 격자 전체»를 TSV 로 클립보드에 올린다. */
export function CopyToExcel({ headers, rows, label = '엑셀로 복사' }: { headers: string[]; rows: PasteRow[]; label?: string }) {
  const [done, setDone] = useState(false)
  async function copy() {
    const tsv = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n')
    await navigator.clipboard.writeText(tsv)
    setDone(true); setTimeout(() => setDone(false), 2000)
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={label}>
      {done ? <Check /> : <Copy />}{done ? '복사됨 — 엑셀에 붙여넣으세요' : label}
    </Button>
  )
}

/** 엑셀에서 붙여넣기 — TSV 를 받아 «미리보기»를 보여 주고, 확인하면 적용한다.
 *  ⛔붙여넣자마자 저장하지 않는다. 엑셀 한 칸이 밀린 채로 들어오는 것이 가장 흔한 사고다. */
export function PasteFromExcel({
  headers, expectCols, onApply, hint,
}: {
  headers: string[]
  /** 기대 열 수 — 어긋나면 적용 버튼을 막는다(밀림 사고 차단). */
  expectCols: number
  onApply: (rows: PasteRow[]) => void
  hint?: string
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const rows = text.trim()
    ? text.trim().split(/\r?\n/).map((line) => line.split('\t').map((c) => c.trim()))
    : []
  const bad = rows.filter((r) => r.length !== expectCols).length
  const ready = rows.length > 0 && bad === 0

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ClipboardPaste />엑셀에서 붙여넣기
      </Button>
    )
  }
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
      <div>
        <p className="text-sm font-medium">엑셀에서 붙여넣기</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          엑셀에서 <strong>{headers.join(' · ')}</strong> 열을 선택해 복사한 뒤 아래 칸에 붙여넣으세요(머리글 제외).
          {hint && <span className="block mt-0.5">{hint}</span>}
        </p>
      </div>
      <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="여기에 ⌘V" className="font-mono text-xs" />
      {rows.length > 0 && (
        <div className="text-xs">
          <p className={bad ? 'text-destructive' : 'text-muted-foreground'}>
            {rows.length}행 인식 · {bad ? `🔴 열 수가 다른 행 ${bad}개 — 엑셀에서 ${expectCols}개 열만 복사했는지 확인하세요` : `열 ${expectCols}개 일치`}
          </p>
          <div className="mt-2 max-h-40 overflow-auto rounded border border-border bg-background">
            <table className="w-full text-xs">
              <thead><tr>{headers.map((h) => <th key={h} className="px-2 py-1 text-left font-medium text-muted-foreground border-b border-border">{h}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    {Array.from({ length: expectCols }).map((_, j) => <td key={j} className="px-2 py-1">{r[j] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 20 && <p className="text-muted-foreground mt-1">…외 {rows.length - 20}행</p>}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={!ready} onClick={() => { onApply(rows); setOpen(false); setText('') }}>
          {rows.length ? `${rows.length}행 적용` : '적용'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setText('') }}>닫기</Button>
      </div>
    </div>
  )
}
