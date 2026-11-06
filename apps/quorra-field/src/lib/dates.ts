export const DAY = 24 * 60 * 60 * 1000;

export const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
// US-style week: Sunday start.
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -d.getDay());
export const startOfMonth = (d: Date) => {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
};
export const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  return x;
};
export const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const fmtDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const fmtDayShort = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtMonth = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

// <input type="datetime-local"> helpers (local time, no timezone suffix)
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => new Date(v).toISOString();
export const toDateInput = (iso: string) => toLocalInput(iso).slice(0, 10);
export const fromDateInput = (v: string) => new Date(`${v}T12:00:00`).toISOString();

// Date + time pickers: a date field and a time-of-day list in 15-minute steps (instead of one datetime-local box).
export const timeOptions = (() => {
  const out: { v: string; label: string }[] = [];
  for (let m = 5 * 60; m <= 21 * 60 + 45; m += 15) {
    const h = Math.floor(m / 60), mm = m % 60;
    const label = `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    out.push({ v: `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, label });
  }
  return out;
})();
/** Round a "HH:MM" value to the nearest 15 minutes so it matches the list. */
export const snapTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(21 * 60 + 45, Math.max(5 * 60, Math.round((h * 60 + m) / 15) * 15));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
export const toInputDate = (d: Date) => toLocalInput(d.toISOString()).slice(0, 10);

/** "2 h 30 min" style duration from minutes. */
export const fmtDuration = (mins: number) => {
  const m = Math.round(mins);
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`;
};
export const quotedMinutes = (j: { start_at: string; end_at: string }) => Math.round((new Date(j.end_at).getTime() - new Date(j.start_at).getTime()) / 60000);
/** Over / under text for actual vs quoted. */
export const fmtVariance = (actual: number, quoted: number) => {
  const d = actual - quoted;
  if (Math.abs(d) < 5) return "On the quoted time";
  return `${fmtDuration(Math.abs(d))} ${d > 0 ? "over" : "under"} the quote`;
};
