export interface TemplateRef {
    id: string;
    version: number;
}
export interface PreferencesV2 {
    version: 2;
    name: string;
    template: string;
    template_version: number;
    snapshot?: string;
    created?: string;
}
/** Parse `chrome-local-huys-macbook-pro@1` or bare template id (version defaults to 1). */
export declare function parseTemplateRef(ref: string): TemplateRef;
export declare function formatTemplateRef(ref: TemplateRef | {
    id: string;
    version?: number;
}): string;
/** Engine install catalog entry for a pinned template version. */
export declare function catalogDir(dataRoot: string, templateId: string, version: number): string;
/** Snapshot directory (contains fingerprint.json + assets/). */
export declare function catalogSnapshotDir(dataRoot: string, templateRef: string | TemplateRef): string;
export declare function catalogFingerprintPath(dataRoot: string, templateRef: string | TemplateRef): string;
/** Named browser profile folder inside user-data-dir. */
export declare function profileDir(userDataDir: string, profileName: string): string;
export declare function profilePreferencesPath(userDataDir: string, profileName: string): string;
/** Embedded snapshot inside a profile instance (`snapshot/fingerprint.json`). */
export declare function profileSnapshotDir(userDataDir: string, profileName: string): string;
/** Portable `.velora-profile` bundle directory. */
export declare function bundleDir(name: string, userDataDir?: string): string;
/** Resolve `snapshot/` inside a bundle (or the bundle root when flat). */
export declare function bundleSnapshotDir(bundlePath: string): string;
export declare function readPreferences(userDataDir: string, profileName: string): PreferencesV2 | null;
export interface ResolveSnapshotOptions {
    dataRoot: string;
    profile?: string;
    userDataDir?: string;
    /** Explicit `--profile-snapshot` path (bundle dir or fingerprint.json). */
    profileSnapshot?: string;
    /** Portable `.velora-profile` bundle directory. */
    profileBundle?: string;
    /** Pinned catalog ref, e.g. `chrome-local-huys-macbook-pro@1`. */
    templateRef?: string;
}
/**
 * Resolve fingerprint snapshot directory for `velora serve --profile-snapshot`.
 * Order: explicit snapshot → bundle → profile instance snapshot → catalog (templateRef or prefs).
 */
export declare function resolveProfileSnapshot(options: ResolveSnapshotOptions): string | undefined;
