import { isUsStorefront, openBuyPage } from "../lib/iosPlan";
import { PUBLIC_SITE_URL } from "../lib/publicUrl";

/** iOS only. US storefront gets one website button. Everywhere else gets text with no link. */
export default function BuyService() {
  if (!isUsStorefront()) {
    return <p className="muted" style={{ margin: 0 }}>Sign up or manage your plan at {PUBLIC_SITE_URL.replace(/^https:\/\//, "")}</p>;
  }
  return (
    <button type="button" className="btn primary block" onClick={() => void openBuyPage()}>Buy service</button>
  );
}
