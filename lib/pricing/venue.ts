// 실시 장소 — 타입과 표기. 값(계수)은 `rates.ts` 가 쥔다.
//
// ★왜 따로인가: `rates.ts` 가 `VenueType` 을 쓰고 `edu.ts` 가 `rates.ts` 를 쓰므로,
//   타입이 `edu.ts` 에 있으면 순환이 된다. 타입과 라벨만 가장 아래 층에 둔다.

export type VenueType = "onsite" | "offsite" | "online";

export const VENUE_LABEL: Record<VenueType, string> = {
  onsite: "사내 출강 (발주사 회의실)",
  offsite: "외부 강의장 (당사 섭외)",
  online: "온라인 실시간",
};
