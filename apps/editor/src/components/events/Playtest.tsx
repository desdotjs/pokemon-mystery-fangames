import { useEffect, useMemo, useRef, useState } from "react";
import { StoryRunner, emptyState, type StoryState, type StoryStep } from "@sky/engine";
import type { Action, StoryGraph } from "@sky/schema";
import { portraitSlot, useAssets } from "../../assetStore";
import { PortraitCanvas } from "../PortraitCanvas";
import { DIALOGUE_LINES, DIALOGUE_TEXT_WIDTH, PmdLines, useFont, useWrapped } from "../PmdText";
import { measureText } from "@sky/rom";
import { describeAction } from "./nodes";

/** DS screen is 256x192; everything below is laid out in native pixels and drawn at 2x. */
const S = 2;

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
  /** The dialogue box consumes a press to finish typing or turn the page; returns true if it did. */
  const box = useRef<{ press(): boolean; move(d: number): void; pick(): void }>({ press: () => false, move: () => {}, pick: () => {} });

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
        if (box.current.press()) return; // finish typing / next page first
        advance((r) => r.next());
      }
      if (step?.type === "choice") {
        if (go) box.current.pick();
        if (e.key === "ArrowUp" || e.key === "ArrowDown") (e.preventDefault(), box.current.move(e.key === "ArrowUp" ? -1 : 1));
        const o = step.options[Number(e.key) - 1];
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
            <div className="pt-screen" style={{ width: 256 * S, height: 192 * S }}>
              <div className="pt-scene muted">Map preview comes with the Map editor (M4–M5)</div>
              {step && <DialogueScreen key={runId} step={step} box={box} onNext={() => advance((r) => r.next())} onChoose={(id) => advance((r) => r.choose(id))} />}
            </div>
            <div className="muted small">Enter / Space / Z to continue · ↑↓ or number keys to choose · text uses your ROM's font</div>
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

type BoxRef = React.MutableRefObject<{ press(): boolean; move(d: number): void; pick(): void }>;

function DialogueScreen(props: { step: StoryStep; box: BoxRef; onNext(): void; onChoose(id: string): void }) {
  const s = props.step;
  if (s.type === "end") {
    props.box.current = { press: () => false, move: () => {}, pick: () => {} };
    return <div className="pt-endmsg">{END_TEXT[s.reason]}</div>;
  }
  if (s.type === "choice") return <ChoiceMenu step={s} box={props.box} onChoose={props.onChoose} />;
  return <TextBox step={s} box={props.box} onNext={props.onNext} />;
}

/** Box frame: native x 4..252, 3 lines tall, sitting on the bottom of the screen. */
const BOX = { x: 4, w: 248, h: DIALOGUE_LINES * 15 + 12 };
const BOX_Y = 192 - 4 - BOX.h;

function Frame(props: { x: number; y: number; w: number; h: number; children?: React.ReactNode; onClick?(): void }) {
  return (
    <div className="pt-frame" onClick={props.onClick} style={{ left: props.x * S, top: props.y * S, width: props.w * S, height: props.h * S }}>
      {props.children}
    </div>
  );
}

function TextBox(props: { step: Extract<StoryStep, { type: "text" }>; box: BoxRef; onNext(): void }) {
  const s = props.step;
  const entry = useAssets((st) => (s.speaker?.monsterId != null ? st.byMonster.get(s.speaker.monsterId) : undefined));
  const lines = useWrapped(s.text, DIALOGUE_TEXT_WIDTH);
  const pages = useMemo(() => {
    const out: string[][] = [];
    for (let i = 0; i < lines.length; i += DIALOGUE_LINES) out.push(lines.slice(i, i + DIALOGUE_LINES));
    return out.length ? out : [[""]];
  }, [lines]);
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [s]);
  const pageLines = pages[Math.min(page, pages.length - 1)]!;
  const total = pageLines.reduce((a, l) => a + [...l].length + 1, 0);
  const { n, skip } = useTypewriter(total, `${s.nodeId}:${page}:${s.text}`);
  const done = n >= total;
  const press = () => {
    if (skip()) return true;
    if (page < pages.length - 1) return setPage(page + 1), true;
    return false;
  };
  props.box.current = { press, move: () => {}, pick: () => {} };
  const slot = portraitSlot(entry, s.emotion);
  const name = s.speaker?.name ?? "";
  const nameW = useNameWidth(name);

  return (
    <>
      {entry && slot != null && (
        <div className="pt-portrait-wrap" style={{ left: BOX.x * S, top: (BOX_Y - 46) * S }}>
          <PortraitCanvas key={`${entry.entry}-${slot}`} entry={entry.entry} slot={slot} size={40 * S} />
        </div>
      )}
      <Frame x={BOX.x} y={BOX_Y} w={BOX.w} h={BOX.h} onClick={() => (press() ? null : props.onNext())}>
        <div style={{ position: "absolute", left: 8 * S, top: 5 * S }}>
          <PmdLines lines={pageLines} maxChars={n} scale={S} width={DIALOGUE_TEXT_WIDTH} minLines={DIALOGUE_LINES} />
        </div>
        {done && <span className="pt-caret" style={{ right: 6 * S, bottom: 3 * S }}>{page < pages.length - 1 ? "▼" : "▼"}</span>}
        {pages.length > 1 && <span className="pt-pages">{page + 1}/{pages.length}</span>}
      </Frame>
      {name && (
        <div className="pt-nametab" style={{ left: (BOX.x + (entry ? 46 : 6)) * S, top: (BOX_Y - 9) * S, padding: `${1 * S}px ${4 * S}px` }}>
          <PmdLines lines={[name]} color="#ffd94a" scale={S} width={nameW} />
        </div>
      )}
    </>
  );
}

function useNameWidth(name: string): number {
  const font = useFont();
  return font ? measureText(font, name) : name.length * 6;
}

function ChoiceMenu(props: { step: Extract<StoryStep, { type: "choice" }>; box: BoxRef; onChoose(id: string): void }) {
  const s = props.step;
  const font = useFont();
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [s]);
  const labels = s.options.map((o) => o.label || "(empty option)");
  const widest = font ? Math.max(40, ...labels.map((l) => measureText(font, l))) : 80;
  const w = Math.min(240, widest + 26);
  const h = Math.max(1, labels.length) * 15 + 10;
  const promptLines = useWrapped(s.prompt, DIALOGUE_TEXT_WIDTH);
  props.box.current = {
    press: () => false,
    move: (d) => setSel((x) => (labels.length ? (x + d + labels.length) % labels.length : 0)),
    pick: () => {
      const o = s.options[sel];
      if (o) props.onChoose(o.id);
    },
  };
  return (
    <>
      {s.prompt && (
        <Frame x={BOX.x} y={BOX_Y} w={BOX.w} h={BOX.h}>
          <div style={{ position: "absolute", left: 8 * S, top: 5 * S }}>
            <PmdLines lines={promptLines.slice(0, DIALOGUE_LINES)} scale={S} width={DIALOGUE_TEXT_WIDTH} />
          </div>
        </Frame>
      )}
      <Frame x={252 - w} y={(s.prompt ? BOX_Y - 4 : 188) - h} w={w} h={h}>
        {labels.length ? labels.map((l, i) => (
          <button
            key={s.options[i]!.id}
            className={"pt-choice" + (i === sel ? " on" : "")}
            style={{ top: (5 + i * 15) * S, left: 4 * S, height: 15 * S }}
            onMouseEnter={() => setSel(i)}
            onClick={() => props.onChoose(s.options[i]!.id)}
          >
            <span className="pt-cursor" style={{ width: 12 * S }}>{i === sel ? "▶" : ""}</span>
            <PmdLines lines={[l]} scale={S} />
          </button>
        )) : <div className="pt-nochoice">No options are visible with the current flags.</div>}
      </Frame>
    </>
  );
}

/** Reveals `total` characters over time. `skip()` jumps to the end and returns true if it was still typing. */
function useTypewriter(total: number, key: string): { n: number; skip(): boolean } {
  const [n, setN] = useState(0);
  const nRef = useRef(0);
  useEffect(() => {
    nRef.current = 0;
    setN(0);
    const t = setInterval(() => {
      if (nRef.current >= total) return clearInterval(t);
      nRef.current += 1;
      setN(nRef.current);
    }, 16);
    return () => clearInterval(t);
  }, [key, total]);
  return {
    n,
    skip() {
      if (nRef.current >= total) return false;
      nRef.current = total;
      setN(total);
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
