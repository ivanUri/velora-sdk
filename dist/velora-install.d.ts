export type VeloraInstallSource = "explicit" | "velora_bin" | "homebrew" | "path" | "desktop_dev" | "zig_dev";
export interface VeloraInstall {
    binary: string;
    dataRoot: string;
    source: VeloraInstallSource;
}
export interface ResolveVeloraInstallOptions {
    binary?: string;
    dataRoot?: string;
    /** @deprecated Use `dataRoot`. */
    repoRoot?: string;
}
/**
 * Resolve velora binary + engine data root (`share/velora` or git checkout).
 * Priority: explicit options → `$VELORA_BIN` → Homebrew → `$PATH` → Desktop dev → zig-out.
 */
export declare function resolveVeloraInstall(options?: ResolveVeloraInstallOptions): VeloraInstall;
/** Default engine data root (Homebrew `share/velora` when installed). */
export declare function defaultVeloraDataRoot(): string;
