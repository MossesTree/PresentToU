# PRD 품질 체크리스트 — presen2U

**목적**: PRD(요구사항) 자체가 명확·완전·측정 가능·모호하지 않게 작성됐는지 검증한다. (구현이 동작하는지 검사하는 것이 아님 — "영어로 쓴 요구사항의 단위 테스트")
**생성일**: 2026-07-13
**대상 문서**: `../PRD.md`

## 문제 정의 품질 (Problem Clarity)

- [ ] CHK001 - 문제 진술이 대상·상황·막히는 원인을 포함해 한 문장으로 특정되는가? [Clarity, PRD §1]
- [ ] CHK002 - "선택지 과잉"과 "취향 정보 부족" 두 원인의 인과가 명시돼 있는가? [Completeness, PRD §1]

## 타깃 & 유저 스토리 품질 (Target & User Story)

- [ ] CHK003 - 타깃이 '모두'가 아니라 관찰 가능한 세그먼트로 좁혀졌는가? [Clarity, PRD §2]
- [ ] CHK004 - 유저 스토리가 As-a / I-want / so-that 형식을 갖추었는가? [Completeness, PRD §2]
- [ ] CHK005 - 유저 스토리에 수령자(선물 받는 사람) 맥락이 반영돼 있는가? [Coverage, PRD §2]

## 핵심 기능 & Flow 품질 (Core Flow)

- [ ] CHK006 - 핵심 기능이 단일 flow(입력→출력)로 좁혀져 문서화됐는가? [Completeness, PRD §3]
- [ ] CHK007 - 입력(질문 수·항목)과 출력(카드 구성 요소)이 구체적으로 정의됐는가? [Clarity, PRD §3]
- [ ] CHK008 - 'wow' 지점(왜 기존 방식보다 나은가)이 요구사항에 드러나는가? [Measurability, PRD §3]

## 비목표 정의 (Non-Goals)

- [ ] CHK009 - 만들지 않는 범위가 열거됐는가(회원가입·연동·결제 등)? [Completeness, PRD §4]
- [ ] CHK010 - 비목표가 핵심 flow와 충돌 없이 경계로 작동하는가? [Consistency, PRD §4]

## 성공 기준 / 수용 기준 품질 (Acceptance Criteria)

- [ ] CHK011 - 각 성공 지표가 측정 시작~종료 시점으로 정의됐는가? [Measurability, PRD §5]
- [ ] CHK012 - 비율 지표의 분모(무엇 대비)가 명시됐는가? [Clarity, PRD §5]
- [ ] CHK013 - 데모 표본 크기(n) 등 통계적 유효 조건이 명시됐는가? [Gap, PRD §5]

## 모호어 & 용어 정의 (Ambiguity Removal)

- [ ] CHK014 - "실패하지 않을 선물"이 조작적 정의로 대체됐는가? [Ambiguity, PRD §6]
- [ ] CHK015 - "빠르게/편하게/예쁘게/잘" 등 정성 모호어가 잔존하지 않는가? [Ambiguity, PRD 전체]
- [ ] CHK016 - "1분 안에"가 특정 측정 정의와 연결돼 있는가? [Consistency, PRD §5, §6]
