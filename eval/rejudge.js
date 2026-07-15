// PresentToU — 저장된 출력 재심사기
// eval/outputs/*.json 에 저장된 서비스 출력을 (재생성 없이) 다시 심사한다.
// 심사 모델만 바꿔 다시 채점할 때 사용한다.
//
// 사용법: OPENAI_JUDGE_MODEL=<모델> node eval/rejudge.js

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { judgeWithRubric } from './judge.js';

const PASS_SCORE = 4;
const OUTPUT_DIR = 'eval/outputs';

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('환경변수 OPENAI_API_KEY가 필요합니다.');
    process.exit(1);
  }

  const files = readdirSync(OUTPUT_DIR).filter((name) => name.endsWith('.json')).sort();
  const results = [];
  for (const file of files) {
    const saved = JSON.parse(readFileSync(join(OUTPUT_DIR, file), 'utf8'));
    if (!saved.output) { results.push({ id: saved.id, error: saved.error }); continue; }
    const verdict = await judgeWithRubric(apiKey, saved);
    results.push({ id: saved.id, title: saved.title, verdict });
    console.log(`${saved.id} — ${verdict.score}점${verdict.unmet.length ? ' | 미충족: ' + verdict.unmet.join(' / ') : ''}`);
    // 재심사 결과를 원본 파일에 함께 남긴다
    saved.rejudge = { model: process.env.OPENAI_JUDGE_MODEL || 'gpt-4o-mini', verdict };
    writeFileSync(join(OUTPUT_DIR, file), JSON.stringify(saved, null, 2), 'utf8');
  }

  const judged = results.filter((r) => r.verdict);
  const passed = judged.filter((r) => r.verdict.score >= PASS_SCORE);
  console.log(`\n재심사 완료 — 통과 ${passed.length}/${results.length} (${Math.round((passed.length / results.length) * 100)}%), 평균 ${(judged.reduce((s, r) => s + r.verdict.score, 0) / judged.length).toFixed(2)}점 (모델: ${process.env.OPENAI_JUDGE_MODEL || 'gpt-4o-mini'})`);
}

main().catch((error) => {
  console.error(`재심사 실패: ${error.message}`);
  process.exit(1);
});
