import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { maps } from "@/db/schema";
import { parseMapJson } from "@/lib/persistence";

/** Same cap the client seam enforces before it ever sends the request —
 *  belt and suspenders, since the server is the actual authority. */
const MAX_BODY_BYTES = 1_000_000;

/** List this user's maps — title/updatedAt only, never the doc itself
 *  (a "My maps" list has no reason to pull every map's full JSON). */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select({ id: maps.id, title: maps.title, updatedAt: maps.updatedAt })
    .from(maps)
    .where(eq(maps.userId, session.user.id))
    .orderBy(desc(maps.updatedAt));
  return NextResponse.json(rows);
}

/** Save the current map as a new cloud map. */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 200)
      : "Untitled map";
  let doc;
  try {
    // Re-run the exact same validate/heal pass a file import gets — a
    // malformed or hand-edited doc never reaches the database as-is.
    doc = parseMapJson(JSON.stringify(body.doc));
  } catch {
    return NextResponse.json({ error: "Invalid map" }, { status: 400 });
  }
  const [row] = await db
    .insert(maps)
    .values({ userId: session.user.id, title, doc })
    .returning({ id: maps.id, title: maps.title, updatedAt: maps.updatedAt });
  return NextResponse.json(row, { status: 201 });
}
