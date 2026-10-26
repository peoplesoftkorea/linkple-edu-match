'use client'
import { useState, Fragment } from 'react'
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel,
  flexRender, type SortingState, type ColumnDef,
} from '@tanstack/react-table'

// 범용 데이터그리드 — TanStack Table(headless) 래핑. 컬럼 헤더 클릭 정렬·전역검색·페이지네이션·행 상세.
// 목록 화면(회원·리드·구독·주문 등)이 columns 정의만으로 일관되게 재사용한다(그라운드룰: 비차별화=채택).
export function DataTable<T extends { id: string }>({
  rows, columns, searchFn, searchPlaceholder = '검색', renderDetail, initialSort, rightControls,
}: {
  rows: T[]
  columns: ColumnDef<T, any>[]
  searchFn?: (row: T, q: string) => boolean
  searchPlaceholder?: string
  renderDetail?: (row: T) => React.ReactNode
  initialSort?: SortingState
  rightControls?: React.ReactNode
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSort || [])
  const [globalFilter, setGlobalFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const cols: ColumnDef<T, any>[] = renderDetail
    ? [...columns, { id: '__detail', header: '', enableSorting: false, cell: ({ row }) => {
        const id = row.original.id
        return (
          <button type="button"
            className={expanded === id ? 'px-2.5 py-1.5 rounded-lg text-[13px] font-semibold border border-line bg-card text-faint'
              : 'px-2.5 py-1.5 rounded-lg text-[13px] font-semibold bg-[#147B58] text-white hover:bg-[#0F6347]'}
            onClick={() => setExpanded(expanded === id ? null : id)}>{expanded === id ? '닫기' : '상세'}</button>
        )
      } }]
    : columns

  const table = useReactTable({
    data: rows, columns: cols,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: searchFn ? (row, _c, v) => searchFn(row.original, String(v)) : 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  })

  const total = table.getFilteredRowModel().rows.length
  const pageRows = table.getRowModel().rows
  const btn = 'px-2.5 py-1.5 rounded-lg text-[13px] font-semibold border border-line bg-card text-faint hover:bg-surface disabled:opacity-50'

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder}
          className="text-sm rounded-lg border border-line bg-card px-3 py-2 text-slate min-w-[240px]" />
        {rightControls}
        <span className="text-sm text-faint ml-auto">{total}건</span>
      </div>

      <div className="bg-card border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-line bg-surface/60">
                  {hg.headers.map((h) => {
                    const sortable = h.column.getCanSort()
                    const dir = h.column.getIsSorted()
                    return (
                      <th key={h.id} className={`text-left px-3 py-2.5 text-xs font-semibold text-faint whitespace-nowrap ${sortable ? 'cursor-pointer select-none hover:text-ink' : ''}`}
                        onClick={sortable ? h.column.getToggleSortingHandler() : undefined}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sortable && <span className="ml-1 text-faint">{dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '↕'}</span>}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-faint">조건에 맞는 항목이 없습니다.</td></tr>
              ) : pageRows.map((row) => (
                <Fragment key={row.original.id}>
                  <tr className="border-b border-line hover:bg-surface/40">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 align-middle">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                  {renderDetail && expanded === row.original.id && (
                    <tr><td colSpan={cols.length} className="px-3 pb-4 bg-surface/60"><div className="rounded-lg p-4">{renderDetail(row.original)}</div></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="flex items-center justify-between px-3 py-2.5 border-t border-line text-sm text-faint">
            <span>{table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–{Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, total)} / {total}</span>
            <div className="flex items-center gap-2">
              <button type="button" className={btn} disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>← 이전</button>
              <span className="text-xs">{table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span>
              <button type="button" className={btn} disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>다음</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
