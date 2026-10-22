import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
// No archive library or extra runtime is needed. This prepares a clearly named release folder.
const { version } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const dir = new URL("../dist/release/", import.meta.url);
await mkdir(dir, { recursive: true });
const html = await readFile(new URL("../dist/NOVA.html", import.meta.url));
await writeFile(new URL("NOVA.html", dir), html);
await writeFile(
  new URL("사용안내.txt", dir),
  "NOVA Focal " +
    version +
    "\r\n\r\n1. 이 폴더를 VDI 개인 폴더에 복사합니다.\r\n2. NOVA.html을 Edge 또는 Chrome에서 엽니다.\r\n3. 앱 폴더 연결에서 이 폴더를 선택하고 권한을 허용합니다.\r\n4. 처음에는 새 데이터 생성을 확인합니다.\r\n5. 수정 팝업의 적용 후 상단 저장을 눌러야 파일에 반영됩니다.\r\n\r\n인터넷·서버·별도 런타임 설치 없이 사용합니다.\r\n업데이트 시 NOVA.html만 교체하고 nova-data.json은 유지합니다.\r\n동일 데이터는 한 탭에서 사용합니다. 별도 백업 파일은 만들지 않습니다.\r\n\r\nWindows VDI에서 이 배포 파일의 실제 저장·재접속 동작을 확인한 뒤 사용해 주세요.\r\n",
);
await writeFile(
  new URL("SHA256SUMS.txt", dir),
  `${createHash("sha256").update(html).digest("hex")}  NOVA.html\n`,
);
console.log(`Release prepared: ${dir.pathname}`);
