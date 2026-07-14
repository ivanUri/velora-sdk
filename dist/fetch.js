import { writeFile } from "node:fs/promises";
import { Browser } from "./browser/browser.js";
import { launchVelora } from "./browser/launch.js";
export async function fetch(url, options = {}) {
    const format = options.format ?? "html";
    const launch = options.launch !== false;
    const endpoint = options.endpoint ?? process.env.VELORA_CDP ?? "http://127.0.0.1:9222";
    const waitUntil = options.waitUntil ?? "domcontentloaded";
    const timeout = options.timeout ?? 30_000;
    const launchOpts = {
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
            let body;
            let data;
            if (format === "md") {
                body = await page.markdown();
            }
            else if (format === "json") {
                data = await page.extract({ timeout });
                body = JSON.stringify(data, null, 2);
            }
            else {
                body = await page.content();
            }
            const result = {
                url: await page.url(),
                title: await page.title(),
                format,
                body,
                data,
            };
            if (options.output)
                await writeFile(options.output, body);
            return result;
        }
        finally {
            if (ownsBrowser)
                await browser.close();
        }
    }
    finally {
        if (launched)
            await launched.close();
    }
}
//# sourceMappingURL=fetch.js.map