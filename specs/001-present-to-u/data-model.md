# Data Model: PresentToU

**Date**: 2026-07-15 | **Plan**: [plan.md](./plan.md)

영구 저장소는 없다(FR-013). 아래 엔티티는 모두 브라우저 메모리(클라이언트 `state`)와 요청/응답 본문 안에서만 존재한다.

## 1. 업로드 데이터 (UploadedFile)

사용자가 선택한 대화·음성 파일. 클라이언트에서만 다룬다.

| 필드 | 타입 | 설명 | 검증 규칙 |
|------|------|------|-----------|
| name | string | 파일 이름 | — |
| size | number | 바이트 크기 | 음성은 4MB(4,194,304B) 이하 |
| kind | 'text' \| 'audio' | 분류 결과 | 확장자+MIME으로 판별. 둘 다 아니면 거부(FR-012) |

- 텍스트: `.txt` `.csv`, `text/*` — FileReader로 즉시 읽음
- 음성: `.wav` `.mp3` `.m4a` `.ogg` `.webm` `.mpga` `.mp4` `.mpeg`, `audio/*` — `/api/transcribe`로 전사
- 동일 파일 중복 추가 방지 키: `name|size|lastModified`

## 2. 추천 요청 (RecommendRequest)

클라이언트 → `/api/recommend` POST 본문. [contracts/recommend-api.md](./contracts/recommend-api.md) 참조.

| 필드 | 타입 | 설명 | 검증 규칙 |
|------|------|------|-----------|
| recipientName | string | 받는 사람 이름 | 이름 또는 conversation 중 하나는 필수 |
| gender | string | 성별 칩 선택값 | 선택 |
| relationship | string | 관계 칩 선택값 | 선택 |
| budgetMin / budgetMax | number | 예산 범위(원) | budgetAny=false일 때 유효 |
| budgetAny | boolean | 예산 무관 여부 | — |
| recipientInfo | string | 사용자가 아는 추가 정보 | 선택 |
| purpose | string | 선물 목적(편지 작성 전용) | 선택 |
| conversation | string | 대화 원문(텍스트 파일 + 전사 텍스트 결합) | 12,000자 초과분은 서버가 요약 처리 |
| note | string | 참고 노트(전사 실패 안내 등) | 선택 |

## 3. 취향 신호 (서버 내부 파생)

서버가 대화에서 추출하는 분석 결과. 응답의 `analysis`, 각 추천의 `signals`·`evidence`로 표면화된다.

| 필드 | 타입 | 설명 |
|------|------|------|
| analysis | string | 관계·취향 2~3문장 분석 |
| signals | string[3] | 카드별 취향/니즈 키워드 |
| evidence | string | 대화 직접/간접 인용 근거. 근거 없으면 "단서를 확인하지 못했습니다" 명시(환각 금지) |

## 4. 선물 추천 카드 (GiftCard)

응답 `top3[]`의 원소. 정확히 3개(SC-004).

| 필드 | 타입 | 카드 표시 위치 |
|------|------|----------------|
| name | string | 앞면 — 선물 이름(브랜드/모델 포함) |
| emoji | string | 앞면 — 대표 이미지 역할(FR-005) |
| reason | string | 앞면 — 추천 이유 1~2문장(US3) |
| price | string | 앞면 — 예상 가격대(예산 범위 내) |
| detail | string | 뒷면(플립) — 상세 설명(FR-006) |
| evidence | string | 뒷면 — 대화 근거 |
| signals | string[] | 뒷면 — 취향 키워드 배지 |
| store / url | string | 뒷면 — 외부 상품 링크(FR-007). url 없으면 검색 링크로 대체 |
| query | string | 네이버 쇼핑 검색 링크 생성용 키워드 |

## 5. 추천 결과 부가 요소

| 필드 | 타입 | 설명 |
|------|------|------|
| forbidden | { name, reason } | 절대 피해야 할 선물 1개 |
| letter | string | 받는 사람에게 전할 편지(4~6문장). 이미지 저장(캔버스) 지원 |

## 6. 추천 세션 (RecommendSession)

1회 사용 흐름의 측정 단위(SC-001~003). 저장하지 않고 콘솔 구조화 로그(requestId 기준)로만 관찰한다.

```
상태 전이:
인트로(봉투) → 입력(조건+파일) → 분석 중(6단계 진행) → 결과(TOP 3+편지)
                                    ↘ 실패(오류 안내 + 재시도) — FR-011/012
```
