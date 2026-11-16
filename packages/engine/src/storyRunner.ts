import type { Action, Condition, Id, Speaker, StoryGraph, StoryNode } from "@sky/schema";

/** Game state the story can read and change. */
export interface StoryState {
  flags: Record<string, boolean>;
  vars: Record<string, number>;
  items: Record<string, number>;
}

export function emptyState(): StoryState {
  return { flags: {}, vars: {}, items: {} };
}

/** What the runner asks the presentation layer (dialogue box, playtest log) to do next. */
export type StoryStep =
  | { type: "text"; nodeId: Id; speaker: Speaker | null; emotion: number; text: string }
  | { type: "choice"; nodeId: Id; prompt: string; options: { id: string; label: string }[] }
  | { type: "end"; nodeId: Id | null; reason: "end" | "dead-end" | "missing-node" | "loop-guard" };

export function checkCondition(c: Condition, s: StoryState): boolean {
  switch (c.type) {
    case "flag":
      return (s.flags[c.flag] ?? false) === c.is;
    case "hasItem":
      return (s.items[c.item] ?? 0) >= c.count;
    case "var": {
      const v = s.vars[c.variable] ?? 0;
      switch (c.cmp) {
        case "==": return v === c.value;
        case "!=": return v !== c.value;
        case ">": return v > c.value;
        case ">=": return v >= c.value;
        case "<": return v < c.value;
        case "<=": return v <= c.value;
      }
    }
  }
}

/** Apply state changes. Presentation-only actions (emote, fade, music, movement) are reported via `onAction`. */
export function applyAction(a: Action, s: StoryState): void {
  switch (a.type) {
    case "setFlag":
      s.flags[a.flag] = a.value;
      break;
    case "setVar":
      s.vars[a.variable] = a.op === "add" ? (s.vars[a.variable] ?? 0) + a.value : a.value;
      break;
    case "giveItem":
      s.items[a.item] = (s.items[a.item] ?? 0) + a.count;
      break;
    case "takeItem":
      s.items[a.item] = Math.max(0, (s.items[a.item] ?? 0) - a.count);
      break;
    default:
      break;
  }
}

/**
 * Walks a story graph. Call `start()`, show the returned step, then `next()` after text
 * or `choose(optionId)` after a choice, until a step of type "end".
 */
export class StoryRunner {
  private current: StoryNode | null = null;
  private readonly byId: Map<Id, StoryNode>;

  constructor(
    private readonly graph: StoryGraph,
    readonly state: StoryState = emptyState(),
    private readonly onAction: (a: Action, nodeId: Id) => void = () => {},
    private readonly random: () => number = Math.random,
  ) {
    this.byId = new Map(graph.nodes.map((n) => [n.id, n]));
  }

  /** Start at a node (default: the first Start node). */
  start(nodeId?: Id): StoryStep {
    const id = nodeId ?? this.graph.nodes.find((n) => n.data.kind === "start")?.id;
    return this.enter(id ?? null);
  }

  /** Continue after a text step. */
  next(): StoryStep {
    if (!this.current) return { type: "end", nodeId: null, reason: "end" };
    return this.follow(this.current.id, "out");
  }

  /** Continue after a choice step. */
  choose(optionId: string): StoryStep {
    if (!this.current) return { type: "end", nodeId: null, reason: "end" };
    return this.follow(this.current.id, optionId);
  }

  private follow(from: Id, port: string): StoryStep {
    const edge = this.graph.edges.find((e) => e.from === from && e.port === port);
    if (!edge) return { type: "end", nodeId: from, reason: "dead-end" };
    return this.enter(edge.to);
  }

  /** Runs through non-interactive nodes until something needs the player. */
  private enter(id: Id | null): StoryStep {
    for (let guard = 0; guard < 1000; guard++) {
      const node = id ? this.byId.get(id) : undefined;
      if (!node) return { type: "end", nodeId: id, reason: "missing-node" };
      this.current = node;
      const d = node.data;
      let port: string;
      switch (d.kind) {
        case "start":
          port = "out";
          break;
        case "passage":
          this.run(d.actions, node.id);
          return { type: "text", nodeId: node.id, speaker: d.speaker, emotion: d.emotion, text: d.text };
        case "choice": {
          const options = d.options.filter((o) => !o.showIf || checkCondition(o.showIf, this.state)).map((o) => ({ id: o.id, label: o.label }));
          return { type: "choice", nodeId: node.id, prompt: d.prompt, options };
        }
        case "branch":
          port = checkCondition(d.condition, this.state) ? "true" : "false";
          break;
        case "action":
          this.run(d.actions, node.id);
          port = "out";
          break;
        case "random": {
          const total = d.weights.reduce((a, w) => a + Math.max(0, w.weight), 0);
          let r = this.random() * total;
          port = d.weights[d.weights.length - 1]?.id ?? "";
          for (const w of d.weights) if ((r -= Math.max(0, w.weight)) < 0) { port = w.id; break; }
          break;
        }
        case "end":
          return { type: "end", nodeId: node.id, reason: "end" };
      }
      const edge = this.graph.edges.find((e) => e.from === node.id && e.port === port);
      if (!edge) return { type: "end", nodeId: node.id, reason: "dead-end" };
      id = edge.to;
    }
    return { type: "end", nodeId: id, reason: "loop-guard" };
  }

  private run(actions: Action[], nodeId: Id): void {
    for (const a of actions) {
      applyAction(a, this.state);
      this.onAction(a, nodeId);
    }
  }
}
