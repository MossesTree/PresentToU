// PresentToU — 결정적 로직 단위 테스트 (node:test 내장 러너, 외부 의존성 없음)
// 실행: npm test  (= node --test tests/)
// 경계값과 예외 케이스를 중심으로 api/_logic.js 의 순수 함수를 검증한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  won,
  parseJsonLoose,
  splitConversation,
  normalizeFitScore,
  judgeQualityExpectation,
  judgeLetterVoice,
  judgeLetterMood,
  isTrustedPurchaseUrl,
  enforceProductPolicy,
  buildUserPrompt,
  sanitizeResult,
  SAFE_GIFT,
} from '../api/_logic.js';

/* ===== won: 원화 표기 ===== */

test('won: 천 단위 구분 표기', () => {
  assert.equal(won(10000), '10,000원');
  assert.equal(won(1234567), '1,234,567원');
});

test('won: 0·null·undefined는 0원으로 방어', () => {
  assert.equal(won(0), '0원');
  assert.equal(won(null), '0원');
  assert.equal(won(undefined), '0원');
});

/* ===== parseJsonLoose: 관대한 JSON 파싱 ===== */

test('parseJsonLoose: 순수 JSON 파싱', () => {
  assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
});

test('parseJsonLoose: 마크다운 코드블록·앞뒤 설명이 섞여도 파싱', () => {
  const text = '결과입니다:\n```json\n{"name":"선물","price":1000}\n```\n감사합니다';
  assert.deepEqual(parseJsonLoose(text), { name: '선물', price: 1000 });
});

test('parseJsonLoose: 중첩 객체는 마지막 } 까지 포함', () => {
  assert.deepEqual(parseJsonLoose('x {"a":{"b":2}} y'), { a: { b: 2 } });
});

test('parseJsonLoose: 중괄호가 없으면 예외', () => {
  assert.throws(() => parseJsonLoose('JSON 없음'), /JSON 파싱 실패/);
});

test('parseJsonLoose: 빈 문자열이면 예외', () => {
  assert.throws(() => parseJsonLoose(''));
});

/* ===== splitConversation: 긴 대화 분할 ===== */

test('splitConversation: 기준 이하면 전체가 recent, older는 빈 문자열', () => {
  assert.deepEqual(splitConversation('짧은 대화', 100), { recent: '짧은 대화', older: '' });
});

test('splitConversation: 기준과 정확히 같으면 분할하지 않음 (경계)', () => {
  const convo = 'a'.repeat(100);
  const { recent, older } = splitConversation(convo, 100);
  assert.equal(recent.length, 100);
  assert.equal(older, '');
});

test('splitConversation: 기준 초과 시 뒤에서 recentChars만큼 recent, 앞이 older', () => {
  const convo = 'a'.repeat(30) + 'b'.repeat(100);
  const { recent, older } = splitConversation(convo, 100);
  assert.equal(recent, 'b'.repeat(100));
  assert.equal(older, 'a'.repeat(30));
  assert.equal(recent.length + older.length, convo.length); // 유실 없음
});

test('splitConversation: null/undefined 대화는 빈 문자열로 방어', () => {
  assert.deepEqual(splitConversation(null, 100), { recent: '', older: '' });
  assert.deepEqual(splitConversation(undefined, 100), { recent: '', older: '' });
});

/* ===== normalizeFitScore: 점수 정규화 ===== */

test('normalizeFitScore: 정상 범위 점수는 그대로 (근거 있음)', () => {
  assert.equal(normalizeFitScore(85, '대화에서 축구를 언급하셨습니다.'), 85);
});

test('normalizeFitScore: 0~100 경계로 자름', () => {
  assert.equal(normalizeFitScore(150, '근거 있음'), 100);
  assert.equal(normalizeFitScore(-10, '근거 있음'), 0);
});

test('normalizeFitScore: 문자열 점수("85점")도 숫자로 해석', () => {
  assert.equal(normalizeFitScore('85점', '근거 있음'), 85);
});

test('normalizeFitScore: 숫자로 해석 불가하면 기본 55점', () => {
  assert.equal(normalizeFitScore('높음', '근거 있음'), 55);
  assert.equal(normalizeFitScore(null, '근거 있음'), 55);
});

test('normalizeFitScore: 근거가 없으면 상한 65점 (핵심 규칙)', () => {
  assert.equal(normalizeFitScore(90, ''), 65);
  assert.equal(normalizeFitScore(90, '제공된 대화에서 관련 단서를 확인하지 못했습니다.'), 65);
});

test('normalizeFitScore: 근거 없어도 65 이하 점수는 그대로', () => {
  assert.equal(normalizeFitScore(40, ''), 40);
});

/* ===== judgeQualityExpectation: 예산 → 퀄리티 기대치 (경계값) ===== */

test('judgeQualityExpectation: 등급 경계값', () => {
  assert.match(judgeQualityExpectation({ budgetMax: 29999, budgetAny: false }).tier, /센스형/);
  assert.match(judgeQualityExpectation({ budgetMax: 30000, budgetAny: false }).tier, /실속형/);
  assert.match(judgeQualityExpectation({ budgetMax: 99999, budgetAny: false }).tier, /실속형/);
  assert.match(judgeQualityExpectation({ budgetMax: 100000, budgetAny: false }).tier, /프리미엄형/);
  assert.match(judgeQualityExpectation({ budgetMax: 299999, budgetAny: false }).tier, /프리미엄형/);
  assert.match(judgeQualityExpectation({ budgetMax: 300000, budgetAny: false }).tier, /럭셔리형/);
});

test('judgeQualityExpectation: 예산 무관·0·null은 예산 무관 등급', () => {
  assert.equal(judgeQualityExpectation({ budgetMax: 500000, budgetAny: true }).tier, '예산 무관');
  assert.equal(judgeQualityExpectation({ budgetMax: 0, budgetAny: false }).tier, '예산 무관');
  assert.equal(judgeQualityExpectation({ budgetMax: null, budgetAny: false }).tier, '예산 무관');
});

test('judgeQualityExpectation: 문자열 숫자도 해석', () => {
  assert.match(judgeQualityExpectation({ budgetMax: '50000', budgetAny: false }).tier, /실속형/);
});

/* ===== judgeLetterVoice: 관계 → 말투 ===== */

test('judgeLetterVoice: 관계 유형별 말투 매핑', () => {
  assert.match(judgeLetterVoice('연인'), /애틋한 말투/);
  assert.match(judgeLetterVoice('친구'), /친근한 반말/);
  assert.match(judgeLetterVoice('엄마'), /존경과 감사/);
  assert.match(judgeLetterVoice('회사 상사'), /격식 있는 존댓말/);
  assert.match(judgeLetterVoice('직장 동료'), /정중한 존댓말/);
});

test('judgeLetterVoice: "여자친구"는 친구가 아니라 연인으로 판정 (우선순위 경계)', () => {
  assert.match(judgeLetterVoice('여자친구'), /애틋한 말투/);
  assert.match(judgeLetterVoice('남자친구'), /애틋한 말투/);
});

test('judgeLetterVoice: 미매칭·빈값·null은 기본 존댓말 지침', () => {
  assert.match(judgeLetterVoice('옆집 이웃'), /예의 바른 존댓말/);
  assert.match(judgeLetterVoice(''), /예의 바른 존댓말/);
  assert.match(judgeLetterVoice(null), /예의 바른 존댓말/);
});

/* ===== judgeLetterMood: 목적 → 감정 결 ===== */

test('judgeLetterMood: 목적 유형별 감정 결 매핑', () => {
  assert.match(judgeLetterMood('생일'), /생일 축하/);
  assert.match(judgeLetterMood('200일 기념'), /기념일 축하/);
  assert.match(judgeLetterMood('승진 축하'), /성취 축하/);
  assert.match(judgeLetterMood('병문안 위로'), /위로와 응원/);
  assert.match(judgeLetterMood('미안해서'), /사과/);
});

test('judgeLetterMood: 미입력·공백은 생일 축하 기본값', () => {
  assert.match(judgeLetterMood(''), /생일 축하 편지로 쓴다/);
  assert.match(judgeLetterMood('   '), /생일 축하 편지로 쓴다/);
  assert.match(judgeLetterMood(null), /생일 축하 편지로 쓴다/);
});

test('judgeLetterMood: 미매칭 목적은 원문을 담아 해석 위임', () => {
  const mood = judgeLetterMood('이사 인사');
  assert.match(mood, /이사 인사/);
  assert.match(mood, /해석/);
});

/* ===== buildUserPrompt: 프롬프트 조립 ===== */

const PROMPT_BASE = {
  recipientName: '민지', gender: '여성', relationship: '친구', purpose: '생일',
  recipientInfo: '', budgetMin: 30000, budgetMax: 50000, budgetAny: false,
  quality: judgeQualityExpectation({ budgetMax: 50000, budgetAny: false }),
  summary: '', recent: '대화 내용', note: '',
};

test('buildUserPrompt: 예산 범위와 퀄리티 기대치가 포함된다', () => {
  const prompt = buildUserPrompt(PROMPT_BASE);
  assert.match(prompt, /30,000원 ~ 50,000원/);
  assert.match(prompt, /실속형/);
  assert.match(prompt, /\[편지 톤 지침\]/);
});

test('buildUserPrompt: 예산 무관이면 금액 대신 예산 무관 표기', () => {
  const prompt = buildUserPrompt({ ...PROMPT_BASE, budgetAny: true, quality: judgeQualityExpectation({ budgetAny: true }) });
  assert.match(prompt, /예산 범위: 예산 무관/);
});

test('buildUserPrompt: 빈 입력은 미입력 문구로 방어 (예외 케이스)', () => {
  const prompt = buildUserPrompt({ ...PROMPT_BASE, recipientName: '', purpose: '', recent: '' });
  assert.match(prompt, /받는 사람: \(미입력\)/);
  assert.match(prompt, /\(대화 텍스트 없음\)/);
});

/* ===== sanitizeResult: 민감 내용 교체 ===== */

// 테스트용 결과 객체를 만든다 (호출마다 새로 생성 — sanitizeResult가 원본을 수정하므로)
function makeResult() {
  return {
    analysis: '정치 성향 분석',
    top3: [
      { name: '선물A', price: '30,000원', evidence: '근거A' },
      { name: '선물B', price: '40,000원', evidence: '근거B' },
      { name: '선물C', price: '50,000원', evidence: '근거C' },
    ],
    forbidden: { name: '금지선물', reason: '이유' },
    letter: '민감한 편지',
  };
}

const CLEAN_VERDICT = { analysis: false, letter: false, forbidden: false, top3: [false, false, false] };

test('sanitizeResult: 민감 없음이면 아무것도 바꾸지 않고 빈 목록 반환', () => {
  const result = makeResult();
  const replaced = sanitizeResult(result, CLEAN_VERDICT, '민지');
  assert.deepEqual(replaced, []);
  assert.equal(result.top3[0].name, '선물A');
  assert.equal(result.letter, '민감한 편지');
});

test('sanitizeResult: 민감 카드만 안전 선물로 교체하고 가격은 유지', () => {
  const result = makeResult();
  const replaced = sanitizeResult(result, { ...CLEAN_VERDICT, top3: [false, true, false] }, '민지');
  assert.deepEqual(replaced, ['top3[1]']);
  assert.equal(result.top3[1].name, SAFE_GIFT.name);
  assert.equal(result.top3[1].price, '40,000원'); // 예산 검증을 통과한 가격 유지
  assert.equal(result.top3[0].name, '선물A');     // 다른 카드는 그대로
  assert.equal(result.top3.length, 3);            // 카드 3개 유지 (SC-004)
});

test('sanitizeResult: 편지 교체 시 받는 사람 이름이 들어간다', () => {
  const result = makeResult();
  sanitizeResult(result, { ...CLEAN_VERDICT, letter: true }, '민지');
  assert.match(result.letter, /^민지님께\./);
});

test('sanitizeResult: 이름이 없으면 호칭 없이 안전 편지로 교체', () => {
  const result = makeResult();
  sanitizeResult(result, { ...CLEAN_VERDICT, letter: true }, '');
  assert.match(result.letter, /^늘 고마운 마음/);
});

test('sanitizeResult: 모든 필드 민감이면 전부 교체하고 목록에 기록', () => {
  const result = makeResult();
  const replaced = sanitizeResult(result, { analysis: true, letter: true, forbidden: true, top3: [true, true, true] }, '민지');
  assert.deepEqual(replaced, ['analysis', 'forbidden', 'letter', 'top3[0]', 'top3[1]', 'top3[2]']);
  assert.notEqual(result.analysis, '정치 성향 분석');
});

test('sanitizeResult: top3가 배열이 아니어도 예외 없이 동작 (예외 케이스)', () => {
  const result = { analysis: 'x', top3: null, forbidden: null, letter: 'y' };
  assert.doesNotThrow(() => sanitizeResult(result, { ...CLEAN_VERDICT, forbidden: true }, ''));
});

/* ===== isTrustedPurchaseUrl: 구매 링크 신뢰 판정 ===== */

test('isTrustedPurchaseUrl: 주요 커머스 도메인은 신뢰', () => {
  assert.equal(isTrustedPurchaseUrl('https://www.coupang.com/vp/products/123'), true);
  assert.equal(isTrustedPurchaseUrl('https://smartstore.naver.com/shop/products/1'), true);
  assert.equal(isTrustedPurchaseUrl('https://www.ssg.com/item/itemView.ssg?itemId=1'), true);
  assert.equal(isTrustedPurchaseUrl('https://gift.kakao.com/product/1'), true);
});

test('isTrustedPurchaseUrl: 중고 거래 플랫폼은 거부', () => {
  assert.equal(isTrustedPurchaseUrl('https://www.daangn.com/articles/123'), false);
  assert.equal(isTrustedPurchaseUrl('https://m.bunjang.co.kr/products/123'), false);
  assert.equal(isTrustedPurchaseUrl('https://web.joongna.com/product/123'), false);
});

test('isTrustedPurchaseUrl: 미등록 도메인·비정상 URL은 거부 (경계)', () => {
  assert.equal(isTrustedPurchaseUrl('https://unknown-mall.co.kr/item/1'), false);
  assert.equal(isTrustedPurchaseUrl('http://coupang.com.evil.io/item'), false); // 도메인 위장
  assert.equal(isTrustedPurchaseUrl('ftp://coupang.com/item'), false);
  assert.equal(isTrustedPurchaseUrl(''), false);
  assert.equal(isTrustedPurchaseUrl(null), false);
});

test('isTrustedPurchaseUrl: 네이버는 쇼핑 하위 도메인만 허용', () => {
  assert.equal(isTrustedPurchaseUrl('https://search.shopping.naver.com/catalog/1'), true);
  assert.equal(isTrustedPurchaseUrl('https://cafe.naver.com/joonggonara/123'), false); // 카페 중고글 차단
  assert.equal(isTrustedPurchaseUrl('https://blog.naver.com/user/223'), false);
});

/* ===== enforceProductPolicy: 상품 정책 강제 ===== */

// 정책 테스트용 카드 3장 결과를 만든다 (호출마다 새로 생성)
function makePolicyResult() {
  return {
    top3: [
      { name: '새 텀블러', detail: '새 제품', reason: '실용적', price: '30,000원', url: 'https://www.coupang.com/vp/1', store: '쿠팡' },
      { name: '캠핑 랜턴 (중고 A급)', detail: '사용감 적음', reason: '캠핑 취향', price: '40,000원', url: 'https://www.coupang.com/vp/2', store: '쿠팡' },
      { name: '커피 그라인더', detail: '새 제품', reason: '홈카페', price: '50,000원', url: 'https://unknown-mall.co.kr/1', store: '알수없는몰' },
    ],
  };
}

test('enforceProductPolicy: 중고성 상품은 안전 선물로 교체하고 카드 3개 유지', () => {
  const result = makePolicyResult();
  const actions = enforceProductPolicy(result);
  assert.equal(result.top3.length, 3);
  assert.equal(result.top3[1].name, SAFE_GIFT.name);
  assert.equal(result.top3[1].price, '40,000원'); // 가격대 유지
  assert.ok(actions.some((a) => a.includes('top3[1]') && a.includes('중고')));
});

test('enforceProductPolicy: 비신뢰 링크는 링크만 제거하고 상품은 유지', () => {
  const result = makePolicyResult();
  enforceProductPolicy(result);
  assert.equal(result.top3[2].name, '커피 그라인더'); // 상품 유지
  assert.equal(result.top3[2].url, '');              // 링크 제거 → 클라이언트가 검색 링크로 폴백
  assert.equal(result.top3[2].store, '');
});

test('enforceProductPolicy: 정상 카드는 건드리지 않는다', () => {
  const result = makePolicyResult();
  enforceProductPolicy(result);
  assert.equal(result.top3[0].url, 'https://www.coupang.com/vp/1');
  assert.equal(result.top3[0].store, '쿠팡');
});

test('enforceProductPolicy: 리퍼·전시 상품 표현도 검출한다', () => {
  const result = { top3: [{ name: '스피커 리퍼비시 특가', detail: '', reason: '', price: '', url: '', store: '' }] };
  const actions = enforceProductPolicy(result);
  assert.equal(result.top3[0].name, SAFE_GIFT.name);
  assert.equal(actions.length, 1);
});

test('enforceProductPolicy: top3가 없거나 배열이 아니어도 예외 없이 동작 (예외 케이스)', () => {
  assert.doesNotThrow(() => enforceProductPolicy({}));
  assert.doesNotThrow(() => enforceProductPolicy({ top3: null }));
  assert.deepEqual(enforceProductPolicy({ top3: null }), []);
});
