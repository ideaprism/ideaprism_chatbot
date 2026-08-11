/**
 * 한 말풍선을 "감정이 바뀐 자리"에서 토막 낸다 (순수 함수).
 *
 * 아키텍처 원칙 3의 연장선이다. AI는 [감정:이름] 표식만 찍고, 그 표식이 글의
 * 어디에서 나왔는지는 프로그램이 기억한다(EmotionMark). 화면은 토막마다 다른
 * 그림을 붙일 뿐이다. 그림을 몇 장 쓸지도 AI가 정하지 않는다.
 *
 * 서버 전용 코드를 들이지 않는다 — 회귀 테스트가 그대로 불러 쓴다.
 */

/** 말풍선 안에서 감정이 바뀐 자리 */
export interface EmotionMark {
  /** 이 감정이 시작되는 글자 위치 (말풍선 본문 기준) */
  at: number;
  emotion: string;
}

/** 그림 한 장과, 그 그림이 맡는 대사 */
export interface EmotionSegment {
  emotion: string;
  text: string;
}

/**
 * 표식 위치를 기준으로 본문을 토막 낸다.
 *
 * 첫 표식보다 앞선 글자는 fallbackEmotion 이 맡는다 (AI가 태그 없이 말을 시작한 경우).
 * 글자가 하나도 없는 토막은 버리되, 전부 비면 그림 한 장은 남긴다
 * (스트리밍 초반 "생각하는 중…" 말풍선에도 얼굴은 있어야 한다).
 */
export function splitByEmotion(
  text: string,
  marks: EmotionMark[] | undefined,
  fallbackEmotion: string,
): EmotionSegment[] {
  const points = (marks ?? [])
    .filter((mark) => mark.at >= 0 && mark.at <= text.length)
    .slice()
    .sort((a, b) => a.at - b.at);

  const segments: EmotionSegment[] = [];
  let cursor = 0;
  let emotion = fallbackEmotion;

  for (const mark of points) {
    if (mark.at > cursor) {
      segments.push({ emotion, text: text.slice(cursor, mark.at).trim() });
      cursor = mark.at;
    }
    emotion = mark.emotion;
  }
  segments.push({ emotion, text: text.slice(cursor).trim() });

  const kept = segments.filter((segment) => segment.text.length > 0);
  return kept.length > 0 ? kept : [{ emotion, text: "" }];
}
