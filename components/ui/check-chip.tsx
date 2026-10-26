// 통제 어휘 다중 선택 — 체크박스를 «칩»으로 보이게 한다.
//
// ★왜 칩인가 — 강사 배정의 과정 주제는 통제 어휘가 40개가 넘는다. 네모 체크박스를 40개
//   나열하면 «목록»으로 읽혀 고른 것과 안 고른 것이 한눈에 갈리지 않는다[대표이사 지적 2026-10-22].
//   칩은 선택된 것이 면으로 떠올라 훑기만 해도 보인다.
//
// ★입력은 네이티브 checkbox 그대로다 — 숨기기만 하고 교체하지 않는다.
//   서버 액션 FormData 에 같은 name 으로 여러 값이 실리는 동작이 그대로 유지된다.
//   ⛔JS 상태로 바꾸지 않는다. 바꾸는 순간 서버 컴포넌트가 아니게 되고, 값 유실 경로가 생긴다.
//
// ★선택을 «색만으로» 알리지 않는다 — 체크 표시를 함께 둔다(솔라피 이식표 패턴 3).
import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CheckChip({
  name, value, defaultChecked, className,
}: {
  name: string
  value: string
  defaultChecked?: boolean
  className?: string
}) {
  return (
    <label
      className={cn(
        'group relative inline-flex cursor-pointer select-none items-center gap-1.5',
        'rounded-full border border-input bg-background px-3 py-1.5 text-sm',
        'transition-colors hover:bg-accent hover:text-accent-foreground',
        'has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-foreground',
        'has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring',
        className,
      )}
    >
      {/* ★sr-only 로 숨기지 않는다 — 뷰포트 밖으로 나가 프로그래밍 클릭이 닿지 않는다
          [matchguard 가 2026-10-22 에 잡았다]. 칩 전체를 덮는 투명 입력칸으로 둔다. */}
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none opacity-0"
      />
      <Check
        aria-hidden
        className="pointer-events-none h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition-opacity peer-checked:opacity-100"
      />
      <span className="pointer-events-none -ml-5 pl-5 peer-checked:font-medium">{value}</span>
    </label>
  )
}
