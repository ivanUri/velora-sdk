import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Browser } from "./browser.js";
import type { BrowserConnectOptions } from "./browser.js";
import {
  cleanupHydratedProfile,
  flushRemoteSession,
  hydrateRemoteProfile,
  type HydratedRemoteProfile,
} from "../profile-api.js";
import { resolveProfileSnapshot } from "../profile.js";
import { resolveVeloraInstall } from "../velora-install.js";
import { delay } from "../utils/timeout.js";
import { ProtocolError } from "../cdp/errors.js";

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

function pickProfile(options: VeloraLaunchOptions): string | undefined {
  if (options.profile) return options.profile;
  if (options.profilePool?.length) {
    const idx = Math.floor(Math.random() * options.profilePool.length);
    return options.profilePool[idx];
  }
  return undefined;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForCdp(
  endpoint: string,
  proc: ChildProcess,
  timeoutMs = 15_000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (proc.exitCode != null) {
      throw new ProtocolError(
        `velora exited before CDP was ready (code ${proc.exitCode}). Try: brew upgrade velora`,
      );
    }
    try {
      const res = await fetch(`${endpoint}/json/version`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await delay(100);
  }
  if (proc.exitCode != null) {
    throw new ProtocolError(
      `velora exited before CDP was ready (code ${proc.exitCode}). Try: brew upgrade velora`,
    );
  }
  throw new ProtocolError(`CDP endpoint not ready: ${endpoint}`, { timeout: timeoutMs });
}

export async function launchVelora(options: VeloraLaunchOptions = {}): Promise<LaunchedVelora> {
  const install = resolveVeloraInstall(options);
  const { binary, dataRoot } = install;
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? await getFreePort();

  let hydrated: HydratedRemoteProfile | undefined;
  let profile = pickProfile(options);
  let userDataDir = options.userDataDir;
  let profileSnapshot: string | undefined;

  const profileId = options.profileId;
  const veloraApi = options.veloraApi ?? (profileId ? process.env.VELORA_API_URL : undefined);
  const apiKey = options.apiKey ?? process.env.VELORA_API_KEY;

  if (profileId) {
    if (!veloraApi) {
      throw new ProtocolError("profileId requires veloraApi (or VELORA_API_URL)");
    }
    hydrated = await hydrateRemoteProfile({
      veloraApi,
      profileId,
      apiKey,
    });
    profile = profileId;
    userDataDir = hydrated.userDataDir;
    profileSnapshot = hydrated.snapshotDir;
  } else if (
    options.profileSnapshot
    || options.profileBundle
    || options.templateRef
  ) {
    profileSnapshot = resolveProfileSnapshot({
      dataRoot,
      profile,
      userDataDir,
      profileSnapshot: options.profileSnapshot,
      profileBundle: options.profileBundle,
      templateRef: options.templateRef,
    });
  } else {
    profile = profile ?? "Default";
    const veloraJson = join(dataRoot, "browser/velora.json");
    if (!existsSync(veloraJson)) {
      throw new ProtocolError(`Default profile not found: ${veloraJson}`);
    }
    profileSnapshot = veloraJson;
  }

  const args = ["serve", "--host", host, "--port", String(port)];
  if (profile) args.push("--browser-profile", profile);
  if (options.profilePool?.length && !options.profile) {
    args.push("--browser-profile-pool", options.profilePool.join(","));
  }
  if (userDataDir) args.push("--user-data-dir", userDataDir);
  if (profileSnapshot) args.push("--profile-snapshot", profileSnapshot);
  if (options.cookieJar) args.push("--cookie-jar", options.cookieJar);
  if (options.logLevel) args.push("--log-level", options.logLevel);

  const proc = spawn(binary, args, {
    cwd: dataRoot,
    stdio: "ignore",
    env: {
      ...process.env,
      VELORA_ROOT: dataRoot,
      VELORA_DATA: dataRoot,
    },
  });
  const endpoint = `http://${host}:${port}`;

  proc.on("error", (err) => {
    throw new ProtocolError(`failed to spawn velora: ${err.message}`);
  });

  await waitForCdp(endpoint, proc);
  const browser = await Browser.connect(endpoint, options);

  return {
    browser,
    endpoint,
    port,
    profile,
    profileSnapshot,
    templateRef: options.templateRef ?? (hydrated
      ? `${hydrated.template}@${hydrated.templateVersion}`
      : undefined),
    profileId: profileId ?? undefined,
    veloraApi: veloraApi ?? undefined,
    hydratedWorkDir: hydrated?.workDir,
    binary,
    dataRoot,
    installSource: install.source,
    process: proc,
    async close() {
      await browser.close().catch(() => undefined);
      if (!proc.killed) proc.kill("SIGTERM");
      if (hydrated && veloraApi) {
        await flushRemoteSession({
          veloraApi,
          apiKey,
          profileId: hydrated.profileId,
          profileDir: hydrated.profileDir,
          record: hydrated.record,
        }).catch(() => undefined);
        cleanupHydratedProfile(hydrated.workDir);
      }
    },
  };
}