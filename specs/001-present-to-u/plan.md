# Implementation Plan: PresentToU — 대화 데이터 기반 선물 TOP 3 추천

**Branch**: `001-present-to-u` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-present-to-u/spec.md`

## Summary

취향을 잘 모르는 상대에게 줄 선물을, 사용자가 업로드한 대화 데이터(카카오톡 대화 내보내기 텍스트 + 통화 음성 녹음)에서 취향 신호를 추출해 60초 미만에 TOP 3로 추천한다.
기술 접근: **단일 HTML 파일(`index.html`) + 순수(vanilla) JS 프런트엔드**가 파일 업로드·검증·상태 표시·결과 렌더링을 담당하고, **Vercel 서버리스 함수 2개**(`api/recommend.js`, `api/transcribe.js`)가 각각 LLM 기반 추천 생성(요약 → 추천 → 웹검색 상품 특정 2차 패스)과 음성 전사(Whisper)를 담당한다. 회원가입·결제·영구 저장은 없다.

## Technical Context

**Language/Version**: HTML5 + CSS3 + JavaScript(ES2020+, 브라우저 네이티브), 서버리스 함수는 Node.js(ESM, Vercel 런타임)

**Primary Dependencies**: 외부 프레임워크·번들러 없음(AGENTS.md 원칙). 서버 측에서 OpenAI API(chat.completions 추천, responses+web_search 상품 특정)와 Groq API(whisper-large-v3 음성 전사, OpenAI 호환) 호출

**Storage**: 없음(N/A). 업로드 데이터는 요청 처리 중 메모리에서만 사용하고 영구 저장하지 않음(FR-013)

**Testing**: 수동 브라우저 검증(quickstart.md의 시나리오). 별도 테스트 러너 없음 — AGENTS.md 체크리스트(콘솔 에러 0)를 게이트로 사용

**Target Platform**: 데스크톱 브라우저(hover 가능 포인터 환경 기본, 모바일 반응형 보조) + Vercel 배포(서버리스 함수)

**Project Type**: 단일 HTML 웹앱 + 서버리스 API 2개

**Performance Goals**: 업로드 완료 후 추천 요청 → TOP 3 첫 노출까지 60초 미만(FR-008, SC-001). Vercel 함수 maxDuration 60초, 웹검색 2차 패스는 50초 타임아웃 후 원본 항목 폴백

**Constraints**: 음성 파일 4MB 이하, 대화 원문 최근 12,000자 + 이전 내용 4,000자 요약으로 컨텍스트 초과 방지, API 키는 서버 환경변수로만 보관(브라우저 비노출)

**Scale/Scope**: 데모 세션 n≥20 규모(SC-003). 동시성·스케일링 고려 없음

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md`는 미작성 템플릿 상태이므로 헌법 검사는 생략한다.
대신 이 저장소의 실질적 규범인 **AGENTS.md**(단일 HTML 원칙, 기능=폴더, CSS/JS 구획 순서, 한국어 주석, 브랜치 플로우)와 **DESIGN.md**(색·글꼴·컴포넌트·애니메이션 규칙)를 게이트로 삼는다.

- [x] 빌드 도구·번들러·외부 프레임워크 없이 브라우저에서 바로 동작 — 통과
- [x] 메인 진입점 `index.html` 루트 고정, 부가 화면은 폴더 분리(`guide/`, `service-intro/`) — 통과
- [x] 계산(순수 함수)·DOM 조작·이벤트 핸들러 분리 — 통과
- [x] DESIGN.md 색상 팔레트·타이포그래피 준수 — 통과

## Project Structure

### Documentation (this feature)

```text
specs/001-present-to-u/
├── PRD.md               # 제품 요구 문서
├── spec.md              # 기능 명세
├── plan.md              # 이 파일 (/speckit-plan 출력)
├── research.md          # Phase 0 출력
├── data-model.md        # Phase 1 출력
├── quickstart.md        # Phase 1 출력 (검증 가이드)
├── contracts/           # Phase 1 출력 (API 계약)
│   ├── recommend-api.md
│   └── transcribe-api.md
├── checklists/
│   ├── prd-quality.md
│   └── requirements.md
└── tasks.md             # Phase 2 출력 (/speckit-tasks — plan에서 생성하지 않음)
```

### Source Code (repository root)

```text
PresentToU/
├── index.html           # 메인 진입점: 인트로(봉투) → 입력(조건+파일 업로드) → 분석 진행 → 결과(TOP 3 카드+편지)
├── api/
│   ├── recommend.js     # Vercel 서버리스: 대화 요약 → LLM 추천(JSON) → 웹검색으로 실제 상품 특정(2차 패스)
│   └── transcribe.js    # Vercel 서버리스: 음성 파일 → Groq Whisper 전사 텍스트
├── guide/
│   └── index.html       # 카카오톡 대화 내보내기 방법 안내 화면
├── service-intro/
│   └── index.html       # 서비스 소개 화면
├── AGENTS.md            # 작업 규범(구조·주석·git 플로우)
├── DESIGN.md            # 디자인 기준(색·글꼴·컴포넌트)
└── package.json
```

**Structure Decision**: AGENTS.md의 "메인 `index.html` 루트 고정 + 기능 하나=폴더 하나" 규칙을 따른다. 핵심 사용자 흐름(업로드→분석→TOP 3)은 단일 `index.html` 안에서 구획 주석으로 역할을 나누고, 부가 화면(안내·소개)만 폴더로 분리한다. 서버 측 코드는 Vercel 관례에 따라 `api/` 폴더에 둔다.

## 아키텍처 결정 요약

1. **단일 HTML + 서버리스 2함수**: 프런트는 정적 파일 하나로 완결(AGENTS.md 원칙), LLM 키 보호와 CORS·용량 제약 때문에 추천·전사만 서버로 분리한다.
2. **추천 파이프라인 2단계**: 1차(gpt-4o-mini, JSON 강제)로 취향 분석·TOP 3·금지 선물·편지를 생성하고, 2차(웹검색 모델, 병렬 3건)로 각 추천을 실제 판매 상품+구매 URL로 특정한다. 2차 실패 시 1차 결과로 폴백해 "항상 정확히 3개"(SC-004)를 보장한다.
3. **긴 대화 처리**: 최근 12,000자는 원문, 그 이전은 4,000자 요약으로 압축해 컨텍스트 초과를 방지한다(FR-003 신호 보존과 FR-008 시간 제약의 절충).
4. **60초 예산 배분**: 전사(업로드 직후 선행 처리) → 추천 1차(~10초) → 2차 웹검색(최대 50초 타임아웃, 병렬) 순으로 배치하고, 클라이언트는 단계별 진행 표시 + 대기 미니게임으로 체감 시간을 줄인다.
5. **개인정보**: 서버는 요청 처리 후 어떤 저장소에도 쓰지 않는다. 로그에는 길이·플래그 등 메타데이터만 남기고 대화 원문을 남기지 않는다(FR-013).

## Complexity Tracking

> Constitution Check 위반 없음 — 해당 없음.
