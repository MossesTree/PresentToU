// PresentToU — 케이스 반복 실행기 (성공률 측정)
// 같은 골든셋 케이스를 k번 생성·심사해 실행별 점수와 성공률(4점 이상 비율)을 집계한다.
// LLM 출력의 비결정성 때문에 1회 결과만으로는 안정성을 알 수 없어, 반복 통과율로 본다.
//
// 사용법: node eval/repeat.js <케이스ID> [k]
//   예:   node eval/repeat.js F1-Q1 5
//   케이스ID 목록은 eval/run-golden.js 의 CASES 참고 (F1-Q1 ~ F5-Q5)

import { CASES, runCase } from './run-golden.js';

/* ===== 상수/설정 ===== */

const PASS_SCORE = 4;    // 성공 기준 점수
const DEFAULT_K = 5;     // 기본 반복 횟수
const CONCURRENCY = 2;   // 동시 실행 수 (웹검색 호출량 보호)

/* ===== 실행 ===== */

// k개의 반복 실행을 동시 CONCURRENCY개씩 돌린다
async function runRepeats(apiKey, testCase, k) {
  const results = new Array(k);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (nextIndex < k) {
      const i = nextIndex++;
      results[i] = await runCase(apiKey, testCase);
      const r = results[i];
      const label = r.error ? `오류(${r.error.slice(0, 60)})` : `${r.verdict.score}점`;
      console.log(`[실행 ${i + 1}/${k}] ${label} (${Math.round(r.ms / 1000)}초)`);
    }
  }));
  return results;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('환경변수 OPENAI_API_KEY가 필요합니다.');
    process.exit(1);
  }

  const caseId = process.argv[2];
  const k = Math.max(1, Number(process.argv[3]) || DEFAULT_K);
  const testCase = CASES.find((c) => c.id === caseId);
  if (!testCase) {
    console.error(`케이스 ID를 찾을 수 없습니다: ${caseId || '(미입력)'}`);
    console.error(`사용법: node eval/repeat.js <케이스ID> [k]  — 사용 가능 ID: ${CASES.map((c) => c.id).join(', ')}`);
    process.exit(1);
  }

  console.log(`■ ${testCase.title} — ${k}회 반복 실행 (성공 기준 ${PASS_SCORE}점 이상)\n`);
  const results = await runRepeats(apiKey, testCase, k);

  // 집계: 실행별 표 + 성공률
  const judged = results.filter((r) => r.verdict);
  const passed = judged.filter((r) => r.verdict.score >= PASS_SCORE);
  const errored = results.filter((r) => r.error);

  console.log('\n| 실행 | 점수 | 판정 | 미충족/오류 |');
  console.log('|------|------|------|--------------|');
  results.forEach((r, i) => {
    const score = r.verdict ? `${r.verdict.score}` : '-';
    const pass = r.error ? '오류' : (r.verdict.score >= PASS_SCORE ? '✅ PASS' : '❌ FAIL');
    const note = r.error ? r.error.slice(0, 80) : (r.verdict.unmet.join(' / ').slice(0, 100) || '');
    console.log(`| ${i + 1} | ${score} | ${pass} | ${note} |`);
  });

  const successRate = Math.round((passed.length / k) * 100);
  const avg = judged.length ? (judged.reduce((sum, r) => sum + r.verdict.score, 0) / judged.length).toFixed(2) : '-';
  console.log(`\n성공률: ${passed.length}/${k} (${successRate}%) · 평균 ${avg}점 · 실행 오류 ${errored.length}건`);
  console.log(`점수 분포: ${[5, 4, 3, 2, 1].map((s) => `${s}점×${judged.filter((r) => r.verdict.score === s).length}`).join(', ')}`);
}

main().catch((error) => {
  console.error(`반복 실행 실패: ${error.message}`);
  process.exit(1);
});
