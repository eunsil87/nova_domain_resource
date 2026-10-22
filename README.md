# NOVA Focal 인력관리

폐쇄망 Windows VDI에서 Edge·Chrome으로 실행하는 오프라인 인력관리 앱입니다. SPEC v0.24와 `design/`의 화면 초안을 기준으로 구현했습니다. 서버·로그인·외부 DB·CDN·별도 런타임을 사용하지 않습니다.

## 사용하기

1. `dist/NOVA.html`을 VDI의 앱 폴더에 복사합니다.
2. Edge 또는 Chrome에서 해당 HTML을 엽니다. 기준 화면은 1920×1080, 배율 100%입니다.
3. 처음에는 **앱 폴더 연결**을 누르고 HTML을 둔 폴더를 선택합니다. 권한을 허용한 다음 새 워크스페이스 생성을 확인합니다.
4. 이후에는 같은 폴더의 `nova-data.json`을 불러옵니다. 브라우저가 권한을 다시 요구하면 재확인합니다.
5. 팝업 **적용**은 현재 세션에만 반영합니다. 상단 **저장**을 눌러 실제 JSON 파일에 저장합니다.

앱 업데이트 시 `NOVA.html`만 교체하고 기존 `nova-data.json`은 유지합니다. 한 데이터는 한 탭에서 사용합니다. HTML과 JSON을 같은 앱 폴더에 보관하세요. 브라우저에 기억하는 것은 폴더 연결이며 인력 데이터 원본은 JSON입니다. `.exe` 실행 허용 여부와 무관하게 HTML 방식으로 배포합니다.

## 구현 범위

- 연간 현황: 참고 Phase 일정, 연도별 목표, M/M 집계·그래프, 14/30일 일정, 부족 인원 계산 및 TBD 추가
- 인력 관리: 등록·상세 수정·삭제, 예정/실제 등록, TBD 등록·전환, 기본/헤더 정렬, 종료 인력 표시, 모든 추가 정보
- 그룹 설정: 다중 구성안·복사·비교·적용, 인력 그룹·상위 그룹·리더, 드래그 배치, 개발반장, 복수 현장대리인
- 기본 설정: 프로젝트·파트 이름, 업체·역할·기술 추가·수정·비활성화
- 저장: 수동 저장, 시작 시 자동 정리와 단일 저장, 파일 변경 충돌 확인, 저장 실패 시 세션 유지, 손상/최신 스키마 데이터 보존

확정 인력 14명과 TBD 5명, 빈 1안을 최초 생성할 때만 제공합니다. 기존 파일의 빈 목록을 초기 상태로 간주해 채우지 않습니다. 2026년 최초 목표는 65.000 M/M이고 확정 예상 실적은 76.000, TBD 계획은 10.000 M/M입니다. 실제 실행일의 한국 날짜로 TBD·자격을 처리하므로 날짜가 지나면 값은 달라집니다.

일반 자동 저장, 백업 파일, 변경 이력, 검색·복합 필터, 인력별/그룹별/월별 M/M, 공동 편집, Sub_Component 할당은 포함하지 않습니다.

## 개발하기

개발에만 Node.js 22 이상과 npm이 필요합니다. 최종 사용자는 설치하지 않습니다.

```sh
cd /workspace/nova_domain_resource
npm ci --ignore-scripts --cache /workspace/.npm-cache
npm run build
npm test
npm run test:browser
```

Windows 등 다른 개발 머신에서는 기본 npm 캐시를 사용해 `npm ci --ignore-scripts`를 실행해도 됩니다. 브라우저 테스트에는 설치된 Chromium이 필요합니다. 기본 경로는 `/usr/bin/chromium`이며 `CHROMIUM_PATH`로 실제 실행파일 경로를 지정할 수 있습니다. 테스트는 임시 로컬 HTTP 서버를 스스로 시작·종료합니다. 앱 실행에 이 서버는 필요하지 않습니다.

- `src/core.js`: 초기 데이터·날짜·정밀 M/M·인력 검증·직책/그룹 참조 처리
- `src/storage.js`: File System Access API·연결 기억·안전한 쓰기 완료·충돌 확인
- `src/app.js`, `src/style.css`: 화면·팝업·세션 편집·드래그
- `scripts/build.mjs`: 소스와 스타일을 단일 HTML로 묶음. 외부 자산을 생성하지 않음
- `tests/`: 계산/저장 테스트 및 브라우저 기능 시나리오
- `docs/SPEC.md`: 전달받은 요구사항 원문
- `docs/VALIDATION.md`: 검증 결과와 VDI 확인 항목
- `docs/SCHEMA.md`: 데이터 구조와 버전 정책

작업은 기존 체크아웃에서 진행합니다. 사용자가 요청하지 않는 한 별도 Git worktree를 만들지 않습니다.

## 검증 범위

Node 테스트 29개와 Chromium 브라우저 시나리오 26개가 통과했습니다. 브라우저 테스트는 실제 네이티브 파일 핸들·파일 스트림·IndexedDB를 사용하지만, OS 폴더 선택 창은 테스트용 브라우저 디렉터리(OPFS)로 대체합니다. 이는 Windows의 로컬 HTML 파일과 VDI 폴더에서 검증한 결과가 아닙니다.

사용자가 확인한 사전 VDI 파일 접근 가능 여부와 별개로, 이 배포 파일의 Edge·Chrome 실사용 검증은 `docs/VALIDATION.md`의 체크리스트에 따라 수행해야 합니다. 동시 저장 직전 비교는 서버식 잠금이 아닙니다.

## Git 관리

GitHub 저장소는 `eunsil87/nova_domain_resource`, 기본 개발 기준 브랜치는 `main`입니다. 소스·테스트·요구사항·화면 참고 자료와 바로 실행할 수 있는 `dist/NOVA.html`을 함께 관리합니다. `node_modules`, 테스트 결과, 사용자 데이터 `nova-data.json`, 배포 ZIP과 중복된 release 폴더는 제외합니다.

수정 후 `npm test`, `npm run build`, 화면 동작에 영향이 있으면 `npm run test:browser`를 실행하고 소스와 갱신된 HTML을 함께 커밋합니다. GitHub Actions는 main push와 pull request에서 계산·저장 테스트 및 빌드 결과 일치 여부를 검사합니다. 브라우저 테스트는 별도의 개발 환경 검증입니다.
