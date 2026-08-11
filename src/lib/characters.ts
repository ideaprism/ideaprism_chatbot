/**
 * 캐릭터 정의 + 감정 이미지 매핑.
 *
 * 아키텍처 원칙 3: AI는 "감정 이름"만 고르고, 이미지 주소는 화면(이 파일)이 만든다.
 * AI 응답에 URL이 섞여 들어오는 일이 없도록, 주소 조립은 전적으로 코드가 담당한다.
 *
 * 열 명 전원 등록. 그림은 2026-08-11에 GitHub 저장소를 조회해 폴더 10개를 전수 확인했다.
 * 아홉 명은 `이름-N_감정.png` 규칙이고 **지원(jiwon)만 번호 없이 `감정.png`** 다
 * (원본에 15장이 있는데 그중 열 개만 쓴다 — 대표님 지시).
 *
 * 누가 어느 단계를 맡는지는 여기서 정하지 않는다. 그건 `cast.ts` 가 맡고,
 * 관리자 페이지에서 바꿀 수 있다.
 */

const IMAGE_BASE =
  "https://raw.githubusercontent.com/ideaprism/tag-chatbot-proto-v2/main/Chatbot_charactors/images";

export type CharacterId =
  | "teacher"
  | "daon"
  | "harin"
  | "jiyou"
  | "leo"
  | "junhyuk"
  | "mia"
  | "detective"
  | "coach"
  | "jiwon";

/** 랜딩·관리자에서 묶어 보여 줄 갈래 */
export type CharacterGroup = "teacher" | "senior" | "expert";

export interface Character {
  id: CharacterId;
  /** 화면에 표시할 이름 */
  name: string;
  /** 교사 · 학생 선배 · 전문가 */
  group: CharacterGroup;
  /** 이름 밑에 붙는 짧은 말 (학년 또는 직함) */
  subtitle: string;
  /** 랜딩에 쓰는 한 줄 소개 */
  tagline: string;
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
  /**
   * 랜딩에서 얼굴 대신 물음표를 띄운다.
   * 아직 밝히지 않을 인물에게 쓴다 (대표님 지시 — 지원).
   */
  hideFace?: boolean;
  /** 말풍선 테마 색 (Tailwind 클래스) */
  theme: {
    accent: string;
    bubble: string;
    ring: string;
  };
}

/** 감정 이름 → 파일명 을 `이름-N_감정.png` 규칙으로 펼친다 */
function numbered(prefix: string, names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name, index) => [name, `${prefix}-${index + 1}_${name}.png`]),
  );
}

export const CHARACTERS: Record<CharacterId, Character> = {
  // ── 교사 ────────────────────────────────────────────────────
  teacher: {
    id: "teacher",
    name: "발명 마스터 선생님",
    group: "teacher",
    subtitle: "지도교사",
    tagline: "칭찬 80%, 어떤 엉뚱한 생각도 발명으로 이끌어 주는 선생님",
    role: "지도교사 · 만남과 매칭, 길을 잃으면 환기",
    personaFile: "master_teacher.txt",
    imageDir: "master_teacher",
    defaultEmotion: "welcome",
    emotions: numbered("teacher", [
      "welcome",
      "listening",
      "thinking",
      "matching",
      "guide",
      "focus",
      "proud",
      "idea",
      "cheer",
      "warm",
    ]),
    theme: {
      accent: "text-amber-700",
      bubble: "bg-amber-50 border-amber-200",
      ring: "ring-amber-300",
    },
  },

  // ── 학생 선배 ───────────────────────────────────────────────
  daon: {
    id: "daon",
    name: "다온",
    group: "senior",
    subtitle: "초등 6학년",
    tagline: "뭐든 분해해 봐야 직성이 풀리는 호기심 폭발 발명왕",
    role: "발명친구 · 초6, 생활 속 불편을 찾아내는 체험형",
    personaFile: "elementary_daon.txt",
    imageDir: "다온",
    defaultEmotion: "excited",
    emotions: numbered("다온", [
      "excited",
      "thinking",
      "eureka",
      "curious",
      "proud",
      "oops",
      "focused",
      "cheerful",
      "surprised",
      "sleepy",
    ]),
    theme: {
      accent: "text-orange-700",
      bubble: "bg-orange-50 border-orange-200",
      ring: "ring-orange-300",
    },
  },

  harin: {
    id: "harin",
    name: "하린",
    group: "senior",
    subtitle: "초등 5학년",
    tagline: "주변 사람의 불편을 그냥 지나치지 못하는 공감 발명가",
    role: "발명친구 · 초5, 누구를 위한 발명인지 먼저 묻는다",
    personaFile: "elementary_harin.txt",
    imageDir: "하린",
    defaultEmotion: "caring",
    emotions: numbered("하린", [
      "caring",
      "thinking",
      "sparkle",
      "listening",
      "proud",
      "worried",
      "writing",
      "cheerful",
      "surprised",
      "gentle_nudge",
    ]),
    theme: {
      accent: "text-rose-700",
      bubble: "bg-rose-50 border-rose-200",
      ring: "ring-rose-300",
    },
  },

  jiyou: {
    id: "jiyou",
    name: "지유 선배",
    group: "senior",
    subtitle: "중등 3학년",
    tagline: "대회는 전략이야. 심사위원 마음을 읽는 전략가",
    role: "발명친구 · 중3, 문제 정의부터 아이디어 확정까지",
    personaFile: "middle_jiyou.txt",
    imageDir: "지유",
    defaultEmotion: "confident",
    emotions: {
      // 10번만 규칙에서 벗어난다 (파일명에 낱말이 둘)
      ...numbered("지유", [
        "confident",
        "strategizing",
        "impressed",
        "coaching",
        "proud",
        "serious",
        "presenting",
        "playful",
        "realizing",
      ]),
      arms_crossed: "지유-10_arms_crossed.png",
    },
    theme: {
      accent: "text-violet-700",
      bubble: "bg-violet-50 border-violet-200",
      ring: "ring-violet-300",
    },
  },

  leo: {
    id: "leo",
    name: "Leo",
    group: "senior",
    subtitle: "중등 3학년",
    tagline: "코딩하다 잠드는 테크 너드, 뭐든 시스템으로 만들고 싶은 발명가",
    role: "발명친구 · 중3, 기술로 푸는 쪽 (한국어에 영어를 섞어 쓴다)",
    personaFile: "middle_leo.txt",
    imageDir: "Leo",
    defaultEmotion: "coding",
    emotions: numbered("Leo", [
      "coding",
      "thinking",
      "eureka",
      "explaining",
      "proud",
      "debug",
      "excited",
      "awkward",
      "focused",
      "yawning",
    ]),
    theme: {
      accent: "text-sky-700",
      bubble: "bg-sky-50 border-sky-200",
      ring: "ring-sky-300",
    },
  },

  junhyuk: {
    id: "junhyuk",
    name: "준혁",
    group: "senior",
    subtitle: "고등 3학년",
    tagline: "발명으로 창업까지, 꿈이 큰 비즈니스 마인드 발명가",
    role: "발명친구 · 고3, 사업화까지 생각하는 실전형",
    personaFile: "high_junhyuk.txt",
    imageDir: "준혁",
    defaultEmotion: "confident",
    emotions: numbered("준혁", [
      "confident",
      "thinking",
      "fired_up",
      "mentoring",
      "proud",
      "honest",
      "laughing",
      "calculating",
      "surprised",
      "chill",
    ]),
    theme: {
      accent: "text-emerald-700",
      bubble: "bg-emerald-50 border-emerald-200",
      ring: "ring-emerald-300",
    },
  },

  mia: {
    id: "mia",
    name: "Mia",
    group: "senior",
    subtitle: "고등 3학년",
    tagline: "가설 세우고 실험하고 증명하는 리서처형 발명가",
    role: "발명친구 · 고3, 근거로 따지는 쪽 (한국어에 영어를 섞어 쓴다)",
    personaFile: "high_mia.txt",
    imageDir: "Mia",
    defaultEmotion: "calm",
    emotions: numbered("Mia", [
      "calm",
      "analyzing",
      "eureka",
      "teaching",
      "proud",
      "honest",
      "writing",
      "warm_smile",
      "curious",
      "glasses_push",
    ]),
    theme: {
      accent: "text-indigo-700",
      bubble: "bg-indigo-50 border-indigo-200",
      ring: "ring-indigo-300",
    },
  },

  // ── 전문가 ──────────────────────────────────────────────────
  detective: {
    id: "detective",
    name: "특허 탐정",
    group: "expert",
    subtitle: "변리사",
    tagline: "특허의 바다에서 비슷한 것을 찾아내 신규성을 가려 준다",
    role: "변리사 · 선행기술조사와 차별점 찾기",
    personaFile: "lawyer.txt",
    imageDir: "lawyer",
    defaultEmotion: "analyzing",
    emotions: numbered("lawyer", [
      "analyzing",
      "search",
      "found",
      "logic",
      "canvas",
      "oops",
      "warning",
      "eureka",
      "writing",
      "congrats",
    ]),
    theme: {
      accent: "text-slate-700",
      bubble: "bg-slate-50 border-slate-200",
      ring: "ring-slate-300",
    },
  },

  coach: {
    id: "coach",
    name: "사업 코치",
    group: "expert",
    subtitle: "사업 코치",
    tagline: "숫자와 시장으로 따지는 냉철한 승부사",
    role: "사업 코치 · 시장성과 실현 가능성",
    personaFile: "coach.txt",
    imageDir: "coach",
    defaultEmotion: "confident",
    emotions: numbered("coach", [
      "confident",
      "investigate",
      "money",
      "global",
      "question",
      "honest",
      "fired",
      "risk",
      "presentation",
      "partner",
    ]),
    theme: {
      accent: "text-red-700",
      bubble: "bg-red-50 border-red-200",
      ring: "ring-red-300",
    },
  },

  jiwon: {
    id: "jiwon",
    name: "지원 연구원",
    group: "expert",
    subtitle: "기업 연구원",
    tagline: "아이디어를 실제 특허와 기술로 실현시키는 기술 설계자",
    role: "기업 연구원 · 엔지니어링과 특허 수준의 구체화",
    personaFile: "jiwon.txt",
    imageDir: "jiwon",
    defaultEmotion: "confidence",
    // 지원만 파일명에 번호가 없다. 원본 15장 중 열 개만 쓴다.
    emotions: {
      confidence: "confidence.png",
      curiosity: "curiosity.png",
      thoughtful: "thoughtful.png",
      concentration: "concentration.png",
      eureka: "eureka.png",
      pride: "pride.png",
      encouragement: "encouragement.png",
      empathy: "empathy.png",
      serious: "serious.png",
      celebration: "celebration.png",
    },
    hideFace: true,
    theme: {
      accent: "text-teal-700",
      bubble: "bg-teal-50 border-teal-200",
      ring: "ring-teal-300",
    },
  },
};

/** 화면에 늘어놓을 순서 — 교사 → 선배(학년 순) → 전문가 */
export const CHARACTER_IDS: CharacterId[] = [
  "teacher",
  "harin",
  "daon",
  "jiyou",
  "leo",
  "junhyuk",
  "mia",
  "detective",
  "coach",
  "jiwon",
];

export const GROUP_LABEL: Record<CharacterGroup, string> = {
  teacher: "교사",
  senior: "학생 선배",
  expert: "전문가",
};

/** 갈래별로 묶어 돌려준다 (랜딩·관리자가 쓴다) */
export function charactersByGroup(): Array<{
  group: CharacterGroup;
  label: string;
  members: Character[];
}> {
  const groups: CharacterGroup[] = ["teacher", "senior", "expert"];
  return groups.map((group) => ({
    group,
    label: GROUP_LABEL[group],
    members: CHARACTER_IDS.map((id) => CHARACTERS[id]).filter(
      (character) => character.group === group,
    ),
  }));
}

export function getCharacter(id: CharacterId): Character {
  return CHARACTERS[id];
}

/** 모르는 값이 들어와도 화면이 깨지지 않게 걸러 준다 */
export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && value in CHARACTERS;
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
