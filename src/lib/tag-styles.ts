/**
 * 태그 색·아이콘 — 1.0의 `src/utils/tag-styles.ts` 를 그대로 이식.
 *
 * 학생이 1.0에서 보던 색과 챗봇에서 보는 색이 달라지면 같은 자료로 보이지 않는다.
 * 색값(HEX)은 1.0과 한 글자도 다르지 않게 유지할 것 — 여기서 색을 "예쁘게" 고치면
 * 두 서비스가 따로 놀기 시작한다.
 *
 * 1.0은 아이콘 이름 문자열을 받아 lucide 묶음에서 통째로 찾아 쓰지만,
 * 여기서는 실제로 쓰는 아이콘만 명시적으로 들여온다 — 묶음 전체를 가져오면 번들이 커지고,
 * 없는 이름이 들어와도 조용히 빈자리가 되어 알아채기 어렵다.
 */

import {
  AlertTriangle,
  ArrowRightLeft,
  Car,
  Circle,
  CloudOff,
  Combine,
  FlipHorizontal2,
  Folder,
  Frown,
  GraduationCap,
  HeartHandshake,
  Home,
  Lightbulb,
  MoreHorizontal,
  Replace,
  Scaling,
  Settings2,
  ShieldAlert,
  Trash2,
  Trees,
  type LucideIcon,
} from "lucide-react";

/**
 * 문제유형 칩 — 테두리 + 옅은 배경 + 진한 글자.
 * DB 값이 자유 문자열이라 정확히 일치시키지 않고 낱말 포함으로 판정한다(1.0과 동일).
 */
export function problemColorClass(tagName = ""): string {
  const name = tagName.trim();

  if (name.includes("환경")) return "border-[#4ADE80] bg-[#4ADE80]/10 text-[#15803D]";
  if (name.includes("안전")) return "border-[#F87171] bg-[#F87171]/10 text-[#B91C1C]";
  if (name.includes("편리") || name.includes("편의"))
    return "border-[#FBBF24] bg-[#FBBF24]/10 text-[#92400E]";
  if (name.includes("경제") || name.includes("에너지"))
    return "border-[#60A5FA] bg-[#60A5FA]/10 text-[#1D4ED8]";
  if (name.includes("성능")) return "border-[#8B5CF6] bg-[#8B5CF6]/10 text-[#5B21B6]";

  return "border-[#9CA3AF] bg-[#9CA3AF]/10 text-[#4B5563]";
}

/** SCAMPER 칩 — 7가지 기법을 빨·주·노·초·파·남·보 순서로 (1.0과 동일) */
export function scamperColorClass(tagName = ""): string {
  const name = tagName.trim();

  if (name.includes("대체")) return "bg-[#FECACA] text-[#7F1D1D]";
  if (name.includes("결합")) return "bg-[#FED7AA] text-[#7C2D12]";
  if (name.includes("응용") || name.includes("적용")) return "bg-[#FEF3C7] text-[#78350F]";
  if (name.includes("변형") || name.includes("확대") || name.includes("축소"))
    return "bg-[#D1FAE5] text-[#064E3B]";
  if (
    name.includes("다르게") ||
    name.includes("활용") ||
    name.includes("용도") ||
    name.includes("변경")
  )
    return "bg-[#BFDBFE] text-[#1E3A8A]";
  if (name.includes("제거")) return "bg-[#C7D2FE] text-[#312E81]";
  if (
    name.includes("뒤집") ||
    name.includes("반전") ||
    name.includes("재배열") ||
    name.includes("거꾸로")
  )
    return "bg-[#DDD6FE] text-[#4C1D95]";

  return "bg-neutral-100 text-neutral-800";
}

/** 분야(카테고리) 칩 — 6종 */
export function categoryColorClass(tagName = ""): string {
  const name = tagName.trim();

  if (name.includes("안전")) return "border-[#EF4444] bg-[#EF4444]/10 text-[#B91C1C]";
  if (name.includes("복지")) return "border-[#EC4899] bg-[#EC4899]/10 text-[#BE185D]";
  if (name.includes("교통")) return "border-[#F97316] bg-[#F97316]/10 text-[#C2410C]";
  if (name.includes("교육")) return "border-[#3B82F6] bg-[#3B82F6]/10 text-[#1D4ED8]";
  if (name.includes("환경")) return "border-[#22C55E] bg-[#22C55E]/10 text-[#15803D]";
  if (name.includes("생활")) return "border-[#8B5CF6] bg-[#8B5CF6]/10 text-[#5B21B6]";

  return "border-[#9CA3AF] bg-[#9CA3AF]/10 text-[#4B5563]";
}

/** 문제유형 아이콘 — 6종 */
export function problemIcon(tagName = ""): LucideIcon {
  const name = tagName.trim();
  if (name.includes("안전")) return AlertTriangle;
  if (name.includes("환경")) return CloudOff;
  if (name.includes("경제")) return Trash2;
  if (name.includes("편의") || name.includes("편리")) return Frown;
  if (name.includes("성능")) return Settings2;
  return MoreHorizontal;
}

/** SCAMPER 아이콘 — 7종 */
export function scamperIcon(tagName = ""): LucideIcon {
  const name = tagName.trim();
  if (name.includes("대체")) return Replace;
  if (name.includes("결합")) return Combine;
  if (name.includes("응용") || name.includes("적용")) return Lightbulb;
  if (name.includes("변형")) return Scaling;
  if (name.includes("용도") || name.includes("활용")) return ArrowRightLeft;
  if (name.includes("제거")) return Trash2;
  if (name.includes("거꾸로") || name.includes("뒤집")) return FlipHorizontal2;
  return Circle;
}

/** 분야 아이콘 — 6종 */
export function categoryIcon(tagName = ""): LucideIcon {
  const name = tagName.trim();
  if (name.includes("안전")) return ShieldAlert;
  if (name.includes("복지")) return HeartHandshake;
  if (name.includes("교통")) return Car;
  if (name.includes("교육")) return GraduationCap;
  if (name.includes("환경")) return Trees;
  if (name.includes("생활")) return Home;
  return Folder;
}

/**
 * 1.0에서 걸러 내는 문제유형 값 — 화면에 칩으로 띄우지 않는다.
 * (자료 정리 과정에서 남은 값들이라 학생에게 보여 줄 분류가 아니다)
 */
export function isValidProblemTag(tagName = ""): boolean {
  const name = tagName.trim();
  if (!name || name === "-") return false;
  return !(name.includes("복지") || name.includes("사회") || name.includes("건강"));
}

/** SDG(ESG 과제) 아이콘 — 통계청 공식 한글 아이콘 주소 */
export function sdgIconUrl(sdgNumber: number): string {
  if (sdgNumber >= 1 && sdgNumber <= 17) {
    return `https://www.index.go.kr/potal/sdg/images/main/ko/${sdgNumber}.png`;
  }
  return "";
}
