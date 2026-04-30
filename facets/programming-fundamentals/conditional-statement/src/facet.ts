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

import type { FacetJson } from '@facet/core/runtime';

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
