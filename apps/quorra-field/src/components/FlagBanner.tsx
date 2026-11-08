import type { Customer } from "../lib/types";
import { useConfirm } from "./ui";

/** Shows a customer's flag and the note about what went wrong. */
export function FlagBanner({ c }: { c?: Customer }) {
  if (!c?.flag) return null;
  return (
    <div className={`notice ${c.flag === "blocked" ? "bad" : "warn"}`}>
      <b>{c.flag === "blocked" ? `${c.name} is blacklisted: do not serve` : `Caution with ${c.name}`}</b>
      <div className="small">{c.flag_note || "No note was added."}</div>
    </div>
  );
}

/** Before saving new work for a blacklisted customer, make sure it is on purpose. */
export function useBlockedGuard() {
  const ask = useConfirm();
  return async (c?: Customer) => {
    if (c?.flag !== "blocked") return true;
    return ask({ title: `${c.name} is blacklisted`, message: c.flag_note || "This customer is marked do not serve.", confirmLabel: "Continue anyway", cancelLabel: "Cancel", danger: true });
  };
}
