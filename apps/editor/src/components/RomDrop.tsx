import { useRef, useState } from "react";

export function RomDrop(props: { busy: boolean; checking: boolean; error: string | null; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(file: File | undefined) {
    if (!file || props.busy) return;
    props.onFile(file);
  }

  return (
    <div className="drop-page">
      <div className="logo big">◆ SKY MAKER</div>
      <div
        className={"drop" + (over ? " over" : "") + (props.busy ? " busy" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files[0]);
        }}
        onClick={() => input.current?.click()}
      >
        {props.busy ? (
          <>
            <div className="spinner" />
            <h2>Reading your ROM…</h2>
            <p className="muted">This takes a few seconds.</p>
          </>
        ) : (
          <>
            <h2>Load your Explorers of Sky ROM</h2>
            {props.checking && <p className="muted small">Checking for a ROM you loaded before…</p>}
            <p>Drag your <code>.nds</code> file here, or click to choose it.</p>
            <p className="muted">
              Sky Maker uses the sprites, portraits and music from your own copy of the game.
              <br />
              Your ROM is read inside this browser and never uploaded.
            </p>
            <button className="btn go" type="button">Choose file</button>
          </>
        )}
        <input ref={input} type="file" accept=".nds" hidden onChange={(e) => take(e.target.files?.[0])} />
      </div>
      {props.error && <div className="error">{props.error}</div>}
      <p className="muted small">Needs the US version (game code C2SE).</p>
    </div>
  );
}
