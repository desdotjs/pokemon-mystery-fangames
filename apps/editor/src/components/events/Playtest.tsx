import { useEffect, useMemo, useRef, useState } from "react";
import { StoryRunner, emptyState, type StoryState, type StoryStep } from "@sky/engine";
import type { Action, StoryGraph } from "@sky/schema";
import { portraitSlot, useAssets } from "../../assetStore";
import { PortraitCanvas } from "../PortraitCanvas";
import { describeAction } from "./nodes";

const END_TEXT: Record<string, string> = {
  end: "The conversation ended.",
  "dead-end": "Stopped: this node doesn't link anywhere yet.",
  "missing-node": "Stopped: a link points at a node that no longer exists.",
  "loop-guard": "Stopped: the graph loops forever without stopping for the player.",
};

/** Playtest a story graph from any node, with editable starting flags/vars/items. */
export function Playtest(props: { graph: StoryGraph; startNodeId: string | null; onClose(): void; onShowNode(id: string): void }) {
  const [setup, setSetup] = useState<StoryState>(() => loadSetup());
  const [runId, setRunId] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [step, setStep] = useState<StoryStep | null>(null);
  const [live, setLive] = useState<StoryState | null>(null);
  const runner = useRef<StoryRunner | null>(null);
  const sink = useRef<string[]>([]);
  const typing = useRef<{ skip(): boolean }>({ skip: () => false });

  useEffect(() => {
    const state: StoryState = structuredClone(setup);
    sink.current = [];
    const r = new StoryRunner(props.graph, state, (a: Action) => sink.current.push(describeAction(a)));
    runner.current = r;
    const first = r.start(props.startNodeId ?? undefined);
    setLog([...sink.current]);
    setStep(first);
    setLive(structuredClone(state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  function advance(fn: (r: StoryRunner) => StoryStep) {
    const r = runner.current;
    if (!r) return;
    sink.current = [];
    const s = fn(r);
    const ran = [...sink.current];
    setLog((l) => [...l, ...ran]);
    setStep(s);
    setLive(structuredClone(r.state));
  }

  useEffect(() => {
    if (step && step.type !== "end") props.onShowNode(step.nodeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.type === "end" ? null : step?.nodeId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "Escape") props.onClose();
      const go = e.key === "Enter" || e.key === " " || e.key === "z";
      if (go) e.preventDefault(); // don't re-click a focused button (e.g. Restart)
      if (step?.type === "text" && go) {
        if (typing.current.skip()) return; // first press finishes the typewriter
        advance((r) => r.next());
      }
      if (step?.type === "choice") {
        const n = Number(e.key);
        const o = step.options[n - 1];
        if (o) advance((r) => r.choose(o.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function changeSetup(s: StoryState) {
    setSetup(s);
    saveSetup(s);
  }

  return (
    <div className="pt-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="pt">
        <div className="pt-head">
          <b>▶ Playtest · {props.graph.name}</b>
          <span className="muted">{props.startNodeId ? "from the selected node" : "from Start"}</span>
          <span className="sp" />
          <button className="btn" onClick={(e) => (e.currentTarget.blur(), setRunId((n) => n + 1))}>↻ Restart</button>
          <button className="btn" onClick={props.onClose}>Close (Esc)</button>
        </div>
        <div className="pt-body">
          <div className="pt-screen-wrap">
            <div className="pt-screen">
              <div className="pt-scene muted">Map preview comes with the Map editor (M4–M5)</div>
              {step && <DialogueBox step={step} typing={typing} onNext={() => advance((r) => r.next())} onChoose={(id) => advance((r) => r.choose(id))} />}
            </div>
            <div className="muted small">Enter / Space / Z to continue · number keys pick a choice</div>
          </div>
          <div className="pt-side">
            <div className="sub">Starting state <span className="muted small">(used on every restart)</span></div>
            <StateEditor value={setup} onChange={changeSetup} />
            <div className="sub">Right now</div>
            <StateView value={live ?? emptyState()} />
            <div className="sub">Actions that ran</div>
            <div className="pt-log">{log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <span className="muted">None yet</span>}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DialogueBox(props: { step: StoryStep; typing: React.MutableRefObject<{ skip(): boolean }>; onNext(): void; onChoose(id: string): void }) {
  const s = props.step;
  const entry = useAssets((st) => (s.type === "text" && s.speaker?.monsterId != null ? st.byMonster.get(s.speaker.monsterId) : undefined));
  const { shown, skip } = useTypewriter(s.type === "text" ? s.text : "", s);
  props.typing.current = { skip };
  if (s.type === "end") {
    return <div className="pt-box pt-end">{END_TEXT[s.reason]}</div>;
  }
  if (s.type === "choice") {
    return (
      <div className="pt-box">
        {s.prompt && <div className="pt-prompt">{s.prompt}</div>}
        {s.options.length ? s.options.map((o, i) => (
          <button key={o.id} className="pt-opt" onClick={() => props.onChoose(o.id)}>
            <span className="muted">{i + 1}.</span> {o.label || "(empty option)"}
          </button>
        )) : <div className="muted">No options are visible with the current flags.</div>}
      </div>
    );
  }
  const slot = portraitSlot(entry, s.emotion);
  const done = shown.length >= s.text.length;
  return (
    <div className="pt-box" onClick={() => (skip() ? null : props.onNext())}>
      {entry && slot != null && <PortraitCanvas key={`${entry.entry}-${slot}`} entry={entry.entry} slot={slot} size={80} className="pt-portrait" />}
      <div className="pt-text">
        {s.speaker?.name && <div className="pt-name">{s.speaker.name}</div>}
        <div>{shown}{done && <span className="pt-caret">▼</span>}</div>
      </div>
    </div>
  );
}

/** Reveals text letter by letter. `skip()` shows it all and returns true if it was still typing. */
function useTypewriter(text: string, key: unknown): { shown: string; skip(): boolean } {
  const [n, setN] = useState(0);
  const nRef = useRef(0);
  useEffect(() => {
    nRef.current = 0;
    setN(0);
    if (!text) return;
    const t = setInterval(() => {
      if (nRef.current >= text.length) return clearInterval(t);
      nRef.current += 1;
      setN(nRef.current);
    }, 18);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    shown: text.slice(0, n),
    skip() {
      if (nRef.current >= text.length) return false;
      nRef.current = text.length;
      setN(text.length);
      return true;
    },
  };
}

function StateEditor(props: { value: StoryState; onChange(s: StoryState): void }) {
  const v = props.value;
  const [k, setK] = useState<"flags" | "vars" | "items">("flags");
  const [name, setName] = useState("");
  const rows = useMemo(() => Object.entries(v[k]), [v, k]);
  return (
    <div className="st-ed">
      <div className="row2">
        {(["flags", "vars", "items"] as const).map((x) => (
          <button key={x} className={"seg" + (x === k ? " on" : "")} onClick={() => setK(x)}>{x === "vars" ? "Variables" : x[0]!.toUpperCase() + x.slice(1)}</button>
        ))}
      </div>
      {rows.map(([key, val]) => (
        <div key={key} className="row2 st-row">
          <span className="grow">{key}</span>
          {k === "flags" ? (
            <select className="inp" value={val ? "on" : "off"} onChange={(e) => props.onChange({ ...v, flags: { ...v.flags, [key]: e.target.value === "on" } })}>
              <option value="on">ON</option><option value="off">OFF</option>
            </select>
          ) : (
            <input className="inp num" type="number" value={Number(val)} onChange={(e) => props.onChange({ ...v, [k]: { ...v[k], [key]: Number(e.target.value) || 0 } })} />
          )}
          <button className="icon" onClick={() => { const c = { ...v[k] }; delete c[key]; props.onChange({ ...v, [k]: c }); }}>✕</button>
        </div>
      ))}
      <form className="row2" onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim();
        if (!n) return;
        props.onChange({ ...v, [k]: { ...v[k], [n]: k === "flags" ? true : 1 } });
        setName("");
      }}>
        <input className="inp grow" list={k === "flags" ? "dl-flags" : k === "vars" ? "dl-vars" : "dl-items"} placeholder={`add ${k === "vars" ? "variable" : k.slice(0, -1)}…`} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn">Add</button>
      </form>
    </div>
  );
}

function StateView(props: { value: StoryState }) {
  const { flags, vars, items } = props.value;
  const parts = [
    ...Object.entries(flags).map(([k, v]) => `🚩 ${k} ${v ? "ON" : "OFF"}`),
    ...Object.entries(vars).map(([k, v]) => `🔢 ${k} = ${v}`),
    ...Object.entries(items).filter(([, v]) => v > 0).map(([k, v]) => `🎒 ${k} ×${v}`),
  ];
  return <div className="pt-log">{parts.length ? parts.map((p) => <div key={p}>{p}</div>) : <span className="muted">Empty</span>}</div>;
}

const SETUP_KEY = "sky-maker/playtest-setup";
function loadSetup(): StoryState {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (raw) return { ...emptyState(), ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return emptyState();
}
function saveSetup(s: StoryState) {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
