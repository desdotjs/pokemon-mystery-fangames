import { describe, expect, it } from "vitest";
import type { Action, StoryGraph } from "@sky/schema";
import { StoryRunner, emptyState } from "../src";

// The pendant quest from the mockup.
const g: StoryGraph = {
  id: "g", name: "Elder", folder: "",
  nodes: [
    { id: "start", x: 0, y: 0, data: { kind: "start" } },
    { id: "hi", x: 0, y: 0, data: { kind: "passage", speaker: { name: "Elder", monsterId: 1 }, emotion: 2, text: "Did you find it?", actions: [{ type: "emote", who: "Elder", emote: "!" }] } },
    { id: "ask", x: 0, y: 0, data: { kind: "choice", prompt: "", options: [
      { id: "yes", label: "Yes!" },
      { id: "no", label: "Not yet" },
      { id: "secret", label: "What pendant?", showIf: { type: "var", variable: "rank", cmp: ">=", value: 2 } },
    ] } },
    { id: "has", x: 0, y: 0, data: { kind: "branch", condition: { type: "hasItem", item: "Lost Pendant", count: 1 } } },
    { id: "reward", x: 0, y: 0, data: { kind: "action", actions: [
      { type: "takeItem", item: "Lost Pendant", count: 1 },
      { type: "giveItem", item: "Reviver Seed", count: 2 },
      { type: "setFlag", flag: "pendant_returned", value: true },
    ] } },
    { id: "thanks", x: 0, y: 0, data: { kind: "passage", speaker: null, emotion: 0, text: "Thank you!", actions: [] } },
    { id: "liar", x: 0, y: 0, data: { kind: "passage", speaker: null, emotion: 0, text: "Check again?", actions: [] } },
    { id: "end", x: 0, y: 0, data: { kind: "end" } },
  ],
  edges: [
    { id: "1", from: "start", port: "out", to: "hi" },
    { id: "2", from: "hi", port: "out", to: "ask" },
    { id: "3", from: "ask", port: "yes", to: "has" },
    { id: "4", from: "has", port: "true", to: "reward" },
    { id: "5", from: "reward", port: "out", to: "thanks" },
    { id: "6", from: "has", port: "false", to: "liar" },
    { id: "7", from: "thanks", port: "out", to: "end" },
  ],
};

describe("StoryRunner", () => {
  it("walks text → choice → branch → actions", () => {
    const state = emptyState();
    state.items["Lost Pendant"] = 1;
    const seen: Action[] = [];
    const r = new StoryRunner(g, state, (a) => seen.push(a));
    const first = r.start();
    expect(first).toMatchObject({ type: "text", text: "Did you find it?", emotion: 2, speaker: { name: "Elder" } });
    expect(seen[0]).toMatchObject({ type: "emote" });
    const choice = r.next();
    expect(choice.type === "choice" && choice.options.map((o) => o.id)).toEqual(["yes", "no"]); // secret hidden
    expect(r.choose("yes")).toMatchObject({ type: "text", text: "Thank you!" });
    expect(state.items).toEqual({ "Lost Pendant": 0, "Reviver Seed": 2 });
    expect(state.flags.pendant_returned).toBe(true);
    expect(r.next()).toMatchObject({ type: "end", reason: "end" });
  });

  it("takes the false branch and reports dead ends", () => {
    const r = new StoryRunner(g);
    r.start();
    r.next();
    expect(r.choose("yes")).toMatchObject({ type: "text", text: "Check again?" });
    expect(r.next()).toMatchObject({ type: "end", reason: "dead-end", nodeId: "liar" });
  });

  it("shows conditional options when the condition passes", () => {
    const state = emptyState();
    state.vars.rank = 3;
    const r = new StoryRunner(g, state);
    r.start();
    const c = r.next();
    expect(c.type === "choice" && c.options.length).toBe(3);
    expect(r.choose("no")).toMatchObject({ type: "end", reason: "dead-end" });
  });

  it("can start from any node", () => {
    expect(new StoryRunner(g).start("liar")).toMatchObject({ type: "text", text: "Check again?" });
  });

  it("picks random paths by weight", () => {
    const rg: StoryGraph = {
      id: "r", name: "", folder: "",
      nodes: [
        { id: "s", x: 0, y: 0, data: { kind: "start" } },
        { id: "rnd", x: 0, y: 0, data: { kind: "random", weights: [{ id: "a", weight: 1 }, { id: "b", weight: 3 }] } },
        { id: "A", x: 0, y: 0, data: { kind: "passage", speaker: null, emotion: 0, text: "A", actions: [] } },
        { id: "B", x: 0, y: 0, data: { kind: "passage", speaker: null, emotion: 0, text: "B", actions: [] } },
      ],
      edges: [
        { id: "1", from: "s", port: "out", to: "rnd" },
        { id: "2", from: "rnd", port: "a", to: "A" },
        { id: "3", from: "rnd", port: "b", to: "B" },
      ],
    };
    expect(new StoryRunner(rg, emptyState(), undefined, () => 0.1).start()).toMatchObject({ text: "A" });
    expect(new StoryRunner(rg, emptyState(), undefined, () => 0.5).start()).toMatchObject({ text: "B" });
  });

  it("stops runaway loops", () => {
    const lg: StoryGraph = {
      id: "l", name: "", folder: "",
      nodes: [
        { id: "s", x: 0, y: 0, data: { kind: "start" } },
        { id: "a", x: 0, y: 0, data: { kind: "action", actions: [] } },
      ],
      edges: [
        { id: "1", from: "s", port: "out", to: "a" },
        { id: "2", from: "a", port: "out", to: "a" },
      ],
    };
    expect(new StoryRunner(lg).start()).toMatchObject({ type: "end", reason: "loop-guard" });
  });
});
