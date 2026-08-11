import { redirect } from "next/navigation";

import { hasEntered } from "@/lib/entry/auth";

/**
 * 대화 화면의 문지기.
 *
 * 랜딩의 소개는 누구나 보지만, 대화는 입장코드를 넣은 사람만 시작할 수 있다.
 * 주소창에 /chat 을 바로 쳐 넣어도 여기서 랜딩으로 돌려보낸다.
 *
 * ※ 이건 화면을 돌려보내는 것뿐이다. **돈이 나가는 것을 실제로 막는 곳은
 *   API 쪽**(`api/chat` 등)이다 — 화면을 거치지 않고 API를 직접 부를 수 있으므로,
 *   문은 두 군데 다 걸어야 한다.
 */
export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasEntered())) redirect("/");
  return children;
}
