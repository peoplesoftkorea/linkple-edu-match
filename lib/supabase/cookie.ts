// 운영자존 쿠키 규격 (품의 2026-008, 2026-07-27) — server/browser/middleware 3곳이 공유하는 SSOT.
// - 쿠키명 sb-admin: 회원존(sb-linkple)과 이름을 분리 — 회원존 부모도메인 쿠키가
//   admin 호스트에 전송되더라도 admin 클라이언트는 sb-admin만 읽으므로 병합이 성립하지 않는다.
// - ★domain은 절대 설정하지 않는다(host-only 고정) — 감사 L1(운영자↔회원 세션 병합 차단).
//   운영자 세션이 회원 앱으로 전파되는 경로를 원천 차단한다.
export const adminCookieOptions = {
  name: 'sb-admin',
}
