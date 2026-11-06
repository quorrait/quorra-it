import { useData } from "../lib/app";

/** Letterhead that only shows when printing / saving as PDF. */
export default function PrintHeader({ title }: { title: string }) {
  const { business } = useData();
  return (
    <div className="print-only print-head">
      {business.logo && <img src={business.logo} alt="" />}
      <div>
        <div className="biz">{business.name}</div>
        <div className="meta">{[business.phone, business.email].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="doc">{title}</div>
    </div>
  );
}
