// PresentToU — LLM-as-judge 골든셋 심사기 (Node 18+, 외부 의존성 없음)
//
// 골든셋(specs/001-present-to-u/golden-set.md)의 합격 기준을 루브릭(1~5점)으로
// 심사하고 판정 근거를 남긴다. 생성 모델과 심사 모델이 같으면 자기 채점 편향이
// 생길 수 있으니, 가능하면 OPENAI_JUDGE_MODEL로 생성과 다른 모델을 지정한다.
//
// 사용법:
//   node eval/judge.js eval/sample-case.json      # 단일 케이스 심사
//   node eval/judge.js eval/cases                 # 폴더 안 *.json 전부 심사
//
// 환경변수:
//   OPENAI_API_KEY      (필수) OpenAI API 키
//   OPENAI_JUDGE_MODEL  (선택) 심사 모델. 기본 gpt-4o-mini
//
// 케이스 파일 형식(JSON) — eval/sample-case.json 참고:
//   {
//     "title":    "F3-Q1 예산 1~2만원 센스형",
//     "input":    "심사에 필요한 입력 요약 (대화 특징, 예산, 관계, 목적 등)",
//     "criteria": ["이 케이스가 충족해야 할 기준", "..."],
//     "output":   { ...recommend API 응답 JSON 원본... }
//   }

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/* ===== 1. 상수/설정 ===== */

const JUDGE_MODEL = process.env.OPENAI_JUDGE_MODEL || 'gpt-4o-mini';

// gpt-5 계열은 temperature 조정을 지원하지 않아 파라미터를 생략한다 (api/recommend.js와 동일한 방어)
const SUPPORTS_TEMPERATURE = !JUDGE_MODEL.startsWith('gpt-5');

// 모든 케이스에 기본으로 얹는 공통 기준 — golden-set.md의 "공통 합격 기준"과 동일하게 유지한다
const COMMON_CRITERIA = [
  '추천 카드(top3)가 정확히 3개다',
  '분석·추천 이유·근거가 자연스러운 한국어 존댓말이다 (편지만 관계에 따라 반말 허용)',
  '성적·정치적·종교적·혐오 표현이 없다',
  '입력에 없는 사실을 근거(evidence)로 지어내지 않았다',
];

const RUBRIC = `5점: 모든 심사 기준을 충족하고 공통 기준 위반이 없다
4점: 핵심 기준은 모두 충족하나 사소한 흠(어색한 표현, 경미한 형식 문제)이 1~2개 있다
3점: 기준 일부를 충족하지 못했지만 출력 자체는 사용자에게 보여줄 수 있는 수준이다
2점: 핵심 기준을 다수 충족하지 못해 그대로 내보내기 어렵다
1점: 치명적 위반이 있다 (카드가 3개가 아님, 민감 내용 노출, 지어낸 근거, 명백한 예산 초과 등)`;

const JUDGE_SYSTEM_PROMPT = `너는 선물 추천 서비스의 품질 심사관이야. 주어진 [심사 기준]과 [루브릭]만을 근거로 [서비스 출력]을 심사해.

[판정 원칙]
- 심사 기준에 적힌 것만 본다. 기준에 없는 개인 취향으로 감점하지 마라.
- 먼저 기준 하나하나를 충족/미충족으로 가른 뒤, 그 결과에 맞는 루브릭 점수 하나를 골라라.
- rationale에는 어떤 기준을 왜 충족/위반했는지, 출력의 실제 문구를 짧게 인용해 구체적으로 써라.
- 확신이 없으면 관대한 쪽이 아니라 낮은 점수 쪽을 골라라 (심사는 보수적으로).

다른 텍스트 없이 아래 JSON만 출력해라.
{ "score": 1~5 정수, "rationale": "판정 근거 2~4문장", "met": ["충족한 기준"], "unmet": ["미충족 기준"] }`;

/* ===== 2. 순수 함수 ===== */

// 케이스 정보를 심사용 사용자 프롬프트 한 덩어리로 조립한다
function buildJudgePrompt({ title, input, criteria, output }) {
  const allCriteria = [...COMMON_CRITERIA, ...(Array.isArray(criteria) ? criteria : [])];
  return `[케이스] ${title || '(제목 없음)'}

[입력 요약]
${input || '(입력 요약 없음)'}

[심사 기준]
${allCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

[루브릭]
${RUBRIC}

[서비스 출력]
${JSON.stringify(output, null, 2)}`;
}

// 모델 응답을 { score, rationale, met, unmet } 형태로 정규화한다 (점수는 1~5 정수로 강제)
function normalizeVerdict(raw) {
  const score = Math.min(5, Math.max(1, Math.round(Number(raw.score) || 1)));
  return {
    score,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
    met: Array.isArray(raw.met) ? raw.met : [],
    unmet: Array.isArray(raw.unmet) ? raw.unmet : [],
  };
}

/* ===== 3. 심사 함수 ===== */

// 루브릭 기준으로 서비스 출력을 1~5점 심사한다
// (apiKey, { title, input, criteria, output }) → { score, rationale, met, unmet }
export async function judgeWithRubric(apiKey, testCase) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      messages: [
        { role: 'system', content: JUDGE_SYSTEM_PROMPT },
        { role: 'user', content: buildJudgePrompt(testCase) },
      ],
      // 심사는 재현성이 중요하므로 온도를 0으로 고정한다
      ...(SUPPORTS_TEMPERATURE ? { temperature: 0 } : {}),
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`심사 API 오류 (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('심사 응답이 비어 있습니다.');
  return normalizeVerdict(JSON.parse(content));
}

/* ===== 4. CLI ===== */

// 인자가 파일이면 그 파일 하나, 폴더면 안의 *.json 전부를 케이스로 읽는다
function loadCases(target) {
  const stats = statSync(target);
  const files = stats.isDirectory()
    ? readdirSync(target).filter((name) => name.endsWith('.json')).map((name) => join(target, name))
    : [target];
  return files.map((file) => ({ file, data: JSON.parse(readFileSync(file, 'utf8')) }));
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('환경변수 OPENAI_API_KEY가 필요합니다.');
    process.exit(1);
  }
  const target = process.argv[2];
  if (!target) {
    console.error('사용법: node eval/judge.js <케이스.json | 케이스 폴더>');
    process.exit(1);
  }

  const cases = loadCases(target);
  let lowScoreCount = 0;

  for (const { file, data } of cases) {
    const verdict = await judgeWithRubric(apiKey, data);
    if (verdict.score <= 3) lowScoreCount += 1;
    console.log(`\n■ ${data.title || file} — ${verdict.score}점 (모델: ${JUDGE_MODEL})`);
    console.log(`  근거: ${verdict.rationale}`);
    if (verdict.unmet.length) console.log(`  미충족: ${verdict.unmet.join(' / ')}`);
  }

  console.log(`\n총 ${cases.length}건 심사 완료 — 3점 이하 ${lowScoreCount}건`);
  // 3점 이하가 하나라도 있으면 실패 코드로 종료해 스크립트 연동(CI 등)에서 감지할 수 있게 한다
  if (lowScoreCount > 0) process.exit(1);
}

// node로 직접 실행했을 때만 CLI 동작 (import 시에는 실행하지 않는다)
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`심사 실패: ${error.message}`);
    process.exit(1);
  });
}
