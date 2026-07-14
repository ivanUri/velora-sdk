import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ProtocolError } from "./cdp/errors.js";
function shellQuote(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function tryBrewPrefix(formula = "velora") {
    try {
        const out = execSync(`brew --prefix ${shellQuote(formula)} 2>/dev/null`, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return out || undefined;
    }
    catch {
        return undefined;
    }
}
function tryWhich(command) {
    try {
        const out = execSync(`command -v ${shellQuote(command)}`, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return out || undefined;
    }
    catch {
        return undefined;
    }
}
function brewInstall() {
    const prefix = tryBrewPrefix("velora");
    if (!prefix)
        return undefined;
    const binary = join(prefix, "bin/velora");
    const dataRoot = join(prefix, "share/velora");
    if (!existsSync(binary) || !existsSync(join(dataRoot, "browser/velora.json"))) {
        return undefined;
    }
    return { binary, dataRoot, source: "homebrew" };
}
function desktopDevInstall() {
    const dataRoot = join(homedir(), "Desktop", "velora");
    const binary = join(dataRoot, "zig-out/bin/velora");
    if (!existsSync(binary) || !existsSync(join(dataRoot, "browser/velora.json"))) {
        return undefined;
    }
    return { binary, dataRoot, source: "desktop_dev" };
}
function inferDataRootFromBinary(binary) {
    if (binary.includes("/zig-out/bin/velora")) {
        const root = resolve(dirname(binary), "../..");
        if (existsSync(join(root, "browser/velora.json")))
            return root;
    }
    for (const rel of ["../share/velora", "../../share/velora"]) {
        const candidate = resolve(dirname(binary), rel);
        if (existsSync(join(candidate, "browser/velora.json")))
            return candidate;
    }
    return brewInstall()?.dataRoot;
}
/**
 * Resolve velora binary + engine data root (`share/velora` or git checkout).
 * Priority: explicit options → `$VELORA_BIN` → Homebrew → `$PATH` → Desktop dev → zig-out.
 */
export function resolveVeloraInstall(options = {}) {
    const explicitDataRoot = options.dataRoot ?? options.repoRoot
        ?? process.env.VELORA_DATA
        ?? process.env.VELORA_ROOT
        ?? undefined;
    if (options.binary) {
        const dataRoot = explicitDataRoot ?? inferDataRootFromBinary(options.binary);
        if (!dataRoot)
            throw new ProtocolError(`Velora data not found for ${options.binary}`);
        return { binary: options.binary, dataRoot, source: "explicit" };
    }
    if (process.env.VELORA_BIN) {
        const dataRoot = explicitDataRoot ?? inferDataRootFromBinary(process.env.VELORA_BIN);
        if (!dataRoot)
            throw new ProtocolError("Velora data not found for VELORA_BIN");
        return { binary: process.env.VELORA_BIN, dataRoot, source: "velora_bin" };
    }
    const brew = brewInstall();
    if (brew) {
        return {
            binary: brew.binary,
            dataRoot: explicitDataRoot ?? brew.dataRoot,
            source: "homebrew",
        };
    }
    const onPath = tryWhich("velora");
    if (onPath) {
        const dataRoot = explicitDataRoot ?? inferDataRootFromBinary(onPath);
        if (!dataRoot) {
            throw new ProtocolError(`Velora install incomplete for ${onPath}. Try: brew tap ivanUri/tap && brew install velora`);
        }
        return { binary: onPath, dataRoot, source: "path" };
    }
    const desktop = desktopDevInstall();
    if (desktop) {
        return {
            binary: desktop.binary,
            dataRoot: explicitDataRoot ?? desktop.dataRoot,
            source: "desktop_dev",
        };
    }
    const fallbackRoot = explicitDataRoot ?? join(homedir(), "Desktop", "velora");
    const zigDev = join(fallbackRoot, "zig-out/bin/velora");
    if (existsSync(zigDev)) {
        return {
            binary: zigDev,
            dataRoot: fallbackRoot,
            source: "zig_dev",
        };
    }
    throw new ProtocolError("Velora not found. Install: brew tap ivanUri/tap && brew install velora");
}
/** Default engine data root (Homebrew `share/velora` when installed). */
export function defaultVeloraDataRoot() {
    return resolveVeloraInstall().dataRoot;
}
//# sourceMappingURL=velora-install.js.map