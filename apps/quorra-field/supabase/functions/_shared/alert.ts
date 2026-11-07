// Tells the business something happened: an in-app notification for everyone on the account, plus email (and text if a number is set).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendEmail, sendSms } from "./notify.ts";

export async function notifyAccount(db: SupabaseClient, ownerId: string, o: { title: string; body: string; link?: string }) {
  await db.from("notifications").insert({ owner_id: ownerId, title: o.title, body: o.body, link: o.link ?? "" });
  const { data: biz } = await db.from("business").select("email,phone,notify_email,notify_phone").eq("owner_id", ownerId).maybeSingle();
  const to = (biz?.notify_email as string) || (biz?.email as string) || "";
  if (to) await sendEmail({ to, subject: o.title, text: o.body });
  if (biz?.notify_phone) await sendSms({ to: biz.notify_phone as string, body: `${o.title}. ${o.body}`.slice(0, 300) });
}
