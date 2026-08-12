"use client";

import {
  Check,
  GraduationCap,
  KeyRound,
  Loader2,
  Plus,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { Classroom } from "@/lib/classroom/rules";
import { cn } from "@/lib/utils";

/**
 * 교실과 선생님 관리.
 *
 * **교실 코드가 곧 학생 입장코드다** — 학생이 첫 화면에서 넣는 그 코드가
 * "어느 반인가"를 정하고, 그 반 선생님이 3.0에서 그 학생들의 노트를 본다.
 *
 * 서버에서 받아 오는 값이라 **상태 변경은 전부 비동기 콜백 안에서** 한다
 * (effect 안에서 바로 setState 하면 lint 가 막는다).
 */

interface Teacher {
  id: string;
  name: string;
  loginCode: string;
  active: boolean;
}

interface Payload {
  ready: boolean;
  classrooms: Classroom[];
  teachers: Teacher[];
  error?: string;
}

type Note = { tone: "ok" | "bad"; text: string } | null;

export function ClassroomTab() {
  const [data, setData] = useState<Payload | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/classrooms")
      .then((response) => response.json())
      .then((payload: Payload) =>
        setData({
          ready: Boolean(payload.ready),
          classrooms: payload.classrooms ?? [],
          teachers: payload.teachers ?? [],
          error: payload.error,
        }),
      )
      .catch(() => setNote({ tone: "bad", text: "교실 목록을 불러오지 못했습니다." }));
  }, []);

  useEffect(load, [load]);

  const save = (body: Record<string, unknown>, done: () => void) => {
    if (busy) return;
    setBusy(true);
    setNote(null);

    fetch("/api/admin/classrooms", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as Payload & {
          error?: string;
        };
        if (!response.ok) {
          setNote({ tone: "bad", text: payload.error ?? "저장하지 못했습니다." });
          return;
        }
        setData({
          ready: Boolean(payload.ready),
          classrooms: payload.classrooms ?? [],
          teachers: payload.teachers ?? [],
        });
        setNote({ tone: "ok", text: "저장했습니다." });
        done();
      })
      .catch(() => setNote({ tone: "bad", text: "저장하지 못했습니다." }))
      .finally(() => setBusy(false));
  };

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
        불러오는 중…
      </div>
    );
  }

  if (!data.ready) {
    return (
      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm leading-relaxed text-amber-900">
          <p className="mb-2 flex items-center gap-2 font-bold">
            <TriangleAlert className="size-4" /> 교실 표가 아직 없습니다
          </p>
          <p>
            <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">
              supabase/classrooms.sql
            </code>{" "}
            을 Supabase에서 한 번 실행해 주세요. 그때까지는 예전처럼 입장코드 하나로 학생이
            들어옵니다 — 대화는 멀쩡합니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-soft min-h-0 flex-1 overflow-y-auto px-5 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-xs leading-relaxed text-neutral-500">
          <strong>학생이 넣는 입장코드가 곧 교실입니다.</strong> 코드 하나가 반 하나이고, 그
          반을 맡은 선생님이 교사 화면에서 그 학생들의 발명노트를 봅니다. 학생이 할 일은 늘지
          않습니다 — 코드 하나 넣는 것은 그대로입니다.
        </p>

        {note && (
          <p
            className={cn(
              "flex items-start gap-1.5 text-xs",
              note.tone === "ok" ? "text-emerald-700" : "text-amber-800",
            )}
          >
            {note.tone === "bad" && <TriangleAlert className="mt-px size-3.5 shrink-0" />}
            {note.text}
          </p>
        )}

        <TeacherSection teachers={data.teachers} busy={busy} onSave={save} />
        <ClassroomSection
          classrooms={data.classrooms}
          teachers={data.teachers}
          busy={busy}
          onSave={save}
        />
      </div>
    </div>
  );
}

// ── 선생님 ──────────────────────────────────────────────────

function TeacherSection({
  teachers,
  busy,
  onSave,
}: {
  teachers: Teacher[];
  busy: boolean;
  onSave: (body: Record<string, unknown>, done: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [loginCode, setLoginCode] = useState("");

  return (
    <section className="rounded-2xl border border-line bg-white px-6 py-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <Users className="size-4" /> 선생님
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        선생님은 <strong>로그인 코드</strong> 하나로 교사 화면에 들어갑니다. 이메일·비밀번호는
        받지 않습니다.
      </p>

      {teachers.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {teachers.map((teacher) => (
            <li
              key={teacher.id}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"
            >
              <span className="font-medium">{teacher.name}</span>
              <span className="flex items-center gap-1.5 font-mono text-xs text-neutral-500">
                <KeyRound className="size-3.5" />
                {teacher.loginCode}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="선생님 이름"
          className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <input
          value={loginCode}
          onChange={(event) => setLoginCode(event.target.value)}
          placeholder="로그인 코드"
          className="w-36 rounded-lg border border-line px-3 py-2 font-mono text-sm outline-none focus:border-neutral-400"
        />
        <button
          type="button"
          disabled={busy || !name.trim() || !loginCode.trim()}
          onClick={() =>
            onSave({ what: "teacher", name, loginCode }, () => {
              setName("");
              setLoginCode("");
            })
          }
          className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-300"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          추가
        </button>
      </div>
    </section>
  );
}

// ── 교실 ────────────────────────────────────────────────────

function ClassroomSection({
  classrooms,
  teachers,
  busy,
  onSave,
}: {
  classrooms: Classroom[];
  teachers: Teacher[];
  busy: boolean;
  onSave: (body: Record<string, unknown>, done: () => void) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const nameOf = (id: string | null) =>
    teachers.find((teacher) => teacher.id === id)?.name ?? null;

  return (
    <section className="rounded-2xl border border-line bg-white px-6 py-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <GraduationCap className="size-4" /> 교실
      </h2>
      <p className="mt-1 text-xs text-neutral-500">
        코드는 학생이 첫 화면에서 넣는 값입니다.{" "}
        <strong>코드를 바꾸면 그 반 학생은 다시 넣어야 합니다</strong> (대화는 그대로
        이어집니다).
      </p>

      {classrooms.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {classrooms.map((room) => (
            <li
              key={room.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs">
                  {room.code}
                </span>
                <span className="font-medium">{room.name}</span>
              </span>

              <span className="flex items-center gap-2 text-xs text-neutral-500">
                {nameOf(room.teacherId) ? (
                  <span className="flex items-center gap-1 text-emerald-700">
                    <Check className="size-3.5" />
                    {nameOf(room.teacherId)}
                  </span>
                ) : (
                  <span className="text-amber-700">담당 선생님 없음</span>
                )}

                <select
                  value={room.teacherId ?? ""}
                  disabled={busy}
                  onChange={(event) =>
                    onSave(
                      {
                        id: room.id,
                        code: room.code,
                        name: room.name,
                        teacherId: event.target.value || null,
                      },
                      () => {},
                    )
                  }
                  className="rounded border border-line px-2 py-1 text-xs outline-none focus:border-neutral-400"
                >
                  <option value="">— 선생님 지정 —</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="입장코드"
          className="w-32 rounded-lg border border-line px-3 py-2 font-mono text-sm outline-none focus:border-neutral-400"
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="교실 이름 (예: 성수중 3학년 발명반)"
          className="min-w-48 flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <select
          value={teacherId}
          onChange={(event) => setTeacherId(event.target.value)}
          className="rounded-lg border border-line px-2 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="">— 선생님 —</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !code.trim() || !name.trim()}
          onClick={() =>
            onSave({ code, name, teacherId: teacherId || null }, () => {
              setCode("");
              setName("");
              setTeacherId("");
            })
          }
          className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-300"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          추가
        </button>
      </div>
    </section>
  );
}
