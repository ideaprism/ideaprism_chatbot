/**
 * 캐릭터 정의 + 감정 이미지 매핑.
 *
 * 아키텍처 원칙 3: AI는 "감정 이름"만 고르고, 이미지 주소는 화면(이 파일)이 만든다.
 * AI 응답에 URL이 섞여 들어오는 일이 없도록, 주소 조립은 전적으로 코드가 담당한다.
 *
 * 모든 주소는 2026-08-10에 30장 전수 검증(HTTP 200) 완료.
 * 지유 10번은 페르소나 문서의 `arms_` 접두어가 오타이므로 제거된 형태가 정답이다.
 */

const IMAGE_BASE =
  "https://raw.githubusercontent.com/ideaprism/tag-chatbot-proto-v2/main/Chatbot_charactors/images";

export type CharacterId = "teacher" | "jiyou" | "detective";

export interface Character {
  id: CharacterId;
  /** 화면에 표시할 이름 */
  name: string;
  /** 역할 한 줄 소개 (진행판·배턴터치 연출에 사용) */
  role: string;
  /** personas/ 폴더의 원본 대본 파일명 */
  personaFile: string;
  /** 이미지 폴더명 (URL 인코딩 전 원본) */
  imageDir: string;
  /** 감정 이름 → 파일명 */
  emotions: Record<string, string>;
  /** 감정을 고르지 못했을 때 쓰는 기본 감정 */
  defaultEmotion: string;
  /** 말풍선 테마 색 (Tailwind 클래스) */
  theme: {
    accent: string;
    bubble: string;
    ring: string;
  };
}

export const CHARACTERS: Record<CharacterId, Character> = {
  teacher: {
    id: "teacher",
    name: "발명 마스터 선생님",
    role: "지도교사 · 만남과 매칭, 길을 잃으면 환기",
    personaFile: "master_teacher.txt",
    imageDir: "master_teacher",
    defaultEmotion: "welcome",
    emotions: {
      welcome: "teacher-1_welcome.png",
      listening: "teacher-2_listening.png",
      thinking: "teacher-3_thinking.png",
      matching: "teacher-4_matching.png",
      guide: "teacher-5_guide.png",
      focus: "teacher-6_focus.png",
      proud: "teacher-7_proud.png",
      idea: "teacher-8_idea.png",
      cheer: "teacher-9_cheer.png",
      warm: "teacher-10_warm.png",
    },
    theme: {
      accent: "text-amber-700",
      bubble: "bg-amber-50 border-amber-200",
      ring: "ring-amber-300",
    },
  },

  jiyou: {
    id: "jiyou",
    name: "지유 선배",
    role: "발명친구 · 중3, 문제 정의부터 아이디어 확정까지",
    personaFile: "middle_jiyou.txt",
    imageDir: "지유",
    defaultEmotion: "confident",
    emotions: {
      confident: "지유-1_confident.png",
      strategizing: "지유-2_strategizing.png",
      impressed: "지유-3_impressed.png",
      coaching: "지유-4_coaching.png",
      proud: "지유-5_proud.png",
      serious: "지유-6_serious.png",
      presenting: "지유-7_presenting.png",
      playful: "지유-8_playful.png",
      realizing: "지유-9_realizing.png",
      arms_crossed: "지유-10_arms_crossed.png",
    },
    theme: {
      accent: "text-violet-700",
      bubble: "bg-violet-50 border-violet-200",
      ring: "ring-violet-300",
    },
  },

  detective: {
    id: "detective",
    name: "특허 탐정",
    role: "변리사 · 선행기술조사와 차별점 찾기",
    personaFile: "lawyer.txt",
    imageDir: "lawyer",
    defaultEmotion: "analyzing",
    emotions: {
      analyzing: "lawyer-1_analyzing.png",
      search: "lawyer-2_search.png",
      found: "lawyer-3_found.png",
      logic: "lawyer-4_logic.png",
      canvas: "lawyer-5_canvas.png",
      oops: "lawyer-6_oops.png",
      warning: "lawyer-7_warning.png",
      eureka: "lawyer-8_eureka.png",
      writing: "lawyer-9_writing.png",
      congrats: "lawyer-10_congrats.png",
    },
    theme: {
      accent: "text-slate-700",
      bubble: "bg-slate-50 border-slate-200",
      ring: "ring-slate-300",
    },
  },
};

export function getCharacter(id: CharacterId): Character {
  return CHARACTERS[id];
}

/** 해당 캐릭터가 고를 수 있는 감정 이름 목록 (프롬프트에 주입) */
export function emotionNames(id: CharacterId): string[] {
  return Object.keys(CHARACTERS[id].emotions);
}

/**
 * 감정 이름 → 실제 이미지 주소.
 * 알 수 없는 감정 이름이 오면 조용히 기본 감정으로 되돌린다(화면이 깨지지 않도록).
 */
export function emotionImageUrl(id: CharacterId, emotion: string): string {
  const character = CHARACTERS[id];
  const file =
    character.emotions[emotion] ?? character.emotions[character.defaultEmotion];
  return `${IMAGE_BASE}/${encodeURIComponent(character.imageDir)}/${encodeURIComponent(file)}`;
}

/** AI가 고른 감정 이름을 검증해, 목록에 없으면 기본값으로 교정한다 */
export function normalizeEmotion(id: CharacterId, emotion: string | null): string {
  const character = CHARACTERS[id];
  if (emotion && emotion in character.emotions) return emotion;
  return character.defaultEmotion;
}
