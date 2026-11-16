import { useEffect, useRef, useState } from "react";
import { portraitImage } from "../romClient";

/** Lazily decodes and draws one 40x40 ROM portrait when it scrolls into view. */
export function PortraitCanvas(props: { entry: number; slot: number; size: number; className?: string }) {
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
  return <canvas ref={ref} width={40} height={40} className={"pixel " + (props.className ?? "")} style={{ width: props.size, height: props.size }} />;
}

