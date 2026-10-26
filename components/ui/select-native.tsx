// 네이티브 select 를 디자인 시스템 토큰으로 감싼 원자.
//
// ★왜 Radix Select(@/components/ui/select) 를 쓰지 않는가 — 두 가지가 다르기 때문이다.
//   1) 이 화면(강사 배정)은 서버 컴포넌트 + 서버 액션 폼이다. Radix Select 는 숨은 네이티브
//      select 를 만들어 값을 싣지만, 그 보장을 화면마다 다시 재야 한다. 값이 조용히 비면
//      폼이 «성공처럼» 제출되고 조건 하나가 사라진다 — 가장 늦게 발견되는 결함이다.
//   2) 운영자가 조건을 빠르게 채우는 화면이라 키보드 타이핑 선택이 빠르다.
//   ⇒ Radix Select 는 단계형 폼(/edu/pricing 의 PricingForm)에서 계속 쓴다. 둘은 용도가 다르다.
//
// ⛔이 원자를 쓰면서 className 으로 테두리·배경을 다시 칠하지 않는다 — 그러면 화면마다 규칙이
//   달라지고, 그 불일치가 곧 「기계가 만든 티」다.
import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export const SelectNative = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'flex h-9 w-full appearance-none rounded-md border border-input bg-transparent',
        'px-3 py-1 pr-8 text-sm shadow-sm transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        '[&>option]:bg-background [&>option]:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
    />
  </div>
))
SelectNative.displayName = 'SelectNative'
