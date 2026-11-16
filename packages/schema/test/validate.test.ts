import { describe, expect, it } from "vitest";
import { newGraph, outPorts, validateGraph, defaultNodeData, type StoryGraph } from "../src";

describe("story graph helpers", () => {
  it("new graphs start clean", () => {
    expect(validateGraph(newGraph("x"))).toEqual([]);
  });

  it("lists ports per node kind", () => {
    const c = defaultNodeData("choice");
    expect(outPorts(c).map((p) => p.label)).toEqual(["Yes", "No"]);
    expect(outPorts(defaultNodeData("branch")).map((p) => p.id)).toEqual(["true", "false"]);
    expect(outPorts(defaultNodeData("end"))).toEqual([]);
  });

  it("flags unlinked choice options, unreachable nodes and empty text", () => {
    const g: StoryGraph = {
      id: "g", name: "t", folder: "",
      nodes: [
        { id: "s", x: 0, y: 0, data: { kind: "start" } },
        { id: "c", x: 0, y: 0, data: { kind: "choice", prompt: "", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] } },
        { id: "e", x: 0, y: 0, data: { kind: "end" } },
        { id: "lonely", x: 0, y: 0, data: { kind: "passage", speaker: null, emotion: 0, text: " ", actions: [] } },
      ],
      edges: [
        { id: "1", from: "s", port: "out", to: "c" },
        { id: "2", from: "c", port: "a", to: "e" },
        { id: "3", from: "lonely", port: "out", to: "e" },
      ],
    };
    const w = validateGraph(g);
    expect(w.map((x) => [x.code, x.nodeId, x.port ?? null])).toEqual([
      ["unlinked-port", "c", "b"],
      ["empty-text", "lonely", null],
      ["unreachable", "lonely", null],
    ]);
  });

  it("requires a start node", () => {
    expect(validateGraph({ id: "g", name: "", folder: "", nodes: [], edges: [] })[0]?.code).toBe("no-start");
  });
});
