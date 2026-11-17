import { useMemo, useState } from "react";
import { FACE_NAMES } from "@sky/rom";
import {
  defaultAction, newId,
  type Action, type ActionType, type Condition, type NodeData, type StoryNode, type GraphWarning,
} from "@sky/schema";
import { collectNames, useProject } from "../../projectStore";
import { portraitSlot, useAssets } from "../../assetStore";
import { PortraitCanvas } from "../PortraitCanvas";
import { KIND_META } from "./nodes";
import { DIALOGUE_LINES, DIALOGUE_TEXT_WIDTH, PmdLines, useFont, useWrapped } from "../PmdText";

const ACTION_LABELS: Record<ActionType, string> = {
  setFlag: "🚩 Set flag", setVar: "🔢 Set variable", giveItem: "🎁 Give item", takeItem: "🎒 Take item",
  emote: "❗ Emote", wait: "⏱ Wait", fade: "🌑 Fade", playBgm: "♪ Play music", moveActor: "🚶 Move character",
};

export function Inspector(props: { node: StoryNode | null; warnings: GraphWarning[]; onPlayFrom(id: string): void }) {
  const update = useProject((s) => s.updateNode);
  const del = useProject((s) => s.deleteNodes);
  const project = useProject((s) => s.project);
  const names = useMemo(() => collectNames(project), [project]);
  const n = props.node;
  if (!n) {
    return (
      <aside className="panel r insp">
        <div className="ph"><span>Inspector</span></div>
        <div className="hint">
          <p><b>Click a node</b> to edit it.</p>
          <p><b>Drag from a dot</b> on the right of a node into empty space to add the next node.</p>
          <p><b>Drag a dot onto another node</b> to link them.</p>
          <p className="muted">Delete/Backspace removes the selection. Ctrl+Z / Ctrl+Shift+Z undo and redo.</p>
        </div>
      </aside>
    );
  }
  const d = n.data;
  const set = (data: NodeData, key?: string) => update(n.id, data, key ? `${n.id}:${key}` : undefined);
  const meta = KIND_META[d.kind];
  const nodeWarnings = props.warnings.filter((w) => w.nodeId === n.id);

  return (
    <aside className="panel r insp">
      <datalist id="dl-flags">{names.flags.map((f) => <option key={f} value={f} />)}</datalist>
      <datalist id="dl-vars">{names.vars.map((f) => <option key={f} value={f} />)}</datalist>
      <datalist id="dl-items">{names.items.map((f) => <option key={f} value={f} />)}</datalist>
      <div className="ph"><span>{meta.icon} {meta.label} node</span>
        <span className="ph-actions">
          {d.kind !== "end" && <button className="link" onClick={() => props.onPlayFrom(n.id)}>▶ Play from here</button>}
          <button className="link danger" onClick={() => del([n.id])}>Delete</button>
        </span>
      </div>
      {nodeWarnings.length > 0 && <div className="warnbox">{nodeWarnings.map((w, i) => <div key={i}>⚠ {w.message}</div>)}</div>}

      {d.kind === "passage" && (
        <>
          <SpeakerField value={d.speaker} onChange={(speaker) => set({ ...d, speaker })} />
          {d.speaker?.monsterId != null && <EmotionField monsterId={d.speaker.monsterId} value={d.emotion} onChange={(emotion) => set({ ...d, emotion })} />}
          <Field label="Text">
            <textarea className="inp ta" rows={5} value={d.text} placeholder="What do they say?" onChange={(e) => set({ ...d, text: e.target.value }, "text")} />
          </Field>
          <PassagePreview text={d.text} name={d.speaker?.name ?? ""} />
          <ActionsEditor title="Before the text shows" actions={d.actions} onChange={(actions) => set({ ...d, actions })} nodeId={n.id} />
        </>
      )}

      {d.kind === "choice" && (
        <>
          <Field label="Prompt (optional)">
            <input className="inp" value={d.prompt} placeholder="Shown above the options" onChange={(e) => set({ ...d, prompt: e.target.value }, "prompt")} />
          </Field>
          <div className="sub">Options</div>
          {d.options.map((o, i) => (
            <div key={o.id} className="opt-edit">
              <div className="row2">
                <input className="inp grow" value={o.label} placeholder={`Option ${i + 1}`} onChange={(e) => set({ ...d, options: d.options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) }, `opt-${o.id}`)} />
                <button className="icon" title="Move up" disabled={i === 0} onClick={() => set({ ...d, options: swap(d.options, i, i - 1) })}>↑</button>
                <button className="icon" title="Remove" disabled={d.options.length <= 1} onClick={() => set({ ...d, options: d.options.filter((x) => x.id !== o.id) })}>✕</button>
              </div>
              {o.showIf ? (
                <div className="cond-wrap">
                  <span className="muted small">Only show if</span>
                  <ConditionEditor value={o.showIf} onChange={(c) => set({ ...d, options: d.options.map((x) => (x.id === o.id ? { ...x, showIf: c } : x)) }, `cond-${o.id}`)} />
                  <button className="link small" onClick={() => set({ ...d, options: d.options.map((x) => (x.id === o.id ? { id: x.id, label: x.label } : x)) })}>remove condition</button>
                </div>
              ) : (
                <button className="link small" onClick={() => set({ ...d, options: d.options.map((x) => (x.id === o.id ? { ...x, showIf: { type: "flag", flag: "", is: true } } : x)) })}>＋ only show if…</button>
              )}
            </div>
          ))}
          <button className="btn small-btn" disabled={d.options.length >= 8} onClick={() => set({ ...d, options: [...d.options, { id: newId("o"), label: "" }] })}>＋ Add option</button>
        </>
      )}

      {d.kind === "branch" && (
        <Field label="Go down the true path if">
          <ConditionEditor value={d.condition} onChange={(condition) => set({ ...d, condition }, "cond")} />
        </Field>
      )}

      {d.kind === "action" && <ActionsEditor title="Actions (run in order)" actions={d.actions} onChange={(actions) => set({ ...d, actions })} nodeId={n.id} />}

      {d.kind === "random" && (
        <>
          <div className="sub">Paths and weights</div>
          {d.weights.map((w, i) => (
            <div key={w.id} className="row2 pad">
              <span className="grow">Path {i + 1}</span>
              <input className="inp num" type="number" min={0} value={w.weight} onChange={(e) => set({ ...d, weights: d.weights.map((x) => (x.id === w.id ? { ...x, weight: Math.max(0, Number(e.target.value) || 0) } : x)) }, `w-${w.id}`)} />
              <button className="icon" disabled={d.weights.length <= 2} onClick={() => set({ ...d, weights: d.weights.filter((x) => x.id !== w.id) })}>✕</button>
            </div>
          ))}
          <button className="btn small-btn" onClick={() => set({ ...d, weights: [...d.weights, { id: newId("w"), weight: 1 }] })}>＋ Add path</button>
        </>
      )}

      {d.kind === "start" && <div className="hint"><p>The conversation begins here. Link it to the first passage.</p></div>}
      {d.kind === "end" && <div className="hint"><p>The conversation ends here and the player gets control back.</p></div>}
    </aside>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{props.label}</label>
      {props.children}
    </div>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const c = [...arr];
  [c[a], c[b]] = [c[b]!, c[a]!];
  return c;
}

function SpeakerField(props: { value: { name: string; monsterId: number | null } | null; onChange(v: { name: string; monsterId: number | null } | null): void }) {
  const portraits = useAssets((s) => s.portraits);
  const byMonster = useAssets((s) => s.byMonster);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? portraits.filter((p) => p.name.toLowerCase().includes(s)) : portraits).slice(0, 24);
  }, [q, portraits]);
  const v = props.value;
  const entry = v?.monsterId != null ? byMonster.get(v.monsterId) : undefined;

  return (
    <>
      <Field label="Speaker">
        <div className="row2">
          <button className={"seg" + (!v ? " on" : "")} onClick={() => props.onChange(null)}>Narration</button>
          <button className={"seg" + (v ? " on" : "")} onClick={() => !v && props.onChange({ name: "", monsterId: null })}>Character</button>
        </div>
      </Field>
      {v && (
        <>
          <Field label="Name shown in the dialogue box">
            <input className="inp" value={v.name} placeholder="e.g. Elder Torkoal" onChange={(e) => props.onChange({ ...v, name: e.target.value })} />
          </Field>
          <Field label="Portrait (Pokémon from your ROM)">
            <div className="picker">
              <div className="row2">
                {entry && <PortraitCanvas entry={entry.entry} slot={portraitSlot(entry, 0) ?? 0} size={32} className="rounded" />}
                <input
                  className="inp grow"
                  value={open ? q : entry?.name ?? ""}
                  placeholder="Search Pokémon…"
                  onFocus={() => (setOpen(true), setQ(""))}
                  onBlur={() => setTimeout(() => setOpen(false), 150)}
                  onChange={(e) => setQ(e.target.value)}
                />
                {entry && <button className="icon" title="No portrait" onClick={() => props.onChange({ ...v, monsterId: null })}>✕</button>}
              </div>
              {open && (
                <div className="picker-list">
                  {matches.map((p) => (
                    <button
                      key={p.entry}
                      className="picker-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        props.onChange({ name: v.name || p.name, monsterId: p.monsterId });
                        setOpen(false);
                      }}
                    >
                      <PortraitCanvas entry={p.entry} slot={portraitSlot(p, 0) ?? 0} size={28} className="rounded" />
                      {p.name}
                    </button>
                  ))}
                  {!matches.length && <div className="muted pad">No matches</div>}
                </div>
              )}
            </div>
          </Field>
        </>
      )}
    </>
  );
}

function EmotionField(props: { monsterId: number; value: number; onChange(face: number): void }) {
  const entry = useAssets((s) => s.byMonster.get(props.monsterId));
  if (!entry) return null;
  const faces = entry.slots.filter((s) => !(s & 1)).map((s) => s >> 1);
  return (
    <Field label="Expression">
      <div className="faces-pick">
        {faces.map((f) => (
          <button key={f} className={"face-btn" + (f === props.value ? " on" : "")} title={FACE_NAMES[f]} onClick={() => props.onChange(f)}>
            <PortraitCanvas entry={entry.entry} slot={f * 2} size={36} />
            <span>{FACE_NAMES[f]}</span>
          </button>
        ))}
      </div>
    </Field>
  );
}

export function ConditionEditor(props: { value: Condition; onChange(c: Condition): void }) {
  const c = props.value;
  return (
    <div className="cond">
      <select className="inp" value={c.type} onChange={(e) => {
        const t = e.target.value as Condition["type"];
        props.onChange(t === "flag" ? { type: "flag", flag: "", is: true } : t === "var" ? { type: "var", variable: "", cmp: ">=", value: 1 } : { type: "hasItem", item: "", count: 1 });
      }}>
        <option value="flag">Flag</option>
        <option value="var">Variable</option>
        <option value="hasItem">Item in bag</option>
      </select>
      {c.type === "flag" && (
        <>
          <input className="inp grow" list="dl-flags" placeholder="flag name" value={c.flag} onChange={(e) => props.onChange({ ...c, flag: e.target.value })} />
          <select className="inp" value={c.is ? "on" : "off"} onChange={(e) => props.onChange({ ...c, is: e.target.value === "on" })}>
            <option value="on">is ON</option>
            <option value="off">is OFF</option>
          </select>
        </>
      )}
      {c.type === "var" && (
        <>
          <input className="inp grow" list="dl-vars" placeholder="variable" value={c.variable} onChange={(e) => props.onChange({ ...c, variable: e.target.value })} />
          <select className="inp" value={c.cmp} onChange={(e) => props.onChange({ ...c, cmp: e.target.value as typeof c.cmp })}>
            {["==", "!=", ">", ">=", "<", "<="].map((x) => <option key={x}>{x}</option>)}
          </select>
          <input className="inp num" type="number" value={c.value} onChange={(e) => props.onChange({ ...c, value: Number(e.target.value) || 0 })} />
        </>
      )}
      {c.type === "hasItem" && (
        <>
          <input className="inp grow" list="dl-items" placeholder="item name" value={c.item} onChange={(e) => props.onChange({ ...c, item: e.target.value })} />
          <span className="muted">×</span>
          <input className="inp num" type="number" min={1} value={c.count} onChange={(e) => props.onChange({ ...c, count: Math.max(1, Number(e.target.value) || 1) })} />
        </>
      )}
    </div>
  );
}

function ActionsEditor(props: { title: string; actions: Action[]; onChange(a: Action[]): void; nodeId: string }) {
  const { actions } = props;
  const upd = (i: number, a: Action) => props.onChange(actions.map((x, j) => (j === i ? a : x)));
  return (
    <>
      <div className="sub">{props.title}</div>
      {actions.map((a, i) => (
        <div key={i} className="act-edit">
          <div className="row2">
            <select className="inp grow" value={a.type} onChange={(e) => upd(i, defaultAction(e.target.value as ActionType))}>
              {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="icon" disabled={i === 0} onClick={() => props.onChange(swap(actions, i, i - 1))}>↑</button>
            <button className="icon" onClick={() => props.onChange(actions.filter((_, j) => j !== i))}>✕</button>
          </div>
          <div className="row2">
            {a.type === "setFlag" && (<>
              <input className="inp grow" list="dl-flags" placeholder="flag name" value={a.flag} onChange={(e) => upd(i, { ...a, flag: e.target.value })} />
              <select className="inp" value={a.value ? "on" : "off"} onChange={(e) => upd(i, { ...a, value: e.target.value === "on" })}><option value="on">ON</option><option value="off">OFF</option></select>
            </>)}
            {a.type === "setVar" && (<>
              <input className="inp grow" list="dl-vars" placeholder="variable" value={a.variable} onChange={(e) => upd(i, { ...a, variable: e.target.value })} />
              <select className="inp" value={a.op} onChange={(e) => upd(i, { ...a, op: e.target.value as "set" | "add" })}><option value="set">=</option><option value="add">+=</option></select>
              <input className="inp num" type="number" value={a.value} onChange={(e) => upd(i, { ...a, value: Number(e.target.value) || 0 })} />
            </>)}
            {(a.type === "giveItem" || a.type === "takeItem") && (<>
              <input className="inp grow" list="dl-items" placeholder="item name" value={a.item} onChange={(e) => upd(i, { ...a, item: e.target.value })} />
              <span className="muted">×</span>
              <input className="inp num" type="number" min={1} value={a.count} onChange={(e) => upd(i, { ...a, count: Math.max(1, Number(e.target.value) || 1) })} />
            </>)}
            {a.type === "emote" && (<>
              <input className="inp grow" placeholder="who" value={a.who} onChange={(e) => upd(i, { ...a, who: e.target.value })} />
              <select className="inp" value={a.emote} onChange={(e) => upd(i, { ...a, emote: e.target.value as typeof a.emote })}>{["!", "?", "♪", "…", "💢"].map((x) => <option key={x}>{x}</option>)}</select>
            </>)}
            {a.type === "wait" && (<><input className="inp num" type="number" min={0} step={0.5} value={a.seconds} onChange={(e) => upd(i, { ...a, seconds: Math.max(0, Number(e.target.value) || 0) })} /><span className="muted">seconds</span></>)}
            {a.type === "fade" && (<select className="inp" value={a.dir} onChange={(e) => upd(i, { ...a, dir: e.target.value as "in" | "out" })}><option value="out">Fade out</option><option value="in">Fade in</option></select>)}
            {a.type === "playBgm" && (<input className="inp grow" placeholder="track (music browser comes in M9)" value={a.track} onChange={(e) => upd(i, { ...a, track: e.target.value })} />)}
            {a.type === "moveActor" && (<>
              <input className="inp grow" placeholder="who" value={a.who} onChange={(e) => upd(i, { ...a, who: e.target.value })} />
              <input className="inp grow" placeholder="to (tile or character)" value={a.to} onChange={(e) => upd(i, { ...a, to: e.target.value })} />
            </>)}
          </div>
        </div>
      ))}
      <button className="btn small-btn" onClick={() => props.onChange([...actions, defaultAction("setFlag")])}>＋ Add action</button>
    </>
  );
}

/** The passage as the game will show it: ROM font, real box width, split into 3-line boxes. */
function PassagePreview(props: { text: string; name: string }) {
  const font = useFont();
  const lines = useWrapped(props.text || " ", DIALOGUE_TEXT_WIDTH);
  if (!font) return null;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += DIALOGUE_LINES) pages.push(lines.slice(i, i + DIALOGUE_LINES));
  return (
    <div className="field">
      <label>In-game preview{pages.length > 1 ? ` · ${pages.length} boxes` : ""}</label>
      <div className="mini-boxes">
        {pages.map((pg, i) => (
          <div key={i} className="mini-box">
            {i === 0 && props.name && <PmdLines lines={[props.name]} color="#ffd94a" scale={1} />}
            <PmdLines lines={pg} scale={1} width={DIALOGUE_TEXT_WIDTH} minLines={DIALOGUE_LINES} />
          </div>
        ))}
      </div>
    </div>
  );
}
