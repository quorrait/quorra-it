import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { acceptInvite, codeFromHash, inviteInfo, rememberInvite } from "../lib/team";
import { useAuth, useData } from "../lib/app";
import { Spinner } from "../components/ui";

/** Reached from an invite link while already signed in. If this is not the invited person, offer to sign out and create their account. */
export default function Join() {
  const nav = useNavigate();
  const auth = useAuth();
  const { refresh } = useData();
  const [msg, setMsg] = useState<string | null>(null);
  const [other, setOther] = useState<{ business: string; email: string } | null>(null);
  useEffect(() => {
    const code = codeFromHash();
    if (!code) { nav("/", { replace: true }); return; }
    void (async () => {
      const info = await inviteInfo(code);
      if (info && auth.email && info.email.toLowerCase() !== auth.email.toLowerCase()) { rememberInvite(code); setOther({ business: info.business, email: info.email }); return; }
      const err = await acceptInvite(code);
      rememberInvite(null);
      if (err) return setMsg(err);
      await refresh();
      nav("/", { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (other) return (
    <div className="auth"><div className="auth-card stack">
      <div className="auth-head">
        <img className="auth-mark" src={`${import.meta.env.BASE_URL}logo-mark-v2.png`} alt="" />
        <h1>Join {other.business}</h1>
        <p className="muted">This invite is for <b>{other.email}</b>, but you are signed in as <b>{auth.email}</b>. Sign out to create the account for {other.email}.</p>
      </div>
      <button className="btn primary block" onClick={() => void auth.signOut()}>Sign out and create account</button>
      <button className="btn block" onClick={() => nav("/", { replace: true })}>Stay signed in as {auth.email}</button>
    </div></div>
  );
  if (msg) return <div className="empty">{msg}</div>;
  return <Spinner />;
}
