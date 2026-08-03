import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../../src/server.js";

interface PackageShape {
  version: string;
  bin: Record<string, string>;
  exports: Record<string, { import: string }>;
}

function readPackageJson(): PackageShape {
  return JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as PackageShape;
}

// The published cdp-mcp compat wrapper (wrapper/cdp-mcp/bin.js) boots the
// server by resolving this package's exports["."] entry and running it as the
// CLI entry point. That only works while the bin target and the main export
// are the same file — pin the equality so a future bin/library split can't
// silently turn the published wrapper into a start-nothing no-op.
describe("package shape — cdp-mcp wrapper contract", () => {
  it("bin target and exports['.'] entry are the same file", () => {
    const pkg = readPackageJson();
    expect(pkg.bin.lynceus).toBe("dist/index.js");
    expect(pkg.exports["."]?.import).toBe(`./${pkg.bin.lynceus}`);
  });

  it("reports the package version in the MCP initialize handshake", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = buildServer();
    const client = new Client(
      { name: "package-shape-test", version: "0.0.1" },
      { capabilities: {} },
    );

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect(client.getServerVersion()?.version).toBe(readPackageJson().version);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
