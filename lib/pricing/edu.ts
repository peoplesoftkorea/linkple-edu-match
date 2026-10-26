// 기업 단체·사내 교육 단가 — 승인 금액의 유일한 출처(기업 축).
//
// ★개인 수강료(programs.ts price)와 «다른 값»이다 [대표님 2026-10-02 B2B 전환].
//   ⛔한 값을 옮겨 적지 않는다. 옮기는 순간 20명 발주가 개인가 × 20 이 되어 아무도 안 산다.
//
// ★산식을 «사람 말»로 함께 돌려준다(priceBasis) — 담당자가 품의서에 그대로 붙인다.
//   금액만 주면 담당자는 그 숫자를 설명하지 못하고, 설명 못 하는 숫자는 상신되지 않는다.
//
// ★2026-10-26 — **값은 `rates.ts` 가 쥔다.** 이 파일은 산식과 문안만 둔다.
//   판가는 계속 바뀌는데 값과 산식이 섞여 있으면 개정 이력을 두 축으로 읽어야 하고,
//   제출용 공개 미러에 산식을 담을 때 값까지 딸려 나간다. 호출부는 바뀌지 않는다 —
//   여기서 그대로 다시 내보낸다.

export type { VenueType } from './venue'
export { VENUE_LABEL } from './venue'
export {
  VENUE_FACTOR, PROGRAM_RATE, PROGRAM_HOURS,
  MIN_HEADCOUNT, MIN_BILLABLE, VOLUME_TIERS, TRAVEL_FEE,
} from './rates'

import type { VenueType } from './venue'
import { VENUE_LABEL } from './venue'
import {
  VENUE_FACTOR, PROGRAM_RATE, VOLUME_TIERS,
  MIN_HEADCOUNT, MIN_BILLABLE, TRAVEL_FEE,
} from './rates'

/** 과정·장소별 적용 요율. 천 원 단위로 끊는다 — 품의서에 소수점이 들어가면 반려된다. */
export function hourlyRate(programSlug: string, venue: VenueType): number {
  const base = PROGRAM_RATE[programSlug]?.rate ?? 0;
  return Math.round(base * VENUE_FACTOR[venue] / 1000) * 1000;
}

export const VAT_RATE = 0.1;

/** 견적 유효기간(일). 단가표가 바뀌어도 이 기간 안에는 그 값을 지킨다. */
export const QUOTE_VALID_DAYS = 30;

/** ★계약 급부 문언 — 파는 것은 «과정의 실시와 완성»이지 「강사 ○명」이 아니다. */
export const CONTRACT_SUBJECT =
  "당사는 본 과정의 실시와 수료 판정까지를 완성할 책임을 집니다. 커리큘럼 구성과 강사 배정은 당사가 정하며, 발주사와 강사 사이에는 계약이 성립하지 않습니다.";

/** 포함·불포함 — 품의서가 반드시 묻는 칸이다. 비워 두면 담당자가 되묻는다. */
export const INCLUDED = [
  "강의료 · 강사 섭외 · 커리큘럼 설계",
  "교보재(인쇄물 · 워크시트) 인원수만큼",
  "출결 기록과 수료 판정 · 디지털 수료증 발급(검증 주소 포함)",
  "발주사 담당자용 수강 현황 조회",
  "수료 90일 후 성과 재확인 1회",
];
export const NOT_INCLUDED = [
  "식음료 · 다과 (사내 출강 시 발주사 부담)",
  "수강생 교통·숙박비",
  "사내 출강 시 강의 장소와 기자재 (발주사 제공)",
  "별도 요청한 맞춤 콘텐츠 제작비",
];

/** 결제 조건 — 담당자가 재무팀에 그대로 전달한다. */
export const PAYMENT_TERMS = [
  "계약 체결 후 세금계산서를 발행하며, 발행일로부터 30일 이내 지급을 원칙으로 합니다.",
  "분할 청구(착수 50% · 종료 50%)가 필요하시면 발주 시 말씀해 주십시오.",
  "교육 개시 전 취소는 전액, 개시 후 취소는 잔여 회차분을 환급합니다.",
  "계약 금액은 과정 총액 단일 항목으로 체결합니다. 아래 단가표는 그 금액의 산출 근거입니다.",
];

/** ★고지해야 하는 사실 — 묻기 전에 먼저 적는다 [CLO 판정 2026-10-04 §6-3)].
 *  법인 설립이 2026-08-18 이라 지정직업훈련시설 요건(교육훈련 실시 경력 1년 이상)을 2027-08 이전에는 채우지 못한다.
 *  ⛔「환급 가능」을 말하면 민사 기망이 된다. 담당자가 환급을 전제하고 품의를 올리면 그 손해는 상대가 본다. */
export const NOT_SUBSIDIZED =
  "본 과정은 고용보험 환급과정(사업주 직업능력개발훈련)이 아닙니다. 환급을 전제로 예산을 세우지 마십시오.";

export function tierOf(headcount: number) {
  return VOLUME_TIERS.find((t) => headcount >= t.from && (t.to === null || headcount <= t.to)) ?? VOLUME_TIERS[0];
}

export type QuoteInput = {
  programSlug: string;
  headcount: number;
  venueType: VenueType;
  region?: string;
};

export type Quote = {
  ok: boolean;
  reason?: string;
  programSlug: string;
  hours: number;
  sessions: number;
  hoursLabel: string;
  venueType: VenueType;
  hourlyRate: number;
  unitPrice: number;       // 1인 단가(할인 전·VAT 별도)
  headcount: number;
  billable: number;        // 실제 청구 인원(최소 청구 인원이 바닥)
  discountRate: number;
  discountAmount: number;
  travelFee: number;       // 총 이동비(회차 × 지역단가)
  subtotal: number;        // 공급가액
  vat: number;
  total: number;
  perPerson: number;       // 할인 반영 1인 실단가(VAT 포함)
  priceBasis: string;      // 품의서에 붙일 산식 한 줄
  belowMinimum: boolean;
  minBilled: boolean;      // 최소 청구 인원이 적용됐는가
};

/** ★원 단위 절사. 품의서에 소수점이 들어가면 그 자리에서 반려된다. */
const won = (n: number) => Math.round(n);
/** ★청구액은 «만원 단위로 올린다» [대표님 확정 2026-10-09].
 *  할인율·이동비가 붙으면 원 단위 끝자리가 남는데, 품의서에 올라가는 숫자는 떨어져야 한다.
 *  ⛔내림이 아니라 올림이다 — 깎는 쪽으로 반올림하면 그만큼이 매번 새어 나간다. */
const CEIL_UNIT = 10_000;
const ceilMan = (n: number) => Math.ceil(n / CEIL_UNIT) * CEIL_UNIT;

export function quote(input: QuoteInput): Quote {
  const meta = PROGRAM_RATE[input.programSlug];
  const base = {
    ok: false, programSlug: input.programSlug, hours: 0, sessions: 0, hoursLabel: "",
    venueType: input.venueType, hourlyRate: 0, unitPrice: 0, headcount: input.headcount,
    billable: 0, discountRate: 0, discountAmount: 0, travelFee: 0, subtotal: 0, vat: 0, total: 0,
    perPerson: 0, priceBasis: "", belowMinimum: false, minBilled: false,
  };
  if (!meta) return { ...base, reason: "단체 발주 단가가 공개된 과정이 아닙니다. 문의를 남겨 주시면 개별 산정해 드립니다." };
  if (!Number.isFinite(input.headcount) || input.headcount < 1) {
    return { ...base, reason: "교육 인원을 1명 이상 적어 주십시오." };
  }

  const rate = hourlyRate(input.programSlug, input.venueType);
  const unitPrice = won(rate * meta.hours);
  // ★청구는 «최소 청구 인원»을 바닥으로 한다 — 강사료가 인원과 무관하게 고정이기 때문이다.
  const billable = Math.max(input.headcount, MIN_BILLABLE);
  // 할인은 «실제 인원»으로 본다 — 규모에 대한 대가이지 청구 기준이 아니다.
  const tier = tierOf(input.headcount);
  const gross = unitPrice * billable;
  const discountAmount = won(gross * tier.rate);
  const perTrip = input.venueType === "onsite" ? (TRAVEL_FEE[input.region ?? "수도권"] ?? 0) : 0;
  const travelFee = won(perTrip * meta.sessions);
  const subtotal = ceilMan(gross - discountAmount + travelFee);
  const vat = won(subtotal * VAT_RATE);
  const total = subtotal + vat;
  const minBilled = billable > input.headcount;

  const parts = [
    `${VENUE_LABEL[input.venueType]} 기준 인당·시간당 ${rate.toLocaleString()}원 × ${meta.hours}시간 = 인당 ${unitPrice.toLocaleString()}원`,
    minBilled
      ? `× 최소 청구 ${billable}명 = ${gross.toLocaleString()}원 (발주 ${input.headcount}명 · 강사료가 인원과 무관하게 고정이라 ${MIN_BILLABLE}명분을 청구합니다)`
      : `× ${billable}명 = ${gross.toLocaleString()}원`,
  ];
  if (tier.rate > 0) parts.push(`인원 할인 ${Math.round(tier.rate * 100)}% (−${discountAmount.toLocaleString()}원)`);
  if (travelFee > 0) parts.push(`강사 이동비 ${perTrip.toLocaleString()}원 × ${meta.sessions}회차 = ${travelFee.toLocaleString()}원`);
  parts.push(`공급가액 ${subtotal.toLocaleString()}원(만원 단위 절상) + 부가세 ${vat.toLocaleString()}원 = 합계 ${total.toLocaleString()}원`);

  return {
    ok: true, programSlug: input.programSlug, hours: meta.hours, sessions: meta.sessions,
    hoursLabel: meta.label, venueType: input.venueType, hourlyRate: rate, unitPrice,
    headcount: input.headcount, billable, discountRate: tier.rate, discountAmount, travelFee,
    subtotal, vat, total, perPerson: won(total / input.headcount),
    priceBasis: parts.join(" · "),
    belowMinimum: input.headcount < MIN_HEADCOUNT, minBilled,
  };
}

/** 발주번호 — 추측 가능한 연번을 쓰지 않는다(남의 발주가 열린다).
 *  ⛔서버 시각(UTC)을 그대로 쓰지 않는다 — 한국 오전에 발급한 번호에 «어제 날짜»가 박힌다[실측 2026-10-04].
 *    담당자가 품의서에 붙이는 번호라서, 날짜가 하루 어긋나면 그 자리에서 의심을 산다. */
export function makeOrderNo(now: Date, rand: string): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `EDU-${y}${m}${d}-${rand.toUpperCase()}`;
}
