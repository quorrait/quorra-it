/** Lets the tour pick a Settings tab. */
let pending: string | null = null;
export const setTourTab = (t: string | null) => { pending = t; window.dispatchEvent(new CustomEvent("qd-settings-tab", { detail: t })); };
export const takeTourTab = (): string | null => { const t = pending; return t; };
