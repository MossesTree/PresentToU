// PresentToU — 결정적(deterministic) 로직 모듈
// LLM 호출 없이 입력만으로 결과가 정해지는 순수 함수들을 모아 단위 테스트를 가능하게 한다.
// (파일명이 _로 시작하면 Vercel이 API 엔드포인트로 배포하지 않는다)
// LLM 호출·프롬프트 실행은 api/recommend.js 에 남긴다.

/* ===== 포맷/파싱 ===== */

// 숫자를 한국 원화 표기로 바꾼다 (예: 10000 → 10,000원)
export function won(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

// 코드블록/앞뒤 설명이 섞여도 첫 { ~ 마지막 } 를 잘라 JSON 파싱
export function parseJsonLoose(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('JSON 파싱 실패');
  return JSON.parse(text.slice(s, e + 1));
}

// 긴 대화를 최근 원문(recent)과 요약 대상(older)으로 나눈다
// recentChars 이하면 전체가 recent, older는 빈 문자열
export function splitConversation(conversation, recentChars) {
  const convo = conversation || '';
  if (convo.length <= recentChars) return { recent: convo, older: '' };
  return { recent: convo.slice(-recentChars), older: convo.slice(0, -recentChars) };
}

// 모델 점수를 화면에 안전하게 표시할 정수로 제한하고 근거가 없으면 상한을 낮춘다
export function normalizeFitScore(value, evidence = '') {
  const parsed = Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  const score = Number.isFinite(parsed) ? Math.round(parsed) : 55;
  const bounded = Math.min(100, Math.max(0, score));
  const lacksEvidence = !String(evidence).trim() || String(evidence).includes('확인하지 못했습니다');
  return lacksEvidence ? Math.min(65, bounded) : bounded;
}

/* ===== 예산 → 퀄리티 기대치 ===== */

// 예산 상한(원)을 기준으로 받는 사람이 체감할 선물 퀄리티 기대치를 판단한다
// 상한이 선물의 '급'을 결정하므로 min이 아닌 max를 기준으로 삼는다
// { budgetMax, budgetAny } → { tier, guide }
export function judgeQualityExpectation({ budgetMax, budgetAny }) {
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

/* ===== 관계·목적 → 편지 톤 ===== */

// 관계 입력(자유 텍스트)을 키워드로 해석해 편지의 말투·호칭 지침을 반환한다
export function judgeLetterVoice(relationship) {
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
export function judgeLetterMood(purpose) {
  const p = (purpose || '').trim();
  const has = (...words) => words.some((word) => p.includes(word));
  if (!p) return '특정한 날을 가정하지 않는다. 선물을 고른 이유와 상대를 생각하는 마음, 고마움이나 다정한 응원을 자연스럽게 담는다.';
  if (has('생일', '생신')) return '생일 축하. 함께해 줘서 고맙다는 마음과 앞으로의 날들에 대한 다정한 응원을 담는다.';
  if (has('기념', '100일', '200일', '300일', '1000일', '주년')) return '기념일 축하. 함께 보낸 시간을 돌아보고 앞으로도 함께하고 싶다는 마음을 담는다.';
  if (has('감사', '고마', '고맙', '스승')) return '감사 전달. 무엇이 고마웠는지 구체적으로 짚으며 담백한 진심으로 쓴다.';
  if (has('승진', '합격', '졸업', '취업', '입학', '개업', '결혼', '출산', '축하')) return '성취 축하. 그동안의 노력을 인정하고 진심으로 축하하는 결로 쓴다.';
  if (has('위로', '응원', '힘내', '쾌유', '병문안', '이별', '퇴사')) return '위로와 응원. 차분하고 조심스럽게, 부담을 주지 않는 온기로 쓴다. 과하게 밝은 표현은 피한다.';
  if (has('사과', '미안', '화해')) return '진심 어린 사과. 변명 없이 솔직하고 겸손하게, 관계를 소중히 여기는 마음을 담는다.';
  if (has('크리스마스', '연말', '새해', '명절', '설날', '추석', '발렌타인', '화이트데이', '어버이날')) return '계절·기념일 인사. 시기에 맞는 인사와 따뜻한 안부를 담는다.';
  return `입력된 목적(${p})에 어울리는 감정을 해석해 담는다.`;
}

// 손글씨 글꼴에서 ㅡ처럼 보이는 긴 대시를 문장 구분용 마침표로 정리한다
export function normalizeLetterPunctuation(letter) {
  return String(letter || '')
    .replace(/\s*[—–―]\s*/g, '. ')
    .replace(/([.!?])\.\s+/g, '$1 ')
    .trim();
}

/* ===== 프롬프트 조립 ===== */

// 1차 추천용 사용자 프롬프트를 조립한다 (입력이 같으면 결과도 같은 순수 함수)
export function buildUserPrompt({ recipientName, recipientInfo, purpose, gender, relationship, budgetMin, budgetMax, budgetAny, quality, summary, recent, note }) {
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

/* ===== 민감 내용 교체(sanitize) ===== */

// 민감 판정된 추천 카드를 대신할 무난한 선물 (누구에게나 부담 없는 범용 구성 — 카드 3개 유지)
export const SAFE_GIFT = {
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

// 민감 판정된 필드를 안전한 기본 문구·선물로 교체한다 → 교체한 필드 이름 목록 반환
export function sanitizeResult(result, verdict, recipientName) {
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

/* ===== 상품 정책(중고 금지·신뢰 링크만) ===== */

// 중고·리퍼 등 새 제품이 아님을 드러내는 표현 (선물 정책상 절대 금지)
const SECONDHAND_PATTERN = /중고|리퍼(?:비쉬드)?|refurb|再生|전시\s?상품|반품\s?상품|스크래치\s?상품|B급|빈티지\s?제품/i;

// 신뢰할 수 있는 판매처 도메인 (국내 주요 커머스·백화점몰 — 이 목록에 없으면 링크를 걸지 않는다)
const TRUSTED_STORE_DOMAINS = [
  'coupang.com', 'naver.com', 'shopping.naver.com', 'smartstore.naver.com', 'brand.naver.com',
  '11st.co.kr', 'gmarket.co.kr', 'auction.co.kr', 'ssg.com', 'emart.ssg.com',
  'lotteon.com', 'lotteimall.com', 'thehyundai.com', 'kurly.com', 'oliveyoung.co.kr',
  'musinsa.com', '29cm.co.kr', 'wconcept.co.kr', 'gift.kakao.com', 'ohou.se',
  'interpark.com', 'himart.co.kr', 'e-himart.co.kr', 'costco.co.kr', 'kyobobook.co.kr', 'yes24.com',
];

// 중고 거래 플랫폼 도메인 (신뢰 목록보다 우선해 무조건 거부)
const SECONDHAND_DOMAINS = ['daangn.com', 'bunjang.co.kr', 'joongna.com', 'fleaauction.co', 'hellomarket.com'];

// 구매 링크가 신뢰할 수 있는 판매처인지 판정한다 (중고 플랫폼·미등록 도메인·비 http(s)는 거부)
export function isTrustedPurchaseUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return false;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const matches = (domain) => host === domain || host.endsWith(`.${domain}`);
  if (SECONDHAND_DOMAINS.some(matches)) return false;
  // 네이버는 쇼핑 관련 하위 도메인만 허용 (카페 중고 거래 글 등 차단)
  if (matches('naver.com')) {
    return ['shopping.naver.com', 'smartstore.naver.com', 'brand.naver.com', 'search.shopping.naver.com', 'msearch.shopping.naver.com']
      .some((allowed) => host === allowed);
  }
  return TRUSTED_STORE_DOMAINS.some(matches);
}

// 추천 카드에 상품 정책을 강제한다 → 조치 목록 반환
// - 중고·리퍼 상품: 카드 전체를 안전 선물로 교체 (카드 3개 유지)
// - 신뢰되지 않는 구매 링크: 링크만 제거 (클라이언트가 네이버 쇼핑 검색 링크로 대체)
export function enforceProductPolicy(result) {
  const actions = [];
  if (!Array.isArray(result.top3)) return actions;
  result.top3 = result.top3.map((gift, index) => {
    const text = [gift.name, gift.detail, gift.reason, gift.store].filter(Boolean).join(' ');
    if (SECONDHAND_PATTERN.test(text)) {
      actions.push(`top3[${index}]: 중고성 상품 → 안전 선물 교체`);
      return { ...SAFE_GIFT, price: gift.price || '' };
    }
    if (gift.url && !isTrustedPurchaseUrl(gift.url)) {
      actions.push(`top3[${index}]: 비신뢰 링크 제거 (${String(gift.url).slice(0, 60)})`);
      return { ...gift, url: '', store: '' };
    }
    return gift;
  });
  return actions;
}
