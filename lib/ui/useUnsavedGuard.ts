'use client'
import { useEffect } from 'react'

// 미저장 이탈 경고 — RecordForm 셸이 쓰던 규칙을 «훅»으로 떼어낸다(2026-10-12).
//   ★왜 떼는가 — 어떤 화면은 셸 없이 폼만 쓴다(서버액션이 redirect 로 답하는 admin 류).
//     그 화면이 이 보호만 받고 싶을 때 셸 전체를 끌어오면 액션까지 다시 써야 한다(= 위험).
//   ⛔변경이 있을 때만 건다. 아무것도 안 고치고 나가는 사람까지 붙잡으면 경고가 소음이 되고,
//     소음이 된 경고는 정작 필요할 때 읽히지 않는다.
export function useUnsavedGuard(dirty: boolean, busy = false) {
  useEffect(() => {
    if (!dirty || busy) return
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty, busy])
}
