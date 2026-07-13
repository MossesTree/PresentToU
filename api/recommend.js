// PresentToU — Vercel 서버리스 함수
// 환경변수 OPENAI_API_KEY로 실제 추천을 생성한다. (키는 서버 측에만 존재 — 브라우저 비노출)
// Vercel 대시보드 → Settings → Environment Variables 에 OPENAI_API_KEY 등록

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const SYSTEM_PROMPT = `너는 선물 추천 전문가야. 사용자가 준 정보(받는 사람 이름, 예산 범위, 대화 내용)를 분석해서 세 가지를 만들어줘.
1) 두 사람의 관계와 받는 사람의 취향을 짧게 분석한 글
2) 예산 범위 안에서 실패하지 않을(무난하게 받아들여질) 선물 TOP 3
3) 이 관계·취향에서 절대 피해야 할 선물 1개
모든 결과는 한국어로 작성하고, 반드시 지정된 JSON 스키마만 출력해. 추측이 필요한 부분은 주어진 단서를 근거로 합리적으로 채워. 추천 선물의 가격대는 반드시 예산 범위 안에 들어와야 해.`;

function won(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

function buildUserPrompt({ recipientName, budgetMin, budgetMax, conversation, note }) {
  return `[받는 사람] ${recipientName || '(미입력)'}
[예산 범위] ${won(budgetMin)} ~ ${won(budgetMax)}
[대화 내용]
"""
${conversation && conversation.trim() ? conversation : '(대화 텍스트 없음)'}
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

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt({ recipientName, budgetMin, budgetMax, conversation, note }) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      res.status(502).json({ error: `OpenAI API 오류 (${aiRes.status}): ${errText.slice(0, 300)}` });
      return;
    }

    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      res.status(502).json({ error: 'OpenAI 응답이 비어 있습니다.' });
      return;
    }

    res.status(200).json(JSON.parse(content));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || '서버 오류' });
  }
}
