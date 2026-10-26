// 공개판 가격 «값» — 미러 전용. 형상은 정본과 같고 값만 예시다.
//
// ★왜 이 파일만 바꿔 끼우나: 정본 `rates.ts` 에는 과정별 기준 단가와 그것을 정한 근거
//   (시간당 강사 원가·초빙 강사료·목표 직접비율의 역산)가 들어 있다. 운영 주체의
//   가격 결정 근거이고, 제출 요건이 「수료 이후에도 공개 유지」라 한 번 나가면 되돌릴 수 없다.
// ★산식은 정본을 그대로 담는다 — `edu.ts`·`custom.ts` 가 이 파일을 읽는다.
//   그래서 단가 분석 «기능»은 공개본에서도 끝까지 돌고, 나가는 것은 숫자뿐이다.
// ⛔여기에 산식을 적지 않는다. 적는 순간 그것이 「제출용 복제」가 된다.
// ⛔이 값으로 견적을 내지 않는다. 시연용이다.

import type { VenueType } from './venue'

/** 장소 유형 계수 — 사내 출강을 1.00 으로 둔다. */
export const VENUE_FACTOR: Record<VenueType, number> = {
  onsite: 1,
  offsite: 1.1,
  online: 0.8,
};

/** 과정별 기준 단가(사내 출강 · 인당·시간당 · 부가세 별도) — 예시값. */
export const PROGRAM_RATE: Record<string, {
  rate: number; hours: number; sessions: number; outsourced: number; label: string;
}> = {
  "marketing-amp":  { rate: 50_000, hours: 30, sessions: 12, outsourced: 8, label: "12차수 · 회당 2.5시간 (총 30시간)" },
  "leader-lab":     { rate: 50_000, hours: 24, sessions: 8,  outsourced: 6, label: "8주 · 회당 3시간 (총 24시간)" },
};

/** 화면·문서가 쓰는 교육시간 표기. PROGRAM_RATE 에서 파생한다 — 두 곳에 적지 않는다. */
export const PROGRAM_HOURS: Record<string, { hours: number; sessions: number; label: string }> =
  Object.fromEntries(Object.entries(PROGRAM_RATE).map(([k, v]) =>
    [k, { hours: v.hours, sessions: v.sessions, label: v.label }]));

/** 최소 발주 인원. 이보다 적으면 견적을 내되 「개설 불가」를 함께 말한다. */
export const MIN_HEADCOUNT = 10;

/** 최소 «청구» 인원 — 발주 인원이 이보다 적어도 이 인원 기준으로 청구한다.
 *  강사료가 인원과 무관하게 고정이라 회차당 바닥을 깐다. */
export const MIN_BILLABLE = 15;

/** 인원 구간 할인 — 예시값. */
export const VOLUME_TIERS: { from: number; to: number | null; rate: number }[] = [
  { from: 1,  to: 19,   rate: 0 },
  { from: 20, to: 49,   rate: 0.05 },
  { from: 50, to: null, rate: 0.1 },
];

/** 출강 지역별 강사 이동비(회차당·원) — 예시값. 수도권은 받지 않는다. */
export const TRAVEL_FEE: Record<string, number> = {
  "수도권": 0,
  "충청·강원": 100_000,
  "영남": 100_000,
  "호남": 100_000,
  "제주": 100_000,
};

/** 초빙 강사료 — 회당(세션당) 예시값. */
export const INSTRUCTOR_FEE_PER_SESSION = 1_000_000;

/** 목표 직접비율 — 공급가 대비 강사 직접비. 예시값. */
export const TARGET_DIRECT_RATIO = 0.4;

/** 교보재·수료 운영비(인당) — 예시값. */
export const MATERIAL_COST_PER_HEAD = 20_000;
