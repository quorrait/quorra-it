import { useData } from "../lib/app";
import type { DocTemplate, TemplateKind } from "../lib/types";

/** Dropdown that applies a saved template to the form it sits in. */
export default function TemplatePicker({ kind, onPick }: { kind: TemplateKind; onPick(t: DocTemplate): void }) {
  const { docTemplates } = useData();
  const list = docTemplates.filter((t) => t.kind === kind);
  if (list.length === 0) return null;
  return (
    <select className="select" value="" onChange={(e) => { const t = list.find((x) => x.id === e.target.value); if (t) onPick(t); }} aria-label="Use a template">
      <option value="">Start from a template...</option>
      {list.map((t) => <option key={t.id} value={t.id}>{t.name}{t.trade ? ` · ${t.trade}` : ""}</option>)}
    </select>
  );
}
