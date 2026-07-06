import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { maps } from "@/db/schema";
import { parseMapJson } from "@/lib/persistence";

const MAX_BODY_BYTES = 1_000_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id would otherwise reach Postgres as an invalid uuid
 *  literal and throw a raw 500 — fail cleanly instead. */
function badId(id: string) {
  return !UUID_RE.test(id);
}

async function ownsMap(id: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: maps.id })
    .from(maps)
    .where(and(eq(maps.id, id), eq(maps.userId, userId)));
  return !!row;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (badId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [row] = await db
    .select({ id: maps.id, title: maps.title, doc: maps.doc, updatedAt: maps.updatedAt })
    .from(maps)
    .where(and(eq(maps.id, id), eq(maps.userId, session.user.id)));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

/** Rename and/or overwrite a map's doc. Either field may be omitted. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (badId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await ownsMap(id, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Map is too large" }, { status: 413 });
  }
  let body: { title?: unknown; doc?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const patch: Partial<typeof maps.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim().slice(0, 200);
  }
  if (body.doc !== undefined) {
    try {
      patch.doc = parseMapJson(JSON.stringify(body.doc));
    } catch {
      return NextResponse.json({ error: "Invalid map" }, { status: 400 });
    }
  }
  const [row] = await db
    .update(maps)
    .set(patch)
    .where(eq(maps.id, id))
    .returning({ id: maps.id, title: maps.title, updatedAt: maps.updatedAt });
  return NextResponse.json(row);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (badId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await ownsMap(id, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await db.delete(maps).where(eq(maps.id, id));
  return NextResponse.json({ ok: true });
}
