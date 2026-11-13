import { useEffect, useMemo, useRef, useState } from "react";
import { slotName, type RomDir } from "@sky/rom";
import type { PortraitEntry } from "../romApi";
import { portraitImage } from "../romClient";

type View = "portraits" | "files";

export function AssetBrowser(props: { tree: RomDir; portraits: PortraitEntry[] }) {
  const [view, setView] = useState<View>("portraits");
  return (
    <>
      <aside className="panel" style={{ width: 220 }}>
        <div className="ph"><span>Assets</span></div>
        <div className="tree">
          <div className={view === "portraits" ? "sel" : ""} onClick={() => setView("portraits")}>
            🙂 Portraits <span className="chip">{props.portraits.length}</span>
          </div>
          <div className={view === "files" ? "sel" : ""} onClick={() => setView("files")}>📁 ROM files</div>
          <div className="disabled">🐾 Sprites <span className="chip">M2</span></div>
          <div className="disabled">🗺 Maps <span className="chip">M3</span></div>
          <div className="disabled">♪ Music <span className="chip">M9</span></div>
          <div className="disabled">＋ Import your own <span className="chip">M10</span></div>
        </div>
      </aside>
      {view === "portraits" ? <Portraits list={props.portraits} /> : <FileTree root={props.tree} />}
    </>
  );
}

function faceCount(slots: number[]): string {
  const n = slots.filter((s) => !(s & 1)).length;
  return n === 1 ? "1 face" : `${n} faces`;
}

function PortraitCanvas(props: { entry: number; slot: number; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current!;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let live = true;
    portraitImage(props.entry, props.slot).then((img) => {
      if (live && img && ref.current) ref.current.getContext("2d")!.putImageData(img, 0, 0);
    });
    return () => {
      live = false;
    };
  }, [visible, props.entry, props.slot]);
  return <canvas ref={ref} width={40} height={40} className="pixel" style={{ width: props.size, height: props.size }} />;
}

function Portraits(props: { list: PortraitEntry[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<PortraitEntry | null>(props.list[0] ?? null);
  const [showFlipped, setShowFlipped] = useState(false);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? props.list.filter((p) => p.name.toLowerCase().includes(s) || String(p.monsterId) === s) : props.list;
  }, [q, props.list]);

  return (
    <>
      <section className="content">
        <div className="toolbar">
          <input className="inp search" placeholder="Search Pokémon…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="muted">{filtered.length} shown</span>
        </div>
        <div className="grid">
          {filtered.map((p) => (
            <button key={p.entry} className={"card" + (sel?.entry === p.entry ? " on" : "")} onClick={() => setSel(p)}>
              <PortraitCanvas entry={p.entry} slot={p.slots[0]!} size={80} />
              <span className="name">{p.name}</span>
              <span className="muted small">#{p.monsterId} · {faceCount(p.slots)}</span>
            </button>
          ))}
        </div>
      </section>
      <aside className="panel r" style={{ width: 340 }}>
        {sel ? (
          <>
            <div className="ph"><span>{sel.name}</span><span>#{sel.monsterId}</span></div>
            <div className="hero">
              <PortraitCanvas key={sel.entry} entry={sel.entry} slot={sel.slots[0]!} size={160} />
            </div>
            <label className="check">
              <input type="checkbox" checked={showFlipped} onChange={(e) => setShowFlipped(e.target.checked)} /> Show flipped versions
            </label>
            <div className="faces">
              {sel.slots
                .filter((s) => showFlipped || !(s & 1))
                .map((s) => (
                  <div key={`${sel.entry}-${s}`} className="face">
                    <PortraitCanvas entry={sel.entry} slot={s} size={72} />
                    <span className="small">{slotName(s)}</span>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <div className="ph"><span>Nothing selected</span></div>
        )}
      </aside>
    </>
  );
}

function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + " MB";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + " KB";
  return n + " B";
}

function dirSize(d: RomDir): number {
  return d.files.reduce((a, f) => a + f.size, 0) + d.dirs.reduce((a, s) => a + dirSize(s), 0);
}
function dirCount(d: RomDir): number {
  return d.files.length + d.dirs.reduce((a, s) => a + dirCount(s), 0);
}

function Dir(props: { d: RomDir; depth: number }) {
  const [open, setOpen] = useState(props.depth === 0);
  const shown = 200;
  return (
    <>
      {props.depth > 0 && (
        <div className="row dir" style={{ paddingLeft: 12 + (props.depth - 1) * 16 }} onClick={() => setOpen(!open)}>
          <span>{open ? "▾" : "▸"} 📁 {props.d.name}</span>
          <span className="muted">{dirCount(props.d).toLocaleString()} files · {fmt(dirSize(props.d))}</span>
        </div>
      )}
      {open &&
        props.d.dirs.map((s) => <Dir key={s.path} d={s} depth={props.depth + 1} />)}
      {open &&
        props.d.files.slice(0, shown).map((f) => (
          <div key={f.path} className="row" style={{ paddingLeft: 12 + props.depth * 16 }}>
            <span>📄 {f.path.split("/").pop()}</span>
            <span className="muted">{fmt(f.size)}</span>
          </div>
        ))}
      {open && props.d.files.length > shown && (
        <div className="row muted" style={{ paddingLeft: 12 + props.depth * 16 }}>
          … and {(props.d.files.length - shown).toLocaleString()} more
        </div>
      )}
    </>
  );
}

function FileTree(props: { root: RomDir }) {
  return (
    <section className="content">
      <div className="toolbar">
        <b>ROM file system</b>
        <span className="muted">Read-only view of what's inside your ROM. Sky Maker reads assets from these files.</span>
      </div>
      <div className="filetree">
        <Dir d={props.root} depth={0} />
      </div>
    </section>
  );
}
