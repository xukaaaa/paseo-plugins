import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readdir, rm, symlink, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePng } from "./fixtures";
import { artifactFilename, MAX_IMAGE_BYTES } from "../shared/protocol";
import { decodeImage, imageMimeType, readArtifact, readArtifactSync, saveImage } from "../server/artifacts";
import { createPreview } from "../server/preview";

test("artifact storage is atomic, deduplicated and previewable", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "native-image-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const png = makePng(1400, 700);
  const artifacts = await Promise.all(Array.from({ length: 4 }, () => saveImage(png.toString("base64"), directory)));
  for (const artifact of artifacts) assert.deepEqual(artifact, artifacts[0]);
  assert.deepEqual(await readdir(directory), [artifactFilename(artifacts[0])]);
  assert.deepEqual(await readArtifact(artifacts[0], directory), png);
  assert.deepEqual(readArtifactSync(artifacts[0], directory), png);
  assert.equal((await stat(join(directory, artifactFilename(artifacts[0])))).mode & 0o777, 0o600);
  const preview = await createPreview(artifacts[0], directory);
  assert.equal(preview.mimeType, "image/jpeg");
  assert.equal(preview.width, 1024);
  assert.equal(preview.height, 512);
  assert.ok(preview.base64.length < 2 * 1024 * 1024);
});

test("storage rejects traversal, symlinks, corrupt and missing artifacts", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "native-image-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const artifact = { artifactId: "b".repeat(64), mimeType: "image/png" as const };
  const target = join(directory, artifactFilename(artifact));
  await assert.rejects(readArtifact({ ...artifact, artifactId: "../../secret" }, directory));
  await assert.rejects(readArtifact(artifact, directory));
  await writeFile(join(directory, "secret"), "private");
  await symlink(join(directory, "secret"), target);
  await assert.rejects(readArtifact(artifact, directory));
  assert.throws(() => readArtifactSync(artifact, directory));
  await rm(target);
  await writeFile(target, "corrupt");
  await assert.rejects(readArtifact(artifact, directory), /integrity/);
});

test("decoder validates base64, signatures and size before storage", () => {
  for (const value of ["", "@@@", "a", "dGV4dA==", "A".repeat(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4)]) {
    assert.throws(() => decodeImage(value));
  }
  assert.equal(imageMimeType(Buffer.from([0xff, 0xd8, 0xff, 0])), "image/jpeg");
  assert.equal(imageMimeType(Buffer.from("RIFFxxxxWEBP")), "image/webp");
});
