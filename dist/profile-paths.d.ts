/** Default Velora user-data-dir (Chrome-style profile root). */
export declare function defaultUserDataDir(): string;
/** Cookies.json inside a named browser profile folder. */
export declare function profileCookiesPath(userDataDir: string, profileName: string): string;
