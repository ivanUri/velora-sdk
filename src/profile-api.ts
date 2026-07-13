import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ProtocolError } from "./cdp/errors.js";

export interface RemoteProfileUrls {
  self: string;
  snapshot_base: string;
  snapshot_files: string;
  session: string;
}

export interface RemoteProfileRecord {
  id: string;
  name: string;
  template: string;
  template_version: number;
  urls: RemoteProfileUrls;
  snapshot: {
    base_url: string;
    files_url: string;
  };
  session: {
    url: string;
    exists: boolean;
  };
}

export interface RemoteSessionBlob {
  profile_id?: string;
  version?: number;
  cookies?: unknown;
  cookies_path?: string;
  local_storage_dir?: string;
  updated_at?: string;
}

export interface ProfileApiOptions {
  /** Control plane base URL, e.g. `http://127.0.0.1:3940`. */
  veloraApi: string;
  apiKey?: string;
}

export interface HydrateRemoteProfileOptions extends ProfileApiOptions {
  profileId: string;
  /** Temp root (default: os.tmpdir()/velora-remote/<profileId>). */
  workDir?: string;
}

export interface HydratedRemoteProfile {
  profileId: string;
  workDir: string;
  snapshotDir: string;
  userDataDir: string;
  profileDir: string;
  template: string;
  templateVersion: number;
  record: RemoteProfileRecord;
}

function apiHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

function normalizeApiBase(url: string): string {
  return url.replace(/\/+$/, "");
}

async function apiFetch(
  url: string,
  init: RequestInit & { apiKey?: string } = {},
): Promise<Response> {
  const headers = { ...apiHeaders(init.apiKey), ...(init.headers as Record<string, string> ?? {}) };
  const res = await fetch(url, { ...init, headers });
  return res;
}

/** Fetch profile metadata from control plane. */
export async function fetchRemoteProfile(
  options: ProfileApiOptions & { profileId: string },
): Promise<RemoteProfileRecord> {
  const base = normalizeApiBase(options.veloraApi);
  const res = await apiFetch(`${base}/v1/profiles/${encodeURIComponent(options.profileId)}`, {
    apiKey: options.apiKey,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProtocolError(`profile API ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<RemoteProfileRecord>;
}

async function downloadSnapshot(
  record: RemoteProfileRecord,
  destDir: string,
  apiKey?: string,
): Promise<void> {
  const res = await apiFetch(record.snapshot.files_url, { apiKey });
  if (!res.ok) throw new ProtocolError(`snapshot files list ${res.status}`);
  const listing = await res.json() as { files: string[] };

  mkdirSync(destDir, { recursive: true });
  for (const rel of listing.files) {
    const fileRes = await apiFetch(`${record.snapshot.base_url}${rel}`, { apiKey });
    if (!fileRes.ok) throw new ProtocolError(`snapshot download failed: ${rel} (${fileRes.status})`);
    const buf = Buffer.from(await fileRes.arrayBuffer());
    const out = join(destDir, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, buf);
  }

  if (!existsSync(join(destDir, "fingerprint.json"))) {
    throw new ProtocolError(`hydrated snapshot missing fingerprint.json: ${destDir}`);
  }
}

function applySessionToProfileDir(profileDir: string, session: RemoteSessionBlob): void {
  mkdirSync(profileDir, { recursive: true });

  if (session.cookies != null) {
    const cookiesPath = join(profileDir, "Cookies.json");
    const payload = typeof session.cookies === "string"
      ? session.cookies
      : JSON.stringify(session.cookies, null, 2);
    writeFileSync(cookiesPath, payload.endsWith("\n") ? payload : `${payload}\n`);
  }

  if (session.local_storage_dir && existsSync(session.local_storage_dir)) {
    cpSync(session.local_storage_dir, join(profileDir, "Local Storage"), { recursive: true });
  }
}

async function downloadSession(
  record: RemoteProfileRecord,
  profileDir: string,
  apiKey?: string,
): Promise<boolean> {
  const res = await apiFetch(record.session.url, { apiKey });
  if (res.status === 404) return false;
  if (!res.ok) throw new ProtocolError(`session download ${res.status}`);
  const session = await res.json() as RemoteSessionBlob;
  applySessionToProfileDir(profileDir, session);
  return true;
}

/**
 * Download snapshot + optional session from mock/production API into a temp work dir.
 * Returns paths suitable for `velora serve --profile-snapshot` and `--user-data-dir`.
 */
export async function hydrateRemoteProfile(
  options: HydrateRemoteProfileOptions,
): Promise<HydratedRemoteProfile> {
  const record = await fetchRemoteProfile(options);
  const workDir = options.workDir ?? join(tmpdir(), "velora-remote", options.profileId);

  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  const snapshotDir = join(workDir, "snapshot");
  const userDataDir = join(workDir, "user-data");
  const profileDir = join(userDataDir, record.id);

  await downloadSnapshot(record, snapshotDir, options.apiKey);
  mkdirSync(profileDir, { recursive: true });
  await downloadSession(record, profileDir, options.apiKey).catch(() => false);

  writeFileSync(join(profileDir, "Preferences.json"), `${JSON.stringify({
    version: 2,
    name: record.id,
    template: record.template,
    template_version: record.template_version,
    snapshot: "snapshot",
    source: "velora-api",
  }, null, 2)}\n`);

  return {
    profileId: record.id,
    workDir,
    snapshotDir,
    userDataDir,
    profileDir,
    template: record.template,
    templateVersion: record.template_version,
    record,
  };
}

/** Upload session state back to control plane (cookies from profile dir). */
export async function flushRemoteSession(
  options: ProfileApiOptions & {
    profileId: string;
    profileDir: string;
    record?: RemoteProfileRecord;
  },
): Promise<void> {
  const record = options.record ?? await fetchRemoteProfile({
    veloraApi: options.veloraApi,
    apiKey: options.apiKey,
    profileId: options.profileId,
  });

  const cookiesPath = join(options.profileDir, "Cookies.json");
  const body: RemoteSessionBlob = {
    version: 1,
    profile_id: options.profileId,
  };
  if (existsSync(cookiesPath)) {
    body.cookies = JSON.parse(readFileSync(cookiesPath, "utf8"));
  }

  const res = await apiFetch(record.session.url, {
    method: "PUT",
    apiKey: options.apiKey,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProtocolError(`session flush ${res.status}: ${text || res.statusText}`);
  }
}

/** Remove hydrated temp directory. */
export function cleanupHydratedProfile(workDir: string): void {
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
}