import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { acceptInvite, codeFromHash, rememberInvite } from "../lib/team";
import { useData } from "../lib/app";
import { Spinner } from "../components/ui";

/** Reached from an invite link while already signed in. */
export default function Join() {
  const nav = useNavigate();
  const { refresh } = useData();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const code = codeFromHash();
    if (!code) { nav("/", { replace: true }); return; }
    void acceptInvite(code).then(async (err) => {
      rememberInvite(null);
      if (err) return setMsg(err);
      await refresh();
      nav("/", { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (msg) return <div className="empty">{msg}</div>;
  return <Spinner />;
}
