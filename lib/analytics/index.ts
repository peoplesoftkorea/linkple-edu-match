'use client'
// Amplitude 배선.
//
// 🔴**init 자체가 전송이다** — Amplitude 는 init 만으로 세션 이벤트를 보낸다.
//   track() 만 막는 게이트는 게이트가 아니다. 그래서 동의 분기를 «init 앞»에 둔다.
//   근거 = [[feedback-만드는것-자체가-전송일수있다]](사업 쪽에서 실측으로 확인된 함정).
//
// 🔴**검사기 트래픽을 분석에서 걸러야 한다** — 헤드리스는 매 실행이 새 익명 ID 라
//   돌릴수록 「신규 방문자」가 는다[[feedback-측정기가-측정대상을-오염시킨다]].
//   모든 이벤트에 is_bot 을 실어 3-2 분석에서 제외할 수 있게 한다.
import type { EventName } from './events'

let ready = false

function isBot(): boolean {
  if (typeof navigator === 'undefined') return true
  // Chrome headless·Playwright 는 webdriver 를 세운다. UA 에 HeadlessChrome 도 남는다.
  return Boolean((navigator as { webdriver?: boolean }).webdriver)
    || /HeadlessChrome|bot|crawler|spider/i.test(navigator.userAgent)
}

/** 동의가 «있을 때만» 부른다. 부르기 전에는 SDK 를 만들지도 않는다. */
export async function initAnalytics(): Promise<void> {
  if (ready || typeof window === 'undefined') return
  const key = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY
  if (!key) return                       // 키가 없으면 조용히 끈다(로컬·프리뷰)
  const amp = await import('@amplitude/analytics-browser')
  amp.init(key, { defaultTracking: { sessions: true, pageViews: false },
                  trackingOptions: { ipAddress: false } })
  ready = true
}

export async function track(name: EventName, props: Record<string, unknown> = {}): Promise<void> {
  if (!ready) return
  const amp = await import('@amplitude/analytics-browser')
  amp.track(name, { ...props, is_bot: isBot() })
}
