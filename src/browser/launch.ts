import { execSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Browser } from "./browser.js";
import type { BrowserConnectOptions } from "./browser.js";
import {
  cleanupHydratedProfile,
  flushRemoteSession,
  hydrateRemoteProfile,
  type HydratedRemoteProfile,
} from "../profile-api.js";
import { resolveProfileSnapshot } from "../profile.js";
import { delay } from "../utils/timeout.js";
import { ProtocolError } from "../cdp/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, "../..");
const DEFAULT_DATA_ROOT = resolve(PACKAGE_ROOT, "../velora");

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
   * Engine install root (templates in browser/templates/).
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
  dataRoot: string;
  process: ChildProcess;
  close(): Promise<void>;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function tryWhich(command: string): string | undefined {
  try {
    const out = execSync(`command -v ${shellQuote(command)}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function tryBrewPrefix(formula = "velora"): string | undefined {
  try {
    const out = execSync(`brew --prefix ${shellQuote(formula)} 2>/dev/null`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

/** TODO: remove when Homebrew release ships embedded snapshot + full browser data. */
function tryDesktopDevInstall(): { binary: string; dataRoot: string } | undefined {
  const dataRoot = join(homedir(), "Desktop", "velora");
  const binary = join(dataRoot, "zig-out/bin/velora");
  if (!existsSync(binary) || !existsSync(join(dataRoot, "browser"))) return undefined;
  return { binary, dataRoot };
}

function inferDataRoot(binary: string): string | undefined {
  if (binary.endsWith("/zig-out/bin/velora") || binary.includes("/zig-out/bin/velora")) {
    const root = resolve(dirname(binary), "../..");
    if (existsSync(join(root, "browser"))) return root;
  }

  const binDir = dirname(binary);
  const candidates = [
    resolve(binDir, "../share/velora"),
    resolve(binDir, "../../share/velora"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "browser"))) return candidate;
  }

  const prefix = tryBrewPrefix("velora");
  if (prefix) {
    const candidate = join(prefix, "share/velora");
    if (existsSync(join(candidate, "browser"))) return candidate;
  }
  return undefined;
}

function resolveDataRoot(options: VeloraLaunchOptions): string {
  if (options.dataRoot) return options.dataRoot;
  if (options.repoRoot) return options.repoRoot;
  if (process.env.VELORA_DATA) return process.env.VELORA_DATA;
  if (process.env.VELORA_ROOT) return process.env.VELORA_ROOT;
  return DEFAULT_DATA_ROOT;
}

function resolveLaunchTarget(options: VeloraLaunchOptions): { binary: string; dataRoot: string } {
  const explicitDataRoot = options.dataRoot ?? options.repoRoot
    ?? process.env.VELORA_DATA
    ?? process.env.VELORA_ROOT
    ?? undefined;

  if (options.binary) {
    const dataRoot = explicitDataRoot ?? inferDataRoot(options.binary);
    if (!dataRoot) throw new ProtocolError(`Velora data not found for ${options.binary}`);
    return { binary: options.binary, dataRoot };
  }

  if (process.env.VELORA_BIN) {
    const dataRoot = explicitDataRoot ?? inferDataRoot(process.env.VELORA_BIN);
    if (!dataRoot) throw new ProtocolError("Velora data not found for VELORA_BIN");
    return { binary: process.env.VELORA_BIN, dataRoot };
  }

  const desktop = tryDesktopDevInstall();
  if (desktop) {
    return {
      binary: desktop.binary,
      dataRoot: explicitDataRoot ?? desktop.dataRoot,
    };
  }

  const devBinary = resolve(resolveDataRoot(options), "zig-out/bin/velora");
  if (existsSync(devBinary)) {
    return {
      binary: devBinary,
      dataRoot: explicitDataRoot ?? resolveDataRoot(options),
    };
  }

  const binary = tryWhich("velora");
  if (!binary) {
    throw new ProtocolError(
      "Velora not found. Install: brew tap ivanUri/tap && brew install velora",
    );
  }

  const dataRoot = explicitDataRoot ?? inferDataRoot(binary);
  if (!dataRoot) {
    throw new ProtocolError(
      `Velora install incomplete for ${binary}. Try: brew upgrade velora`,
    );
  }

  return { binary, dataRoot };
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
  const { binary, dataRoot } = resolveLaunchTarget(options);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? await getFreePort();

  let hydrated: HydratedRemoteProfile | undefined;
  let profile = pickProfile(options);
  let userDataDir = options.userDataDir;
  let profileSnapshot: string | undefined;

  const veloraApi = options.veloraApi ?? process.env.VELORA_API_URL;
  const profileId = options.profileId ?? process.env.VELORA_PROFILE_ID;
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
  } else {
    profileSnapshot = resolveProfileSnapshot({
      dataRoot,
      profile,
      userDataDir,
      profileSnapshot: options.profileSnapshot,
      profileBundle: options.profileBundle,
      templateRef: options.templateRef,
    });
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
    dataRoot,
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