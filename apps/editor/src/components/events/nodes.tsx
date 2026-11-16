import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { FACE_NAMES } from "@sky/rom";
import type { Action, Condition, StoryNode } from "@sky/schema";
import type { GraphWarning } from "@sky/schema";
import { PortraitCanvas } from "../PortraitCanvas";
import { portraitSlot, useAssets } from "../../assetStore";

export type FlowNodeData = { node: StoryNode; warnings: GraphWarning[] };
export type FlowNode = Node<FlowNodeData>;

export const KIND_META = {
  start: { icon: "▶", label: "Start", cls: "k-start" },
  passage: { icon: "💬", label: "Passage", cls: "k-passage" },
  choice: { icon: "❓", label: "Choice", cls: "k-choice" },
  branch: { icon: "⑂", label: "Branch", cls: "k-branch" },
  action: { icon: "⚡", label: "Action", cls: "k-action" },
  random: { icon: "🎲", label: "Random", cls: "k-random" },
  end: { icon: "■", label: "End", cls: "k-end" },
} as const;

export function describeAction(a: Action): string {
  switch (a.type) {
    case "setFlag": return `🚩 ${a.flag || "?"} = ${a.value ? "ON" : "OFF"}`;
    case "setVar": return `🔢 ${a.variable || "?"} ${a.op === "add" ? "+=" : "="} ${a.value}`;
    case "giveItem": return `🎁 Give ${a.item || "?"} ×${a.count}`;
    case "takeItem": return `🎒 Take ${a.item || "?"} ×${a.count}`;
    case "emote": return `❗ Emote ${a.who || "?"} ${a.emote}`;
    case "wait": return `⏱ Wait ${a.seconds}s`;
    case "fade": return `🌑 Fade ${a.dir}`;
    case "playBgm": return `♪ Music ${a.track || "?"}`;
    case "moveActor": return `🚶 Move ${a.who || "?"} → ${a.to || "?"}`;
  }
}

export function describeCondition(c: Condition): string {
  switch (c.type) {
    case "flag": return `flag ${c.flag || "?"} is ${c.is ? "ON" : "OFF"}`;
    case "var": return `${c.variable || "?"} ${c.cmp} ${c.value}`;
    case "hasItem": return `bag has ${c.item || "?"}${c.count > 1 ? ` ×${c.count}` : ""}`;
  }
}

function Shell(props: { d: FlowNodeData; selected: boolean; children?: React.ReactNode; input?: boolean; title?: React.ReactNode; out?: boolean }) {
  const kind = props.d.node.data.kind;
  const meta = KIND_META[kind];
  const warn = props.d.warnings.length > 0;
  return (
    <div className={`sn ${meta.cls}${props.selected ? " sel" : ""}${warn ? " warn" : ""}`} title={props.d.warnings.map((w) => w.message).join("\n")}>
      {props.input !== false && <Handle type="target" position={Position.Left} className="h-in" />}
      <div className="sn-h">
        <span>{meta.icon} {meta.label}</span>
        {props.title && <span className="sn-ht">{props.title}</span>}
        {warn && <span className="sn-w">⚠ {props.d.warnings.length}</span>}
      </div>
      {props.children}
      {props.out && <Handle type="source" position={Position.Right} id="out" className="h-out" />}
    </div>
  );
}

function Row(props: { port: string; children: React.ReactNode; tone?: string; unlinked?: boolean }) {
  return (
    <div className={"sn-row" + (props.tone ? " " + props.tone : "") + (props.unlinked ? " unlinked" : "")}>
      {props.children}
      <Handle type="source" position={Position.Right} id={props.port} className="h-out" />
    </div>
  );
}

const unlinkedPorts = (d: FlowNodeData) => new Set(d.warnings.filter((w) => w.code === "unlinked-port").map((w) => w.port));

export const StartNode = memo(({ data, selected }: NodeProps<FlowNode>) => <Shell d={data} selected={selected} input={false} out />);

export const EndNode = memo(({ data, selected }: NodeProps<FlowNode>) => <Shell d={data} selected={selected} />);

export const PassageNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const d = data.node.data;
  const entry = useAssets((s) => (d.kind === "passage" && d.speaker?.monsterId != null ? s.byMonster.get(d.speaker.monsterId) : undefined));
  if (d.kind !== "passage") return null;
  const slot = portraitSlot(entry, d.emotion);
  return (
    <Shell d={data} selected={selected} out title={d.speaker ? `${d.speaker.name || "?"} · ${FACE_NAMES[d.emotion] ?? ""}` : "Narration"}>
      <div className="sn-b">
        {entry && slot != null ? <PortraitCanvas entry={entry.entry} slot={slot} size={40} className="sn-pp" /> : d.speaker ? <span className="sn-pp ph">?</span> : null}
        <span className={d.text.trim() ? "" : "muted"}>{d.text.trim() ? clip(d.text, 140) : "(no text yet)"}</span>
      </div>
      {d.actions.map((a, i) => <div key={i} className="sn-act">⚡ {describeAction(a)}</div>)}
    </Shell>
  );
});

export const ChoiceNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const d = data.node.data;
  if (d.kind !== "choice") return null;
  const un = unlinkedPorts(data);
  return (
    <Shell d={data} selected={selected}>
      {d.prompt && <div className="sn-b muted">{clip(d.prompt, 80)}</div>}
      {d.options.map((o) => (
        <Row key={o.id} port={o.id} unlinked={un.has(o.id)}>
          <span>{o.label || <i className="muted">(empty)</i>}</span>
          {o.showIf && <span className="tagc">if {describeCondition(o.showIf)}</span>}
        </Row>
      ))}
    </Shell>
  );
});

export const BranchNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const d = data.node.data;
  if (d.kind !== "branch") return null;
  const un = unlinkedPorts(data);
  return (
    <Shell d={data} selected={selected}>
      <div className="sn-b">If {describeCondition(d.condition)}</div>
      <Row port="true" tone="t-true" unlinked={un.has("true")}>true</Row>
      <Row port="false" tone="t-false" unlinked={un.has("false")}>false</Row>
    </Shell>
  );
});

export const ActionNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const d = data.node.data;
  if (d.kind !== "action") return null;
  return (
    <Shell d={data} selected={selected} out>
      {d.actions.length ? d.actions.map((a, i) => <div key={i} className="sn-act">{describeAction(a)}</div>) : <div className="sn-b muted">(no actions yet)</div>}
    </Shell>
  );
});

export const RandomNode = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const d = data.node.data;
  if (d.kind !== "random") return null;
  const total = d.weights.reduce((a, w) => a + Math.max(0, w.weight), 0) || 1;
  const un = unlinkedPorts(data);
  return (
    <Shell d={data} selected={selected}>
      {d.weights.map((w, i) => (
        <Row key={w.id} port={w.id} unlinked={un.has(w.id)}>
          Path {i + 1} <span className="muted">{Math.round((Math.max(0, w.weight) / total) * 100)}%</span>
        </Row>
      ))}
    </Shell>
  );
});

export const nodeTypes = {
  start: StartNode,
  end: EndNode,
  passage: PassageNode,
  choice: ChoiceNode,
  branch: BranchNode,
  action: ActionNode,
  random: RandomNode,
};

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
