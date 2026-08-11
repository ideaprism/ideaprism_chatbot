"use client";

import { Eye, EyeOff, KeyRound, Loader2, Save, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * 입장코드 관리 — 학생이 첫 화면에서 넣는 코드를 여기서 바꾼다.
 *
 * 이 코드는 프롬프트가 아니라 설정값이라 대본 편집기와 따로 둔다
 * (그 편집기는 20자 미만을 거부해서 네 자리 코드를 저장할 수 없다).
 *
 * 서버에서 받아 오는 값이라 **상태 변경은 전부 비동기 콜백 안에서** 한다 —
 * effect 안에서 바로 setState 하면 lint 가 막는다.
 */

interface EntryCodeInfo {
  code: string;
  isDefault: boolean;
  min: number;
  max: number;
}

export function EntryCodeTab() {
  const [info, setInfo] = useState<EntryCodeInfo | null>(null);
  const [draft, setDraft] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/entry-code")
      .then((response) => response.json())
      .then((data: EntryCodeInfo & { error?: string }) => {
        if (data.error) return;
        setInfo(data);
        setDraft(data.code);
      })
      .catch(() => setMessage({ tone: "bad", text: "입장코드를 불러오지 못했습니다." }));
  }, []);

  useEffect(load, [load]);

  const save = () => {
    if (busy || !info || draft.trim() === info.code) return;
    setBusy(true);
    setMessage(null);

    fetch("/api/admin/entry-code", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: draft }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage({ tone: "bad", text: data?.error ?? "저장하지 못했습니다." });
          return;
        }
        setInfo({ ...info, code: data.code, isDefault: data.isDefault });
        setDraft(data.code);
        setMessage({
          tone: "ok",
          text: `입장코드를 「${data.code}」로 바꿨습니다. 지금부터 이 코드로만 들어올 수 있어요.`,
        });
      })
      .catch(() => setMessage({ tone: "bad", text: "저장하지 못했습니다." }))
      .finally(() => setBusy(false));
  };

  if (!info) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
        불러오는 중…
      </div>
    );
  }

  const changed = draft.trim() !== info.code;

  return (
    <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-5 py-6">
      <div className="mx-auto max-w-lg space-y-4">
        <section className="rounded-2xl border border-line bg-white px-6 py-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <KeyRound className="size-4" /> 학생 입장코드
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            첫 화면에서 이 코드를 넣어야 대화를 시작할 수 있습니다. 캐릭터 소개는 코드 없이도
            보이고, <strong>막히는 것은 대화와 검색</strong>입니다 — AI 비용이 나가는 자리라서요.
          </p>

          <div className="mt-4 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={visible ? "text" : "password"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") save();
                }}
                className="w-full rounded-lg border border-line py-2.5 pr-10 pl-3 font-mono text-sm outline-none focus:border-neutral-400"
              />
              <button
                type="button"
                onClick={() => setVisible((on) => !on)}
                aria-label={visible ? "코드 가리기" : "코드 보기"}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-700"
              >
                {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={save}
              disabled={busy || !changed}
              className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-300"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              저장
            </button>
          </div>

          <p className="mt-2 text-[11px] text-neutral-400">
            {info.min}~{info.max}자 · 빈칸은 넣을 수 없습니다 (학생이 그대로 옮겨 적어야 해서요)
          </p>

          {message && (
            <p
              className={
                message.tone === "ok"
                  ? "mt-3 text-xs text-emerald-700"
                  : "mt-3 flex items-start gap-1.5 text-xs text-amber-800"
              }
            >
              {message.tone === "bad" && (
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
              )}
              {message.text}
            </p>
          )}
        </section>

        {info.isDefault && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-xs leading-relaxed text-amber-900">
            <p className="flex items-center gap-1.5 font-bold">
              <TriangleAlert className="size-3.5" /> 아직 기본 코드입니다
            </p>
            <p className="mt-1">
              처음에 정해 둔 코드를 그대로 쓰고 있습니다. 여러 분께 알려 주기 전에 한 번 바꿔
              두시는 편이 안전합니다.
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-line bg-neutral-50 px-6 py-4 text-xs leading-relaxed text-neutral-600">
          <p className="font-bold text-neutral-800">알아 두실 것</p>
          <ul className="mt-2 space-y-1.5">
            <li>
              · <strong>코드를 바꾸면 지금 들어와 있는 학생도 다시 넣어야 합니다.</strong> 쓰던
              대화는 브라우저에 남아 있으니, 새 코드를 넣고 「이어서 하기」를 누르면 그대로
              이어집니다.
            </li>
            <li>· 한 번 넣으면 그 기기에서는 한 달 동안 다시 묻지 않습니다.</li>
            <li>· 관리자로 로그인해 있으면 코드 없이도 학생 화면을 볼 수 있습니다.</li>
            <li>
              · 이건 <strong>비용을 지키는 문</strong>이지 개인 인증이 아닙니다. 코드를 아는
              사람끼리는 서로 구분되지 않습니다.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
