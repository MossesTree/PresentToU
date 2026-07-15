// PresentToU — LLM 출력 스냅샷 회귀 테스트 (Node 18+, 외부 의존성 없음)
//
// LLM 출력은 비결정적이라 문장 그대로 비교하면 매번 다르다. 대신 출력에서
// "지켜져야 할 구조적 불변식"을 투영(projection)으로 뽑아 스냅샷으로 저장하고,
// 이후 실행의 투영과 비교해 회귀(프롬프트·모델 변경으로 인한 동작 변화)를 감지한다.
//
// 사용법:
//   node eval/snapshot.js --update    # 기준 스냅샷 생성/갱신 (프롬프트를 의도적으로 바꾼 뒤 실행)
//   node eval/snapshot.js             # 현재 출력을 기준 스냅샷과 비교 → 드리프트 감지 시 종료 코드 1
//
// 스냅샷 저장: eval/snapshots/<케이스ID>.json (비교 실패 시 최신 출력은 <케이스ID>.latest.json)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { CASES, runCase } from './run-golden.js';

/* ===== 1. 상수/설정 ===== */

// 기능 영역별 대표 1케이스씩 스냅샷 대상으로 고정한다 (전수 실행은 비용이 커서 대표만)
const SNAPSHOT_IDS = ['F1-Q1', 'F2-Q2', 'F3-Q1', 'F4-Q1', 'F5-Q4'];
const SNAPSHOT_DIR = 'eval/snapshots';

// 실행마다 흔들려도 회귀로 보지 않는 수치 필드의 허용 오차
// budgetViolations는 모델 특성상 0~1 사이를 오가서 1까지 허용한다 (2 이상 벌어지면 회귀)
const TOLERANCE = { letterSentenceCount: 2, budgetViolations: 1 };

/* ===== 2. 투영(projection) — 출력에서 결정적 불변식만 추출 ===== */

// 가격 문자열에서 1,000 이상 숫자만 뽑는다 (예: "30,000원 ~ 45,000원" → [30000, 45000])
function parsePrices(priceText) {
  const matches = String(priceText || '').match(/[\d,]+/g) || [];
  return matches.map((m) => Number(m.replace(/,/g, ''))).filter((n) => n >= 1000);
}

// 편지의 격식 수준을 어림 판정한다 — 존댓말 어미(요/니다)가 2회 이상이면 formal
function speechLevel(letter) {
  const formalEndings = (String(letter || '').match(/(요|니다)[.!?~♥]?(\s|$)/g) || []).length;
  return formalEndings >= 2 ? 'formal' : 'casual';
}

// 서비스 출력 → 비교 가능한 구조적 투영
// 카드 순서가 실행마다 바뀌므로 인덱스별 비교 대신 "항상 지켜져야 할 불변식"의 집계로 남긴다
export function projectOutput(output, body) {
  const top3 = Array.isArray(output.top3) ? output.top3 : [];

  // 서비스의 fitScore 상한 규칙(normalizeFitScore)과 동일한 기준으로 근거 부재를 판정한다
  const lacksEvidence = (gift) => !String(gift.evidence || '').trim()
    || String(gift.evidence).includes('확인하지 못했습니다');

  return {
    top3Count: top3.length,
    // 모든 카드가 이름·이모지·취향 신호를 갖췄는지 (렌더링 필수 필드)
    allCardsComplete: top3.every((gift) =>
      Boolean(gift.name && String(gift.name).trim()) && Boolean(gift.emoji)
      && Array.isArray(gift.signals) && gift.signals.length >= 1),
    // 규칙 불변식: 근거 없는 카드가 fitScore 65를 초과하면 위반 (항상 0이어야 한다)
    fitScoreCapViolations: top3.filter((gift) => lacksEvidence(gift) && Number(gift.fitScore) > 65).length,
    // 예산 지정 케이스에서 파싱된 가격이 범위를 벗어난 카드 수 (0~1은 허용 오차, 늘어나면 회귀)
    budgetViolations: (!body.budgetAny && body.budgetMin)
      ? top3.filter((gift) => {
          const prices = parsePrices(gift.price);
          return prices.length && !prices.every((p) => p >= body.budgetMin && p <= body.budgetMax);
        }).length
      : 0,
    hasForbidden: Boolean(output.forbidden && output.forbidden.name),
    hasLetter: Boolean(output.letter && String(output.letter).trim()),
    letterSentenceCount: (String(output.letter || '').match(/[.!?](\s|$)/g) || []).length,
    letterSpeech: speechLevel(output.letter),
    hasAnalysis: Boolean(output.analysis && String(output.analysis).trim()),
  };
}

/* ===== 3. 비교 — 투영끼리의 차이(드리프트) 목록 생성 ===== */

// 기준(baseline)과 현재(current) 투영을 재귀 비교해 차이 목록을 반환한다
export function diffProjection(baseline, current, path = '') {
  const diffs = [];
  const keys = new Set([...Object.keys(baseline || {}), ...Object.keys(current || {})]);
  for (const key of keys) {
    const p = path ? `${path}.${key}` : key;
    const b = baseline?.[key];
    const c = current?.[key];
    if (Array.isArray(b) || Array.isArray(c)) {
      const len = Math.max(b?.length || 0, c?.length || 0);
      for (let i = 0; i < len; i += 1) diffs.push(...diffProjection(b?.[i] || {}, c?.[i] || {}, `${p}[${i}]`));
    } else if (typeof b === 'object' && b !== null) {
      diffs.push(...diffProjection(b, c, p));
    } else if (typeof b === 'number' && typeof c === 'number' && TOLERANCE[key]) {
      if (Math.abs(b - c) > TOLERANCE[key]) diffs.push({ path: p, baseline: b, current: c });
    } else if (b !== c) {
      diffs.push({ path: p, baseline: b, current: c });
    }
  }
  return diffs;
}

/* ===== 4. 실행 흐름 ===== */

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('환경변수 OPENAI_API_KEY가 필요합니다.');
    process.exit(1);
  }
  const updateMode = process.argv.includes('--update');
  mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const targets = CASES.filter((c) => SNAPSHOT_IDS.includes(c.id));
  let driftCount = 0;

  for (const testCase of targets) {
    const snapshotPath = `${SNAPSHOT_DIR}/${testCase.id}.json`;
    console.log(`\n■ ${testCase.title}`);

    const run = await runCase(apiKey, testCase);
    if (run.error) {
      console.log(`  실행 오류: ${run.error}`);
      driftCount += 1;
      continue;
    }
    const projection = projectOutput(run.output, testCase.body);

    if (updateMode || !existsSync(snapshotPath)) {
      // 기준 스냅샷 저장 (투영 + 사람이 대조할 원본)
      writeFileSync(snapshotPath, JSON.stringify({
        id: testCase.id, title: testCase.title, savedAt: new Date().toISOString(),
        projection, rawOutput: run.output,
      }, null, 2), 'utf8');
      console.log(`  기준 스냅샷 저장 → ${snapshotPath}`);
      continue;
    }

    // 비교 모드: 기준 투영과 현재 투영의 차이를 본다
    const baseline = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    const diffs = diffProjection(baseline.projection, projection);
    if (diffs.length === 0) {
      console.log('  ✅ 드리프트 없음 — 기준 스냅샷과 구조적으로 동일');
    } else {
      driftCount += 1;
      console.log(`  ⚠️ 드리프트 ${diffs.length}건 감지:`);
      for (const d of diffs) console.log(`    - ${d.path}: 기준=${JSON.stringify(d.baseline)} → 현재=${JSON.stringify(d.current)}`);
      // 사람이 원문을 대조할 수 있게 최신 출력을 따로 남긴다
      const latestPath = `${SNAPSHOT_DIR}/${testCase.id}.latest.json`;
      writeFileSync(latestPath, JSON.stringify({ projection, rawOutput: run.output }, null, 2), 'utf8');
      console.log(`    최신 출력 저장 → ${latestPath}`);
    }
  }

  if (!updateMode) {
    console.log(`\n스냅샷 비교 완료 — 드리프트 ${driftCount}/${targets.length}건`);
    if (driftCount > 0) process.exit(1); // CI 연동: 드리프트가 있으면 실패
  } else {
    console.log(`\n기준 스냅샷 ${targets.length}건 저장 완료`);
  }
}

main().catch((error) => {
  console.error(`스냅샷 테스트 실패: ${error.message}`);
  process.exit(1);
});
