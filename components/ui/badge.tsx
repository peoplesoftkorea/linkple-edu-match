import * as React from 'react'
import { cn } from '@/lib/utils'

// shadcn/ui Badge — tremor Badge 대체. 색은 «의미»로만 가른다(장식 금지).
const TONE = {
  default: 'bg-primary/10 text-primary border-primary/20',
  // ⛔bg-muted 위에 text-faint 는 «보조색 위 보조색»이라 4.34 로 모자랐다[실측 2026-10-13].
  neutral: 'bg-muted text-slate border-line',
  warning: 'bg-warn-bg text-warn border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
} as const

export function Badge({ tone = 'default', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONE }) {
  return <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', TONE[tone], className)} {...props} />
}
