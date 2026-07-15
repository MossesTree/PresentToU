# API Contract: POST /api/transcribe

통화 음성 녹음 → 텍스트 전사. Vercel 서버리스 함수(`api/transcribe.js`)가 Groq Whisper(whisper-large-v3)로 프록시한다.

## 요청

- **Method**: POST (그 외 405)
- **Content-Type**: `multipart/form-data` (아니면 400)
- **Headers**: `x-request-id`(선택)
- **폼 필드**:
  - `file`: 오디오 파일 — `.wav` `.mp3` `.m4a` `.ogg` `.webm` `.mpga` `.mp4` `.mpeg`, **4MB 이하**(클라이언트에서 검증)
  - `model`: `whisper-large-v3`

## 응답

### 200 OK

```json
{ "text": "전사된 대화 텍스트" }
```

- 전사 결과가 비어 있으면 `text`는 빈 문자열(클라이언트가 "신호 없음" 흐름으로 처리)

### 오류

| 상태 | 조건 | 본문 |
|------|------|------|
| 400 | multipart가 아님 | `{ "error": "multipart/form-data 형식의 오디오가 필요합니다." }` |
| 405 | POST 외 메서드 | `{ "error": "POST만 지원합니다." }` |
| 500 | GROQ_API_KEY 미설정·내부 오류 | `{ "error": "…" }` |
| 502 | Groq 업스트림 오류 | `{ "error": "STT 오류 (…)" }` |

## 비기능 계약

- 클라이언트는 전사 실패 시 해당 파일을 건너뛰고 `note`에 사유를 담아 추천을 계속 진행한다(FR-011, 전체 실패 방지)
- 오디오 바이트는 저장하지 않고 Groq로 중계 후 폐기한다(FR-013)
