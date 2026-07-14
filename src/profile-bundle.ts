import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProtocolError } from "./cdp/errors.js";
import { defaultUserDataDir } from "./profile-paths.js";
import { formatTemplateRef, parseTemplateRef } from "./profile.js";
import { resolveVeloraInstall } from "./velora-install.js";

export interface ProfileBundleCommonOptions {
  /** Engine install root (VELORA_ROOT). */
  dataRoot?: string;
  /** Chrome-style session root. */
  userDataDir?: string;
  /** Path to velora binary (uses `velora profile` subcommand when available). */
  binary?: string;
}

export interface PublishTemplateOptions extends ProfileBundleCommonOptions {
  /** Template id or `id@version`. */
  template: string;
  /** Override version when template ref has no `@version`. */
  version?: number;
}

export interface ExportProfileOptions extends ProfileBundleCommonOptions {
  name: string;
  /** Output bundle directory (default: `<userDataDir>/<name>.velora-profile`). */
  out?: string;
}

export interface ImportProfileOptions extends ProfileBundleCommonOptions {
  name: string;
  from: string;
}

export interface CreateProfileOptions extends ProfileBundleCommonOptions {
  name: string;
  template?: string;
  version?: number;
}

export interface ProfileBundleResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function resolveInstall(options: ProfileBundleCommonOptions) {
  return resolveVeloraInstall({
    binary: options.binary,
    dataRoot: options.dataRoot,
  });
}

function bundleScriptPath(dataRoot: string): string {
  const script = join(dataRoot, "scripts/profile-bundle.mjs");
  if (!existsSync(script)) {
    throw new ProtocolError(`profile-bundle.mjs not found in ${dataRoot}`);
  }
  return script;
}

async function runProcess(
  command: string,
  args: string[],
  cwd: string,
): Promise<ProfileBundleResult> {
  return new Promise((resolveResult, reject) => {
    const chunksOut: Buffer[] = [];
    const chunksErr: Buffer[] = [];
    const proc = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    proc.stdout?.on("data", (d) => chunksOut.push(d));
    proc.stderr?.on("data", (d) => chunksErr.push(d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      const stdout = Buffer.concat(chunksOut).toString("utf8");
      const stderr = Buffer.concat(chunksErr).toString("utf8");
      const exitCode = code ?? 1;
      if (exitCode !== 0) {
        reject(new ProtocolError(
          `${command} ${args.join(" ")} failed (exit ${exitCode})\n${stderr || stdout}`.trim(),
        ));
        return;
      }
      resolveResult({ stdout, stderr, exitCode });
    });
  });
}

async function runVeloraProfile(
  subArgs: string[],
  options: ProfileBundleCommonOptions,
): Promise<ProfileBundleResult> {
  const { binary, dataRoot } = resolveInstall(options);
  const userDataDir = options.userDataDir ?? defaultUserDataDir();
  const args = ["profile", ...subArgs, "--user-data-dir", userDataDir];
  return runProcess(binary, args, dataRoot);
}

async function runBundleScript(
  subArgs: string[],
  options: ProfileBundleCommonOptions,
): Promise<ProfileBundleResult> {
  const { dataRoot } = resolveInstall(options);
  const script = bundleScriptPath(dataRoot);
  const userDataDir = options.userDataDir ?? defaultUserDataDir();
  const args = [
    script,
    "--velora-root",
    dataRoot,
    "--user-data-dir",
    userDataDir,
    ...subArgs,
  ];
  return runProcess("node", args, dataRoot);
}

/** Publish a template into `browser/catalog/<id>/<version>/`. */
export async function publishTemplate(
  options: PublishTemplateOptions,
): Promise<ProfileBundleResult> {
  const ref = parseTemplateRef(options.template);
  const version = options.version ?? ref.version;
  try {
    return await runVeloraProfile([
      "publish",
      "--template",
      ref.id,
      "--version",
      String(version),
    ], options);
  } catch {
    return runBundleScript([
      "publish",
      "--template",
      ref.id,
      "--version",
      String(version),
    ], options);
  }
}

/** Export a profile instance to a portable `.velora-profile` bundle. */
export async function exportProfile(
  options: ExportProfileOptions,
): Promise<ProfileBundleResult> {
  const extra = options.out ? ["--to", resolve(options.out)] : [];
  try {
    return await runVeloraProfile(["export", "--name", options.name, ...extra], options);
  } catch {
    const scriptArgs = ["export", "--name", options.name];
    if (options.out) scriptArgs.push("--out", resolve(options.out));
    return runBundleScript(scriptArgs, options);
  }
}

/** Import a bundle into user-data-dir as a named profile. */
export async function importProfile(
  options: ImportProfileOptions,
): Promise<ProfileBundleResult> {
  try {
    return await runVeloraProfile([
      "import",
      "--name",
      options.name,
      "--from",
      resolve(options.from),
    ], options);
  } catch {
    return runBundleScript([
      "import",
      "--name",
      options.name,
      "--from",
      resolve(options.from),
    ], options);
  }
}

/** Create a profile folder with Preferences v2 (via velora CLI). */
export async function createProfile(
  options: CreateProfileOptions,
): Promise<ProfileBundleResult> {
  const template = options.template ?? options.name;
  const ref = parseTemplateRef(template);
  const version = options.version ?? ref.version;
  const templateArg = formatTemplateRef({ id: ref.id, version });
  return runVeloraProfile([
    "create",
    "--name",
    options.name,
    "--template",
    templateArg,
  ], options);
}