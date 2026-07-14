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
/** Fetch profile metadata from control plane. */
export declare function fetchRemoteProfile(options: ProfileApiOptions & {
    profileId: string;
}): Promise<RemoteProfileRecord>;
/**
 * Download snapshot + optional session from mock/production API into a temp work dir.
 * Returns paths suitable for `velora serve --profile-snapshot` and `--user-data-dir`.
 */
export declare function hydrateRemoteProfile(options: HydrateRemoteProfileOptions): Promise<HydratedRemoteProfile>;
/** Upload session state back to control plane (cookies from profile dir). */
export declare function flushRemoteSession(options: ProfileApiOptions & {
    profileId: string;
    profileDir: string;
    record?: RemoteProfileRecord;
}): Promise<void>;
/** Remove hydrated temp directory. */
export declare function cleanupHydratedProfile(workDir: string): void;
