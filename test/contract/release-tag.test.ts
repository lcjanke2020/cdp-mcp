import { describe, expect, it } from "vitest";
import { validateReleaseTag } from "../../scripts/check-release-tag.js";

describe("release tag guard", () => {
  it("accepts the stable package version's v-prefixed tag", () => {
    expect(() => validateReleaseTag("v0.5.0", "0.5.0")).not.toThrow();
  });

  it("rejects a release tag that differs from the package version", () => {
    expect(() => validateReleaseTag("v0.5.0", "0.4.0")).toThrow(
      "release tag v0.5.0 does not match package version 0.4.0",
    );
  });

  it("rejects prereleases because publish.yml targets npm latest", () => {
    expect(() => validateReleaseTag("v0.5.0-dev", "0.5.0-dev")).toThrow(
      "package version 0.5.0-dev is a prerelease",
    );
  });

  it("rejects a missing release tag", () => {
    expect(() => validateReleaseTag(undefined, "0.5.0")).toThrow(
      "RELEASE_TAG is required",
    );
  });
});
