"use client";

/* ════════════════════════════════════════════════════════════════════
   CLOUD — the client half of the persistence seam (lib/persistence.ts
   is the file half). Same MapDoc round-trips through both; this one
   just goes over the network to app/api/maps/* instead of the
   filesystem. Every call throws a CloudError with a message safe to
   show directly in a notice pill. */

import type { MapDoc } from "@/lib/types";

export class CloudError extends Error {}

export type MapSummary = { id: string; title: string; updatedAt: string };
export type MapRecord = MapSummary & { doc: MapDoc };

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) {
      throw new CloudError("Sign in to use cloud maps.");
    }
    if (res.status === 404) {
      throw new CloudError("That map is gone — it may have been deleted.");
    }
    const body = await res.json().catch(() => null);
    throw new CloudError(
      (body && typeof body.error === "string" && body.error) ||
        "Something went wrong reaching your maps.",
    );
  }
  return res.json() as Promise<T>;
}

export async function listMaps(): Promise<MapSummary[]> {
  const res = await fetch("/api/maps");
  return asJson(res);
}

export async function createMap(
  title: string,
  doc: MapDoc,
): Promise<MapSummary> {
  const res = await fetch("/api/maps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, doc }),
  });
  return asJson(res);
}

export async function updateMap(
  id: string,
  patch: { title?: string; doc?: MapDoc },
): Promise<MapSummary> {
  const res = await fetch(`/api/maps/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return asJson(res);
}

export async function loadCloudMap(id: string): Promise<MapRecord> {
  const res = await fetch(`/api/maps/${id}`);
  return asJson(res);
}

export async function deleteMap(id: string): Promise<void> {
  const res = await fetch(`/api/maps/${id}`, { method: "DELETE" });
  await asJson(res);
}
