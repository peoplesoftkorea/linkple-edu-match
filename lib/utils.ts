import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn/ui 규약 유틸 — 클래스 병합. 복사한 컴포넌트가 전부 이것을 쓴다.
// ★tailwind-merge 는 이미 트리에 있다(tremor 의존) — 새 설치가 아니다.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
