// PresentToU — Vercel 서버리스 함수
// 환경변수 OPENAI_API_KEY로 실제 추천을 생성한다. (키는 서버 측에만 존재 — 브라우저 비노출)
// Vercel 대시보드 → Settings → Environment Variables 에 OPENAI_API_KEY 등록
//
// 긴 대화 처리: 최근 12,000자는 원문 그대로, 그 이전 내용은 4,000자 이내 요약으로 압축해
// 컨텍스트 길이 초과(context_length_exceeded)를 방지한다.

// 추천·요약·민감 검증에 쓰는 기본 모델. 접근 권한이 열린 gpt-5.6-sol을 사용한다.
// (Vercel에 OPENAI_MODEL 환경변수가 설정돼 있으면 그 값이 우선한다)
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-sol';

// gpt-5 계열은 temperature 조정을 지원하지 않아(기본값 고정) 요청에서 파라미터를 생략한다
const SUPPORTS_TEMPERATURE = !MODEL.startsWith('gpt-5');

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

// 2차 웹검색(gpt-5.6-luna)은 응답이 오래 걸려 함수 실행 시간을 넉넉히 잡는다.
// 60초(Hobby 기본 상한)에서는 요약+1차 추천+웹검색 합계가 벽을 넘어 추천 전체가 강제 취소되는 일이 있었다.
// Fluid Compute를 켜면 Hobby 플랜도 최대 300초까지 허용된다.
// ⚠️ Vercel 대시보드 → Settings → Functions → Fluid Compute 활성화가 선행돼야 배포가 성공한다.
export const config = { maxDuration: 300 };

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
      ...(SUPPORTS_TEMPERATURE ? { temperature } : {}),
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

// 예산 상한(원)을 기준으로 받는 사람이 체감할 선물 퀄리티 기대치를 판단한다
// 상한이 선물의 '급'을 결정하므로 min이 아닌 max를 기준으로 삼는다
// { budgetMax, budgetAny } → { tier, guide }
function judgeQualityExpectation({ budgetMax, budgetAny }) {
  if (budgetAny || !Number(budgetMax)) {
    return {
      tier: '예산 무관',
      guide: '가격보다 취향 적합성과 정성을 우선하라. 무리하게 고가 선물을 권하지 말고, 만족도가 확실한 선물을 자유롭게 골라라.',
    };
  }
  const max = Number(budgetMax);
  if (max < 30000) {
    return {
      tier: '부담 없는 센스형 (3만원 미만)',
      guide: '브랜드 프리미엄보다 가격 대비 만족감과 센스가 기대치다. 취향을 정확히 맞춘 소모품·디저트·작은 굿즈처럼 "이 가격에 이런 걸?"이라는 반응이 나오는 선물을 골라라. 고가 카테고리의 최저가 상품처럼 싸구려로 보일 수 있는 선물은 피하라.',
    };
  }
  if (max < 100000) {
    return {
      tier: '실속형 (3만원 이상 10만원 미만)',
      guide: '품질이 검증된 준브랜드급 실용품이 기대치다. 일상에서 자주 쓰는 물건을 한 단계 좋은 것으로 업그레이드해 주는 선물, 직접 사기는 애매하지만 받으면 확실히 쓰는 선물을 골라라.',
    };
  }
  if (max < 300000) {
    return {
      tier: '프리미엄형 (10만원 이상 30만원 미만)',
      guide: '인지도 있는 브랜드와 좋은 소재·마감이 기대치다. 받는 사람이 스스로 사기엔 아깝다고 느끼는, 오래 남는 물건을 골라라. 이 가격대에서 이름 없는 잡화를 여러 개 묶는 구성은 피하라.',
    };
  }
  return {
    tier: '럭셔리형 (30만원 이상)',
    guide: '명품·하이엔드 브랜드의 가치나 특별한 경험이 기대치다. 기념일급 정성이 느껴지도록 브랜드 대표 제품이나 시그니처 라인에서 골라라. 어중간한 중가 상품 여러 개보다 확실한 하나가 낫다.',
  };
}

// 관계 입력(자유 텍스트)을 키워드로 해석해 편지의 말투·호칭 지침을 반환한다
function judgeLetterVoice(relationship) {
  const rel = relationship || '';
  const has = (...words) => words.some((word) => rel.includes(word));
  if (has('연인', '여자친구', '남자친구', '여친', '남친', '애인', '썸', '아내', '와이프', '남편', '부부')) {
    return '다정하고 애틋한 말투. 부드러운 반말이 자연스럽다. 둘 사이에 어울리는 호칭으로 시작하고, 함께한 시간이 떠오르는 결로 쓴다.';
  }
  if (has('친구', '동창', '베프', '절친', '단짝')) {
    return '편하고 친근한 반말. 가벼운 장난기가 살짝 묻어나도 좋지만, 마지막에는 진심이 분명하게 전해지게 쓴다.';
  }
  if (has('엄마', '아빠', '어머니', '아버지', '부모', '할머니', '할아버지', '조부모')) {
    return '존댓말. 존경과 감사가 배어나는 정겨운 말투로, 자식(손주)다운 애틋함을 담는다.';
  }
  if (has('형', '누나', '오빠', '언니', '동생', '가족', '사촌', '이모', '고모', '삼촌', '조카')) {
    return '가족다운 편안한 말투. 관계에 맞는 호칭을 자연스럽게 쓰고, 격식보다 정을 우선한다.';
  }
  if (has('상사', '팀장', '부장', '과장', '대표', '사장', '교수', '선생', '은사', '멘토')) {
    return '격식 있는 존댓말. 정중하되 딱딱하지 않게, 존경과 감사를 절제된 문장으로 표현한다. 사적인 농담은 쓰지 않는다.';
  }
  if (has('동료', '직장', '회사', '선배', '후배', '팀원', '거래처')) {
    return '정중한 존댓말. 과하게 감상적이지 않게, 담백하고 예의 바르게 마음을 전한다.';
  }
  return '관계 입력을 해석해 어울리는 호칭과 말투를 고르되, 기본은 따뜻하고 예의 바른 존댓말로 쓴다.';
}

// 선물 목적(자유 텍스트)을 키워드로 해석해 편지의 감정 결을 반환한다
function judgeLetterMood(purpose) {
  const p = (purpose || '').trim();
  const has = (...words) => words.some((word) => p.includes(word));
  if (!p) return '목적이 명시되지 않았으니 생일 축하 편지로 쓴다. 함께해 줘서 고맙다는 따뜻한 마음을 담는다.';
  if (has('생일', '생신')) return '생일 축하. 함께해 줘서 고맙다는 마음과 앞으로의 날들에 대한 다정한 응원을 담는다.';
  if (has('기념', '100일', '200일', '300일', '1000일', '주년')) return '기념일 축하. 함께 보낸 시간을 돌아보고 앞으로도 함께하고 싶다는 마음을 담는다.';
  if (has('감사', '고마', '고맙', '스승')) return '감사 전달. 무엇이 고마웠는지 구체적으로 짚으며 담백한 진심으로 쓴다.';
  if (has('승진', '합격', '졸업', '취업', '입학', '개업', '결혼', '출산', '축하')) return '성취 축하. 그동안의 노력을 인정하고 진심으로 축하하는 결로 쓴다.';
  if (has('위로', '응원', '힘내', '쾌유', '병문안', '이별', '퇴사')) return '위로와 응원. 차분하고 조심스럽게, 부담을 주지 않는 온기로 쓴다. 과하게 밝은 표현은 피한다.';
  if (has('사과', '미안', '화해')) return '진심 어린 사과. 변명 없이 솔직하고 겸손하게, 관계를 소중히 여기는 마음을 담는다.';
  if (has('크리스마스', '연말', '새해', '명절', '설날', '추석', '발렌타인', '화이트데이', '어버이날')) return '계절·기념일 인사. 시기에 맞는 인사와 따뜻한 안부를 담는다.';
  return `입력된 목적(${p})에 어울리는 감정을 해석해 담는다.`;
}

const SYSTEM_PROMPT = `너는 선물 추천 전문가이자, 따뜻한 축하 편지를 대신 써 드리는 작가야.
사용자가 제공한 정보(받는 사람 이름, 성별, 관계, 예산 범위, 사용자가 아는 추가 정보, 이전 대화 요약, 최근 대화 원문)를 종합 분석해서 다음 네 가지 임무를 수행해.

1) 두 사람의 관계와 받는 사람의 취향을 짧게 분석해.
2) 예산 범위 안에서 실패하지 않을 선물 TOP 3를 추천해. (반드시 3개)
3) 이 관계와 취향에서 절대 피해야 할 선물 1개를 꼽아.
4) 받는 사람에게 전할 편지를 대신 써 줘. (선물 목적에 맞는 편지 — 목적이 없으면 생일 축하 편지)

[제약 조건]
- 추측이 필요한 부분은 주어진 대화 단서를 근거로 합리적으로 채워라.
- 예산 범위가 지정된 경우 추천 선물의 가격대는 반드시 입력된 범위 내에 있어야 한다. 예산이 무관하면 가격보다 취향 적합성을 우선한다.
- '[선물 퀄리티 기대치]'의 지침을 따라 추천 선물의 급(브랜드 수준·구성·완성도)을 예산에서 기대되는 수준에 맞춰라.
- 각 추천 항목의 'reason'은 두 문장으로 작성하라. 첫 문장은 실제 대화에서 확인한 관심사·키워드와 그 의미를 설명하고, 두 번째 문장은 '이러한 취향을 고려해'처럼 자연스럽게 이어 해당 제품을 추천하는 이유를 설명하라.
- 'reason'과 'evidence'에서 같은 문장을 반복하지 말고, '그래서'를 연속해서 사용하거나 근거 없이 단정하지 마라. 예: '대화에서 운동 이야기를 나눌 때 축구를 자주 언급하셔서 관심이 높은 것으로 보입니다. 이러한 취향을 고려해 직접 활용하기 좋은 이 제품을 추천해 드립니다.'
- 대화 원문에 있는 짧은 표현은 큰따옴표로 직접 인용하고, 그대로 인용하기 어렵다면 '대화에서 ~라고 말씀하신 점'처럼 간접 인용하라.
- 'evidence'에는 입력에 없는 취향·사실·대화 내용을 절대 만들어 넣지 마라. 근거를 확인할 수 없으면 '제공된 대화에서 관련 단서를 확인하지 못했습니다.'라고 명시하라.
- 각 추천 항목의 'fitScore'는 대화 근거 35점, 취향 일치도 30점, 관계 적합성 20점, 예산 적합성 15점을 합산한 0~100 정수로 작성하라. 실제 대화 근거를 확인하지 못한 항목은 65점을 넘기지 마라.
- 분석, 추천 이유, 상세 설명, 대화 근거, 금지 이유는 모두 자연스러운 한국어 존댓말로 작성하라. 메모체, 단정적인 추측을 사용하지 마라.
- 편지의 말투만은 '[편지 톤 지침]'을 따르라. 지침이 반말을 허용하는 관계(연인·친구 등)라면 편지에 한해 자연스러운 반말을 써도 된다.
- 편지는 받는 사람 이름(또는 관계에 어울리는 호칭)을 부르며 시작하고, '[편지 톤 지침]'의 말투·호칭과 감정 결을 반영하라. 대화나 추가 정보에서 확인된 실제 취향·추억을 한두 가지 자연스럽게 녹이되, 없는 사실을 지어내지 마라.
- 성적(선정적)·정치적(정당/정치인/이념)·종교적(특정 종교 권유/비하) 내용과 폭력·혐오·차별 표현은 분석, 추천, 금지 선물, 편지 어디에도 포함하지 마라. 대화에 그런 주제가 나오더라도 선물과 문구는 중립적으로 작성하라.
- 선물 목적은 마지막 편지 작성에만 반영하고, 분석·추천·금지 선물 판단에는 사용하지 마라.
- 편지는 4~6문장 분량의 한국어로 쓰고, 보내는 사람 이름은 알 수 없으니 지어내지 말고 마음이 담긴 맺음말로 끝내라.
- 모든 결과는 한국어로 작성하라.
- 다른 텍스트나 설명 없이 오직 아래의 JSON 형식으로만 응답해라. (Markdown 코드 블록 없이 순수 JSON만 출력할 것)

[JSON 스키마]
{
  "analysis": "관계와 취향에 대한 2~3문장 분석",
  "top3": [
    {
      "name": "구체적인 선물 이름",
      "emoji": "대표 이모지 1개",
      "reason": "실제 대화 단서와 추천 결론을 자연스럽게 연결한 존댓말 2문장",
      "fitScore": 85,
      "price": "예상 가격대 (예: 30,000원 ~ 45,000원, 반드시 예산 범위 내)",
      "detail": "상세 설명 및 추천 이유 2~3문장",
      "evidence": "이 추천을 뒷받침하는 실제 대화 근거 1~2문장(직접 인용 또는 간접 인용)",
      "signals": ["대화에서 포착된 취향/니즈 키워드 3개"],
      "query": "쿠팡 등 쇼핑몰 검색용 최적화 키워드"
    }
  ],
  "forbidden": {
    "name": "절대 금지 선물 1개",
    "reason": "왜 피해야 하는지 이유 한 줄"
  },
  "letter": "받는 사람에게 전할 편지 본문 (4~6문장, 편지 톤 지침의 말투·감정 결 반영)"
}`;

function buildUserPrompt({ recipientName, recipientInfo, purpose, gender, relationship, budgetMin, budgetMax, budgetAny, quality, summary, recent, note }) {
  // 예산 포맷팅 함수가 외부에 있다고 가정 (예: 10,000원)
  const budgetStr = budgetAny ? '예산 무관' : `${won(budgetMin)} ~ ${won(budgetMax)}`;

  return `[입력 데이터]
- 받는 사람: ${recipientName || '(미입력)'}
- 성별: ${gender || '(미입력)'}
- 관계: ${relationship || '(미입력)'}
- 예산 범위: ${budgetStr}

[선물 퀄리티 기대치]
- 등급: ${quality.tier}
- 지침: ${quality.guide}

[사용자가 아는 추가 정보]
${recipientInfo && recipientInfo.trim() ? recipientInfo : '(입력 없음)'}

[편지 작성 전용 정보]
- 선물 목적: ${purpose || '(미입력)'}

[편지 톤 지침]
- 말투·호칭: ${judgeLetterVoice(relationship)}
- 감정 결: ${judgeLetterMood(purpose)}

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

// 결과 화면에 성·정치·종교·혐오 등 민감 내용이 노출되지 않도록 표시 직전에 검증한다
const SAFETY_PROMPT = `너는 선물 추천 서비스의 콘텐츠 검수 담당자야. 사용자 화면에 그대로 표시될 텍스트에
성적(선정적), 정치적(정당·정치인·이념 옹호/비방), 종교적(특정 종교 권유·찬양·비하), 폭력·혐오·차별 내용이 포함됐는지 판정해.

- 일상적인 선물·감사·축하·취향 표현은 민감하지 않다. 확실히 민감한 경우에만 true로 판정해 과잉 차단을 피해라.
- 입력 JSON: { "analysis": "...", "letter": "...", "forbidden": "...", "top3": ["항목별 텍스트", ...] }
- 다른 설명 없이 아래 형식의 JSON만 출력해라. (true = 민감 내용 포함)
{ "analysis": false, "letter": false, "forbidden": false, "top3": [false, false, false] }`;

// 민감 판정된 추천 카드를 대신할 무난한 선물 (누구에게나 부담 없는 범용 구성 — 카드 3개 유지)
const SAFE_GIFT = {
  name: '프리미엄 꽃다발 & 감사 카드 세트',
  emoji: '💐',
  reason: '취향을 크게 타지 않으면서도 정성이 잘 전해지는 선물이라 추천해 드립니다.',
  fitScore: 55,
  price: '',
  detail: '계절 꽃으로 구성한 꽃다발과 짧은 손글씨 카드를 함께 전하는 구성입니다. 어떤 관계에서도 부담 없이 마음을 표현할 수 있습니다.',
  evidence: '제공된 대화에서 관련 단서를 확인하지 못했습니다.',
  signals: ['정성', '무난함', '마음 전달'],
  store: '',
  url: '',
  query: '꽃다발 감사 카드 선물 세트',
};

// 모델 점수를 화면에 안전하게 표시할 정수로 제한하고 근거가 없으면 상한을 낮춘다
function normalizeFitScore(value, evidence = '') {
  const parsed = Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  const score = Number.isFinite(parsed) ? Math.round(parsed) : 55;
  const bounded = Math.min(100, Math.max(0, score));
  const lacksEvidence = !String(evidence).trim() || String(evidence).includes('확인하지 못했습니다');
  return lacksEvidence ? Math.min(65, bounded) : bounded;
}

// 결과 JSON에서 화면에 표시되는 텍스트만 모아 민감 여부를 판정한다
// result → { analysis, letter, forbidden, top3: boolean[] } (true = 민감 내용 포함)
async function checkSensitiveContent(apiKey, result) {
  const top3 = Array.isArray(result.top3) ? result.top3 : [];
  const payload = {
    analysis: result.analysis || '',
    letter: result.letter || '',
    forbidden: result.forbidden ? `${result.forbidden.name || ''}: ${result.forbidden.reason || ''}` : '',
    top3: top3.map((gift) => [gift.name, gift.reason, gift.detail, gift.evidence, (Array.isArray(gift.signals) ? gift.signals : []).join(', ')]
      .filter(Boolean).join(' / ')),
  };
  const content = await callOpenAI(apiKey, [
    { role: 'system', content: SAFETY_PROMPT },
    { role: 'user', content: JSON.stringify(payload) },
  ], { json: true, temperature: 0 });
  const verdict = JSON.parse(content);
  return {
    analysis: Boolean(verdict.analysis),
    letter: Boolean(verdict.letter),
    forbidden: Boolean(verdict.forbidden),
    top3: top3.map((_, index) => Boolean(Array.isArray(verdict.top3) && verdict.top3[index])),
  };
}

// 민감 판정된 필드를 안전한 기본 문구·선물로 교체한다 → 교체한 필드 이름 목록 반환
function sanitizeResult(result, verdict, recipientName) {
  const replaced = [];
  if (verdict.analysis) {
    result.analysis = '대화 내용을 바탕으로 받는 분께 어울리는 선물을 준비했습니다.';
    replaced.push('analysis');
  }
  if (verdict.forbidden && result.forbidden) {
    result.forbidden = { name: '받는 분의 취향과 어긋나는 선물', reason: '대화에서 확인된 취향과 맞지 않는 선물은 피하시는 편이 좋습니다.' };
    replaced.push('forbidden');
  }
  if (verdict.letter) {
    const opening = recipientName && recipientName.trim() ? `${recipientName.trim()}님께. ` : '';
    result.letter = `${opening}늘 고마운 마음을 담아 작은 선물을 준비했습니다. 소중한 하루하루가 따뜻한 일들로 가득하길 바랍니다. 앞으로도 좋은 순간을 함께 나눌 수 있으면 좋겠습니다. 마음을 담아 이 편지를 전합니다.`;
    replaced.push('letter');
  }
  if (Array.isArray(result.top3)) {
    verdict.top3.forEach((flagged, index) => {
      if (flagged && result.top3[index]) {
        // 가격대는 예산 검증을 이미 통과한 값이라 유지한다
        result.top3[index] = { ...SAFE_GIFT, price: result.top3[index].price || '' };
        replaced.push(`top3[${index}]`);
      }
    });
  }
  return replaced;
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
  const prompt = `너는 쇼핑 큐레이터야. 아래 "추천 방향"에 맞는 실제 판매 중인 '구체적인 상품 하나'를 웹에서 찾아라.
- 카테고리·뭉뚱그린 표현(예: "커피 세트") 금지. 브랜드·모델까지 특정된 실제 상품으로.
- 반드시 웹 검색으로 실제 존재하는 상품 페이지 URL을 확인해서 url에 넣어라(네이버쇼핑/쿠팡 등 실제 판매처면 어디든). 실제 URL을 못 찾으면 url은 빈 문자열.
- 예산 범위가 지정된 경우 가격대는 반드시 그 범위 안. 예산 무관이면 취향 적합성을 우선.
- '[선물 퀄리티 기대치]' 지침에 맞는 급의 상품을 골라라. 기대치보다 싸구려로 보이거나 과하게 격식을 차린 상품은 피하라.
- 기존에 전달된 대화 근거는 사실성을 위해 수정하거나 새로 만들지 말고 그대로 유지해라.
- 'reason'은 첫 문장에서 실제 대화 단서를 설명하고, 두 번째 문장에서 구체적인 상품 추천 결론으로 자연스럽게 이어지는 존댓말로 작성해라. 같은 근거나 '그래서'를 반복하지 마라.
- 'fitScore'는 1차 추천에서 계산한 값을 변경하지 말고 그대로 반환해라.
- 성인용품, 정치·종교 관련 상품은 제외하고, 성적·정치적·종교적·혐오 표현이 없는 중립적인 문구로만 작성해라.
- 모든 설명은 한국어 존댓말로 작성하고, 마크다운·설명 없이 아래 JSON만 출력해라.

[받는 사람] ${ctx.recipientName || '(미입력)'}
[성별] ${ctx.gender || '(미입력)'}
[관계] ${ctx.relationship || '(미입력)'}
[예산 범위] ${ctx.budgetAny ? '예산 무관' : `${won(ctx.budgetMin)} ~ ${won(ctx.budgetMax)}`}
[선물 퀄리티 기대치] ${ctx.quality ? `${ctx.quality.tier} — ${ctx.quality.guide}` : '(지정 없음)'}
[추천 방향] ${item.name || ''}
[추천 이유] ${item.reason || ''}
[추천 적합도] ${normalizeFitScore(item.fitScore, item.evidence)}점
[대화 근거] ${item.evidence || '제공된 대화에서 관련 단서를 확인하지 못했습니다.'}
[취향 신호] ${(Array.isArray(item.signals) ? item.signals : []).join(', ')}

[JSON]
{"name":"구체적 상품명(브랜드/모델 포함)","emoji":"대표 이모지 1개","reason":"실제 대화 단서와 상품 추천 결론을 연결한 존댓말 2문장","fitScore":85,"price":"예상 가격대(예산 내)","detail":"상세 설명 2~3문장","evidence":"기존 대화 근거를 그대로 유지한 1~2문장","signals":["취향/니즈 키워드 3개"],"store":"판매처 이름","url":"실제 상품 구매 페이지 URL(없으면 빈 문자열)","query":"쇼핑몰 검색용 구체 키워드"}`;
  const text = await webSearch(apiKey, prompt);
  const p = parseJsonLoose(text);
  // 모델이 일부 필드를 빠뜨리면 원래 항목 값으로 보완
  return {
    name: p.name || item.name,
    emoji: p.emoji || item.emoji || '🎁',
    reason: p.reason || item.reason || '',
    fitScore: normalizeFitScore(item.fitScore, item.evidence),
    price: p.price || item.price || '',
    detail: p.detail || item.detail || '',
    evidence: item.evidence || p.evidence || '제공된 대화에서 관련 단서를 확인하지 못했습니다.',
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
    const { recipientName, recipientInfo, purpose, gender, relationship, budgetMin, budgetMax, budgetAny, conversation, note } = body;
    log('request.body.parsed', { conversationLength: (conversation || '').length, hasRecipientName: Boolean(recipientName), hasRecipientInfo: Boolean(recipientInfo && recipientInfo.trim()), hasNote: Boolean(note), budgetMin, budgetMax, budgetAny: Boolean(budgetAny) });

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

    // 예산 범위가 만드는 퀄리티 기대치를 판단해 1차 추천·2차 상품 특정 양쪽에 반영한다
    const quality = judgeQualityExpectation({ budgetMax, budgetAny });
    log('quality.expectation', { tier: quality.tier });

    log('recommendation.start', { recentLength: recent.length, summaryLength: summary.length });
    log('recommendation.openai.start', { model: MODEL });
    const content = await callOpenAI(apiKey, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt({ recipientName, recipientInfo, purpose, gender, relationship, budgetMin, budgetMax, budgetAny, quality, summary, recent, note: convoNote }) },
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
          return refineToProduct(apiKey, item, { recipientName, gender, relationship, budgetMin, budgetMax, budgetAny, quality })
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
      result.top3 = result.top3.map((gift) => ({
        ...gift,
        fitScore: normalizeFitScore(gift.fitScore, gift.evidence),
      }));
      log('product_refinement.complete', { itemCount: result.top3.length });
    }

    // 화면에 표시되기 전 마지막 관문: 민감 내용(성·정치·종교·혐오 등) 검증 후 안전한 내용으로 교체
    try {
      log('safety.check.start', {});
      const verdict = await checkSensitiveContent(apiKey, result);
      const replaced = sanitizeResult(result, verdict, recipientName);
      log('safety.check.complete', { replacedCount: replaced.length, replaced });
    } catch (safetyError) {
      // 검증 호출 실패가 추천 전체를 막지 않도록 결과는 내보내되 기록을 남긴다
      log('safety.check.error', { name: safetyError.name, message: safetyError.message }, 'error');
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
