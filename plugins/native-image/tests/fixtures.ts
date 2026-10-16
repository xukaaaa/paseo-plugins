import { PNG } from "pngjs";

export function makePng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let offset = 0; offset < png.data.length; offset += 4) {
    png.data[offset] = 40;
    png.data[offset + 1] = 100;
    png.data[offset + 2] = 230;
    png.data[offset + 3] = 255;
  }
  return PNG.sync.write(png);
}
