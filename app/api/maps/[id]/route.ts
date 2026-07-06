import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { maps } from "@/db/schema";
import { parseMapJson } from "@/lib/persistence";
import { readCappedText } from "../read-body";

const MAX_BODY_BYTES = 1_000_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id would otherwise reach Postgres as an invalid uuid
 *  literal and throw a raw 500 — fail cleanly instead. */
function badId(id: string) {
  return !UUID_RE.test(id);
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
  const text = await readCappedText(request, MAX_BODY_BYTES);
  if (text === null) {
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
  // Ownership is enforced *in the statement*: filtering by userId here (not
  // in a prior read) makes the check atomic — no TOCTOU window, one round
  // trip. An empty result means the map is gone or not this user's → 404.
  const [row] = await db
    .update(maps)
    .set(patch)
    .where(and(eq(maps.id, id), eq(maps.userId, session.user.id)))
    .returning({ id: maps.id, title: maps.title, updatedAt: maps.updatedAt });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
  const deleted = await db
    .delete(maps)
    .where(and(eq(maps.id, id), eq(maps.userId, session.user.id)))
    .returning({ id: maps.id });
  if (!deleted.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
