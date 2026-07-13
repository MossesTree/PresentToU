// PresentToU — Vercel 서버리스 함수
// 환경변수 OPENAI_API_KEY로 실제 추천을 생성한다. (키는 서버 측에만 존재 — 브라우저 비노출)
// Vercel 대시보드 → Settings → Environment Variables 에 OPENAI_API_KEY 등록
//
// 긴 대화 처리: 최근 12,000자는 원문 그대로, 그 이전 내용은 4,000자 이내 요약으로 압축해
// 컨텍스트 길이 초과(context_length_exceeded)를 방지한다.

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const RECENT_CHARS = 12000;   // 최근 대화 원문 유지 길이
const SUMMARY_MAX = 4000;     // 요약문 최대 길이
const SUMMARY_SRC_CAP = 40000; // 요약 대상으로 한 번에 넣는 최대 원문 길이(컨텍스트 보호)

function won(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

async function callOpenAI(apiKey, messages, { json = false, temperature = 0.7 } = {}) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    const e = new Error(`OpenAI API 오류 (${res.status}): ${errText.slice(0, 300)}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI 응답이 비어 있습니다.');
  return content;
}

// 이전 대화(older)를 선물 추천에 도움이 되도록 4,000자 이내로 요약
async function summarizeConversation(apiKey, text) {
  const src = text.slice(-SUMMARY_SRC_CAP); // 요약 대상은 최근 쪽 위주로 컷(컨텍스트 보호)
  const summary = await callOpenAI(apiKey, [
    {
      role: 'system',
      content: `너는 대화 로그를 요약하는 도우미야. 선물 추천에 도움이 되도록 "받는 사람"의 관심사·취향·자주 언급한 것·관계·예산 관련 단서를 중심으로 ${SUMMARY_MAX}자 이내 한국어로 간결하게 요약해. 불필요한 인사말·잡담은 빼고 핵심 단서만 정리해.`,
    },
    { role: 'user', content: src },
  ], { temperature: 0.3 });
  return summary.slice(0, SUMMARY_MAX);
}

const SYSTEM_PROMPT = `너는 선물 추천 전문가야. 사용자가 준 정보(받는 사람 이름, 예산 범위, 이전 대화 요약, 최근 대화 원문)를 종합 분석해서 세 가지를 만들어줘.
1) 두 사람의 관계와 받는 사람의 취향을 짧게 분석한 글
2) 예산 범위 안에서 실패하지 않을(무난하게 받아들여질) 선물 TOP 3
3) 이 관계·취향에서 절대 피해야 할 선물 1개
모든 결과는 한국어로 작성하고, 반드시 지정된 JSON 스키마만 출력해. 추측이 필요한 부분은 주어진 단서를 근거로 합리적으로 채워. 추천 선물의 가격대는 반드시 예산 범위 안에 들어와야 해.`;

function buildUserPrompt({ recipientName, budgetMin, budgetMax, summary, recent, note }) {
  return `[받는 사람] ${recipientName || '(미입력)'}
[예산 범위] ${won(budgetMin)} ~ ${won(budgetMax)}
[이전 대화 요약]
"""
${summary && summary.trim() ? summary : '(요약 없음 — 아래 최근 대화만 참고)'}
"""
[최근 대화 원문]
"""
${recent && recent.trim() ? recent : '(대화 텍스트 없음)'}
"""
${note ? `\n[참고] ${note}` : ''}

반드시 아래 JSON 형식으로만 응답해(다른 텍스트 금지):
{
  "analysis": "관계와 취향에 대한 2~3문장 분석",
  "top3": [
    {
      "name": "선물 이름",
      "emoji": "대표 이모지 1개",
      "reason": "왜 이 선물인지 한 줄 근거",
      "price": "예상 가격대 (반드시 예산 범위 안, 예: 3~5만원)",
      "detail": "상세 설명 2~3문장",
      "signals": ["신호1", "신호2", "신호3"],
      "query": "쿠팡 검색용 키워드"
    }
  ],
  "forbidden": { "name": "절대 금지 선물 1개", "reason": "왜 피해야 하는지 한 줄" }
}
top3는 정확히 3개여야 해.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '환경변수 OPENAI_API_KEY가 설정되지 않았습니다.' });
    return;
  }

  try {
    // Vercel은 JSON 본문을 자동 파싱하지만, 문자열로 올 경우도 방어
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { recipientName, budgetMin, budgetMax, conversation, note } = body;

    // 이름 또는 대화 내용 중 하나는 있어야 추천 가능
    if ((!recipientName || !recipientName.trim()) && (!conversation || !conversation.trim())) {
      res.status(400).json({ error: '받는 사람 이름 또는 대화 내용이 필요합니다.' });
      return;
    }

    // 최근 12,000자는 원문, 그 이전은 4,000자 이내 요약
    const convo = conversation || '';
    let recent = convo;
    let summary = '';
    let convoNote = note || '';

    if (convo.length > RECENT_CHARS) {
      recent = convo.slice(-RECENT_CHARS);
      const older = convo.slice(0, -RECENT_CHARS);
      if (older.trim()) {
        try {
          summary = await summarizeConversation(apiKey, older);
          convoNote = [convoNote, `대화가 길어 이전 내용은 ${SUMMARY_MAX.toLocaleString('ko-KR')}자 이내 요약으로, 최근 ${RECENT_CHARS.toLocaleString('ko-KR')}자는 원문으로 분석했습니다.`]
            .filter(Boolean).join(' ');
        } catch (e) {
          // 요약 실패 시 최근 원문만으로 진행 (전체 실패 방지)
          convoNote = [convoNote, '이전 대화 요약에 실패해 최근 대화 원문만으로 분석했습니다.'].filter(Boolean).join(' ');
        }
      }
    }

    const content = await callOpenAI(apiKey, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt({ recipientName, budgetMin, budgetMax, summary, recent, note: convoNote }) },
    ], { json: true, temperature: 0.7 });

    res.status(200).json(JSON.parse(content));
  } catch (err) {
    console.error(err);
    const status = err.status && err.status >= 400 && err.status < 600 ? 502 : 500;
    res.status(status).json({ error: err.message || '서버 오류' });
  }
}
