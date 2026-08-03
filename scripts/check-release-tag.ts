import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function validateReleaseTag(
  releaseTag: string | undefined,
  packageVersion: string,
): void {
  if (!releaseTag) {
    throw new Error("RELEASE_TAG is required");
  }

  // This workflow publishes to npm's default `latest` dist-tag. Refuse a
  // prerelease package version until the workflow grows an explicit npm tag.
  if (packageVersion.includes("-")) {
    throw new Error(
      `package version ${packageVersion} is a prerelease and cannot be published to the latest dist-tag`,
    );
  }

  const expectedTag = `v${packageVersion}`;
  if (releaseTag !== expectedTag) {
    throw new Error(
      `release tag ${releaseTag} does not match package version ${packageVersion} (expected ${expectedTag})`,
    );
  }
}

function packageVersion(): string {
  const metadata = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };
  if (typeof metadata.version !== "string" || metadata.version.length === 0) {
    throw new Error("package.json does not contain a valid version string");
  }
  return metadata.version;
}

async function main(): Promise<void> {
  const version = packageVersion();
  validateReleaseTag(process.env.RELEASE_TAG, version);
  process.stdout.write(
    `Release tag ${process.env.RELEASE_TAG} matches package version ${version}.\n`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`::error::${message}\n`);
    process.exitCode = 1;
  });
}
