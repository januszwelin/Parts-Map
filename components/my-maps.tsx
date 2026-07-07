"use client";

/* ════════════════════════════════════════════════════════════════════
   MY MAPS — the cloud maps modal: list, open, rename, delete, save
   current map as a new cloud copy
   ════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from "react";
import type { MapDoc } from "@/lib/types";
import {
  listMaps,
  createMap,
  updateMap,
  loadCloudMap,
  deleteMap,
  CloudError,
  type MapSummary,
} from "@/lib/cloud";
import { panelStyle } from "@/lib/ui";
import { useFocusTrap } from "@/hooks/use-focus-trap";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A quiet "3 parts · edited Jul 6" line for a map row — gives a sense of
 *  a map's size and recency before opening it. The count is omitted when
 *  the summary doesn't carry it (e.g. straight off a create/rename, before
 *  the list re-fetch fills it in). */
function rowMeta(row: MapSummary) {
  const date = `edited ${formatDate(row.updatedAt)}`;
  if (row.partCount == null) return date;
  const parts = `${row.partCount} part${row.partCount === 1 ? "" : "s"}`;
  return `${parts} · ${date}`;
}

export function MyMapsModal({
  open,
  onClose,
  getCurrentDoc,
  isDirty,
  onOpenMap,
}: {
  open: boolean;
  onClose: () => void;
  /** Read lazily, only when "Save current map" is actually clicked. */
  getCurrentDoc: () => MapDoc;
  /** Read lazily, only when Open is actually clicked. */
  isDirty: () => boolean;
  onOpenMap: (id: string, title: string, doc: MapDoc) => void;
}) {
  const [rows, setRows] = useState<MapSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<MapSummary | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef);

  useEffect(() => {
    const openFresh = () => {
      if (!open) return;
      setError(null);
      setConfirmDeleteId(null);
      setConfirmOpen(null);
      listMaps()
        .then(setRows)
        .catch((e) =>
          setError(e instanceof CloudError ? e.message : "Couldn't load your maps."),
        );
    };
    openFresh();
  }, [open]);

  if (!open) return null;

  const refresh = () => listMaps().then(setRows).catch(() => {});

  const doOpen = async (row: MapSummary) => {
    setBusyId(row.id);
    try {
      const full = await loadCloudMap(row.id);
      onOpenMap(full.id, full.title, full.doc);
      onClose();
    } catch (e) {
      setError(e instanceof CloudError ? e.message : "Couldn't open that map.");
    } finally {
      setBusyId(null);
    }
  };

  const requestOpen = (row: MapSummary) => {
    if (isDirty()) {
      setConfirmOpen(row);
      return;
    }
    doOpen(row);
  };

  const doDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteMap(id);
      setRows((rs) => rs?.filter((r) => r.id !== id) ?? rs);
    } catch (e) {
      setError(e instanceof CloudError ? e.message : "Couldn't delete that map.");
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  };

  const commitRename = async (row: MapSummary) => {
    const title = renameText.trim();
    setRenamingId(null);
    if (!title || title === row.title) return;
    try {
      await updateMap(row.id, { title });
      refresh();
    } catch (e) {
      setError(e instanceof CloudError ? e.message : "Couldn't rename that map.");
    }
  };

  const saveCurrent = async () => {
    // Enter in the title field and the Save button share this path — the
    // latch stops a double-fire from creating two identical cloud maps.
    if (busyId) return;
    const title = saveTitle.trim() || "Untitled map";
    setBusyId("__save__");
    try {
      await createMap(title, getCurrentDoc());
      setSaveTitle("");
      refresh();
    } catch (e) {
      setError(e instanceof CloudError ? e.message : "Couldn't save this map.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      data-ui-chrome
      className="absolute inset-0 z-40 flex items-start justify-center p-4 pt-14 sm:items-center sm:pt-4"
      style={{ background: "rgba(58,55,51,0.18)" }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="my-maps-title"
        className="fade-in flex w-full max-w-md flex-col rounded-2xl p-4"
        style={{ ...panelStyle, background: "#FDFCFA", maxHeight: "80dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2">
          <h2 id="my-maps-title" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
            My maps
          </h2>
          <button
            aria-label="Close"
            className="rounded-md px-2 py-1 text-xs hover:bg-black/5"
            style={{ color: "var(--ink-faint)" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 pb-3">
          <input
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "rgba(255,255,255,0.7)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
            }}
            placeholder="Save current map as…"
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
          />
          <button
            className="shrink-0 rounded-lg px-3 py-2 text-xs text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--accent)" }}
            disabled={busyId === "__save__"}
            onClick={saveCurrent}
          >
            {busyId === "__save__" ? "Saving…" : "Save"}
          </button>
        </div>

        {error && (
          <p className="pb-2 text-[12px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto">
          {rows === null && (
            <p className="py-4 text-center text-xs" style={{ color: "var(--ink-faint)" }}>
              Loading…
            </p>
          )}
          {rows && rows.length === 0 && (
            <p className="py-4 text-center text-xs" style={{ color: "var(--ink-faint)" }}>
              No cloud maps yet — save your current one above.
            </p>
          )}
          {rows?.map((row) => (
            <div key={row.id} className="mb-1 rounded-xl px-2 py-2" style={{ background: "rgba(0,0,0,0.02)" }}>
              {confirmOpen?.id === row.id ? (
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className="flex-1 text-[12px]" style={{ color: "var(--ink-soft)" }}>
                    Unsaved changes — open anyway?
                  </span>
                  <button
                    className="rounded-md px-2 py-1 text-[11px] disabled:opacity-60"
                    style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                    disabled={busyId === row.id}
                    onClick={() => doOpen(row)}
                  >
                    {busyId === row.id ? "Opening…" : "Open anyway"}
                  </button>
                  <button
                    className="rounded-md px-2 py-1 text-[11px]"
                    style={{ color: "var(--ink-soft)" }}
                    onClick={() => setConfirmOpen(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : confirmDeleteId === row.id ? (
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className="flex-1 text-[12px]" style={{ color: "var(--ink-soft)" }}>
                    Delete “{row.title}”?
                  </span>
                  <button
                    className="rounded-md px-2 py-1 text-[11px] disabled:opacity-60"
                    style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                    disabled={busyId === row.id}
                    onClick={() => doDelete(row.id)}
                  >
                    {busyId === row.id ? "Deleting…" : "Delete"}
                  </button>
                  <button
                    className="rounded-md px-2 py-1 text-[11px]"
                    style={{ color: "var(--ink-soft)" }}
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    {renamingId === row.id ? (
                      <input
                        autoFocus
                        className="w-full rounded-md px-1.5 py-0.5 text-sm outline-none"
                        style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onBlur={() => commitRename(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                      />
                    ) : (
                      <button
                        className="block w-full truncate text-left text-sm"
                        style={{ color: "var(--ink)" }}
                        title="Rename"
                        onClick={() => {
                          setRenamingId(row.id);
                          setRenameText(row.title);
                        }}
                      >
                        {row.title}
                      </button>
                    )}
                    <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                      {rowMeta(row)}
                    </span>
                  </div>
                  <button
                    className="shrink-0 rounded-md px-2.5 py-1 text-[11px] disabled:opacity-60"
                    style={{ background: "rgba(0,0,0,0.05)", color: "var(--ink)" }}
                    disabled={busyId !== null}
                    onClick={() => requestOpen(row)}
                  >
                    {busyId === row.id ? "Opening…" : "Open"}
                  </button>
                  <button
                    aria-label="Delete map"
                    className="shrink-0 rounded-md px-2.5 py-1 text-[11px] disabled:opacity-60"
                    style={{ color: "var(--danger)", background: "var(--danger-bg)" }}
                    disabled={busyId !== null}
                    onClick={() => setConfirmDeleteId(row.id)}
                  >
                    delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
