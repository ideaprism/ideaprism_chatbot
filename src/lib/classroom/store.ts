/**
 * 교실·선생님 저장소 (서버 전용).
 *
 * 표가 아직 없을 수도 있다 — `supabase/classrooms.sql` 을 실행하기 전이거나,
 * 실행 중에 잠깐 못 읽을 수도 있다. **그때 서비스가 멈추면 안 된다.**
 * 그래서 조회 결과를 `{ ready: false }` 로 돌려주고, 부르는 쪽이
 * 교실이 생기기 전의 방식(코드 하나짜리 입장코드)으로 되돌아갈 수 있게 한다.
 *
 * 학생이 문을 두드릴 때마다 교실을 확인하므로 **짧게 캐시**한다.
 * 관리자에서 고치면 즉시 비운다. (`prompts/store.ts` 와 같은 방식·같은 이유)
 */

import "server-only";

import { supabaseWrite } from "@/lib/supabase";
import type { Classroom } from "./rules";

export type { Classroom } from "./rules";

/** 선생님 한 명 */
export interface Teacher {
  id: string;
  name: string;
  /** 3.0에 들어갈 때 넣는 코드 */
  loginCode: string;
  active: boolean;
}

/**
 * 표를 못 읽었는가(`ready:false`), 읽었는데 없는가(`value:null`).
 * 이 둘을 뭉뚱그리면 "표가 아직 없다"를 "그런 교실 없다"로 오해해 문을 잠가 버린다.
 */
export type Lookup<T> = { ready: true; value: T } | { ready: false };

const CACHE_TTL_MS = 20_000;

let cache: { at: number; classrooms: Classroom[]; teachers: Teacher[] } | null = null;
/** 표가 아직 없을 때 매 요청 오류를 내지 않도록 잠시 쉬어 간다 */
let unavailableUntil = 0;

export function clearClassroomCache() {
  cache = null;
  unavailableUntil = 0;
}

interface ClassroomRow {
  id: string;
  code: string;
  name: string;
  teacher_id: string | null;
  active: boolean;
}

interface TeacherRow {
  id: string;
  name: string;
  login_code: string;
  active: boolean;
}

function toClassroom(row: ClassroomRow): Classroom {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    teacherId: row.teacher_id,
    active: row.active,
  };
}

function toTeacher(row: TeacherRow): Teacher {
  return { id: row.id, name: row.name, loginCode: row.login_code, active: row.active };
}

/** 교실과 선생님을 한 번에 읽어 잠깐 들고 있는다 */
async function load(): Promise<Lookup<{ classrooms: Classroom[]; teachers: Teacher[] }>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return { ready: true, value: { classrooms: cache.classrooms, teachers: cache.teachers } };
  }
  if (now < unavailableUntil) return { ready: false };

  try {
    const db = supabaseWrite();
    const [rooms, teachers] = await Promise.all([
      db.from("classrooms").select("id, code, name, teacher_id, active"),
      db.from("teachers").select("id, name, login_code, active"),
    ]);

    if (rooms.error || teachers.error) throw rooms.error ?? teachers.error;

    const value = {
      classrooms: ((rooms.data ?? []) as ClassroomRow[]).map(toClassroom),
      teachers: ((teachers.data ?? []) as TeacherRow[]).map(toTeacher),
    };
    cache = { at: now, ...value };
    return { ready: true, value };
  } catch {
    unavailableUntil = now + 60_000;
    return { ready: false };
  }
}

export async function listClassrooms(): Promise<Lookup<Classroom[]>> {
  const found = await load();
  return found.ready ? { ready: true, value: found.value.classrooms } : { ready: false };
}

export async function listTeachers(): Promise<Lookup<Teacher[]>> {
  const found = await load();
  return found.ready ? { ready: true, value: found.value.teachers } : { ready: false };
}

/** 학생이 넣은 코드의 교실. 꺼 둔 교실은 없는 것으로 본다 */
export async function classroomByCode(code: string): Promise<Lookup<Classroom | null>> {
  const found = await load();
  if (!found.ready) return { ready: false };

  const room = found.value.classrooms.find((one) => one.active && one.code === code);
  return { ready: true, value: room ?? null };
}

/** 쪽지에 적힌 교실 (서명을 확인하려면 그 교실의 코드가 필요하다) */
export async function classroomById(id: string): Promise<Lookup<Classroom | null>> {
  const found = await load();
  if (!found.ready) return { ready: false };

  const room = found.value.classrooms.find((one) => one.active && one.id === id);
  return { ready: true, value: room ?? null };
}

// ── 고치기 (관리자에서만) ────────────────────────────────────

export async function saveClassroom(input: {
  id?: string;
  code: string;
  name: string;
  teacherId: string | null;
  active?: boolean;
}): Promise<void> {
  const row = {
    ...(input.id ? { id: input.id } : {}),
    code: input.code,
    name: input.name,
    teacher_id: input.teacherId,
    ...(input.active === undefined ? {} : { active: input.active }),
  };

  const { error } = await supabaseWrite().from("classrooms").upsert(row).select("id");
  if (error) throw new Error(error.message);
  clearClassroomCache();
}

export async function saveTeacher(input: {
  id?: string;
  name: string;
  loginCode: string;
  active?: boolean;
}): Promise<void> {
  const row = {
    ...(input.id ? { id: input.id } : {}),
    name: input.name,
    login_code: input.loginCode,
    ...(input.active === undefined ? {} : { active: input.active }),
  };

  const { error } = await supabaseWrite().from("teachers").upsert(row).select("id");
  if (error) throw new Error(error.message);
  clearClassroomCache();
}
