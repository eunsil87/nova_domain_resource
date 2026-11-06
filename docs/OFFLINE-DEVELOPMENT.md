# 폐쇄망 소스 이관 안내

작성일: 2026-11-06 KST. 기준 앱 0.3.1 / SPEC 0.29 / JSON 스키마 3.

## 묶음에 포함된 항목

- `src/`: 화면·스타일·업무 규칙·파일 저장·Catalog 전체 소스.
- `docs/SPEC.md`: 최신 요구사항. `SCHEMA.md`: 저장 구조. `VALIDATION.md`: 검증 기록.
- `docs/catalog/`: 전달받은 서비스오더 Catalog 원본 v3.0.
- `data/initial-workspace.json`: 초기 확정 14명·TBD 5명, 업체·역할·기술·목표·참고 Phase와 Catalog 전체 계층을 합친 기초 JSON. 담당자와 L4 Phase는 미지정. 사용 중인 JSON을 가져온 파일이 아니다.
- `scripts/`: 빌드·기초데이터 생성 등 개발 도구. `tests/`: 검증 소스.
- `package.json`, `package-lock.json`, `AGENTS.md`, `.gitignore`, `.gitattributes`: 개발 설정과 작업 규칙.

완성 HTML, 디자인 이미지, node_modules, Git 이력·인증정보, 사용 중인 nova-data.json은 포함하지 않는다. 기초데이터는 `node scripts/export-initial-data.mjs`로 재생성할 수 있다. 이 명령은 기초 JSON만 다시 만들며 사용자 파일을 읽지 않는다.

## 폐쇄망에서 수정하고 실행하기

개발용 PC에는 **Node.js 22 이상**이 필요하다. 반입 전에 설치 또는 사내 승인된 휴대용 Node 실행 환경을 준비한다. 이 묶음에는 Node 실행파일을 넣지 않는다. npm 패키지 설치나 인터넷은 빌드에 필요하지 않다.

1. ZIP을 풀고 소스 폴더에서 터미널을 연다.
2. `src/`의 필요한 파일을 편집한다. 동작 변경 시 `docs/SPEC.md`의 관련 규칙·검증 기준·버전·한국 날짜·변경 이력을 함께 갱신한다.
3. `node scripts/build.mjs`를 실행한다. `dist/NOVA.html`이 생성된다. **src/index.html을 직접 실행하는 방식은 아니다.**
4. 생성된 `dist/NOVA.html`을 Edge·Chrome에서 연다. 기존 사용 데이터가 있으면 기존 JSON을 유지하고 HTML만 교체한다.
5. 완전히 새로 시작하려면 `data/initial-workspace.json`을 별도 앱 폴더에 복사하고 **복사본 이름을 nova-data.json으로 변경**한 뒤 그 폴더를 연결한다. Safari에서는 `JSON 파일 열기`에서 기초 JSON을 선택할 수 있다. 사용 중인 파일 위에 기초 JSON을 덮어쓰지 않는다.
6. 일반 단위 검증은 `node --test tests/*.test.mjs`로 실행한다. Playwright 브라우저 검증은 별도 패키지·브라우저가 필요하며 묶음만으로 실행되지는 않는다.

기초데이터의 날짜는 기존 요구사항의 기준값을 보존한다. 실제 실행일이 지난 TBD 시작일 등은 앱 시작 규칙에 따라 조정되며 담당자 자동 정리도 적용된다. Edge·Chrome 폴더 방식은 시작 정리 결과를 JSON에 저장하고, Safari 다운로드 방식은 별도로 저장해야 한다.

## Git과 반입

ZIP에는 `.git`을 포함하지 않는다. 폐쇄망에 Git이 있으면 `git init`, `git add .`, `git commit -m "Import NOVA source"`로 새 로컬 이력을 시작할 수 있다. 외부 GitHub 연결 없이 로컬 커밋이 가능하다. 실제 사용자 JSON은 저장소에 추가하지 않는다.

소스 묶음에는 원래 확장자의 `.js`, `.mjs`가 들어 있다. 앞서 확인한 메일 첨부 차단 정책에 걸릴 수 있으므로 조직에서 허용한 파일 반입 경로를 사용한다.
