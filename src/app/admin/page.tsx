"use client";

import {
  Eye,
  Loader2,
  LogOut,
  MessageSquareText,
  RotateCcw,
  Save,
  TriangleAlert,
  UserRound,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { HealthTab } from "./HealthTab";
import { UsageTab } from "./UsageTab";
import { normalizeCast, parseCast, serializeCast } from "@/lib/cast";
import { charactersByGroup, CHARACTERS, type CharacterId } from "@/lib/characters";
import { STAGE_IDS, STAGES, type StageId } from "@/lib/quest";
import { cn } from "@/lib/utils";

/**
 * 관리자 페이지 — 캐릭터 대본(페르소나)과 대화 흐름 글을 여기서 고친다.
 *
 * 고친 글은 Supabase에 저장되고, personas/ · flow/ 파일은 공장 초기값으로 남는다.
 * 그래서 무엇을 어떻게 고쳤든 "기본값으로 되돌리기"가 항상 가능하다.
 */

interface DocSummary {
  kind: "persona" | "flow" | "config";
  name: string;
  label: string;
  hint: string;
  editedAt: string | null;
}

interface DocDetail {
  kind: "persona" | "flow" | "config";
  name: string;
  content: string;
  original: string;
  edited: boolean;
  preview: string;
}

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((response) => response.json())
      .then((data) => {
        setConfigured(Boolean(data.configured));
        setAuthed(Boolean(data.authenticated));
      })
      .catch(() => setConfigured(false))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <main className="flex h-dvh items-center justify-center text-sm text-neutral-400">
        준비하는 중…
      </main>
    );
  }

  if (!configured) return <NotConfigured />;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return <Console />;
}

const TABS = [
  { id: "prompts", label: "프롬프트", caption: "대화구조 · 캐릭터 대본 · 대화 흐름" },
  { id: "usage", label: "이용내역", caption: "학생들이 남긴 발명노트" },
  { id: "health", label: "점검", caption: "무엇이 준비됐나" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** 관리자 화면 껍데기 — 머리말과 탭. 알맹이는 탭마다 다른 화면이 채운다 */
function Console() {
  const [tab, setTab] = useState<TabId>("prompts");
  const current = TABS.find((one) => one.id === tab) ?? TABS[0];

  return (
    <main className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-3 pb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold tracking-tight">IdeaPrism 관리자</span>
            <span className="text-[11px] text-neutral-400">{current.caption}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/chat"
              className="rounded-full border border-line bg-white px-3 py-1 text-xs text-neutral-600 hover:border-neutral-300"
            >
              학생 화면 보기
            </Link>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/admin/session", { method: "DELETE" });
                window.location.reload();
              }}
              className="flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1 text-xs text-neutral-600 hover:border-neutral-300"
            >
              <LogOut className="size-3" /> 나가기
            </button>
          </div>
        </div>

        <nav className="flex gap-1 px-5">
          {TABS.map((one) => (
            <button
              key={one.id}
              type="button"
              onClick={() => setTab(one.id)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
                tab === one.id
                  ? "border-neutral-900 font-bold text-neutral-900"
                  : "border-transparent text-neutral-400 hover:text-neutral-700",
              )}
            >
              {one.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "prompts" && <Editor />}
      {tab === "usage" && <UsageTab />}
      {tab === "health" && <HealthTab />}
    </main>
  );
}

function NotConfigured() {
  return (
    <main className="flex h-dvh items-center justify-center p-6">
      <div className="max-w-lg rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm leading-relaxed text-amber-900">
        <p className="mb-2 flex items-center gap-2 font-bold">
          <TriangleAlert className="size-4" /> 관리자 접근 코드가 없습니다
        </p>
        <p>
          프롬프트는 서비스의 두뇌라 잠금 없이 열지 않습니다.
          <br />
          <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">.env.local</code> 에 아래
          한 줄을 넣고 개발 서버를 껐다 켜 주세요.
        </p>
        <pre className="mt-3 rounded-lg bg-white px-3 py-2 font-mono text-[13px]">
          ADMIN_PASSWORD=원하는_코드
        </pre>
        <p className="mt-3 text-[13px] text-amber-800">
          배포한 곳에서는 Vercel 환경변수에 같은 이름으로 넣으시면 됩니다.
        </p>
      </div>
    </main>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) setError(data?.error ?? "들어가지 못했습니다.");
      else onDone();
    } catch {
      setError("들어가지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-white px-6 py-6 shadow-sm">
        <h1 className="text-base font-bold">IdeaPrism 관리자</h1>
        <p className="mt-1 text-xs text-neutral-500">
          대화구조·대본을 고치고, 학생들이 남긴 이용내역을 보는 곳입니다.
        </p>

        <input
          type="password"
          value={password}
          autoFocus
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          placeholder="접근 코드"
          className="mt-4 w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:border-neutral-400"
        />

        {error && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !password}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-300"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          들어가기
        </button>
      </div>
    </main>
  );
}

/** 목록·편집기 양쪽에서 같은 글을 가리키는 열쇠 */
function keyOf(doc: { kind: string; name: string }) {
  return `${doc.kind}:${doc.name}`;
}

/** 목록 항목에서 "어느 글인가"만 뽑는다 */
function keyless(doc: DocSummary) {
  return { kind: doc.kind, name: doc.name };
}

interface DocLists {
  personas: DocSummary[];
  flows: DocSummary[];
  configs: DocSummary[];
}

function Editor() {
  const [lists, setLists] = useState<DocLists>({
    personas: [],
    flows: [],
    configs: [],
  });
  /** 직접 고른 글. 아직 안 골랐으면 첫 글을 보여 준다(아래 active) */
  const [picked, setPicked] = useState<{ kind: string; name: string } | null>(null);

  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** 어느 글에 대한 알림인지 함께 들고 있어야, 다른 글로 옮겼을 때 남아 있지 않다 */
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string; at: string } | null>(
    null,
  );
  const [showPreview, setShowPreview] = useState(false);

  const first = lists.configs[0] ?? lists.personas[0];
  const active = picked ?? (first ? keyless(first) : null);
  const activeKey = active ? keyOf(active) : null;

  const fetchList = useCallback(async () => {
    const response = await fetch("/api/admin/prompts");
    if (!response.ok) return null;
    return (await response.json()) as Partial<DocLists>;
  }, []);

  const refreshList = useCallback(() => {
    fetchList()
      .then((data) => {
        if (data) {
          setLists({
            personas: data.personas ?? [],
            flows: data.flows ?? [],
            configs: data.configs ?? [],
          });
        }
      })
      .catch(() => {
        /* 목록을 못 받아도 편집 자체에는 지장이 없다 */
      });
  }, [fetchList]);

  useEffect(refreshList, [refreshList]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    fetch(`/api/admin/prompts/${active.kind}/${encodeURIComponent(active.name)}`)
      .then((response) => response.json())
      .then((data: DocDetail) => {
        if (cancelled) return;
        setDoc(data);
        setDraft(data.content);
      })
      .catch(() => {
        if (!cancelled) {
          setMessage({ tone: "bad", text: "글을 불러오지 못했습니다.", at: keyOf(active) });
        }
      });

    return () => {
      cancelled = true;
    };
    // active 객체는 매 렌더 새로 만들어지므로 열쇠로만 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  // 고른 글과 불러온 글이 아직 다르면 불러오는 중이다 (따로 상태를 두지 않는다)
  const loaded = doc !== null && activeKey !== null && keyOf(doc) === activeKey;
  const shownMessage = message && message.at === activeKey ? message : null;

  const save = async () => {
    if (!active || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/prompts/${active.kind}/${encodeURIComponent(active.name)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: draft }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setMessage({ tone: "bad", text: data?.error ?? "저장하지 못했습니다.", at: keyOf(active) });
      } else {
        setMessage({
          tone: "ok",
          text: "저장했어요. 다음 대화부터 바뀐 내용으로 말합니다.",
          at: keyOf(active),
        });
        // 서버가 정리한 글이 있으면 그걸 기준으로 삼는다 (설정값은 정리 후 저장된다)
        const saved = typeof data.content === "string" ? data.content : draft;
        setDraft(saved);
        setDoc((current) =>
          current ? { ...current, content: saved, edited: true, preview: data.preview } : current,
        );
        refreshList();
      }
    } catch {
      setMessage({ tone: "bad", text: "저장하지 못했습니다.", at: keyOf(active) });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!active || busy) return;
    if (!window.confirm("고친 내용을 버리고 처음 상태로 되돌릴까요?")) return;

    setBusy(true);
    try {
      const response = await fetch(
        `/api/admin/prompts/${active.kind}/${encodeURIComponent(active.name)}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) {
        setMessage({ tone: "bad", text: data?.error ?? "되돌리지 못했습니다.", at: keyOf(active) });
      } else {
        setDraft(data.content);
        setDoc((current) =>
          current ? { ...current, content: data.content, edited: false } : current,
        );
        setMessage({ tone: "ok", text: "처음 상태로 되돌렸어요.", at: keyOf(active) });
        refreshList();
      }
    } catch {
      setMessage({ tone: "bad", text: "되돌리지 못했습니다.", at: keyOf(active) });
    } finally {
      setBusy(false);
    }
  };

  const dirty = loaded && doc !== null && draft !== doc.content;
  const { personas, flows, configs } = lists;
  const selected = active;
  const setSelected = setPicked;
  const loading = !loaded;

  return (
    <div className="flex min-h-0 flex-1">
        {/* 왼쪽: 글 목록 */}
        <nav className="scroll-soft w-64 shrink-0 overflow-y-auto border-r border-line bg-panel px-3 py-4">
          <DocGroup
            title="대화구조"
            caption="누가 어느 단계를 맡는가"
            icon={Workflow}
            docs={configs}
            selected={selected}
            onSelect={setSelected}
          />
          <DocGroup
            title="캐릭터 대본"
            caption="어떻게 말하는가"
            icon={UserRound}
            docs={personas}
            selected={selected}
            onSelect={setSelected}
          />
          <DocGroup
            title="대화 흐름"
            caption="어떻게 흘러가는가"
            icon={MessageSquareText}
            docs={flows}
            selected={selected}
            onSelect={setSelected}
          />
        </nav>

        {/* 오른쪽: 편집기 */}
        <section className="flex min-w-0 flex-1 flex-col">
          {loading || !doc ? (
            <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
              {loading ? "불러오는 중…" : "왼쪽에서 고칠 글을 골라 주세요."}
            </div>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold">
                    {doc.kind === "config"
                      ? "대화구조"
                      : doc.kind === "persona"
                        ? `캐릭터 대본 · ${CHARACTERS[doc.name as CharacterId]?.name ?? doc.name}`
                        : `대화 흐름 · ${doc.name}`}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-neutral-400">
                    {doc.edited
                      ? "고쳐진 상태예요. 처음 상태로 되돌릴 수 있어요."
                      : "아직 고치지 않은 처음 상태예요."}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPreview(!showPreview)}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors",
                      showPreview
                        ? "border-neutral-800 bg-neutral-900 text-white"
                        : "border-line bg-white text-neutral-600 hover:border-neutral-300",
                    )}
                  >
                    <Eye className="size-3.5" /> AI가 받는 내용
                  </button>
                  <button
                    type="button"
                    onClick={() => void reset()}
                    disabled={busy || !doc.edited}
                    className="flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:border-neutral-300 disabled:opacity-40"
                  >
                    <RotateCcw className="size-3.5" /> 처음으로
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={busy || !dirty}
                    className="flex items-center gap-1 rounded-full bg-neutral-900 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-300"
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    저장
                  </button>
                </div>
              </div>

              {shownMessage && (
                <p
                  className={cn(
                    "shrink-0 px-5 py-2 text-xs",
                    shownMessage.tone === "ok"
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-50 text-amber-800",
                  )}
                >
                  {shownMessage.text}
                </p>
              )}

              {showPreview ? (
                <div className="scroll-soft min-h-0 flex-1 overflow-y-auto bg-neutral-50 px-5 py-4">
                  <p className="mb-2 text-[11px] text-neutral-400">
                    AI에게 실제로 전달되는 내용입니다. 맨 위 안내 주석
                    {doc.kind === "persona" && ", 이미지 지시문"}은 걸러집니다.
                  </p>
                  <pre className="whitespace-pre-wrap rounded-xl border border-line bg-white p-4 text-[13px] leading-relaxed">
                    {doc.preview || "(비어 있음)"}
                  </pre>
                </div>
              ) : doc.kind === "config" ? (
                <CastEditor value={draft} onChange={setDraft} />
              ) : (
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  spellCheck={false}
                  className="scroll-soft min-h-0 flex-1 resize-none bg-white px-5 py-4 font-mono text-[13px] leading-relaxed outline-none"
                />
              )}

              <p className="shrink-0 border-t border-line bg-neutral-50 px-5 py-2 text-[11px] text-neutral-400">
                {dirty
                  ? "고친 내용이 아직 저장되지 않았어요."
                  : "저장한 내용은 다음 대화 턴부터 반영됩니다. 이미 진행 중인 대화도 다음 말부터 바뀌어요."}
              </p>
            </>
          )}
        </section>
    </div>
  );
}

/**
 * 대화구조 편집기 — 단계마다 담당 캐릭터를 고른다.
 *
 * 저장되는 값은 JSON이지만 대표님이 JSON을 쓰실 일은 없다.
 * 고르면 이 화면이 JSON으로 바꿔 준다.
 *
 * 완료 조건(언제 다음 단계로 넘어가는가)은 여기서 못 바꾼다 — 프로그램이 판정한다.
 */
function CastEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const cast = parseCast(value);
  const groups = charactersByGroup();

  /** slot 0 = 이끄는 사람, slot 1 = 함께 있는 친구 (없음 = 혼자) */
  const pick = (stage: StageId, slot: 0 | 1, who: CharacterId | null) => {
    const members = [...cast[stage]];
    if (who === null) members.splice(slot, 1);
    else members[slot] = who;
    // 같은 사람을 두 칸에 넣으면 혼자 두 명인 척하게 된다
    const unique = members.filter((id, index) => id && members.indexOf(id) === index);
    onChange(serializeCast(normalizeCast({ ...cast, [stage]: unique })));
  };

  return (
    <div className="scroll-soft min-h-0 flex-1 overflow-y-auto bg-white px-5 py-4">
      <p className="mb-4 text-[12px] leading-relaxed text-neutral-500">
        단계마다 누가 맡을지 고릅니다. 담당이 바뀌는 자리에서 <b>배턴터치</b>가 저절로
        일어납니다.
        <br />
        <b>언제 다음 단계로 넘어가는가(완료 조건)는 여기서 못 바꿉니다</b> — 그건 프로그램이
        판정합니다.
      </p>

      <ul className="space-y-2">
        {STAGE_IDS.map((stage) => {
          const members = cast[stage];

          const chooser = (slot: 0 | 1) => (
            <select
              key={slot}
              value={members[slot] ?? ""}
              onChange={(event) =>
                pick(stage, slot, (event.target.value || null) as CharacterId | null)
              }
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
            >
              {slot === 1 && <option value="">— 혼자 —</option>}
              {groups.map(({ group, label, members: options }) => (
                <optgroup key={group} label={label}>
                  {options.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          );

          return (
            <li
              key={stage}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2.5"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white tabular-nums">
                {stage}
              </span>

              <div className="min-w-[7rem]">
                <p className="text-sm font-medium">{STAGES[stage].label}</p>
                <p className="text-[11px] text-neutral-400">{STAGES[stage].doneWhen}</p>
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-neutral-400">이끄는 사람</span>
                {chooser(0)}
                <span className="text-[11px] text-neutral-400">함께</span>
                {chooser(1)}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-neutral-400">
        ※ 한 단계에 <b>둘까지</b> 앉힐 수 있습니다. 둘이면 서로 주고받으며 이야기합니다.
        <br />※ <b>0단계에서 선생님이 골라 준 친구 두 명이 1~4단계를 대신 채웁니다.</b> 여기
        설정은 선생님이 고르기 전까지의 기본값입니다.
        <br />※ 저장해도 <b>이미 이야기 중인 학생은 원래 만나던 사람과 끝까지 갑니다.</b> 새로
        시작하는 대화부터 바뀐 배치로 만납니다.
      </p>
    </div>
  );
}

function DocGroup({
  title,
  caption,
  icon: Icon,
  docs,
  selected,
  onSelect,
}: {
  title: string;
  caption: string;
  icon: typeof UserRound;
  docs: DocSummary[];
  selected: { kind: string; name: string } | null;
  onSelect: (doc: { kind: string; name: string }) => void;
}) {
  if (docs.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-baseline gap-1.5 px-2">
        <Icon className="size-3.5 shrink-0 self-center text-neutral-400" />
        <span className="text-xs font-bold">{title}</span>
        <span className="text-[11px] text-neutral-400">{caption}</span>
      </div>

      <ul className="space-y-0.5">
        {docs.map((doc) => {
          const active = selected?.kind === doc.kind && selected?.name === doc.name;
          return (
            <li key={`${doc.kind}:${doc.name}`}>
              <button
                type="button"
                onClick={() => onSelect({ kind: doc.kind, name: doc.name })}
                title={doc.hint}
                className={cn(
                  "w-full rounded-lg px-2.5 py-2 text-left transition-colors",
                  active ? "bg-neutral-900 text-white" : "hover:bg-neutral-100",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{doc.label}</span>
                  {doc.editedAt && (
                    <span
                      title="고쳐진 글"
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        active ? "bg-white" : "bg-amber-500",
                      )}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "mt-0.5 line-clamp-2 text-[11px]",
                    active ? "text-white/60" : "text-neutral-400",
                  )}
                >
                  {doc.hint}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
