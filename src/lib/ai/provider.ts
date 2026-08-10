/**
 * 제공사 고르기.
 *
 * 라우트는 여기서 어댑터 하나를 받아 쓰고, 그 뒤로는 어느 회사인지 모른 채 대화를 진행한다.
 */

import "server-only";

import { createClaudeAdapter } from "./adapters/claude";
import { createGeminiAdapter } from "./adapters/gemini";
import { createOpenAiAdapter } from "./adapters/openai";
import { DEFAULT_PROVIDER } from "./config";
import { PROVIDER_IDS, type AiAdapter, type ProviderId } from "./types";

const FACTORIES: Record<ProviderId, () => AiAdapter> = {
  claude: createClaudeAdapter,
  openai: createOpenAiAdapter,
  gemini: createGeminiAdapter,
};

export function getAdapter(id: ProviderId): AiAdapter {
  return FACTORIES[id]();
}

/** 키가 들어 있어 실제로 쓸 수 있는 제공사 목록 */
export function availableProviders(): Array<{
  id: ProviderId;
  label: string;
  model: string;
  configured: boolean;
}> {
  return PROVIDER_IDS.map((id) => {
    const adapter = FACTORIES[id]();
    return {
      id,
      label: adapter.label,
      model: adapter.model,
      configured: adapter.isConfigured(),
    };
  });
}

/**
 * 이번 대화에 쓸 제공사를 정한다.
 * 요청이 고른 제공사에 키가 없으면, 키가 있는 다른 곳으로 조용히 넘어간다.
 * (학생 화면이 "키 없음" 오류로 막히는 것보다 낫다)
 */
export function resolveProvider(requested: ProviderId | null | undefined): {
  adapter: AiAdapter;
  fellBack: boolean;
} | null {
  const order: ProviderId[] = [
    ...(requested ? [requested] : []),
    DEFAULT_PROVIDER,
    ...PROVIDER_IDS,
  ];

  for (const id of order) {
    const adapter = FACTORIES[id]();
    if (adapter.isConfigured()) {
      return { adapter, fellBack: Boolean(requested) && adapter.id !== requested };
    }
  }

  return null;
}
