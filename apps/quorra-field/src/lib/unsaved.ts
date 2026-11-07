/** Tracks screens with unsaved changes so leaving can ask "are you sure?". A screen may also register a save function. */
const keys = new Set<string>();
const savers = new Map<string, () => Promise<unknown>>();
export const setUnsaved = (key: string, on: boolean, save?: () => Promise<unknown>) => { if (on) { keys.add(key); if (save) savers.set(key, save); } else { keys.delete(key); savers.delete(key); } };
export const hasUnsaved = () => keys.size > 0;
export const clearUnsaved = () => { keys.clear(); savers.clear(); };
/** Saves everything that registered a save function. Throws if one fails. */
export const saveUnsaved = async () => { for (const f of Array.from(savers.values())) await f(); };
export const canSaveUnsaved = () => savers.size > 0;
