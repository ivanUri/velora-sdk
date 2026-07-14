import { type ChildProcess } from "node:child_process";
import { Browser } from "./browser.js";
import type { BrowserConnectOptions } from "./browser.js";
export interface VeloraLaunchOptions extends BrowserConnectOptions {
    /** Profile folder name inside user-data-dir (maps to --browser-profile). */
    profile?: string;
    /** Random profile from this list when `profile` is omitted (--browser-profile-pool). */
    profilePool?: string[];
    /** Chrome-style user data root (--user-data-dir). */
    userDataDir?: string;
    /** Override Cookies.json path (--cookie-jar, deprecated; prefer profile dir). */
    cookieJar?: string;
    /** Self-contained fingerprint bundle dir or fingerprint.json (`--profile-snapshot`). */
    profileSnapshot?: string;
    /** Portable `.velora-profile` bundle directory (uses `snapshot/` inside). */
    profileBundle?: string;
    /** Pinned catalog template ref, e.g. `chrome-local-huys-macbook-pro@1`. */
    templateRef?: string;
    /** SaaS profile id — hydrate snapshot + session from control plane API. */
    profileId?: string;
    /** Control plane base URL when using `profileId`. */
    veloraApi?: string;
    /** Optional API key (`Authorization: Bearer`). */
    apiKey?: string;
    /** CDP port (default: auto free port). */
    port?: number;
    /** Path to velora binary. */
    binary?: string;
    /**
     * Engine install root (`share/velora` from Homebrew, or git checkout).
     * Sets VELORA_ROOT / VELORA_DATA for the child process.
     */
    dataRoot?: string;
    /** @deprecated Use `dataRoot`. */
    repoRoot?: string;
    host?: string;
    logLevel?: string;
}
export interface LaunchedVelora {
    browser: Browser;
    endpoint: string;
    port: number;
    profile?: string;
    /** Resolved `--profile-snapshot` directory passed to velora. */
    profileSnapshot?: string;
    templateRef?: string;
    profileId?: string;
    veloraApi?: string;
    /** Temp hydration dir when launched via API (cleaned on close). */
    hydratedWorkDir?: string;
    binary: string;
    dataRoot: string;
    installSource: string;
    process: ChildProcess;
    close(): Promise<void>;
}
export declare function launchVelora(options?: VeloraLaunchOptions): Promise<LaunchedVelora>;
