import { useMemo, useRef, useState } from "react";
import { useData } from "../lib/app";
import { downloadCsv, parseCsv } from "../lib/csv";
import { autoMap, ENTITIES, templateCsv, type Entity } from "../lib/importers";
import { Spinner, useToast } from "../components/ui";

export default function Import() {
  const { loading, store, customers, invoices, jobs, refresh } = useData();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<Entity>(ENTITIES[0]);
  const [file, setFile] = useState<string | null>(null);
  const [table, setTable] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<string, number>>({});
  const [skipDup, setSkipDup] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const headers = table[0] ?? [];
  const data = table.slice(1);

  const built = useMemo(() => {
    const ctx = { customers: [...customers], invoices: [...invoices], jobs, store };
    return data.map((cells, i) => {
      const r: Record<string, string> = {};
      for (const f of entity.fields) { const idx = map[f.key]; r[f.key] = idx === undefined || idx < 0 ? "" : (cells[idx] ?? "").trim(); }
      const res = entity.build(r, ctx);
      // Later rows in the same file should see earlier ones, so repeats inside the file count as duplicates too.
      if (!("error" in res) && !res.dup) {
        if (entity.key === "customers") ctx.customers.push({ id: "", name: String(res.value.name), email: String(res.value.email), phone: "", address: "", notes: "" } as never);
        if (entity.key === "invoices") ctx.invoices.push({ number: res.value.number as number } as never);
      }
      return { line: i + 2, res };
    });
  }, [data, map, entity, customers, invoices, jobs, store]);

  const bad = built.filter((b) => "error" in b.res);
  const dups = built.filter((b) => !("error" in b.res) && b.res.dup);
  const toImport = built.filter((b) => !("error" in b.res) && !(skipDup && b.res.dup));
  const missingReq = entity.fields.filter((f) => f.required && map[f.key] === undefined);

  function reset(e: Entity) { setEntity(e); setFile(null); setTable([]); setMap({}); setResult(null); if (fileRef.current) fileRef.current.value = ""; }

  async function onFile(f: File) {
    const t = parseCsv(await f.text());
    if (t.length < 2) return toast("That file has no data rows");
    setFile(f.name); setTable(t); setMap(autoMap(entity, t[0])); setResult(null);
  }

  async function run() {
    setBusy(true);
    let ok = 0, failed = 0;
    const ctx = { customers: [...customers], invoices: [...invoices], jobs, store };
    for (const b of toImport) {
      try { if (!("error" in b.res)) { await entity.save(b.res.value, ctx); ok++; } } catch { failed++; }
    }
    await refresh();
    setBusy(false);
    setResult(`Imported ${ok} ${entity.label.toLowerCase()}${failed ? `, ${failed} failed` : ""}${skipDup && dups.length ? `, skipped ${dups.length} duplicates` : ""}${bad.length ? `, ${bad.length} rows had problems and were skipped` : ""}.`);
    setFile(null); setTable([]); setMap({});
    if (fileRef.current) fileRef.current.value = "";
  }

  if (loading) return <Spinner />;

  return (
    <div className="stack">
      <div className="page-head"><div><h1 className="page-title">Import</h1><p className="page-sub">Bring your data over from a spreadsheet or another app (CSV).</p></div></div>

      <div className="chips">{ENTITIES.map((e) => <button key={e.key} className={`chip${entity.key === e.key ? " on" : ""}`} onClick={() => reset(e)}>{e.label}</button>)}</div>

      <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>1. Get the template</div>
        <p className="small muted">{entity.hint} Columns: {entity.fields.map((f) => f.label + (f.required ? "*" : "")).join(", ")}.</p>
        <div><button className="btn" onClick={() => downloadCsv(`${entity.key}-template.csv`, templateCsv(entity))}>Download {entity.label.toLowerCase()} template</button></div>
      </div>

      <div className="card stack">
        <div className="card-title" style={{ margin: 0 }}>2. Upload your CSV</div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        <p className="small muted">In Excel or Google Sheets: File, Download or Save As, CSV. Column names are matched automatically; you can fix any below.</p>
        {result && <div className="notice">{result}</div>}
      </div>

      {file && (
        <div className="card stack">
          <div className="card-title" style={{ margin: 0 }}>3. Check the match · {file}</div>
          <div className="grid2 stack-sm">
            {entity.fields.map((f) => (
              <label key={f.key} className="field"><span className="small bold">{f.label}{f.required ? " *" : ""}</span>
                <select className="select" value={map[f.key] ?? -1} onChange={(e) => { const v = Number(e.target.value); setMap((m) => { const n = { ...m }; if (v < 0) delete n[f.key]; else n[f.key] = v; return n; }); }}>
                  <option value={-1}>(skip)</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          {missingReq.length > 0 && <div className="notice" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>Pick a column for: {missingReq.map((f) => f.label).join(", ")}</div>}

          <div className="small"><b>{toImport.length}</b> ready · {dups.length} duplicates · <span style={{ color: bad.length ? "var(--bad)" : undefined }}>{bad.length} with problems</span> · {data.length} rows total</div>
          <label className="row small"><input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} /> Skip duplicates (same name, email or invoice number)</label>

          {bad.length > 0 && (
            <div className="small" style={{ maxHeight: 120, overflow: "auto" }}>
              {bad.slice(0, 20).map((b) => <div key={b.line} style={{ color: "var(--bad)" }}>Row {b.line}: {"error" in b.res ? b.res.error : ""}</div>)}
              {bad.length > 20 && <div className="muted">and {bad.length - 20} more...</div>}
            </div>
          )}

          <div>
            <table className="tbl tbl-cards">
              <thead><tr>{entity.fields.filter((f) => map[f.key] !== undefined).map((f) => <th key={f.key}>{f.label.split(" (")[0]}</th>)}</tr></thead>
              <tbody>
                {data.slice(0, 5).map((cells, i) => <tr key={i}>{entity.fields.filter((f) => map[f.key] !== undefined).map((f) => <td key={f.key} data-label={f.label.split(" (")[0]}>{cells[map[f.key]]}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <button className="btn primary block" disabled={busy || missingReq.length > 0 || toImport.length === 0} onClick={run}>{busy ? "Importing..." : `Import ${toImport.length} ${entity.label.toLowerCase()}`}</button>
        </div>
      )}
    </div>
  );
}
