import { create } from "zustand";
import { get as idbGet, set as idbSet } from "idb-keyval";
import {
  defaultNodeData, isProject, newGraph, newId, newProject,
  type Id, type NodeData, type NodeKind, type Project, type StoryGraph,
} from "@sky/schema";

const KEY = "sky-maker/project";
const HISTORY_LIMIT = 100;

interface ProjectState {
  project: Project;
  loaded: boolean;
  graphId: Id;
  selectedNodeId: Id | null;
  past: Project[];
  future: Project[];
  lastCoalesce: { key: string; at: number } | null;
  saveStatus: "saved" | "saving" | "unsaved" | "unavailable";

  /** Apply a change with undo. Same `coalesceKey` within 1.5 s merges into one undo step (typing). */
  commit(mutate: (p: Project) => void, coalesceKey?: string): void;
  undo(): void;
  redo(): void;
  load(): Promise<void>;
  replaceProject(p: Project): void;

  selectGraph(id: Id): void;
  selectNode(id: Id | null): void;
  addGraph(): void;
  deleteGraph(id: Id): void;
  addNode(kind: NodeKind, x: number, y: number, connectFrom?: { from: Id; port: string }): Id;
  updateNode(id: Id, data: NodeData, coalesceKey?: string): void;
  moveNode(id: Id, x: number, y: number): void;
  deleteNodes(ids: Id[]): void;
  connect(from: Id, port: string, to: Id): void;
  deleteEdges(ids: Id[]): void;
}

export const useProject = create<ProjectState>((set, get) => {
  function graphOf(p: Project): StoryGraph {
    const id = get().graphId;
    return p.graphs.find((g) => g.id === id) ?? p.graphs[0]!;
  }

  return {
    project: newProject(),
    loaded: false,
    graphId: "",
    selectedNodeId: null,
    past: [],
    future: [],
    lastCoalesce: null,
    saveStatus: "saved",

    commit(mutate, coalesceKey) {
      const { project, past, lastCoalesce } = get();
      const next = structuredClone(project);
      mutate(next);
      const now = Date.now();
      const merge = coalesceKey && lastCoalesce?.key === coalesceKey && now - lastCoalesce.at < 1500;
      set({
        project: next,
        past: merge ? past : [...past.slice(-HISTORY_LIMIT + 1), project],
        future: [],
        lastCoalesce: coalesceKey ? { key: coalesceKey, at: now } : null,
        saveStatus: "unsaved",
      });
      scheduleSave();
    },

    undo() {
      const { past, project, future, graphId } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({
        project: prev, past: past.slice(0, -1), future: [project, ...future], lastCoalesce: null,
        graphId: prev.graphs.some((g) => g.id === graphId) ? graphId : prev.graphs[0]?.id ?? "",
        saveStatus: "unsaved",
      });
      scheduleSave();
    },

    redo() {
      const { past, project, future, graphId } = get();
      const nxt = future[0];
      if (!nxt) return;
      set({
        project: nxt, past: [...past, project], future: future.slice(1), lastCoalesce: null,
        graphId: nxt.graphs.some((g) => g.id === graphId) ? graphId : nxt.graphs[0]?.id ?? "",
        saveStatus: "unsaved",
      });
      scheduleSave();
    },

    async load() {
      let p: Project | null = null;
      try {
        const raw = await Promise.race([idbGet<unknown>(KEY), new Promise((r) => setTimeout(() => r(null), 5000))]);
        if (isProject(raw)) p = raw;
      } catch {
        set({ saveStatus: "unavailable" });
      }
      p ??= newProject();
      set({ project: p, loaded: true, graphId: p.graphs[0]?.id ?? "", past: [], future: [] });
    },

    replaceProject(p) {
      get().commit((draft) => {
        draft.name = p.name;
        draft.graphs = p.graphs;
      });
      set({ graphId: p.graphs[0]?.id ?? "", selectedNodeId: null });
    },

    selectGraph(id) {
      set({ graphId: id, selectedNodeId: null });
    },
    selectNode(id) {
      set({ selectedNodeId: id });
    },

    addGraph() {
      const g = newGraph("New conversation", graphOf(get().project)?.folder ?? "Unsorted");
      get().commit((p) => void p.graphs.push(g));
      set({ graphId: g.id, selectedNodeId: null });
    },

    deleteGraph(id) {
      if (get().project.graphs.length <= 1) return;
      get().commit((p) => void (p.graphs = p.graphs.filter((g) => g.id !== id)));
      const first = get().project.graphs[0];
      set({ graphId: first?.id ?? "", selectedNodeId: null });
    },

    addNode(kind, x, y, connectFrom) {
      const id = newId();
      get().commit((p) => {
        const g = graphOf(p);
        g.nodes.push({ id, x, y, data: defaultNodeData(kind) });
        if (connectFrom) {
          g.edges = g.edges.filter((e) => !(e.from === connectFrom.from && e.port === connectFrom.port));
          g.edges.push({ id: newId("e"), from: connectFrom.from, port: connectFrom.port, to: id });
        }
      });
      set({ selectedNodeId: id });
      return id;
    },

    updateNode(id, data, coalesceKey) {
      get().commit((p) => {
        const g = graphOf(p);
        const n = g.nodes.find((x) => x.id === id);
        if (!n) return;
        n.data = data;
        // Drop edges from ports that no longer exist (e.g. a deleted choice option).
        const ports = new Set(portIds(data));
        g.edges = g.edges.filter((e) => e.from !== id || ports.has(e.port));
      }, coalesceKey);
    },

    moveNode(id, x, y) {
      get().commit((p) => {
        const n = graphOf(p).nodes.find((n) => n.id === id);
        if (n) (n.x = Math.round(x), n.y = Math.round(y));
      });
    },

    deleteNodes(ids) {
      const del = new Set(ids);
      get().commit((p) => {
        const g = graphOf(p);
        g.nodes = g.nodes.filter((n) => !del.has(n.id));
        g.edges = g.edges.filter((e) => !del.has(e.from) && !del.has(e.to));
      });
      if (del.has(get().selectedNodeId ?? "")) set({ selectedNodeId: null });
    },

    connect(from, port, to) {
      if (from === to) return;
      get().commit((p) => {
        const g = graphOf(p);
        g.edges = g.edges.filter((e) => !(e.from === from && e.port === port)); // one link per port
        g.edges.push({ id: newId("e"), from, port, to });
      });
    },

    deleteEdges(ids) {
      const del = new Set(ids);
      get().commit((p) => {
        const g = graphOf(p);
        g.edges = g.edges.filter((e) => !del.has(e.id));
      });
    },
  };
});

function portIds(d: NodeData): string[] {
  switch (d.kind) {
    case "choice": return d.options.map((o) => o.id);
    case "branch": return ["true", "false"];
    case "random": return d.weights.map((w) => w.id);
    case "end": return [];
    default: return ["out"];
  }
}

export function useCurrentGraph(): StoryGraph {
  return useProject((s) => s.project.graphs.find((g) => g.id === s.graphId) ?? s.project.graphs[0]!);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const { project } = useProject.getState();
    useProject.setState({ saveStatus: "saving" });
    try {
      await Promise.race([
        idbSet(KEY, project),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 10_000)),
      ]);
      if (useProject.getState().project === project) useProject.setState({ saveStatus: "saved" });
    } catch {
      useProject.setState({ saveStatus: "unavailable" });
    }
  }, 600);
}

/** Download the project as a JSON file. */
export function exportProject(): void {
  const { project } = useProject.getState();
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${project.name.replace(/[^\w\- ]+/g, "").trim() || "project"}.skymaker.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function importProject(file: File): Promise<string | null> {
  try {
    const data: unknown = JSON.parse(await file.text());
    if (!isProject(data)) return "That file isn't a Sky Maker project.";
    useProject.getState().replaceProject(data);
    return null;
  } catch {
    return "That file couldn't be read as a Sky Maker project.";
  }
}

/** Every flag, variable and item name used anywhere, for autocomplete. */
export function collectNames(p: Project): { flags: string[]; vars: string[]; items: string[] } {
  const flags = new Set<string>(), vars = new Set<string>(), items = new Set<string>();
  const cond = (c: { type: string; flag?: string; variable?: string; item?: string } | undefined) => {
    if (!c) return;
    if (c.type === "flag" && c.flag) flags.add(c.flag);
    if (c.type === "var" && c.variable) vars.add(c.variable);
    if (c.type === "hasItem" && c.item) items.add(c.item);
  };
  for (const g of p.graphs) for (const n of g.nodes) {
    const d = n.data;
    const acts = d.kind === "passage" || d.kind === "action" ? d.actions : [];
    for (const a of acts) {
      if (a.type === "setFlag" && a.flag) flags.add(a.flag);
      if (a.type === "setVar" && a.variable) vars.add(a.variable);
      if ((a.type === "giveItem" || a.type === "takeItem") && a.item) items.add(a.item);
    }
    if (d.kind === "branch") cond(d.condition);
    if (d.kind === "choice") d.options.forEach((o) => cond(o.showIf));
  }
  return { flags: [...flags].sort(), vars: [...vars].sort(), items: [...items].sort() };
}
