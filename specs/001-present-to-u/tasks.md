# Tasks: PresentToU — 대화 데이터 기반 선물 TOP 3 추천

**Input**: Design documents from `/specs/001-present-to-u/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 스펙에서 자동 테스트를 요구하지 않음 — 테스트 태스크는 생성하지 않고, quickstart.md의 수동 검증 시나리오를 게이트로 사용한다.

**Organization**: 사용자 스토리 단위로 묶어 각 스토리를 독립적으로 구현·검증할 수 있게 한다.

**참고**: 이 태스크 목록은 이미 진행 중인 코드베이스를 기준으로 작성되었다. 코드에서 구현이 확인된 항목은 완료(`[x]`)로 표시한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 진행 가능(다른 파일, 선행 의존 없음)
- **[Story]**: 소속 사용자 스토리(US1, US2, US3)

## Phase 1: Setup (공유 기반)

**Purpose**: 프로젝트 구조와 배포 기반 마련

- [x] T001 AGENTS.md 규칙대로 프로젝트 구조 생성 — 루트 `index.html`, `api/`, `guide/`, `service-intro/`
- [x] T002 Vercel 배포 설정 — `package.json`, 서버리스 함수 `maxDuration 60` 지정 (`api/recommend.js`)
- [x] T003 [P] DESIGN.md 색상·글꼴 토큰을 CSS 변수로 정의하고 폰트를 base64로 내장 (`index.html` `<style>` 구획 1)

---

## Phase 2: Foundational (모든 스토리의 선행 조건)

**Purpose**: 사용자 스토리 구현 전 필수 인프라

**⚠️ CRITICAL**: 이 단계 완료 전에는 스토리 작업을 시작하지 않는다

- [x] T004 요청 ID 기반 구조화 로깅 공통화 — 클라이언트 `logClientEvent`/`createRequestId` (`index.html`), 서버 `logEvent` (`api/recommend.js`, `api/transcribe.js`)
- [x] T005 [P] `/api/recommend` 핸들러 골격 — 메서드·API 키·본문 검증과 오류 응답 계약 (`api/recommend.js`, contracts/recommend-api.md)
- [x] T006 [P] `/api/transcribe` Groq Whisper 프록시 — multipart 중계와 오류 응답 계약 (`api/transcribe.js`, contracts/transcribe-api.md)
- [x] T007 `index.html` JS 구획 구조(상수/상태/순수 함수/DOM/핸들러/init)와 중앙 상태 객체 구성

**Checkpoint**: 기반 완료 — 스토리 구현 시작 가능

---

## Phase 3: User Story 1 - 대화 데이터 업로드로 1분 안에 TOP 3 받기 (Priority: P1) 🎯 MVP

**Goal**: 카카오톡 대화·음성 파일을 업로드하면 60초 미만에 정확히 3개의 선물 후보를 제시한다

**Independent Test**: 샘플 대화/음성 파일 업로드 후 60초 이내에 선물 카드 3개 노출 (quickstart.md S1)

### Implementation for User Story 1

- [x] T008 [P] [US1] 파일 분류·검증 순수 함수 — 확장자/MIME 판별, 음성 4MB 제한, 미지원 형식 거부 사유 반환 (`index.html` `classifyFile`, `validateUploadFile`) — FR-001, FR-012
- [x] T009 [US1] 업로드 UI — 다중 선택·드래그 앤 드롭·파일 목록 표시·중복 방지·개별 제거 (`index.html` `handleFileSelection`, `handleFileDrop`, `updateFileDisplay`) — FR-001
- [x] T010 [US1] 대화 소스 통합 읽기 — 텍스트 파일 읽기 + 음성 파일 전사(`/api/transcribe`) 결과를 하나의 대화 텍스트로 결합, 실패 파일은 건너뛰고 사유를 note에 기록 (`index.html` `readConversationFiles`, `transcribeAudioFile`) — FR-002, US1/AC3
- [x] T011 [P] [US1] 선물 조건 입력 폼 — 받는 사람 이름·성별·관계 칩·예산 범위(무관 포함)·추가 정보 (`index.html` `renderBudgetControl`, `handleChipSelection`, `updateContinueButton`)
- [x] T012 [US1] 추천 요청 흐름 — 입력 검증, `/api/recommend` 호출, 오류·타임아웃 시 재시도 안내 (`index.html` `handleRecommend`, `requestJson`, `showRetryMessage`) — FR-008, FR-011
- [x] T013 [US1] 긴 대화 압축 — 최근 12,000자 원문 + 이전 4,000자 요약, 요약 실패 시 원문만으로 진행 (`api/recommend.js` `summarizeConversation`) — FR-003
- [x] T014 [US1] 추천 파이프라인 — 1차 LLM(JSON 강제)로 분석·TOP 3·금지 선물·편지 생성, 2차 웹검색으로 실제 상품·구매 URL 특정(병렬·50초 타임아웃·실패 시 원본 유지) (`api/recommend.js` `handler`, `refineToProduct`) — FR-003, FR-004, SC-004
- [x] T015 [US1] 분석 진행 표시 — 6단계 진행 라벨과 대기 미니게임(떨어지는 선물 받기), `prefers-reduced-motion` 대응 (`index.html` `setAnalysisStage`, `startAnalysisProgress`, 게임 함수들) — SC-005

**Checkpoint**: US1 단독으로 데모 성립 (MVP)

---

## Phase 4: User Story 2 - 카드 플립으로 상세 확인 후 외부 상품 페이지로 이동 (Priority: P2)

**Goal**: 카드 hover 시 플립되어 상세 정보가 보이고, 외부 상품 링크로 이동할 수 있다

**Independent Test**: TOP 3 노출 상태에서 카드 hover → 플립·상세 표시, 외부 링크 클릭 → 새 탭 이동 (quickstart.md S2)

### Implementation for User Story 2

- [x] T016 [US2] TOP 3 카드 렌더링 — 앞면에 선물 이름·이모지·추천 이유·예상 가격대·플립 힌트 표시 (`index.html` `renderResults`) — FR-005
- [x] T017 [US2] 카드 플립 상호작용 — hover 시 뒤집혀 상세 설명·근거·취향 배지·링크가 담긴 뒷면 표시 (`index.html` `<style>` 카드 플립 규칙) — FR-006
- [x] T018 [US2] 외부 상품 링크 — 확보된 구매 URL(판매처명 표기) + 네이버 쇼핑 검색 링크 폴백, 새 탭 열기 (`index.html` `createPurchaseLinks`) — FR-007, FR-010

**Checkpoint**: US1 + US2 모두 독립 동작

---

## Phase 5: User Story 3 - 추천 근거 확인으로 신뢰 형성 (Priority: P3)

**Goal**: 각 카드에 대화 신호와 연결된 추천 근거가 표시된다

**Independent Test**: 각 카드에 대화 인용 기반 추천 이유 한 줄 표시 (quickstart.md S3)

### Implementation for User Story 3

- [x] T019 [US3] 근거 생성 규칙 — 프롬프트에 직접/간접 인용 강제, 근거 없으면 "단서를 확인하지 못했습니다" 명시(환각 금지), 2차 패스에서 evidence 원본 유지 (`api/recommend.js` SYSTEM_PROMPT, `refineToProduct`) — FR-003, US3/AC1
- [x] T020 [US3] 카드 근거 표시 — 추천 이유와 대화 근거를 자연스러운 한 흐름으로 결합해 표시, 취향 신호 배지 렌더링 (`index.html` `combineRecommendationReason`, `renderResults`) — US3/AC1

**Checkpoint**: 세 스토리 모두 독립 동작

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 스토리 전반에 걸친 개선·부가 화면

- [x] T021 [P] 결과 부가 요소 — 절대 피해야 할 선물 1개와 맞춤 편지 표시, 편지 이미지(PNG) 저장 (`index.html` `renderGiftLetter`, `downloadLetterImage`, `createLetterCanvas`)
- [x] T022 [P] 카카오톡 대화 내보내기 안내 화면 (`guide/index.html`)
- [x] T023 [P] 서비스 소개 화면 (`service-intro/index.html`)
- [x] T024 개인정보 무저장 보증 — 서버는 대화·음성을 저장하지 않고 로그에 메타데이터만 기록, 푸터에 삭제 안내 문구 (`api/*.js`, `index.html` 푸터) — FR-013, FR-009
- [ ] T025 quickstart.md 검증 시나리오 S1~S6 수동 실행 — 콘솔 에러 0건, 60초 예산, 반응형·reduced-motion 확인 (specs/001-present-to-u/quickstart.md)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음
- **Foundational (Phase 2)**: Setup 완료 후 — 모든 스토리를 블로킹
- **User Stories (Phase 3~5)**: Foundational 완료 후, 우선순위 순(P1 → P2 → P3). US2·US3은 US1의 추천 결과 데이터에 의존하므로 US1 완료 후 진행
- **Polish (Phase 6)**: 원하는 스토리 완료 후

### Parallel Opportunities

- Phase 1: T003은 T001·T002와 병렬 가능
- Phase 2: T005, T006은 서로 다른 파일이라 병렬 가능
- Phase 3: T008, T011은 병렬 가능(서로 다른 구획)
- Phase 6: T021, T022, T023은 서로 다른 파일이라 병렬 가능

---

## Implementation Strategy

- **MVP**: Phase 1 → 2 → 3(US1)까지 완료하면 데모 성립. 이후 US2(전환), US3(신뢰) 순으로 증분 배포
- 각 논리 단위마다 커밋하고(AGENTS.md 5.4), 스토리 체크포인트마다 quickstart.md 해당 시나리오로 검증한다
