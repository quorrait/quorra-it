import { PUBLIC_PRIVACY_URL, PUBLIC_TERMS_URL } from "../lib/publicUrl";

const link = { target: "_blank", rel: "noopener" } as const;

/** Shown on signup and plan selection, where continuing creates or pays for an account. */
export function AgreeLine() {
  return (
    <p className="small muted" style={{ margin: 0 }}>
      By continuing you agree to the <a href={PUBLIC_TERMS_URL} {...link}>Terms</a> and <a href={PUBLIC_PRIVACY_URL} {...link}>Privacy Policy</a>.
    </p>
  );
}

/** Sign-in and other screens that are not a signup. */
export function LegalLinks() {
  return (
    <p className="small muted" style={{ margin: 0, textAlign: "center" }}>
      <a href={PUBLIC_TERMS_URL} {...link}>Terms</a>
      {" · "}
      <a href={PUBLIC_PRIVACY_URL} {...link}>Privacy Policy</a>
    </p>
  );
}
