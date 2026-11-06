import type { Payment } from "./types";
import { addDays, addMonths, startOfDay, startOfMonth, startOfWeek } from "./dates";

const sum = (ps: Payment[], from: Date, to: Date) =>
  ps
    .filter((p) => {
      const t = new Date(p.paid_at).getTime();
      return t >= from.getTime() && t < to.getTime();
    })
    .reduce((s, p) => s + p.amount_cents, 0);

export function earningsSummary(payments: Payment[], now = new Date()) {
  const today = startOfDay(now);
  const week = startOfWeek(now);
  const month = startOfMonth(now);
  const end = addDays(today, 1);
  // Compare against the same stretch of last month, not the whole month, so day 6 isn't judged against day 30.
  const prevMonth = addMonths(month, -1);
  const daysIn = Math.round((end.getTime() - month.getTime()) / 86400_000);
  const prevEnd = new Date(Math.min(addDays(prevMonth, daysIn).getTime(), month.getTime()));
  return {
    today: sum(payments, today, end),
    week: sum(payments, week, end),
    month: sum(payments, month, end),
    lastMonth: sum(payments, prevMonth, prevEnd),
    yesterday: sum(payments, addDays(today, -1), today),
  };
}

export interface Bar {
  label: string;
  value: number;
  current: boolean;
}

export function dailySeries(payments: Payment[], days = 14, now = new Date()): Bar[] {
  const today = startOfDay(now);
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i - (days - 1));
    return {
      label: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      value: sum(payments, d, addDays(d, 1)),
      current: i === days - 1,
    };
  });
}

export function weeklySeries(payments: Payment[], weeks = 8, now = new Date()): Bar[] {
  const thisWeek = startOfWeek(now);
  return Array.from({ length: weeks }, (_, i) => {
    const w = addDays(thisWeek, (i - (weeks - 1)) * 7);
    return {
      label: w.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
      value: sum(payments, w, addDays(w, 7)),
      current: i === weeks - 1,
    };
  });
}

export function monthlySeries(payments: Payment[], months = 6, now = new Date()): Bar[] {
  const thisMonth = startOfMonth(now);
  return Array.from({ length: months }, (_, i) => {
    const m = addMonths(thisMonth, i - (months - 1));
    return {
      label: m.toLocaleDateString("en-US", { month: "short" }),
      value: sum(payments, m, addMonths(m, 1)),
      current: i === months - 1,
    };
  });
}
