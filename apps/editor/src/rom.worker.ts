/// <reference lib="webworker" />
import * as Comlink from "comlink";
import { romApi } from "./romApi";

Comlink.expose({
  ...romApi,
  async portrait(entry: number, slot: number) {
    const px = await romApi.portrait(entry, slot);
    return px ? Comlink.transfer(px, [px.buffer]) : null;
  },
});
