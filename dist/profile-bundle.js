import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProtocolError } from "./cdp/errors.js";
import { defaultUserDataDir } from "./profile-paths.js";
import { formatTemplateRef, parseTemplateRef } from "./profile.js";
import { resolveVeloraInstall } from "./velora-install.js";
function resolveInstall(options) {
    return resolveVeloraInstall({
        binary: options.binary,
        dataRoot: options.dataRoot,
    });
}
function bundleScriptPath(dataRoot) {
    const script = join(dataRoot, "scripts/profile-bundle.mjs");
    if (!existsSync(script)) {
        throw new ProtocolError(`profile-bundle.mjs not found in ${dataRoot}`);
    }
    return script;
}
async function runProcess(command, args, cwd) {
    return new Promise((resolveResult, reject) => {
        const chunksOut = [];
        const chunksErr = [];
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
                reject(new ProtocolError(`${command} ${args.join(" ")} failed (exit ${exitCode})\n${stderr || stdout}`.trim()));
                return;
            }
            resolveResult({ stdout, stderr, exitCode });
        });
    });
}
async function runVeloraProfile(subArgs, options) {
    const { binary, dataRoot } = resolveInstall(options);
    const userDataDir = options.userDataDir ?? defaultUserDataDir();
    const args = ["profile", ...subArgs, "--user-data-dir", userDataDir];
    return runProcess(binary, args, dataRoot);
}
async function runBundleScript(subArgs, options) {
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
export async function publishTemplate(options) {
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
    }
    catch {
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
export async function exportProfile(options) {
    const extra = options.out ? ["--to", resolve(options.out)] : [];
    try {
        return await runVeloraProfile(["export", "--name", options.name, ...extra], options);
    }
    catch {
        const scriptArgs = ["export", "--name", options.name];
        if (options.out)
            scriptArgs.push("--out", resolve(options.out));
        return runBundleScript(scriptArgs, options);
    }
}
/** Import a bundle into user-data-dir as a named profile. */
export async function importProfile(options) {
    try {
        return await runVeloraProfile([
            "import",
            "--name",
            options.name,
            "--from",
            resolve(options.from),
        ], options);
    }
    catch {
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
export async function createProfile(options) {
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
//# sourceMappingURL=profile-bundle.js.map