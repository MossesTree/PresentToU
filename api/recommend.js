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
// 서버 로그를 요청 ID와 함께 남겨 긴 추천 요청의 병목 구간을 추적한다
function createRequestId(req) {
  return req.headers['x-request-id'] || `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

function logEvent(requestId, event, details = {}, level = 'info') {
  const payload = JSON.stringify({ scope: 'recommend', timestamp: new Date().toISOString(), requestId, event, ...details });
  if (level === 'error') console.error(payload);
  else console.log(payload);
}

// 2차 웹검색(gpt-5.6-luna)은 응답이 오래 걸려 함수 실행 시간을 넉넉히 잡는다. Vercel Hobby 최대 60초.
export const config = { maxDuration: 60 };

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

const SYSTEM_PROMPT = `너는 선물 추천 전문가야. 
사용자가 제공한 정보(받는 사람 이름, 성별, 관계, 예산 범위, 이전 대화 요약, 최근 대화 원문)를 종합 분석해서 다음 세 가지 임무를 수행해.

1) 두 사람의 관계와 받는 사람의 취향을 짧게 분석해.
2) 예산 범위 안에서 실패하지 않을 선물 TOP 3를 추천해. (반드시 3개)
3) 이 관계와 취향에서 절대 피해야 할 선물 1개를 꼽아.

[제약 조건]
- 추측이 필요한 부분은 주어진 대화 단서를 근거로 합리적으로 채워라.
- 추천 선물의 가격대는 반드시 입력된 '예산 범위' 내에 있어야 한다.
- 모든 결과는 한국어로 작성하라.
- 다른 텍스트나 설명 없이 오직 아래의 JSON 형식으로만 응답해라. (Markdown 코드 블록 없이 순수 JSON만 출력할 것)

[JSON 스키마]
{
  "analysis": "관계와 취향에 대한 2~3문장 분석",
  "top3": [
    {
      "name": "구체적인 선물 이름",
      "emoji": "대표 이모지 1개",
      "reason": "왜 이 선물인지 핵심 근거 한 줄",
      "price": "예상 가격대 (예: 30,000원 ~ 45,000원, 반드시 예산 범위 내)",
      "detail": "상세 설명 및 추천 이유 2~3문장",
      "signals": ["대화에서 포착된 취향/니즈 키워드 3개"],
      "query": "쿠팡 등 쇼핑몰 검색용 최적화 키워드"
    }
  ],
  "forbidden": { 
    "name": "절대 금지 선물 1개", 
    "reason": "왜 피해야 하는지 이유 한 줄" 
  }
}`;

function buildUserPrompt({ recipientName, gender, relationship, budgetMin, budgetMax, summary, recent, note }) {
  // 예산 포맷팅 함수가 외부에 있다고 가정 (예: 10,000원)
  const budgetStr = `${won(budgetMin)} ~ ${won(budgetMax)}`;

  return `[입력 데이터]
- 받는 사람: ${recipientName || '(미입력)'}
- 성별: ${gender || '(미입력)'}
- 관계: ${relationship || '(미입력)'}
- 예산 범위: ${budgetStr}

[이전 대화 요약]
${summary && summary.trim() ? summary : '(요약 없음 — 아래 최근 대화만 참고)'}

[최근 대화 원문]
${recent && recent.trim() ? recent : '(대화 텍스트 없음)'}

${note ? `[참고 노트]\n${note}` : ''}`;
}

// 웹 검색이 가능한 모델. Responses API의 web_search 도구로 실제 판매 상품/링크를 찾는다.
const SEARCH_MODEL = process.env.OPENAI_SEARCH_MODEL || 'gpt-5.6-luna';

// Responses API + web_search 호출 → 최종 output_text(문자열) 반환
async function webSearch(apiKey, prompt) {
  // 검색이 지나치게 오래 걸리면 중단하고 상위에서 폴백(원본 항목)하도록 한다
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50000);
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: SEARCH_MODEL, tools: [{ type: 'web_search' }], input: prompt }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const errText = await res.text();
    const e = new Error(`웹검색 오류 (${res.status}): ${errText.slice(0, 200)}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  let text = '';
  for (const o of (data.output || [])) {
    if (o.type === 'message') {
      for (const c of (o.content || [])) {
        if (c.type === 'output_text') text += c.text;
      }
    }
  }
  return text;
}

// 코드블록/앞뒤 설명이 섞여도 첫 { ~ 마지막 } 를 잘라 JSON 파싱
function parseJsonLoose(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('JSON 파싱 실패');
  return JSON.parse(text.slice(s, e + 1));
}

// 2차 패스: 각 추천 방향을 웹에서 실제 판매 중인 구체적 상품 하나로 특정하고 구매 URL을 확보
async function refineToProduct(apiKey, item, ctx) {
  const prompt = `너는 쇼핑 큐레이터야. 아래 "추천 방향"에 맞는, 예산 범위 안에서 실제로 판매 중인 '구체적인 상품 하나'를 웹에서 찾아라.
- 카테고리·뭉뚱그린 표현(예: "커피 세트") 금지. 브랜드·모델까지 특정된 실제 상품으로.
- 반드시 웹 검색으로 실제 존재하는 상품 페이지 URL을 확인해서 url에 넣어라(네이버쇼핑/쿠팡 등 실제 판매처면 어디든). 실제 URL을 못 찾으면 url은 빈 문자열.
- 가격대는 반드시 예산 범위 안.
- 한국어로, 마크다운·설명 없이 아래 JSON만 출력해라.

[받는 사람] ${ctx.recipientName || '(미입력)'}
[성별] ${ctx.gender || '(미입력)'}
[관계] ${ctx.relationship || '(미입력)'}
[예산 범위] ${won(ctx.budgetMin)} ~ ${won(ctx.budgetMax)}
[추천 방향] ${item.name || ''}
[추천 이유] ${item.reason || ''}
[취향 신호] ${(Array.isArray(item.signals) ? item.signals : []).join(', ')}

[JSON]
{"name":"구체적 상품명(브랜드/모델 포함)","emoji":"대표 이모지 1개","reason":"이 상품을 고른 핵심 근거 한 줄","price":"예상 가격대(예산 내)","detail":"상세 설명 2~3문장","signals":["취향/니즈 키워드 3개"],"store":"판매처 이름","url":"실제 상품 구매 페이지 URL(없으면 빈 문자열)","query":"쇼핑몰 검색용 구체 키워드"}`;
  const text = await webSearch(apiKey, prompt);
  const p = parseJsonLoose(text);
  // 모델이 일부 필드를 빠뜨리면 원래 항목 값으로 보완
  return {
    name: p.name || item.name,
    emoji: p.emoji || item.emoji || '🎁',
    reason: p.reason || item.reason || '',
    price: p.price || item.price || '',
    detail: p.detail || item.detail || '',
    signals: Array.isArray(p.signals) && p.signals.length ? p.signals : (item.signals || []),
    store: typeof p.store === 'string' ? p.store : '',
    url: (typeof p.url === 'string' && /^https?:\/\//.test(p.url)) ? p.url : '',
    query: p.query || p.name || item.query || item.name,
  };
}

export default async function handler(req, res) {
  const requestId = createRequestId(req);
  const startedAt = Date.now();
  const log = (event, details = {}, level = 'info') => logEvent(requestId, event, details, level);
  res.setHeader('x-request-id', requestId);
  log('request.start', { method: req.method });
  if (req.method !== 'POST') {
    log('request.rejected', { reason: 'method_not_allowed' }, 'error');
    res.status(405).json({ error: 'POST만 지원합니다.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    log('request.rejected', { reason: 'missing_api_key' }, 'error');
    res.status(500).json({ error: '환경변수 OPENAI_API_KEY가 설정되지 않았습니다.' });
    return;
  }

  try {
    // Vercel은 JSON 본문을 자동 파싱하지만, 문자열로 올 경우도 방어
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { recipientName, gender, relationship, budgetMin, budgetMax, conversation, note } = body;
    log('request.body.parsed', { conversationLength: (conversation || '').length, hasRecipientName: Boolean(recipientName), hasNote: Boolean(note), budgetMin, budgetMax });

    // 이름 또는 대화 내용 중 하나는 있어야 추천 가능
    if ((!recipientName || !recipientName.trim()) && (!conversation || !conversation.trim())) {
      log('request.rejected', { reason: 'missing_input' }, 'error');
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
          log('summary.start', { sourceLength: older.length });
          summary = await summarizeConversation(apiKey, older);
          log('summary.complete', { summaryLength: summary.length });
          convoNote = [convoNote, `대화가 길어 이전 내용은 ${SUMMARY_MAX.toLocaleString('ko-KR')}자 이내 요약으로, 최근 ${RECENT_CHARS.toLocaleString('ko-KR')}자는 원문으로 분석했습니다.`]
            .filter(Boolean).join(' ');
        } catch (e) {
          log('summary.error', { name: e.name, message: e.message }, 'error');
          // 요약 실패 시 최근 원문만으로 진행 (전체 실패 방지)
          convoNote = [convoNote, '이전 대화 요약에 실패해 최근 대화 원문만으로 분석했습니다.'].filter(Boolean).join(' ');
        }
      }
    }

    log('recommendation.start', { recentLength: recent.length, summaryLength: summary.length });
    log('recommendation.openai.start', { model: MODEL });
    const content = await callOpenAI(apiKey, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt({ recipientName, gender, relationship, budgetMin, budgetMax, summary, recent, note: convoNote }) },
    ], { json: true, temperature: 0.7 });

    const result = JSON.parse(content);
    log('recommendation.openai.complete', { contentLength: content.length });
    log('recommendation.complete', { top3Count: Array.isArray(result.top3) ? result.top3.length : 0 });

    // 2차 패스: 각 추천을 구체적인 단일 상품으로 특정 (병렬, 실패 시 원본 유지)
    if (Array.isArray(result.top3)) {
      log('product_refinement.start', { itemCount: Math.min(result.top3.length, 3) });
      result.top3 = await Promise.all(
        result.top3.slice(0, 3).map((item, index) => {
          const itemStartedAt = Date.now();
          log('product_refinement.item.start', { index });
          return refineToProduct(apiKey, item, { recipientName, gender, relationship, budgetMin, budgetMax })
            .then((refined) => {
              log('product_refinement.item.complete', { index, durationMs: Date.now() - itemStartedAt });
              return refined;
            })
            .catch((error) => {
              log('product_refinement.item.error', { index, name: error.name, message: error.message, durationMs: Date.now() - itemStartedAt }, 'error');
              return item;
            });
        })
      );
      log('product_refinement.complete', { itemCount: result.top3.length });
    }

    log('request.complete', { durationMs: Date.now() - startedAt });
    res.status(200).json(result);
  } catch (err) {
    log('request.error', { name: err.name, message: err.message, durationMs: Date.now() - startedAt }, 'error');
    console.error(err);
    const status = err.status && err.status >= 400 && err.status < 600 ? 502 : 500;
    res.status(status).json({ error: err.message || '서버 오류' });
  }
}
