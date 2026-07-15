# API Contract: POST /api/recommend

선물 추천 생성. Vercel 서버리스 함수(`api/recommend.js`), maxDuration 60초.

## 요청

- **Method**: POST (그 외 405)
- **Content-Type**: `application/json`
- **Headers**: `x-request-id`(선택) — 클라이언트 추적 ID. 없으면 서버가 생성해 응답 헤더로 반환

```json
{
  "recipientName": "김민지",
  "gender": "여성",
  "relationship": "친구",
  "budgetMin": 30000,
  "budgetMax": 50000,
  "budgetAny": false,
  "recipientInfo": "커피를 좋아함",
  "purpose": "생일 축하",
  "conversation": "[카카오톡 대화 원문 + 음성 전사 텍스트]",
  "note": ""
}
```

**유효성**: `recipientName` 또는 `conversation` 중 하나는 비어 있지 않아야 한다(위반 시 400).

## 처리 규칙

1. 대화가 12,000자 초과 시: 최근 12,000자 원문 + 이전 내용 4,000자 요약(요약 실패는 무시하고 진행)
2. 1차: gpt-4o-mini(JSON 강제)로 analysis/top3/forbidden/letter 생성
3. 2차: top3 각 항목을 웹검색으로 실제 판매 상품+URL로 특정(병렬, 50초 타임아웃, 실패 시 해당 항목은 1차 결과 유지)

## 응답

### 200 OK

```json
{
  "analysis": "두 분은 …",
  "top3": [
    {
      "name": "구체적 상품명",
      "emoji": "☕",
      "reason": "대화 근거와 이어지는 추천 이유",
      "price": "30,000원 ~ 45,000원",
      "detail": "상세 설명 2~3문장",
      "evidence": "대화 인용 근거",
      "signals": ["커피", "홈카페", "감성"],
      "store": "쿠팡",
      "url": "https://... (없으면 빈 문자열)",
      "query": "검색용 키워드"
    }
  ],
  "forbidden": { "name": "피해야 할 선물", "reason": "이유 한 줄" },
  "letter": "편지 본문 4~6문장"
}
```

- `top3`는 항상 정확히 3개(SC-004). `url`은 `https?://` 형식일 때만 채워진다.

### 오류

| 상태 | 조건 | 본문 |
|------|------|------|
| 400 | 이름·대화 모두 없음 | `{ "error": "받는 사람 이름 또는 대화 내용이 필요합니다." }` |
| 405 | POST 외 메서드 | `{ "error": "POST만 지원합니다." }` |
| 500 | 서버 키 미설정·내부 오류 | `{ "error": "…" }` |
| 502 | 업스트림(OpenAI) 4xx/5xx | `{ "error": "OpenAI API 오류 (…)" }` |

## 비기능 계약

- 응답까지 60초 미만(FR-008). 클라이언트는 타임아웃·오류 시 재시도 안내를 표시한다(FR-011/012)
- 요청 본문(대화 원문)은 저장하지 않는다. 로그에는 길이 등 메타데이터만 남긴다(FR-013)
