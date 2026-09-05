/**
 * Conditional Statement facet JSON 선언.
 *
 * 진행 모델: 정적 + 입력 반응형 (ReactiveMechanism). 시간 축 없이 입력값
 * 슬라이더가 평가 마름모의 응결과 활성 가지를 직접 흔든다.
 *
 * 컨트롤바 어휘 (기획 §6 §8):
 *   [ mode-toggle (2갈래/3갈래) ] [ auto-demo ] [ reset ]
 *
 * 슬라이더 자체는 view 가 SVG 인-스테이지로 그려 dispatch 채널에 직접 송신.
 *
 * 도식 규칙 (학습 단순화) — `value >= threshold` 사슬:
 *   2갈래: 값 ≥ 50 → 덥다 / 그 외 → 시원하다 (초기 70 → "덥다")
 *   3갈래: 값 ≥ 80 → 뜨겁다 / 값 ≥ 50 → 따뜻하다 / 그 외 → 시원하다
 *          (초기 70 → "따뜻하다", 모드 전환 시 첫 가지가 켜지는 인상은 70 에서도
 *           유지되지 않으므로 auto-demo 로 모든 가지 점등을 한 번 보여준다.)
 *
 * 식별자 (C1): `flow:` `diamond:` `branch:` `block:` `merge:` 명시 prefix.
 */

import type { FacetJson } from '@ffacet/core/runtime';

export const conditionalStatementFacet: FacetJson = {
  id: 'facet:conditionalStatement',
  title: { en: 'If / Else If / Else', ko: '조건문 (if / else if / else)' },
  description: {
    en: 'A flow that hits a fork, evaluates each condition top-down, lights exactly one branch on the first true, and merges back into a single line',
    ko: '흐르던 길이 분기점에 도착해 조건의 참/거짓을 위에서부터 평가하다 처음 참이 된 한 가지에서 흐름이 확정되고, 나머지 가지는 어두워진 채 닫힌 뒤 다시 한 줄로 합쳐지는 약속',
  },
  algorithm: 'module:conditionalStatement',
  projector: 'module:conditionalStatementProjector',
  initialData: {
    type: 'conditional-statement',
    initialMode: 'two',
    initialValue: 70,
    rulesByMode: {
      two: {
        rules: [
          {
            diamondId: 'if',
            expr: '값 ≥ 50',
            threshold: 50,
            trueBranchId: 'then',
            trueBlockId: 'then',
            trueBlockLabel: '덥다',
          },
        ],
        else: { branchId: 'else', blockId: 'else', blockLabel: '시원하다' },
      },
      three: {
        rules: [
          {
            diamondId: 'if',
            expr: '값 ≥ 80',
            threshold: 80,
            trueBranchId: 'then',
            trueBlockId: 'then',
            trueBlockLabel: '뜨겁다',
          },
          {
            diamondId: 'elif',
            expr: '값 ≥ 50',
            threshold: 50,
            trueBranchId: 'elif-then',
            trueBlockId: 'elif-then',
            trueBlockLabel: '따뜻하다',
          },
        ],
        else: { branchId: 'else', blockId: 'else', blockLabel: '시원하다' },
      },
    },
    pulseMs: 220,
    autoDemoHoldMs: 1100,
    autoDemoValues: [90, 65, 25, 70],
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  messages: {
    'concept.line1': { en: 'A conditional is the promise that when running code', ko: '조건문은 흐르던 코드가 갈림길에 도착했을' },
    'concept.line2': { en: 'reaches a fork, it reads whether the current value is', ko: '때, 지금의 값이 참인지 거짓인지를 보고 갈래' },
    'concept.line3': { en: 'true or false and passes through exactly one branch.', ko: '중 단 한 길만 골라 통과하는 약속이에요. 고르' },
    'concept.line4': { en: 'The branch not taken is closed for this run — not a', ko: '지 않은 길은 이번 흐름에서는 닫혀 있어 단' },
    'concept.line5': { en: 'single line of it executes. Once the fork is over,', ko: '한 줄도 동작하지 않아요. 갈림길이 끝나면' },
    'concept.line6': { en: 'every path gathers back into one line and carries on', ko: '어느 길로 갔든 모두 다시 한 줄로 모여 다음' },
    'concept.line7': { en: 'into the code that follows.', ko: '코드로 이어집니다.' },
    'guide.line1': { en: 'Try moving the slider above. Watch the result', ko: '위쪽 슬라이더를 흔들어 보세요. 마름모에서' },
    'guide.line2': { en: 'condense again at the diamond, and the lit path and', ko: '결과가 다시 응결되고, 켜지는 길과 닫히는' },
    'guide.line3': { en: 'the closed one swap. A branch with a bar drawn', ko: '길이 바뀌는 모습을 보세요. 빗장이 그어진' },
    'guide.line4': { en: 'across it is the path that did not run this time.', ko: '가지는 이번에 동작하지 않은 길이에요.' },
    'label.concept': { en: 'concept', ko: '개념' },
    'label.false': { en: 'false', ko: '거짓' },
    'label.guide': { en: 'how to explore', ko: '학습자 안내' },
    'label.nextCode': { en: 'next code', ko: '다음 코드' },
    'label.references': { en: 'see also', ko: '참고' },
    'label.title': { en: 'Conditional — one beat of condensation', ko: '조건문 — 한 박자의 응결' },
    'label.true': { en: 'true', ko: '참' },
    'label.value': { en: 'value', ko: '값' },
    'caption.autoDemo': { en: 'Self-demonstration — the path changes with the value.', ko: '자동 시연 — 값에 따라 길이 바뀐다.' },
    'caption.base': { en: 'A conditional is the promise that when running code reaches a fork it reads whether the current value is true or false, passes through exactly one branch, and then gathers back into a single line.', ko: '조건문은 흐르던 코드가 갈림길에 도착했을 때, 지금의 값이 참인지 거짓인지를 보고 단 한 길만 골라 통과한 뒤 다시 한 줄로 모이는 약속이다.' },
    'caption.demoEnd': { en: 'Self-demonstration finished.', ko: '자동 시연 종료.' },
    'caption.ignoredInput': { en: 'Input ignored — {op}: {raw}', ko: '입력 무시 — {op}: {raw}' },
    'caption.threeWay': { en: 'Three ways — it unfolds as an if / else if / else chain.', ko: '3갈래 — if / else if / else 사슬로 펼쳐진다.' },
    'caption.twoWay': { en: 'Two ways — it folds into a single if / else diamond.', ko: '2갈래 — if / else 한 마름모로 합쳐진다.' },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'conditional-flowchart' },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'button',
          action: 'mode-toggle',
          label: { en: 'Branches: 2 / 3', ko: '갈래 2 / 3' },
        },
        { widget: 'button', action: 'auto-demo', label: { en: 'Auto demo', ko: '자동 시연' } },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화' } },
      ],
    },
  },
};
