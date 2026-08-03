// @jridgewell/source-map types its `addMapping` as
// `Parameters<typeof maybeAddMapping>[1]`, and `Parameters<>` on an overloaded
// function collapses to the LAST overload — the one where `name` is required.
// gen-mapping's own overloads (and the runtime) accept a mapping without
// `name`; this augmentation restores that lost call shape for tests, which
// build name-less synthetic maps throughout. Instance-side interface merge:
// adds an overload, removes nothing.
import type { Pos } from "@jridgewell/gen-mapping/dist/types/types";

declare module "@jridgewell/source-map" {
  interface SourceMapGenerator {
    addMapping(mapping: {
      generated: Pos;
      source: string;
      original: Pos;
      name?: string;
      content?: string | null;
    }): void;
  }
}
