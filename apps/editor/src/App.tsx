import * as Comlink from "comlink";
import { useEffect, useState } from "react";
import { rom, saveRom, loadSavedRom, forgetRom } from "./romClient";
import type { LoadResult } from "./rom.worker";
import { RomDrop } from "./components/RomDrop";
import { AssetBrowser } from "./components/AssetBrowser";

type Loaded = Extract<LoadResult, { ok: true }>;

const TABS = [
  { id: "map", label: "Map", milestone: "M3–M4" },
  { id: "events", label: "Events", milestone: "M5–M6" },
  { id: "dungeons", label: "Dungeons", milestone: "M7–M8" },
  { id: "starter", label: "Starter", milestone: "M11" },
  { id: "systems", label: "Systems", milestone: "M12–M14" },
  { id: "database", label: "Database", milestone: "M6" },
  { id: "assets", label: "Assets", milestone: "" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function App() {
  const [state, setState] = useState<"checking" | "need-rom" | "loading" | "ready">("checking");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Loaded | null>(null);
  const [tab, setTab] = useState<TabId>("assets");

  async function open(buf: ArrayBuffer, remember: boolean) {
    setState("loading");
    setError(null);
    if (remember) await saveRom(buf);
    const res = await rom.load(Comlink.transfer(buf, [buf]));
    if (res.ok) {
      setInfo(res);
      setState("ready");
    } else {
      if (!remember) await forgetRom();
      setError(res.error);
      setState("need-rom");
    }
  }

  useEffect(() => {
    loadSavedRom().then((buf) => (buf ? open(buf, false) : setState("need-rom")));
  }, []);

  async function unload() {
    await forgetRom();
    location.reload();
  }

  if (state !== "ready" || !info) {
    return <RomDrop busy={state === "loading" || state === "checking"} error={error} onFile={(b) => open(b, true)} />;
  }

  const current = TABS.find((t) => t.id === tab)!;
  return (
    <div className="app">
      <header className="top">
        <span className="logo">◆ SKY MAKER</span>
        {TABS.map((t) => (
          <button key={t.id} className={"tab" + (t.id === tab ? " on" : "")} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
        <span className="sp" />
        <span className="chip" title={`SHA-1 ${info.sha1}`}>
          {info.gameName} · {info.fileCount.toLocaleString()} files
        </span>
        <button className="btn" onClick={unload}>Change ROM</button>
        <button className="btn go" disabled title="Coming in M5">▶ Playtest</button>
      </header>
      <main className="main">
        {tab === "assets" ? (
          <AssetBrowser tree={info.tree} portraits={info.portraits} />
        ) : (
          <div className="soon">
            <div className="soon-card">
              <h2>{current.label}</h2>
              <p>This editor is planned for milestone <b>{current.milestone}</b>.</p>
              <p className="muted">For now, the <b>Assets</b> tab shows what Sky Maker can already read from your ROM.</p>
              <button className="btn" onClick={() => setTab("assets")}>Go to Assets</button>
            </div>
          </div>
        )}
      </main>
      <footer className="status">
        <span>{info.title} ({info.gameCode} rev {info.revision})</span>
        <span>{info.portraits.length} Pokémon with portraits</span>
        <span style={{ marginLeft: "auto" }}>Your ROM stays on this computer</span>
      </footer>
    </div>
  );
}
