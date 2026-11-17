import { useEffect, useMemo, useRef } from "react";
import { GLYPH_SIZE, charToByte, glyphAdvance, wrapText, type BitmapFont } from "@sky/rom";
import { useAssets } from "../assetStore";
import type { GameFonts } from "../romApi";

/** Width of the text area inside a DS dialogue box, in native pixels. */
export const DIALOGUE_TEXT_WIDTH = 232;
export const DIALOGUE_LINES = 3;
export const LINE_HEIGHT = 15;

export type FontName = keyof GameFonts;

export function useFont(name: FontName = "dialogue"): BitmapFont | null {
  return useAssets((s) => s.fonts?.[name] ?? null);
}

export function useWrapped(text: string, width: number, name: FontName = "dialogue"): string[] {
  const font = useFont(name);
  return useMemo(() => (font ? wrapText(font, text, width) : text.split("\n")), [font, text, width]);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Draws pre-wrapped lines in one of the game's ROM fonts, pixel-perfect at an integer scale.
 * `maxChars` reveals only the first N characters (typewriter) without re-wrapping.
 * Falls back to plain text if fonts aren't loaded.
 */
export function PmdLines(props: {
  lines: string[];
  font?: FontName;
  scale?: number;
  color?: string;
  shadow?: string;
  maxChars?: number;
  width?: number; // native px; defaults to the widest line
  minLines?: number;
  className?: string;
}) {
  const font = useFont(props.font);
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = props.scale ?? 2;
  const lineCount = Math.max(props.lines.length, props.minLines ?? 0);
  const widest = useMemo(
    () => (font ? Math.max(1, ...props.lines.map((l) => [...l].reduce((w, ch) => w + glyphAdvance(font, ch), 0))) : 1),
    [font, props.lines],
  );
  const w = (props.width ?? widest) + 1;
  const h = lineCount * LINE_HEIGHT;

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !font) return;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    const [r, g, b] = hexToRgb(props.color ?? "#ffffff");
    const sh = props.shadow ? hexToRgb(props.shadow) : null;
    let budget = props.maxChars ?? Infinity;
    const plot = (x: number, y: number, c: [number, number, number], a: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      if (img.data[i + 3]! > a * 255) return;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = Math.round(a * 255);
    };
    props.lines.forEach((line, li) => {
      let x = 0;
      const top = li * LINE_HEIGHT + 1;
      for (const ch of line) {
        if (budget-- <= 0) return;
        const code = charToByte(ch) ?? 0x3f;
        const base = code * GLYPH_SIZE * GLYPH_SIZE;
        const passes: [number, number, [number, number, number]][] = sh ? [[1, 1, sh], [0, 0, [r, g, b]]] : [[0, 0, [r, g, b]]];
        for (const [dx, dy, col] of passes) {
          for (let p = 0; p < GLYPH_SIZE * GLYPH_SIZE; p++) {
            const v = font.pixels[base + p]!;
            if (!v) continue;
            // Shaded fonts: the game maps levels onto a light ramp (FONT/b_pal2.bin, ~53%→90% white), fully opaque.
            const c: [number, number, number] = font.shaded && col !== sh ? [col[0], col[1], col[2]].map((k) => Math.round(k * (0.53 + 0.4 * (v / 15)))) as [number, number, number] : col;
            plot(x + (p % GLYPH_SIZE) + dx, top + Math.floor(p / GLYPH_SIZE) + dy, c, 1);
          }
        }
        x += glyphAdvance(font, ch);
      }
      budget--; // a line break counts as one character of typing time
    });
    ctx.putImageData(img, 0, 0);
  }, [font, props.lines, props.color, props.shadow, props.maxChars, w, h]);

  if (!font) return <span className={props.className}>{props.lines.join("\n")}</span>;
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      className={"pixel " + (props.className ?? "")}
      style={{ width: w * scale, height: h * scale }}
      aria-label={props.lines.join(" ")}
      role="img"
    />
  );
}

/** Convenience: wrap + draw a string. */
export function PmdText(props: { text: string; font?: FontName; scale?: number; color?: string; shadow?: string; width?: number; className?: string }) {
  const lines = useWrapped(props.text, props.width ?? 10_000, props.font);
  return <PmdLines {...props} lines={lines} width={props.width} />;
}
