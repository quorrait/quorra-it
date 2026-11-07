/** Text to show for a failure. Database errors are plain objects, not Error instances, so read their message too. */
export function errMsg(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e !== null && "message" in e ? String((e as { message: unknown }).message) : "";
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code === "42501" || /row-level security/i.test(m)) return "Your plan is not active, or you do not have permission to do this. Check Billing.";
  if (code === "23505") return "That number is already used. Try again.";
  return m || fallback;
}
