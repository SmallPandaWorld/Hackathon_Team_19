import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const wasmSource = new URL(
  "../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
  import.meta.url,
);
const publicDirectory = new URL("../public/", import.meta.url);
const wasmDestination = new URL("zxing_reader.wasm", publicDirectory);

await mkdir(fileURLToPath(publicDirectory), { recursive: true });
await copyFile(wasmSource, wasmDestination);
