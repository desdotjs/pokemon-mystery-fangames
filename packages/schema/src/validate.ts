import { outPorts, type Id, type StoryGraph } from "./story";

export type WarningCode = "no-start" | "many-starts" | "unlinked-port" | "unreachable" | "empty-text" | "empty-option";

export interface GraphWarning {
  code: WarningCode;
  nodeId: Id | null;
  port?: string;
  message: string;
}

/** Problems shown in the editor. None of them stop playtesting. */
export function validateGraph(g: StoryGraph): GraphWarning[] {
  const out: GraphWarning[] = [];
  const starts = g.nodes.filter((n) => n.data.kind === "start");
  if (starts.length === 0) out.push({ code: "no-start", nodeId: null, message: "This graph has no Start node." });
  if (starts.length > 1) for (const s of starts.slice(1)) out.push({ code: "many-starts", nodeId: s.id, message: "Extra Start node (only the first is used)." });

  const linked = new Set(g.edges.map((e) => `${e.from}:${e.port}`));
  for (const n of g.nodes) {
    for (const p of outPorts(n.data)) {
      if (!linked.has(`${n.id}:${p.id}`)) {
        const what = n.data.kind === "choice" ? `Option "${p.label}"` : n.data.kind === "branch" ? `The "${p.label}" path` : "This node";
        out.push({ code: "unlinked-port", nodeId: n.id, port: p.id, message: `${what} doesn't lead anywhere.` });
      }
    }
    if (n.data.kind === "passage" && !n.data.text.trim()) out.push({ code: "empty-text", nodeId: n.id, message: "Passage has no text." });
    if (n.data.kind === "choice") for (const o of n.data.options) if (!o.label.trim()) out.push({ code: "empty-option", nodeId: n.id, port: o.id, message: "A choice option has no text." });
  }

  if (starts[0]) {
    const next = new Map<Id, Id[]>();
    for (const e of g.edges) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
    const seen = new Set<Id>([starts[0].id]);
    const queue = [starts[0].id];
    while (queue.length) for (const t of next.get(queue.shift()!) ?? []) if (!seen.has(t)) (seen.add(t), queue.push(t));
    for (const n of g.nodes) if (!seen.has(n.id) && n.data.kind !== "start") out.push({ code: "unreachable", nodeId: n.id, message: "Nothing leads to this node." });
  }
  return out;
}
