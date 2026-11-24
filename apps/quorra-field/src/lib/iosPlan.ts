import { isIOSNative } from "./platform";

/** Same check as isIOSNative(). Existing screens call this. */
export function isIosApp(): boolean {
  return isIOSNative();
}
