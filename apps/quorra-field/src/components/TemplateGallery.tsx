import { useEffect, useRef, useState } from "react";
import { Sheet } from "./ui";

export interface GalleryItem { id: string; name: string; desc: string; html: string; /** A page to show instead of rendered HTML (used for the built-in form). */ src?: string }

const THUMB_W = 150;

/** Full-size preview: the page is drawn at its design width, scaled to fit the sheet, and scrolls if taller. */
function BigPreview({ html, src, pageW, pageH, title }: { html: string; src?: string; pageW: number; pageH: number; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 320)); ro.observe(el); setW(el.clientWidth || 320);
    return () => ro.disconnect();
  }, []);
  const k = Math.min(1, w / pageW);
  return (
    <div ref={ref} style={{ width: "100%", height: "65vh", overflowY: "auto", overflowX: "hidden", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }}>
      <div style={{ height: pageH * k, width: "100%", overflow: "hidden" }}>
        <iframe title={title} sandbox={src ? "allow-scripts allow-forms" : ""} {...(src ? { src } : { srcDoc: html })} style={{ width: pageW, height: pageH, border: 0, transform: `scale(${k})`, transformOrigin: "0 0", display: "block" }} />
      </div>
    </div>
  );
}

/** A row of small live previews. Tap one to see it full size, or press Use to choose it. */
export default function TemplateGallery({ items, render, pageW, pageH, currentId, busy, onPick, previewNote }: {
  items: GalleryItem[];
  /** Turns a template into the page shown in the preview (fills in sample data). */
  render(html: string): string;
  /** Size of the page the template is designed for, so the thumbnail can be scaled to fit. */
  pageW: number;
  pageH: number;
  currentId?: string;
  busy?: boolean;
  onPick(item: GalleryItem): void;
  previewNote?: string;
}) {
  const [big, setBig] = useState<GalleryItem | null>(null);
  const scale = THUMB_W / pageW;
  return (
    <>
      <div className="tpl-grid">
        {items.map((t) => {
          const on = currentId === t.id;
          return (
            <div key={t.id} className={`tpl${on ? " on" : ""}`}>
              <button type="button" className="tpl-thumb" style={{ width: THUMB_W, height: Math.round(pageH * scale), padding: 0, cursor: "pointer" }} onClick={() => setBig(t)} aria-label={`Preview ${t.name}`}>
                <iframe title={t.name} sandbox={t.src ? "allow-scripts" : ""} tabIndex={-1} {...(t.src ? { src: t.src } : { srcDoc: render(t.html) })} style={{ width: pageW, height: pageH, transform: `scale(${scale})` }} />
              </button>
              <div className="tpl-name">{t.name}</div>
              <div className="tpl-desc">{t.desc}</div>
              {on ? <span className="badge blue">In use</span> : <button type="button" className="btn sm primary" disabled={busy} onClick={() => onPick(t)}>Use this</button>}
            </div>
          );
        })}
      </div>
      {big && (
        <Sheet title={big.name} onClose={() => setBig(null)}>
          <div className="stack">
            {previewNote && <p className="small muted" style={{ margin: 0 }}>{previewNote}</p>}
            <BigPreview title={`${big.name} preview`} src={big.src} html={big.src ? "" : render(big.html)} pageW={pageW} pageH={pageH} />
            <button type="button" className="btn primary block" disabled={busy} onClick={() => { const t = big; setBig(null); onPick(t); }}>Use this layout</button>
          </div>
        </Sheet>
      )}
    </>
  );
}
