import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const { extractTextFromBuffer } = await import("../../knowledge_base/raw-import-lib.js");

test("extractTextFromBuffer returns text for a text-based PDF", async () => {
  const buf = await readFile(path.resolve("test/fixtures/tor-sample.pdf"));
  const text = await extractTextFromBuffer(buf, ".pdf");
  assert.match(text, /TOR ตัวอย่าง/);
  assert.match(text, /2\.5 GHz/);
});

test("extractTextFromBuffer returns text for a DOCX", async () => {
  const buf = await readFile(path.resolve("test/fixtures/tor-sample.docx"));
  const text = await extractTextFromBuffer(buf, ".docx");
  assert.match(text, /TOR sample DOCX/);
  assert.match(text, /CPU >= 2\.5 GHz/);
});

test("extractTextFromBuffer passes through plain text for .txt and .md", async () => {
  const buf = Buffer.from("hello world", "utf8");
  assert.equal(await extractTextFromBuffer(buf, ".txt"), "hello world");
  assert.equal(await extractTextFromBuffer(buf, ".md"), "hello world");
});

test("extractTextFromBuffer rejects unsupported extensions", async () => {
  await assert.rejects(
    () => extractTextFromBuffer(Buffer.from("x"), ".exe"),
    /Unsupported extension: \.exe/
  );
});

test("extractTextFromBuffer returns empty string for a scanned PDF", async () => {
  const buf = await readFile(path.resolve("test/fixtures/tor-sample.scan.pdf"));
  const text = await extractTextFromBuffer(buf, ".pdf");
  assert.equal(text.trim().length, 0);
});
