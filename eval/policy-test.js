// 상품 정책 E2E 검증 — 실제 추천을 생성해 중고 상품·비신뢰 링크가 없는지 결정적으로 검사한다
// (LLM 심사가 아니라 규칙 검사이므로 판정이 흔들리지 않는다)
//
// 사용법: node --env-file=.env eval/policy-test.js [케이스ID ...]
//         (ID 생략 시 대표 5케이스 실행)

import { CASES, runCase } from './run-golden.js';
import { isTrustedPurchaseUrl } from '../api/_logic.js';

// 서버 가드와 동일한 중고 검출 기준으로 최종 출력을 재검사한다
const SECONDHAND_PATTERN = /중고|리퍼(?:비쉬드)?|refurb|전시\s?상품|반품\s?상품|스크래치\s?상품|B급/i;

// 웹검색으로 실제 URL이 자주 나오는 대표 케이스들
const DEFAULT_IDS = ['F1-Q1', 'F2-Q1', 'F3-Q2', 'F3-Q4', 'F5-Q5'];

// 카드 배열에 정책 위반이 있는지 검사한다 → 위반 목록
function findPolicyViolations(top3) {
  const violations = [];
  (top3 || []).forEach((gift, index) => {
    const text = [gift.name, gift.detail, gift.reason, gift.store].filter(Boolean).join(' ');
    if (SECONDHAND_PATTERN.test(text)) violations.push(`카드${index}: 중고성 표현 (${gift.name})`);
    if (gift.url && !isTrustedPurchaseUrl(gift.url)) violations.push(`카드${index}: 비신뢰 링크 (${gift.url.slice(0, 60)})`);
  });
  return violations;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('환경변수 OPENAI_API_KEY가 필요합니다.');
    process.exit(1);
  }
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_IDS;
  const targets = CASES.filter((c) => ids.includes(c.id));

  let failCount = 0;
  for (const testCase of targets) {
    const run = await runCase(apiKey, testCase);
    if (run.error) {
      console.log(`❌ ${testCase.id} — 실행 오류: ${run.error}`);
      failCount += 1;
      continue;
    }
    const violations = findPolicyViolations(run.output.top3);
    const links = (run.output.top3 || []).map((g) => (g.url ? new URL(g.url).hostname : '(링크 없음→검색 폴백)'));
    if (violations.length === 0) {
      console.log(`✅ ${testCase.id} — 위반 0건 | 판매처: ${links.join(', ')}`);
    } else {
      failCount += 1;
      console.log(`❌ ${testCase.id} — 위반 ${violations.length}건`);
      violations.forEach((v) => console.log(`   - ${v}`));
    }
  }

  console.log(`\n정책 검증 완료 — 위반 케이스 ${failCount}/${targets.length}건`);
  if (failCount > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`정책 검증 실패: ${error.message}`);
  process.exit(1);
});
