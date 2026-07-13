import { homedir } from "node:os";
import { join } from "node:path";

/** Default Velora user-data-dir (Chrome-style profile root). */
export function defaultUserDataDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "velora");
  }
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? homedir(), "velora");
  }
  return join(homedir(), ".config", "velora");
}

/** Cookies.json inside a named browser profile folder. */
export function profileCookiesPath(userDataDir: string, profileName: string): string {
  return join(userDataDir, profileName, "Cookies.json");
}