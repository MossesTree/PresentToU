# Research: PresentToU — 대화 데이터 기반 선물 TOP 3 추천

**Date**: 2026-07-15 | **Plan**: [plan.md](./plan.md)

Technical Context에 NEEDS CLARIFICATION 항목은 없다. 아래는 주요 기술 선택의 결정 기록이다.

## R1. 프런트엔드 형태 — 단일 HTML + 순수 JS

- **Decision**: 프레임워크·번들러 없이 `index.html` 하나로 완결되는 정적 페이지를 만든다.
- **Rationale**: AGENTS.md의 프로젝트 원칙("브라우저에서 파일을 열면 바로 동작")이자, 데모 규모(세션 n≥20)에서 빌드 파이프라인은 순수 비용이다. 폰트도 base64 서브셋으로 내장해 외부 요청 없이 렌더링한다.
- **Alternatives considered**: React/Vite SPA — 카드 플립·상태 관리가 편해지지만 빌드 도구 도입이 원칙 위반이라 기각. 다중 HTML 페이지 — 상태 공유(파일, 입력값)가 번거로워 핵심 흐름은 한 파일로 유지.

## R2. 추천 생성 — 서버리스 함수 + LLM 2단계 파이프라인

- **Decision**: `api/recommend.js`(Vercel)에서 ① gpt-4o-mini로 취향 분석·TOP 3·금지 선물·편지를 JSON으로 생성하고, ② 웹검색 가능 모델(responses API + web_search, 기본 `gpt-5.6-luna`)로 각 추천을 실제 판매 상품+구매 URL로 특정한다(병렬 3건, 50초 타임아웃, 실패 시 1차 결과 폴백).
- **Rationale**: API 키를 브라우저에 노출하지 않으려면 서버 경유가 필수. 1차만으로는 "커피 세트"류의 뭉뚱그린 추천이 나와 외부 상품 링크(FR-007) 품질이 낮았고, 2차 웹검색으로 실제 상품 페이지를 확보한다. 폴백 덕분에 유효 입력에 항상 정확히 3개(SC-004)가 보장된다.
- **Alternatives considered**: 사전 큐레이션된 정적 선물 DB 매칭 — spec의 최소 가정이지만 근거 문장(FR-003, US3)의 개인화 품질이 낮아 LLM 방식 채택. 단일 패스에서 웹검색까지 — 응답 시간이 불안정하고 JSON 스키마 준수율이 떨어져 2단계로 분리.

## R3. 음성 전사 — Groq Whisper 프록시

- **Decision**: `api/transcribe.js`가 브라우저의 multipart(file+model) 요청을 그대로 Groq `audio/transcriptions`(whisper-large-v3)로 전달한다. 클라이언트는 추천 요청 전에 음성 파일을 먼저 전사해 텍스트로 합친다.
- **Rationale**: Groq는 OpenAI 호환 API라 프록시가 단순하고, 전사 속도가 빨라 60초 예산(FR-008) 안에 들어온다. 음성 파일은 4MB로 제한해 서버리스 본문 크기·처리 시간을 통제한다.
- **Alternatives considered**: OpenAI whisper-1 — 동작은 같지만 전사 지연이 더 길어 시간 예산에 불리. 브라우저 내 Web Speech API — 파일 입력(녹음 파일)을 지원하지 않아 기각.

## R4. 긴 대화 처리 — 최근 원문 + 이전 요약

- **Decision**: 대화가 12,000자를 넘으면 최근 12,000자는 원문 유지, 이전 내용은 4,000자 이내로 LLM 요약해 함께 전달한다(요약 대상 원문은 40,000자 컷). 요약 실패 시 최근 원문만으로 진행한다.
- **Rationale**: 카카오톡 내보내기는 수십만 자가 흔해 그대로 넣으면 context_length_exceeded로 전체 실패한다. 취향 신호(FR-003)는 최근 대화에 밀집되므로 최근 원문을 우선 보존한다.
- **Alternatives considered**: 전체 요약 — 직접 인용 근거(recommend 프롬프트의 인용 규칙)를 만들 원문이 사라져 기각. 단순 뒤쪽 절단 — 오래된 대화의 관계 맥락이 유실되어 요약 병행으로 보완.

## R5. 60초 대기 UX — 단계 표시 + 미니게임

- **Decision**: 분석 진행을 6단계 라벨(파일 확인→음성 전사→…→상품 큐레이팅)로 표시하고, 대기 중 "떨어지는 선물 받기" 캔버스 미니게임을 제공한다. `prefers-reduced-motion` 환경에서는 반복 애니메이션을 줄인다.
- **Rationale**: 실측 응답이 30~60초라 빈 스피너로는 이탈 위험이 크다(SC-005의 "빈 화면 없이 흐름 유지"). 단계 표시는 실패 지점 안내(FR-011/012)와도 연결된다.
- **Alternatives considered**: 스트리밍 부분 결과 표시 — 2차 웹검색 패스가 카드 내용을 바꿔치기해 혼란을 줘 기각.

## R6. 개인정보 취급 — 무저장 + 메타데이터 로깅

- **Decision**: 서버는 대화·음성 데이터를 어떤 저장소에도 쓰지 않고 응답 후 폐기한다. 서버·클라이언트 로그에는 길이·형식·소요 시간 등 메타데이터만 남긴다.
- **Rationale**: FR-013(추천 생성에만 사용, 영구 저장 금지)과 spec Assumptions의 개인정보 최소화 원칙.
- **Alternatives considered**: 세션 캐시(재추천용) — 편의는 있으나 저장 금지 원칙에 어긋나 기각.
