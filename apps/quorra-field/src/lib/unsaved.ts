/** Tracks screens with unsaved changes so leaving can ask "are you sure?". */
const keys = new Set<string>();
export const setUnsaved = (key: string, on: boolean) => { if (on) keys.add(key); else keys.delete(key); };
export const hasUnsaved = () => keys.size > 0;
export const clearUnsaved = () => keys.clear();
