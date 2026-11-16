import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useReactFlow, applyNodeChanges, applyEdgeChanges,
  type Edge, type NodeChange, type EdgeChange, type Connection, type OnConnectEnd,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { validateGraph, type NodeKind, type StoryGraph } from "@sky/schema";
import { exportProject, importProject, useCurrentGraph, useProject } from "../../projectStore";
import { nodeTypes, KIND_META, type FlowNode } from "./nodes";
import { Inspector } from "./Inspector";
import { Playtest } from "./Playtest";

const ADDABLE: NodeKind[] = ["passage", "choice", "branch", "action", "random", "end"];

export function EventsEditor() {
  return (
    <ReactFlowProvider>
      <EventsEditorInner />
    </ReactFlowProvider>
  );
}

function EventsEditorInner() {
  const graph = useCurrentGraph();
  const s = useProject();
  const warnings = useMemo(() => validateGraph(graph), [graph]);
  const [menu, setMenu] = useState<{ x: number; y: number; from?: { from: string; port: string } } | null>(null);
  const [play, setPlay] = useState<{ from: string | null } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // React Flow keeps measured sizes and selection on its own node objects; rebuild from the store but keep those.
  const [rfNodes, setRfNodes] = useState<FlowNode[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  useEffect(() => {
    setRfNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      const sel = s.selectedNodeId;
      // Selection set from outside the canvas (inspector, playtest) is exclusive; otherwise keep React Flow's (multi-select).
      const external = sel != null && !old.get(sel)?.selected;
      return graph.nodes.map((n) => {
        const o = old.get(n.id);
        return {
          ...(o ?? {}),
          id: n.id,
          type: n.data.kind,
          position: o?.dragging ? o.position : { x: n.x, y: n.y },
          selected: external ? n.id === sel : (o?.selected ?? n.id === sel),
          deletable: true,
          data: { node: n, warnings: warnings.filter((w) => w.nodeId === n.id) },
        } as FlowNode;
      });
    });
    setRfEdges((prev) => {
      const old = new Map(prev.map((e) => [e.id, e]));
      return graph.edges.map((e) => ({
        ...(old.get(e.id) ?? {}),
        id: e.id,
        source: e.from,
        sourceHandle: e.port,
        target: e.to,
        className: e.port === "true" ? "e-true" : e.port === "false" ? "e-false" : "",
      }));
    });
  }, [graph, warnings, s.selectedNodeId]);

  // Fit the view when switching graphs.
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.2, maxZoom: 1 }), 50);
    return () => clearTimeout(t);
  }, [graph.id, rf]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
    const st = useProject.getState();
    for (const c of changes) {
      if (c.type === "select" && c.selected) st.selectNode(c.id);
    }
    const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
    if (removed.length) st.deleteNodes(removed);
  }, []);

  // Commit final positions for multi-node drags (React Flow reports dragging=false per node on stop).
  const onNodeDragStop = useCallback((_: unknown, __: unknown, nodes: FlowNode[]) => {
    const st = useProject.getState();
    const g = st.project.graphs.find((x) => x.id === st.graphId);
    const moved = nodes.filter((n) => {
      const orig = g?.nodes.find((x) => x.id === n.id);
      return orig && (Math.round(orig.x) !== Math.round(n.position.x) || Math.round(orig.y) !== Math.round(n.position.y));
    });
    if (moved.length) st.commit((p) => {
      const gg = p.graphs.find((x) => x.id === st.graphId);
      for (const m of moved) {
        const nn = gg?.nodes.find((x) => x.id === m.id);
        if (nn) (nn.x = Math.round(m.position.x), nn.y = Math.round(m.position.y));
      }
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
    const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
    if (removed.length) useProject.getState().deleteEdges(removed);
  }, []);

  const onConnect = useCallback((c: Connection) => {
    if (c.source && c.target) useProject.getState().connect(c.source, c.sourceHandle ?? "out", c.target);
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback((event, state) => {
    if (state.isValid || !state.fromNode || !state.fromHandle || state.fromHandle.type !== "source") return;
    const pt = "changedTouches" in event ? event.changedTouches[0]! : (event as MouseEvent);
    const box = wrap.current!.getBoundingClientRect();
    setMenu({ x: pt.clientX - box.left, y: pt.clientY - box.top, from: { from: state.fromNode.id, port: state.fromHandle.id ?? "out" } });
  }, []);

  /** Pan (keeping zoom) so a freshly added node at flow position (x, y) is fully on screen. */
  function reveal(x: number, y: number) {
    const box = wrap.current!.getBoundingClientRect();
    const tl = rf.screenToFlowPosition({ x: box.left + 40, y: box.top + 40 });
    const br = rf.screenToFlowPosition({ x: box.right - 40, y: box.bottom - 60 });
    const w = 260, h = 160;
    if (x >= tl.x && y >= tl.y && x + w <= br.x && y + h <= br.y) return;
    const { zoom } = rf.getViewport();
    const cx = Math.min(Math.max((tl.x + br.x) / 2, x + w - (br.x - tl.x) / 2), x + (br.x - tl.x) / 2);
    const cy = Math.min(Math.max((tl.y + br.y) / 2, y + h - (br.y - tl.y) / 2), y + (br.y - tl.y) / 2);
    rf.setCenter(cx, cy, { zoom, duration: 250 });
  }

  function addFromMenu(kind: NodeKind) {
    if (!menu) return;
    const box = wrap.current!.getBoundingClientRect();
    const pos = rf.screenToFlowPosition({ x: menu.x + box.left, y: menu.y + box.top });
    useProject.getState().addNode(kind, pos.x, pos.y - 20, menu.from);
    setMenu(null);
    reveal(pos.x, pos.y - 20);
  }

  function addAtCenter(kind: NodeKind) {
    const box = wrap.current!.getBoundingClientRect();
    const pos = rf.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    const jitter = (Math.random() - 0.5) * 60;
    useProject.getState().addNode(kind, pos.x - 120 + jitter, pos.y - 40 + jitter);
  }

  // Undo / redo shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (play) return;
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") (e.preventDefault(), e.shiftKey ? useProject.getState().redo() : useProject.getState().undo());
      if (mod && e.key.toLowerCase() === "y") (e.preventDefault(), useProject.getState().redo());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play]);

  const selected = graph.nodes.find((n) => n.id === s.selectedNodeId) ?? null;
  const folders = useMemo(() => groupByFolder(s.project.graphs), [s.project.graphs]);

  return (
    <>
      <aside className="panel" style={{ width: 240 }}>
        <div className="ph"><span>Story graphs</span><button className="link" onClick={s.addGraph} title="New graph">＋ New</button></div>
        <div className="tree">
          {folders.map(([folder, gs]) => (
            <div key={folder} className="folder-block">
              <div className="folder">📁 {folder}</div>
              {gs.map((g) => (
                <div key={g.id} className={"graph-item" + (g.id === graph.id ? " sel" : "")} onClick={() => s.selectGraph(g.id)}>
                  <span>{g.name || "(untitled)"}</span>
                  {validateGraph(g).length > 0 && <span className="warn-dot" title="Has warnings">⚠</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="ph" style={{ marginTop: 10 }}><span>This graph</span></div>
        <div className="field"><label>Name</label>
          <input className="inp" value={graph.name} onChange={(e) => s.commit((p) => void (p.graphs.find((g) => g.id === graph.id)!.name = e.target.value), `gname-${graph.id}`)} />
        </div>
        <div className="field"><label>Folder</label>
          <input className="inp" value={graph.folder} placeholder="e.g. Town Square" onChange={(e) => s.commit((p) => void (p.graphs.find((g) => g.id === graph.id)!.folder = e.target.value), `gfolder-${graph.id}`)} />
        </div>
        <div className="field row2">
          <button className="btn go" onClick={() => setPlay({ from: null })}>▶ Play from Start</button>
          <button className="btn" disabled={s.project.graphs.length <= 1} onClick={() => s.deleteGraph(graph.id)} title="Delete graph (undo with Ctrl+Z)">🗑</button>
        </div>
        <div className="ph" style={{ marginTop: 10 }}><span>Add node</span></div>
        <div className="tree">
          {ADDABLE.map((k) => (
            <div key={k} onClick={() => addAtCenter(k)}>{KIND_META[k].icon} {KIND_META[k].label}</div>
          ))}
        </div>
        <div className="ph" style={{ marginTop: 10 }}><span>Project file</span></div>
        <div className="field row2">
          <button className="btn" onClick={exportProject}>⤓ Export</button>
          <button className="btn" onClick={() => fileInput.current?.click()}>⤒ Import</button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setImportError(await importProject(f));
          }} />
        </div>
        {importError && <div className="warnbox">{importError}</div>}
        <div className="field muted small">{saveLabel(s.saveStatus)}</div>
      </aside>

      <section className="content flow-wrap" ref={wrap}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onPaneClick={() => (setMenu(null), s.selectNode(null))}
          onNodeContextMenu={(e, n) => (e.preventDefault(), setPlay({ from: n.id }))}
          deleteKeyCode={["Backspace", "Delete"]}
          minZoom={0.2}
          maxZoom={2}
          defaultEdgeOptions={{ type: "default" }}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
        >
          <Background gap={22} size={1} color="#2a2f3c" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={(n) => miniColor(n.type)} maskColor="rgba(10,12,16,.6)" />
        </ReactFlow>
        {menu && (
          <div className="add-menu" style={{ left: menu.x, top: menu.y }}>
            <div className="muted small">ADD NEXT NODE</div>
            {ADDABLE.map((k) => (
              <button key={k} onClick={() => addFromMenu(k)}>{KIND_META[k].icon} {KIND_META[k].label}</button>
            ))}
          </div>
        )}
        <div className="flow-status">
          {graph.nodes.length} nodes · {graph.edges.length} links ·{" "}
          <span className={warnings.length ? "warn-text" : ""}>{warnings.length} warning{warnings.length === 1 ? "" : "s"}</span>
          <span className="muted"> · right-click a node to play from it</span>
        </div>
      </section>

      <Inspector node={selected} warnings={warnings} onPlayFrom={(id) => setPlay({ from: id })} />

      {play && (
        <Playtest
          graph={graph}
          startNodeId={play.from}
          onClose={() => setPlay(null)}
          onShowNode={(id) => s.selectNode(id)}
        />
      )}
    </>
  );
}

function groupByFolder(gs: StoryGraph[]): [string, StoryGraph[]][] {
  const m = new Map<string, StoryGraph[]>();
  for (const g of gs) m.set(g.folder || "Unsorted", [...(m.get(g.folder || "Unsorted") ?? []), g]);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function miniColor(type?: string) {
  return ({ passage: "#3b5a99", choice: "#6b4f99", branch: "#8a6a2a", action: "#2f7a5a", random: "#7a3f6a", start: "#4a5066", end: "#4a5066" } as Record<string, string>)[type ?? ""] ?? "#4a5066";
}

function saveLabel(s: string) {
  return s === "saved" ? "✓ Saved in this browser" : s === "saving" ? "Saving…" : s === "unsaved" ? "Unsaved changes…" : "⚠ Can't save in this browser. Use Export to keep your work.";
}
