import * as React from 'react'
import { cn } from '@/lib/utils'

// shadcn/ui Table — 복사해 «우리 코드»로 소유한다(대표님 결정 2026-09-13).
// ⛔@tremor/react 의 Table 을 대체한다. tremor 는 2025-01 이후 20개월 정지 상태다[gh api 실측].
// ★가로 스크롤은 «표가 아니라 감싸는 div» 가 책임진다 — 대표님 지적(매칭 관제 표 잘림)의 원인이
//   tremor 표가 아니라 바깥 Card 가 넘침을 감춘 것이었다. 여기서는 래퍼가 항상 스크롤을 준다.

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-[13px]', className)} {...props} />
    </div>
  ),
)
Table.displayName = 'Table'

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('[&_tr]:border-b bg-muted/40', className)} {...props} />,
)
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />,
)
TableBody.displayName = 'TableBody'

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('border-b border-line transition-colors hover:bg-muted/50', className)} {...props} />
  ),
)
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn('px-3 py-2.5 text-left align-middle text-xs font-semibold text-muted-foreground whitespace-nowrap', className)} {...props} />
  ),
)
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn('px-3 py-2.5 align-middle', className)} {...props} />,
)
TableCell.displayName = 'TableCell'

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
