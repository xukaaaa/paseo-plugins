import { imageSize } from "image-size";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { readArtifact } from "./artifacts";
import type { Artifact } from "../shared/protocol";

const MAX_PREVIEW_BYTES = 1536 * 1024;
const MAX_PIXELS = 16_000_000;

/** Pure JS codecs: Paseo bundles server code, so native addon resolution is unsafe. */
export async function createPreview(artifact: Artifact, directory?: string) {
  const bytes = await readArtifact(artifact, directory);
  const size = imageSize(bytes);
  if (!size.width || !size.height || size.width * size.height > MAX_PIXELS) {
    throw new Error("Image dimensions exceed the 16 megapixel preview limit.");
  }
  if (artifact.mimeType === "image/webp") {
    // React Native/browser decoders support WebP directly. Do not load native
    // codecs in the plugin subprocess; large WebP originals remain on disk.
    if (bytes.length > MAX_PREVIEW_BYTES) throw new Error("WebP preview exceeds 1.5 MiB; use PNG or JPEG output for large images.");
    return { base64: bytes.toString("base64"), mimeType: "image/webp" as const, width: size.width, height: size.height };
  }
  const decoded = artifact.mimeType === "image/png"
    ? PNG.sync.read(bytes)
    : jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 256 });
  const scale = Math.min(1, 1024 / decoded.width, 1024 / decoded.height);
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = (Math.min(decoded.height - 1, Math.floor(y / scale)) * decoded.width + Math.min(decoded.width - 1, Math.floor(x / scale))) * 4;
      const dest = (y * width + x) * 4;
      const alpha = decoded.data[source + 3] / 255;
      for (let channel = 0; channel < 3; channel++) pixels[dest + channel] = Math.round(decoded.data[source + channel] * alpha + 255 * (1 - alpha));
      pixels[dest + 3] = 255;
    }
  }
  const data = jpeg.encode({ data: pixels, width, height }, 80).data;
  if (data.length > MAX_PREVIEW_BYTES) throw new Error("Preview exceeds the 1.5 MiB limit.");
  return { base64: Buffer.from(data).toString("base64"), mimeType: "image/jpeg" as const, width, height };
}
