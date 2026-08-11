/**
 * 한 말풍선을 "사람이 바뀐 자리"와 "감정이 바뀐 자리"에서 토막 낸다 (순수 함수).
 *
 * 아키텍처 원칙 3의 연장선이다. AI는 [말:누구]·[감정:이름] 표식만 찍고,
 * 그 표식이 글의 어디에서 나왔는지는 프로그램이 기억한다. 화면은 토막마다
 * 그 사람의 얼굴과 말풍선 색을 붙일 뿐이다. 몇 토막이 될지도 AI가 정하지 않는다.
 *
 * 서버 전용 코드를 들이지 않는다 — 회귀 테스트가 그대로 불러 쓴다.
 */

import { getCharacter, isCharacterId, type CharacterId } from "./characters";

/** 감정이 바뀐 자리 */
export interface EmotionMark {
  /** 이 감정이 시작되는 글자 위치 (말풍선 본문 기준) */
  at: number;
  emotion: string;
}

/** 말하는 사람이 바뀐 자리 (한 단계에 둘이 함께 있을 때) */
export interface SpeakerMark {
  at: number;
  character: CharacterId;
}

/** 얼굴 한 장과, 그 얼굴이 맡는 대사 */
export interface SpeechSegment {
  character: CharacterId;
  emotion: string;
  text: string;
}

export interface SplitOptions {
  emotions?: EmotionMark[];
  speakers?: SpeakerMark[];
  /** 표식이 나오기 전까지 말하는 사람 (이 단계를 이끄는 쪽) */
  character: CharacterId;
}

type Cut =
  | { at: number; kind: "emotion"; emotion: string }
  | { at: number; kind: "speaker"; character: CharacterId };

/**
 * 표식 위치를 기준으로 본문을 토막 낸다.
 *
 * **글자가 없는 토막은 내보내지 않는다.** 표식은 문단 맨 앞에 오므로,
 * 표식만 도착하고 대사는 아직 안 온 순간이 반드시 생긴다. 그때 얼굴부터 그리면
 * 그림이 먼저 뜨고 말이 뒤늦게 따라붙는다. 얼굴은 그 대사의 것이니 함께 나와야 한다.
 *
 * 사람이 바뀌면 감정은 **그 사람의 기본 감정**에서 다시 시작한다 —
 * 감정 이름은 캐릭터마다 다르기 때문이다.
 */
export function splitSpeech(text: string, options: SplitOptions): SpeechSegment[] {
  const base = isCharacterId(options.character) ? options.character : "teacher";

  const cuts: Cut[] = [
    ...(options.emotions ?? []).map(
      (mark): Cut => ({ at: mark.at, kind: "emotion", emotion: mark.emotion }),
    ),
    ...(options.speakers ?? [])
      .filter((mark) => isCharacterId(mark.character))
      .map((mark): Cut => ({ at: mark.at, kind: "speaker", character: mark.character })),
  ]
    .filter((cut) => cut.at >= 0 && cut.at <= text.length)
    // 같은 자리에 둘 다 있으면 사람을 먼저 바꾼다 (감정이 새 사람 것으로 덮이도록)
    .sort((a, b) => a.at - b.at || (a.kind === "speaker" ? -1 : 1));

  const segments: SpeechSegment[] = [];
  let cursor = 0;
  let character = base;
  let emotion = getCharacter(base).defaultEmotion;

  for (const cut of cuts) {
    if (cut.at > cursor) {
      segments.push({ character, emotion, text: text.slice(cursor, cut.at).trim() });
      cursor = cut.at;
    }
    if (cut.kind === "speaker") {
      character = cut.character;
      emotion = getCharacter(character).defaultEmotion;
    } else {
      emotion = cut.emotion;
    }
  }
  segments.push({ character, emotion, text: text.slice(cursor).trim() });

  return segments.filter((segment) => segment.text.length > 0);
}
