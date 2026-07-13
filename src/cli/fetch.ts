#!/usr/bin/env node
import { fetch, type FetchFormat } from "../fetch.js";

function parseArgs(argv: string[]) {
  let url: string | undefined;
  let format: FetchFormat = "html";
  let launch = false;
  let output: string | undefined;
  let endpoint = process.env.VELORA_CDP;
  let waitUntil: "none" | "commit" | "domcontentloaded" | "load" | "networkidle" | "done" = "domcontentloaded";
  let timeout = 30_000;
  let logger = false;
  let profile: string | undefined;
  let userDataDir: string | undefined;
  let profileSnapshot: string | undefined;
  let profileBundle: string | undefined;
  let templateRef: string | undefined;
  let dataRoot: string | undefined;
  let logLevel: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return argv[i];
    };
    switch (arg) {
      case "--endpoint": endpoint = next(); break;
      case "-o":
      case "--output": output = next(); break;
      case "--wait-until": waitUntil = next() as typeof waitUntil; break;
      case "--timeout": timeout = Number(next()); break;
      case "--logger": logger = true; break;
      case "--launch": launch = true; break;
      case "--profile":
      case "--browser-profile": profile = next(); break;
      case "--user-data-dir": userDataDir = next(); break;
      case "--profile-snapshot": profileSnapshot = next(); break;
      case "--profile-bundle": profileBundle = next(); break;
      case "--template":
      case "--template-ref": templateRef = next(); break;
      case "--data-root":
      case "--velora-root": dataRoot = next(); break;
      case "--log-level": logLevel = next(); break;
      case "--format": {
        const fmt = next();
        if (fmt === "html" || fmt === "md" || fmt === "markdown" || fmt === "json") {
          format = fmt === "markdown" ? "md" : fmt;
        } else {
          throw new Error(`Unknown format: ${fmt}`);
        }
        break;
      }
      case "--md":
      case "--markdown": format = "md"; break;
      case "--html": format = "html"; break;
      case "--json":
      case "--extract": format = "json"; break;
      case "--help": usage(0); break;
      default:
        if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
        url = arg;
    }
  }
  if (!url) usage(1);
  return {
    url, format, launch, output, endpoint, waitUntil, timeout, logger,
    profile, userDataDir, profileSnapshot, profileBundle, templateRef, dataRoot, logLevel,
  };
}

function usage(exitCode: number): never {
  console.error(`Usage: velora-fetch <url> [options]

  velora-fetch https://example.com --launch -o page.html
  velora-fetch https://example.com --launch --md -o page.md
  velora-fetch https://example.com --launch --profile chrome-local-huys-macbook-pro
  velora-fetch https://example.com --launch --template chrome-local-huys-macbook-pro@1
`);
  process.exit(exitCode);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await fetch(args.url, {
    format: args.format,
    launch: args.launch,
    endpoint: args.endpoint,
    waitUntil: args.waitUntil,
    timeout: args.timeout,
    logger: args.logger,
    output: args.output,
    profile: args.profile,
    userDataDir: args.userDataDir,
    profileSnapshot: args.profileSnapshot,
    profileBundle: args.profileBundle,
    templateRef: args.templateRef,
    dataRoot: args.dataRoot,
    logLevel: args.logLevel,
  });
  if (!args.output) process.stdout.write(result.body);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});