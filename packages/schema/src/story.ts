/**
 * Story graphs: Twine-style dialogue and events (SPEC §6).
 * Pure data. The editor edits it, the engine walks it, the ROM exporter compiles it.
 */

export type Id = string;

/** Who is talking. `monsterId` points at ROM portraits; `name` is what the dialogue box shows. */
export interface Speaker {
  name: string;
  monsterId: number | null;
}

export type Action =
  | { type: "setFlag"; flag: string; value: boolean }
  | { type: "setVar"; variable: string; op: "set" | "add"; value: number }
  | { type: "giveItem"; item: string; count: number }
  | { type: "takeItem"; item: string; count: number }
  | { type: "emote"; who: string; emote: "!" | "?" | "♪" | "…" | "💢" }
  | { type: "wait"; seconds: number }
  | { type: "fade"; dir: "out" | "in" }
  | { type: "playBgm"; track: string }
  | { type: "moveActor"; who: string; to: string };

export type ActionType = Action["type"];

export type Condition =
  | { type: "flag"; flag: string; is: boolean }
  | { type: "var"; variable: string; cmp: "==" | "!=" | ">" | ">=" | "<" | "<="; value: number }
  | { type: "hasItem"; item: string; count: number };

export interface ChoiceOption {
  id: Id;
  label: string;
  showIf?: Condition;
}

export type NodeData =
  | { kind: "start" }
  | { kind: "passage"; speaker: Speaker | null; emotion: number; text: string; actions: Action[] }
  | { kind: "choice"; prompt: string; options: ChoiceOption[] }
  | { kind: "branch"; condition: Condition }
  | { kind: "action"; actions: Action[] }
  | { kind: "random"; weights: { id: Id; weight: number }[] }
  | { kind: "end" };

export type NodeKind = NodeData["kind"];

export interface StoryNode {
  id: Id;
  x: number;
  y: number;
  data: NodeData;
}

/** `port` is "out" for single-exit nodes, the option id for choices, "true"/"false" for branches. */
export interface StoryEdge {
  id: Id;
  from: Id;
  port: string;
  to: Id;
}

export interface StoryGraph {
  id: Id;
  name: string;
  folder: string;
  nodes: StoryNode[];
  edges: StoryEdge[];
}

export interface Project {
  version: 1;
  name: string;
  graphs: StoryGraph[];
}

let counter = 0;
export function newId(prefix = "n"): Id {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Output ports a node exposes, in display order. */
export function outPorts(data: NodeData): { id: string; label: string }[] {
  switch (data.kind) {
    case "start":
    case "passage":
    case "action":
      return [{ id: "out", label: "" }];
    case "choice":
      return data.options.map((o) => ({ id: o.id, label: o.label || "(empty option)" }));
    case "branch":
      return [
        { id: "true", label: "true" },
        { id: "false", label: "false" },
      ];
    case "random":
      return data.weights.map((w, i) => ({ id: w.id, label: `${w.weight}× (path ${i + 1})` }));
    case "end":
      return [];
  }
}

export function hasInput(data: NodeData): boolean {
  return data.kind !== "start";
}

export function defaultNodeData(kind: NodeKind): NodeData {
  switch (kind) {
    case "start":
      return { kind };
    case "passage":
      return { kind, speaker: null, emotion: 0, text: "", actions: [] };
    case "choice":
      return { kind, prompt: "", options: [{ id: newId("o"), label: "Yes" }, { id: newId("o"), label: "No" }] };
    case "branch":
      return { kind, condition: { type: "flag", flag: "", is: true } };
    case "action":
      return { kind, actions: [] };
    case "random":
      return { kind, weights: [{ id: newId("w"), weight: 1 }, { id: newId("w"), weight: 1 }] };
    case "end":
      return { kind };
  }
}

export function defaultAction(type: ActionType): Action {
  switch (type) {
    case "setFlag": return { type, flag: "", value: true };
    case "setVar": return { type, variable: "", op: "set", value: 0 };
    case "giveItem": return { type, item: "", count: 1 };
    case "takeItem": return { type, item: "", count: 1 };
    case "emote": return { type, who: "", emote: "!" };
    case "wait": return { type, seconds: 1 };
    case "fade": return { type, dir: "out" };
    case "playBgm": return { type, track: "" };
    case "moveActor": return { type, who: "", to: "" };
  }
}

export function newGraph(name: string, folder = "Unsorted"): StoryGraph {
  const start: StoryNode = { id: newId(), x: 0, y: 0, data: { kind: "start" } };
  const hello: StoryNode = {
    id: newId(), x: 220, y: -20,
    data: { kind: "passage", speaker: null, emotion: 0, text: "Hello!", actions: [] },
  };
  const end: StoryNode = { id: newId(), x: 560, y: 0, data: { kind: "end" } };
  return {
    id: newId("g"), name, folder,
    nodes: [start, hello, end],
    edges: [
      { id: newId("e"), from: start.id, port: "out", to: hello.id },
      { id: newId("e"), from: hello.id, port: "out", to: end.id },
    ],
  };
}

export function newProject(): Project {
  return { version: 1, name: "My PMD game", graphs: [newGraph("First conversation", "Town")] };
}

/** Loose structural check for imported files. */
export function isProject(x: unknown): x is Project {
  const p = x as Project;
  return !!p && p.version === 1 && typeof p.name === "string" && Array.isArray(p.graphs) &&
    p.graphs.every((g) => typeof g.id === "string" && Array.isArray(g.nodes) && Array.isArray(g.edges));
}
