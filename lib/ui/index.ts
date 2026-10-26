// 미러의 `@/lib/ui` 자리 — 배럴 하나. 로직은 없다.
//
// ★정본 `packages/ui` 는 전사 공용 디자인 시스템이라 이 제품이 쓰지 않는 표면까지 들고 온다.
//   미러가 실제로 쓰는 것은 둘뿐이다 — 저장 안 된 변경 경고 훅과 법인 식별 한 줄.
// ⛔여기에 컴포넌트를 «새로» 적지 않는다. 필요하면 정본을 매니페스트에 등재한다.

export { useUnsavedGuard } from './useUnsavedGuard'
export { CorpLine } from './CorpLine'
