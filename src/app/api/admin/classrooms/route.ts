import { NextResponse } from "next/server";

import { isAdmin } from "@/lib/admin/auth";
import {
  findDuplicateCode,
  validateClassroom,
  validateClassroomName,
} from "@/lib/classroom/rules";
import {
  listClassrooms,
  listTeachers,
  saveClassroom,
  saveTeacher,
} from "@/lib/classroom/store";
import { validateEntryCode } from "@/lib/entry/rules";

/**
 * 교실·선생님 관리 — 관리자만.
 *
 * **교실 코드가 곧 학생 입장코드다** (대표님 결정). 그래서 코드 규칙은
 * 입장코드의 것을 그대로 쓴다 — 여기서 저장은 됐는데 학생이 못 들어가면 안 된다.
 */
export const runtime = "nodejs";

const NOT_READY =
  "교실 표가 아직 없습니다. supabase/classrooms.sql 을 Supabase에서 실행해 주세요. " +
  "(그때까지는 예전 방식대로 입장코드 하나로 들어옵니다)";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자만 볼 수 있습니다." }, { status: 401 });
  }

  const [rooms, teachers] = await Promise.all([listClassrooms(), listTeachers()]);
  if (!rooms.ready || !teachers.ready) {
    return NextResponse.json({ ready: false, error: NOT_READY });
  }

  return NextResponse.json({
    ready: true,
    classrooms: rooms.value,
    teachers: teachers.value,
  });
}

/** 교실 또는 선생님 한 건 만들기·고치기 */
export async function PUT(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "관리자만 고칠 수 있습니다." }, { status: 401 });
  }

  let body: {
    what?: unknown;
    id?: unknown;
    code?: unknown;
    name?: unknown;
    teacherId?: unknown;
    loginCode?: unknown;
    active?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const id = typeof body.id === "string" && body.id ? body.id : undefined;
  const active = typeof body.active === "boolean" ? body.active : undefined;

  try {
    if (body.what === "teacher") {
      const name = validateClassroomName(body.name);
      if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });

      const loginCode = validateEntryCode(body.loginCode);
      if (!loginCode.ok) {
        return NextResponse.json(
          { error: `선생님 로그인 코드: ${loginCode.error}` },
          { status: 400 },
        );
      }

      await saveTeacher({ id, name: name.name, loginCode: loginCode.code, active });
    } else {
      const checked = validateClassroom({ code: body.code, name: body.name });
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

      // 같은 코드가 두 교실에 있으면 학생이 어느 반으로 갈지 정해지지 않는다
      const rooms = await listClassrooms();
      if (rooms.ready) {
        const clash = findDuplicateCode(rooms.value, checked.code, id);
        if (clash) {
          return NextResponse.json(
            { error: `그 코드는 이미 「${clash.name}」이 쓰고 있습니다.` },
            { status: 409 },
          );
        }
      }

      await saveClassroom({
        id,
        code: checked.code,
        name: checked.name,
        teacherId: typeof body.teacherId === "string" && body.teacherId ? body.teacherId : null,
        active,
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          `저장하지 못했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}. ` +
          NOT_READY,
      },
      { status: 502 },
    );
  }

  const [rooms, teachers] = await Promise.all([listClassrooms(), listTeachers()]);
  return NextResponse.json({
    ok: true,
    ready: rooms.ready && teachers.ready,
    classrooms: rooms.ready ? rooms.value : [],
    teachers: teachers.ready ? teachers.value : [],
  });
}
