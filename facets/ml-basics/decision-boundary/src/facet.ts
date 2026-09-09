/**
 * 결정 경계 facet JSON 선언.
 *
 * @piece — 질문 하나에 답하고 멈추는 조각 (S-piece).
 *
 * 질문: 확률로 답하는 모델은 어디서 "이쪽" 과 "저쪽" 을 가르는가.
 *
 * 선언이 담는 것은 구조뿐이다 — 고정된 무게와 치우침, 점 여덟, 질문을 던지는
 * 입력 공간의 범위, 격자 해상도. z 도 p 도 경계선의 자리도 여기 없다. 그것은
 * 전부 파생값이라 algorithm 이 셈하고, 좌표는 stage 가 캔버스에서 역산한다.
 *
 * 무게 (1, 1) 과 치우침 −5.5 는 학습의 결과가 아니라 주어진 것이다. 이 조각은
 * 학습을 보이지 않는다 — 이미 정해진 모델이 평면을 어떻게 가르는지만 보인다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

/** 점 여덟. 아래쪽 넷과 위쪽 넷이지만 조각은 그 이름표를 화면에 쓰지 않는다. */
const POINTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 1, y: 1 },
  { x: 2, y: 1.5 },
  { x: 1.5, y: 2.5 },
  { x: 3, y: 1 },
  { x: 4, y: 3.5 },
  { x: 3, y: 4 },
  { x: 5, y: 2.5 },
  { x: 4.5, y: 4.5 },
];

export const decisionBoundaryFacet: FacetJson = {
  id: 'facet:decisionBoundary',
  title: {
    en: 'Decision Boundary — the line that shows up last',
    ko: '결정 경계 — 마지막에 나타나는 선',
  },
  description: {
    en: 'Every spot gets a probability first; the boundary is where it crosses half',
    ko: '자리마다 확률이 먼저 매겨지고, 그것이 반을 넘나드는 곳이 경계다',
  },
  algorithm: 'module:decisionBoundary',
  projector: 'module:decisionBoundaryProjector',
  initialData: {
    type: 'decision-boundary',
    weights: { x: 1, y: 1 },
    bias: -5.5,
    points: POINTS.map((p) => ({ ...p })),
    domain: { min: 0, max: 6 },
    grid: { cols: 24, rows: 24, waves: 3 },
    stepMs: 750,
  },
  blocks: {
    stage: { type: 'decision-boundary-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.probe': {
      en: 'Ask each point for a probability, not a side — {k} of {n}.',
      ko: '점마다 확률을 묻는다. 어느 쪽인지가 아니다 — {k} / {n}.',
    },
    'caption.spread': {
      en: 'The eight fell to the two ends. Nothing landed near half.',
      ko: '여덟은 두 끝으로 갔다. 반 근처에 앉은 것은 없다.',
    },
    'caption.scan': {
      en: 'So ask every spot on the plane the same question.',
      ko: '그래서 평면의 모든 자리에 같은 것을 묻는다.',
    },
    'caption.crossing': {
      en: 'Light up the cells where the probability crosses half.',
      ko: '확률이 반을 넘나드는 칸에 불을 켠다.',
    },
    'caption.boundary': {
      en: 'Join them and the boundary appears. It was never drawn first.',
      ko: '그것을 이으면 경계가 나타난다. 미리 그어 둔 선이 아니다.',
    },
    'caption.done': {
      en: 'The line sits where p = 0.5 — not midway between the two clumps.',
      ko: '선이 있는 곳은 p = 0.5 인 자리다. 두 무리의 한가운데가 아니다.',
    },
  },
};
