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
/** Publish a template into `browser/catalog/<id>/<version>/`. */
export declare function publishTemplate(options: PublishTemplateOptions): Promise<ProfileBundleResult>;
/** Export a profile instance to a portable `.velora-profile` bundle. */
export declare function exportProfile(options: ExportProfileOptions): Promise<ProfileBundleResult>;
/** Import a bundle into user-data-dir as a named profile. */
export declare function importProfile(options: ImportProfileOptions): Promise<ProfileBundleResult>;
/** Create a profile folder with Preferences v2 (via velora CLI). */
export declare function createProfile(options: CreateProfileOptions): Promise<ProfileBundleResult>;
