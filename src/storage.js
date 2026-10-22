import { validateData, clone } from "./core.js";
export const DATA_FILE = "nova-data.json";
export async function rememberHandle(value) {
  const db = await openHandles();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(value, "folder");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export function openHandles() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("nova-focal-connection", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("handles");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function recalledHandle() {
  const db = await openHandles();
  try {
    return await new Promise((resolve, reject) => {
      const req = db
        .transaction("handles")
        .objectStore("handles")
        .get("folder");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export class FolderStore {
  constructor(directory) {
    this.directory = directory;
    this.version = null;
    this.baseline = null;
    this.exists = false;
  }
  async permission(request = false) {
    const options = { mode: "readwrite" };
    let state = await this.directory.queryPermission(options);
    if (state !== "granted" && request)
      state = await this.directory.requestPermission(options);
    if (state !== "granted") {
      const e = Error("앱 폴더 접근 권한을 확인해 주세요.");
      e.name = "NotAllowedError";
      throw e;
    }
  }
  async raw() {
    try {
      return await (await this.directory.getFileHandle(DATA_FILE))
        .getFile()
        .then((f) => f.text());
    } catch (e) {
      if (e.name === "NotFoundError") return null;
      throw e;
    }
  }
  async load() {
    await this.permission();
    const raw = await this.raw();
    if (raw === null) {
      this.exists = false;
      this.baseline = null;
      this.version = null;
      return null;
    }
    let d;
    try {
      d = validateData(JSON.parse(raw));
    } catch (e) {
      throw Error("데이터를 읽을 수 없습니다. " + e.message);
    }
    this.exists = true;
    this.baseline = raw;
    this.version = d.saveVersion;
    return d;
  }
  async save(data) {
    await this.permission();
    validateData(data);
    const current = await this.raw();
    if (current !== this.baseline)
      throw Error(
        "다른 탭 또는 프로그램에서 데이터가 변경되었습니다. 저장을 중단했습니다. 현재 작업을 확인하고 새로고침해 주세요.",
      );
    const out = clone(data);
    out.saveVersion = (this.version ?? 0) + 1;
    const text = JSON.stringify(out, null, 2) + "\n";
    const handle = await this.directory.getFileHandle(DATA_FILE, {
      create: true,
    });
    let stream;
    try {
      stream = await handle.createWritable();
      await stream.write(text);
      await stream.close();
    } catch (e) {
      if (stream)
        try {
          await stream.abort();
        } catch {}
      throw e;
    }
    this.exists = true;
    this.baseline = text;
    this.version = out.saveVersion;
    return out;
  }
}
