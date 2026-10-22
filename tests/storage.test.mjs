import test from "node:test";
import assert from "node:assert/strict";
import { FolderStore } from "../src/storage.js";
import { seed, startup, clone } from "../src/core.js";
function filesystem(initial = null) {
  let text = initial,
    pending = null,
    fail = null,
    writes = 0,
    permission = "granted";
  const file = {
    getFile: async () => ({ text: async () => text }),
    createWritable: async () => ({
      write: async (value) => {
        if (fail === "write") throw Error("write failure");
        pending = value;
      },
      close: async () => {
        if (fail === "close") throw Error("close failure");
        text = pending;
        writes++;
      },
      abort: async () => (pending = null),
    }),
  };
  return {
    directory: {
      queryPermission: async () => permission,
      requestPermission: async () => permission,
      getFileHandle: async (name, options) => {
        assert.equal(name, "nova-data.json");
        if (text === null && !options?.create)
          throw Object.assign(Error("missing"), { name: "NotFoundError" });
        return file;
      },
    },
    read: () => text,
    set: (value) => (text = value),
    setFail: (value) => (fail = value),
    writes: () => writes,
    setPermission: (value) => (permission = value),
  };
}
test("native stream transaction completion controls saveVersion and persistence", async () => {
  const fs = filesystem(),
    s = new FolderStore(fs.directory);
  assert.equal(await s.load(), null);
  const data = (await startup(seed(), { today: "2026-10-22" })).data;
  const saved = await s.save(data);
  assert.equal(saved.saveVersion, 1);
  assert.equal(data.saveVersion, 0);
  assert.equal(JSON.parse(fs.read()).saveVersion, 1);
  const reopened = new FolderStore(fs.directory);
  assert.deepEqual(await reopened.load(), saved);
  saved.projectName = "수정";
  const again = await reopened.save(saved);
  assert.equal(again.saveVersion, 2);
  assert.equal(fs.writes(), 2);
});
test("write and close failures preserve previous file and allow retry without increment", async () => {
  const original = JSON.stringify(seed());
  for (const mode of ["write", "close"]) {
    const fs = filesystem(original),
      s = new FolderStore(fs.directory),
      d = await s.load();
    d.projectName = "미저장";
    fs.setFail(mode);
    await assert.rejects(s.save(d), /failure/);
    assert.equal(fs.read(), original);
    assert.equal(d.projectName, "미저장");
    assert.equal(s.version, 0);
    fs.setFail(null);
    const saved = await s.save(d);
    assert.equal(saved.saveVersion, 1);
  }
});
test("external changes, including same-version edits and deletion, stop overwrite", async () => {
  for (const mode of ["version", "same-version", "delete"]) {
    const fs = filesystem(JSON.stringify(seed())),
      s = new FolderStore(fs.directory),
      d = await s.load();
    const other = clone(d);
    other.projectName = "다른 탭";
    if (mode === "version") other.saveVersion++;
    fs.set(mode === "delete" ? null : JSON.stringify(other));
    const current = fs.read();
    await assert.rejects(s.save(d), /저장을 중단/);
    assert.equal(fs.read(), current);
    assert.equal(fs.writes(), 0);
  }
});
test("missing file is never recreated after externally deleting existing data", async () => {
  const fs = filesystem(JSON.stringify(seed())),
    s = new FolderStore(fs.directory);
  const d = await s.load();
  fs.set(null);
  await assert.rejects(s.save(d), /다른 탭/);
  assert.equal(fs.read(), null);
});
test("new workbook detects a file created by another tab", async () => {
  const fs = filesystem(),
    s = new FolderStore(fs.directory);
  await s.load();
  fs.set(JSON.stringify(seed()));
  await assert.rejects(s.save(seed()), /다른 탭/);
  assert.equal(fs.writes(), 0);
});
test("malformed JSON and future schema never invoke writer", async () => {
  for (const raw of [
    "{bad",
    JSON.stringify({ ...seed(), schemaVersion: 99 }),
  ]) {
    const fs = filesystem(raw),
      s = new FolderStore(fs.directory);
    await assert.rejects(s.load(), /데이터/);
    assert.equal(fs.read(), raw);
    assert.equal(fs.writes(), 0);
  }
});
test("permission loss blocks reads and writes without touching the data", async () => {
  const fs = filesystem(JSON.stringify(seed())),
    s = new FolderStore(fs.directory),
    d = await s.load();
  fs.setPermission("denied");
  await assert.rejects(s.save(d), /권한/);
  assert.equal(fs.writes(), 0);
});
