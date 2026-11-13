import { useEffect, useState } from "react";
import { saveRom, loadSavedRom, forgetRom, loadRom, TimeoutError } from "./romClient";
import type { LoadResult } from "./romApi";
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

  async function open(file: Blob, fromSaved: boolean) {
    setState("loading");
    setError(null);
    try {
      const res = await loadRom(file);
      if (res.ok) {
        if (!fromSaved) saveRom(file);
        setInfo(res);
        setState("ready");
        return;
      }
      setError(res.error);
    } catch (e) {
      console.error("[sky-maker]", e);
      setError(
        e instanceof TimeoutError
          ? `Reading your ROM took too long (${e.message}). Try opening Sky Maker in Google Chrome or Microsoft Edge, then drop the ROM again.`
          : `Something went wrong reading your ROM: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (fromSaved) await forgetRom();
    setState("need-rom");
  }

  useEffect(() => {
    loadSavedRom().then((blob) => (blob ? open(blob, true) : setState("need-rom")));
  }, []);

  async function unload() {
    await forgetRom();
    location.reload();
  }

  if (state !== "ready" || !info) {
    return <RomDrop busy={state === "loading"} checking={state === "checking"} error={error} onFile={(f) => open(f, false)} />;
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
