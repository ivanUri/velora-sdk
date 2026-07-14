import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultUserDataDir } from "./profile-paths.js";
/** Parse `chrome-local-huys-macbook-pro@1` or bare template id (version defaults to 1). */
export function parseTemplateRef(ref) {
    const at = ref.lastIndexOf("@");
    if (at === -1)
        return { id: ref, version: 1 };
    const id = ref.slice(0, at);
    const version = Number(ref.slice(at + 1));
    if (!id || !Number.isFinite(version) || version < 1) {
        throw new Error(`Invalid template ref: ${ref}`);
    }
    return { id, version };
}
export function formatTemplateRef(ref) {
    const version = ref.version ?? 1;
    return version === 1 ? ref.id : `${ref.id}@${version}`;
}
/** Engine install catalog entry for a pinned template version. */
export function catalogDir(dataRoot, templateId, version) {
    return join(dataRoot, "browser", "catalog", templateId, String(version));
}
/** Snapshot directory (contains fingerprint.json + assets/). */
export function catalogSnapshotDir(dataRoot, templateRef) {
    const ref = typeof templateRef === "string" ? parseTemplateRef(templateRef) : templateRef;
    return catalogDir(dataRoot, ref.id, ref.version);
}
export function catalogFingerprintPath(dataRoot, templateRef) {
    return join(catalogSnapshotDir(dataRoot, templateRef), "fingerprint.json");
}
/** Named browser profile folder inside user-data-dir. */
export function profileDir(userDataDir, profileName) {
    return join(userDataDir, profileName);
}
export function profilePreferencesPath(userDataDir, profileName) {
    return join(profileDir(userDataDir, profileName), "Preferences.json");
}
/** Embedded snapshot inside a profile instance (`snapshot/fingerprint.json`). */
export function profileSnapshotDir(userDataDir, profileName) {
    return join(profileDir(userDataDir, profileName), "snapshot");
}
/** Portable `.velora-profile` bundle directory. */
export function bundleDir(name, userDataDir = defaultUserDataDir()) {
    return join(userDataDir, `${name}.velora-profile`);
}
/** Resolve `snapshot/` inside a bundle (or the bundle root when flat). */
export function bundleSnapshotDir(bundlePath) {
    const nested = join(bundlePath, "snapshot");
    if (existsSync(join(nested, "fingerprint.json")))
        return nested;
    if (existsSync(join(bundlePath, "fingerprint.json")))
        return bundlePath;
    throw new Error(`Bundle missing fingerprint.json: ${bundlePath}`);
}
export function readPreferences(userDataDir, profileName) {
    const path = profilePreferencesPath(userDataDir, profileName);
    if (!existsSync(path))
        return null;
    const prefs = JSON.parse(readFileSync(path, "utf8"));
    return prefs.version === 2 ? prefs : null;
}
/**
 * Resolve fingerprint snapshot directory for `velora serve --profile-snapshot`.
 * Order: explicit snapshot → bundle → profile instance snapshot → catalog (templateRef or prefs).
 */
export function resolveProfileSnapshot(options) {
    if (options.profileSnapshot) {
        const p = options.profileSnapshot;
        if (existsSync(join(p, "fingerprint.json")))
            return p;
        if (p.endsWith("fingerprint.json") && existsSync(p))
            return join(p, "..");
        throw new Error(`profileSnapshot not found: ${p}`);
    }
    if (options.profileBundle) {
        return bundleSnapshotDir(options.profileBundle);
    }
    const userDataDir = options.userDataDir ?? defaultUserDataDir();
    if (options.profile) {
        const embedded = profileSnapshotDir(userDataDir, options.profile);
        if (existsSync(join(embedded, "fingerprint.json")))
            return embedded;
        const prefs = readPreferences(userDataDir, options.profile);
        if (prefs) {
            const catalog = catalogDir(options.dataRoot, prefs.template, prefs.template_version);
            if (existsSync(join(catalog, "fingerprint.json")))
                return catalog;
        }
    }
    if (options.templateRef) {
        const catalog = catalogSnapshotDir(options.dataRoot, options.templateRef);
        if (existsSync(join(catalog, "fingerprint.json")))
            return catalog;
        throw new Error(`Catalog snapshot not found: ${catalog}`);
    }
    return undefined;
}
//# sourceMappingURL=profile.js.map