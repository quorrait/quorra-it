import { setUnsaved } from "./unsaved";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface Entry { dirty: boolean; save: () => Promise<unknown> }
const Ctx = createContext<((key: string, e: Entry | null) => void) | null>(null);

/** Lets every settings card register its unsaved changes, so the page can show one Save button (top and bottom). */
export function SaveAllProvider({ children }: { children: ReactNode }) {
  const map = useRef(new Map<string, Entry>());
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  const set = (k: string, e: Entry | null) => {
    const prev = map.current.get(k);
    if (e) map.current.set(k, e); else map.current.delete(k);
    if (Boolean(prev?.dirty) !== Boolean(e?.dirty)) bump((n) => n + 1);
  };
  const dirty = Array.from(map.current.values()).some((e) => e.dirty);
  useEffect(() => { setUnsaved("settings", dirty); return () => setUnsaved("settings", false); }, [dirty]);
  async function saveAll() {
    setBusy(true);
    try { for (const e of Array.from(map.current.values())) if (e.dirty) await e.save(); }
    finally { setBusy(false); }
  }
  const bar = (pos: string) => (
    <div className={`savebar2 ${dirty ? "dirty" : ""}`} data-pos={pos}>
      <span className="small">{dirty ? "You have unsaved changes" : "All changes saved"}</span>
      <button className="btn primary" disabled={!dirty || busy} onClick={() => void saveAll()}>{busy ? "Saving..." : "Save changes"}</button>
    </div>
  );
  return <Ctx.Provider value={set}>{bar("top")}{children}{bar("bottom")}</Ctx.Provider>;
}

/** Registers a card's dirty state and save function with the page's Save button. */
export function useRegisterSave(key: string, dirty: boolean, save: () => Promise<unknown>) {
  const set = useContext(Ctx);
  const ref = useRef(save);
  ref.current = save;
  useEffect(() => {
    set?.(key, { dirty, save: () => ref.current() });
  });
  useEffect(() => () => set?.(key, null), [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
