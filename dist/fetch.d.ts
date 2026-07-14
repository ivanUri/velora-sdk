import type { ExtractResult } from "./browser/page.js";
import type { WaitUntil } from "./browser/waiter.js";
export type FetchFormat = "html" | "md" | "json";
export interface FetchOptions {
    /** Output format (default: html). */
    format?: FetchFormat;
    /** Start velora automatically (default: true). */
    launch?: boolean;
    /** CDP endpoint when launch is false. */
    endpoint?: string;
    waitUntil?: WaitUntil;
    timeout?: number;
    logger?: boolean;
    /** Write result to this file path. */
    output?: string;
    /** Passed to `launchVelora` when `launch` is true. */
    profile?: string;
    profilePool?: string[];
    userDataDir?: string;
    profileSnapshot?: string;
    profileBundle?: string;
    templateRef?: string;
    cookieJar?: string;
    binary?: string;
    dataRoot?: string;
    /** @deprecated Use `dataRoot`. */
    repoRoot?: string;
    logLevel?: string;
}
export interface FetchResult {
    url: string;
    title: string;
    format: FetchFormat;
    /** HTML, Markdown, or JSON string. */
    body: string;
    /** Parsed extract payload when format is json. */
    data?: ExtractResult;
}
export declare function fetch(url: string, options?: FetchOptions): Promise<FetchResult>;
