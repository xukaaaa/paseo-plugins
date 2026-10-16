import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { link, mkdir, open, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { artifactFilename, MAX_IMAGE_BYTES, type Artifact } from "../shared/protocol";

export function artifactDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.PI_NATIVE_IMAGE_DIR || join(env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "native-image-artifacts"));
}

export function imageMimeType(bytes: Buffer): Artifact["mimeType"] {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  throw new Error("Provider returned an unsupported image format (expected PNG, JPEG or WebP).");
}

export function decodeImage(base64: string): Buffer {
  if (!base64 || base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("Invalid image data or image exceeds the 20 MiB limit.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > MAX_IMAGE_BYTES || bytes.toString("base64").replace(/=+$/, "") !== base64.replace(/=+$/, "")) {
    throw new Error("Invalid image data or image exceeds the 20 MiB limit.");
  }
  imageMimeType(bytes);
  return bytes;
}

export async function saveImage(base64: string, directory = artifactDirectory()): Promise<Artifact> {
  const bytes = decodeImage(base64);
  const artifact: Artifact = { artifactId: createHash("sha256").update(bytes).digest("hex"), mimeType: imageMimeType(bytes) };
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, artifactFilename(artifact));
  // Publish only fully written files. A hard link is atomic and never overwrites
  // an existing artifact or follows a planted destination symlink.
  const temporary = join(directory, `.pending-${randomUUID()}`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.close();
    try {
      await link(temporary, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await readArtifact(artifact, directory);
    }
  } finally {
    await handle.close();
    await unlink(temporary).catch(() => {});
  }
  return artifact;
}

function verifyArtifact(bytes: Buffer, artifact: Artifact): Buffer {
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.artifactId || imageMimeType(bytes) !== artifact.mimeType) {
    throw new Error("Image integrity check failed.");
  }
  return bytes;
}

/** The terminal renderer is synchronous; read once when constructing its component. */
export function readArtifactSync(artifact: Artifact, directory = artifactDirectory()): Buffer {
  const fd = openSync(join(directory, artifactFilename(artifact)), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_IMAGE_BYTES) throw new Error("Invalid image file or image exceeds the 20 MiB limit.");
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) throw new Error("Image file is incomplete.");
      offset += count;
    }
    return verifyArtifact(bytes, artifact);
  } finally { closeSync(fd); }
}

export async function readArtifact(artifact: Artifact, directory = artifactDirectory()): Promise<Buffer> {
  // No user-supplied paths. O_NOFOLLOW rejects symlinks; all reads are bounded.
  const file = join(directory, artifactFilename(artifact));
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_IMAGE_BYTES) throw new Error("Invalid image file or image exceeds the 20 MiB limit.");
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) throw new Error("Image file is incomplete.");
      offset += bytesRead;
    }
    return verifyArtifact(bytes, artifact);
  } finally {
    await handle.close();
  }
}
