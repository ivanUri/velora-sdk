import { writeFile } from "node:fs/promises";
import { Browser } from "./browser/browser.js";
import type { ExtractResult } from "./browser/page.js";
import { launchVelora, type VeloraLaunchOptions } from "./browser/launch.js";
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

export async function fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const format = options.format ?? "html";
  const launch = options.launch !== false;
  const endpoint = options.endpoint ?? process.env.VELORA_CDP ?? "http://127.0.0.1:9222";
  const waitUntil = options.waitUntil ?? "domcontentloaded";
  const timeout = options.timeout ?? 30_000;

  const launchOpts: VeloraLaunchOptions = {
    logger: options.logger,
    profile: options.profile,
    profilePool: options.profilePool,
    userDataDir: options.userDataDir,
    profileSnapshot: options.profileSnapshot,
    profileBundle: options.profileBundle,
    templateRef: options.templateRef,
    cookieJar: options.cookieJar,
    binary: options.binary,
    dataRoot: options.dataRoot ?? options.repoRoot,
    repoRoot: options.repoRoot,
    logLevel: options.logLevel,
  };
  const launched = launch ? await launchVelora(launchOpts) : null;

  try {
    const browser = launched?.browser ?? await Browser.connect(endpoint, { logger: options.logger });
    const ownsBrowser = !launched;

    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil, timeout });

      let body: string;
      let data: ExtractResult | undefined;

      if (format === "md") {
        body = await page.markdown();
      } else if (format === "json") {
        data = await page.extract({ timeout });
        body = JSON.stringify(data, null, 2);
      } else {
        body = await page.content();
      }

      const result: FetchResult = {
        url: await page.url(),
        title: await page.title(),
        format,
        body,
        data,
      };

      if (options.output) await writeFile(options.output, body);
      return result;
    } finally {
      if (ownsBrowser) await browser.close();
    }
  } finally {
    if (launched) await launched.close();
  }
}