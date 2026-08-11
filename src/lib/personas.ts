/**
 * 페르소나 원문 정제 (순수 함수).
 *
 * PRD F-2: 페르소나 문서는 대표님이 고치는 글이 원본이다. 코드에 대본을 복사해 두지 않는다.
 * 글을 어디서 읽어 오는지는 `lib/prompts/persona.ts` 가 맡는다
 * (파일 = 공장 초기값, 관리자 페이지에서 고친 값이 있으면 그쪽).
 *
 * 다만 원본 문서는 1.0 시절 규칙("매 응답 시작 시 <img src=...> 를 넣어라")을 담고 있는데,
 * 2.0의 아키텍처 원칙 3(감정 이름만 고르고 이미지는 화면이 렌더링)과 충돌한다.
 * 그래서 읽어 온 뒤 이미지 관련 지시만 걷어내고(sanitize), 대신 2.0 방식의
 * 감정 선택 규칙을 프롬프트 조립 단계(prompt.ts)에서 붙인다.
 *
 * 이 파일은 서버 전용 코드를 들이지 않는다 — 회귀 테스트가 그대로 불러 쓰기 때문이다.
 */

/**
 * 이미지 지시문 제거.
 * 1) <img ...> 또는 이미지 원본 주소가 들어간 줄은 통째로 버린다.
 * 2) "감정 이미지" 섹션은 다음 제목(#)이나 구분선(---)을 만날 때까지 통째로 버린다.
 * 3) "매 응답 시 이미지를 포함한다" 류의 지시 줄을 버린다.
 */
export function sanitizePersona(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const kept: string[] = [];
  let skippingImageSection = false;

  for (const line of lines) {
    const isHeading = /^#{1,6}\s/.test(line);
    const isDivider = /^\s*---+\s*$/.test(line);

    if (skippingImageSection) {
      // 다음 제목이나 구분선을 만나면 섹션 종료
      if (isHeading || isDivider) {
        skippingImageSection = false;
        // 구분선 자체는 버리고, 제목은 살린다
        if (isHeading) kept.push(line);
        continue;
      }
      continue;
    }

    if (isHeading && /감정\s*이미지/.test(line)) {
      skippingImageSection = true;
      continue;
    }

    if (/<img\b/i.test(line) || /raw\.githubusercontent\.com/i.test(line)) continue;
    if (/이미지를?\s*(반드시\s*)?(1개\s*)?포함한다/.test(line)) continue;
    if (/이미지\s*기입으로\s*시작한다/.test(line)) continue;
    if (/^\s*[-*]?\s*형식\s*:/.test(line)) continue;
    if (/^\s*경로\s*:/.test(line)) continue;

    kept.push(line);
  }

  // 연속 빈 줄 정리
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

