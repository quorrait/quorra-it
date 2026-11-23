import { Capacitor } from "@capacitor/core";
import { Link } from "react-router-dom";
import { APP_NAME } from "../lib/config";
import { PUBLIC_PRIVACY_URL, PUBLIC_TERMS_URL } from "../lib/publicUrl";

/** Footer on the pages anyone can open (plans, contact, sign in). Hidden in the installed phone app. */
export default function PublicFooter() {
  if (Capacitor.isNativePlatform()) return null;
  return (
    <footer className="pubfoot" style={{ textAlign: "center", padding: "24px 16px 32px", fontSize: 13, color: "var(--muted, #64748b)" }}>
      <div className="pf-name" style={{ fontWeight: 700 }}>{APP_NAME} by Quorra IT LLC</div>
      <div style={{ marginTop: 6, display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
        <a href="tel:+19163027695" style={{ color: "inherit" }}>(916) 302-7695</a>
        <a href="mailto:support@quorrait.com" style={{ color: "inherit" }}>support@quorrait.com</a>
        <Link to="/contact" style={{ color: "inherit" }}>Contact us</Link>
        <Link to="/plans" style={{ color: "inherit" }}>Plans</Link>
        <a href={PUBLIC_TERMS_URL} style={{ color: "inherit" }}>Terms</a>
        <a href={PUBLIC_PRIVACY_URL} style={{ color: "inherit" }}>Privacy</a>
        <a href="https://www.quorrait.com" style={{ color: "inherit" }}>quorrait.com</a>
      </div>
      <div style={{ marginTop: 8 }}>&copy; {new Date().getFullYear()} Quorra IT LLC</div>
    </footer>
  );
}
