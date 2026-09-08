/**
 * bst-degenerate — 편향 트리 조각(piece) 선언.
 *
 * @piece 같은 값 여섯 개를 두 순서로 넣는다. 한쪽은 매번 같은 방향으로만
 * 갈 곳이 정해져 아래로 길어지는 줄이 되고, 다른 쪽은 좌우로 번갈아 붙어
 * 옆으로 퍼진다 — 담긴 값은 같은데 모양만, 그래서 찾는 비용만 다르다는
 * 한 가지만 말하고 멈춘다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다 (S-piece). layout 은 stage 와 controls 뿐이라 러너에 맡긴다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const bstDegenerateFacet: FacetJson = {
  id: 'facet:bstDegenerate',
  title: { en: 'Grow one way, grow into a line', ko: '한쪽으로만 자라면 줄이 된다' },
  description: {
    en: 'Insert the same six values in two different orders and watch one tree become a chain while the other spreads out.',
    ko: '같은 값 여섯 개를 두 순서로 넣어, 한쪽은 사슬이 되고 다른 쪽은 옆으로 퍼지는 것을 본다.',
  },
  algorithm: 'module:bstDegenerate',
  projector: 'module:bstDegenerateProjector',
  initialData: {
    type: 'bst-degenerate',
    // 오름차순 — 새 값이 언제나 지금 자리보다 커서 오른쪽으로만 뻗는다.
    orderA: [10, 20, 30, 40, 50, 60],
    // 좌우를 번갈아 골라 옆으로 퍼진다.
    orderB: [40, 20, 60, 10, 30, 50],
    // 두 나무에서 공통으로 찾아볼 값 — 찾을 때 비교 횟수가 곧 높이 차이다.
    searchValue: 60,
    stepMs: 560,
  },
  blocks: {
    stage: { type: 'bst-degenerate-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.problem': {
      en: 'The same six values, inserted in two different orders.',
      ko: '같은 값 여섯 개를 두 순서로 넣는다.',
    },
    'caption.growing': {
      en: 'Every insertion compares first, then goes left or right.',
      ko: '넣을 때마다 먼저 비교하고, 그 결과로 왼쪽 또는 오른쪽으로 내려간다.',
    },
    'caption.searching': {
      en: 'Both trees are built. Now look for {value} in each.',
      ko: '두 나무를 다 길렀다. 이제 각각에서 {value} 을 찾아본다.',
    },
    'caption.result': {
      en: 'A: height {heightA}, {comparisonsA} compares. B: height {heightB}, {comparisonsB} compares — same values, different cost.',
      ko: 'A: 높이 {heightA}, 비교 {comparisonsA}회. B: 높이 {heightB}, 비교 {comparisonsB}회 — 같은 값인데 비용이 다르다.',
    },
    'label.result': {
      en: 'height {height} · {comparisons} compares',
      ko: '높이 {height} · 비교 {comparisons}회',
    },
  },
};
