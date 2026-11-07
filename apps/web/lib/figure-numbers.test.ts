import { describe, expect, it } from "vitest";

import { figureNumbers } from "./figure-numbers";

describe("figure numbers", () => {
  it("numbers pictures by section and position within the section", () => {
    const image = "x.png";
    const numbers = figureNumbers([
      { blocks: [{ nodeId: "a" }, { nodeId: "f1", image }, { nodeId: "f2", image }] },
      { blocks: [] },
      { blocks: [{ nodeId: "b" }, { nodeId: "f3", image }] }
    ]);

    expect([...numbers]).toEqual([["f1", { chapter: 1, index: 1 }], ["f2", { chapter: 1, index: 2 }], ["f3", { chapter: 3, index: 1 }]]);
  });
});
