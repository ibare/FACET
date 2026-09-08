/**
 * @piece 정렬 전제 — "줄이 서 있지 않으면 같은 절차가 있는 값을 없다고 답한다."
 *
 * 조각(piece) 이므로 S-piece 를 따른다: 제목 블록 없음 · 메트릭 없음 · layout 선언
 * 없음 · 컨트롤은 다시 보기와 한 걸음 둘뿐. 진행은 reactive 메커니즘이 맡고
 * (`index.ts` 의 `registerAlgorithm(..., { mechanismKind: 'reactive' })`) 걸음 간격은
 * `initialData.stepMs` 로 선언한다 — 읽을 시간을 주는 것은 저작 결정이다.
 *
 * 데이터는 같은 값 일곱을 두 줄로 놓은 것이다. 두 줄의 값 집합이 같아야 "같은 값을
 * 두고 같은 절차를 걸었는데 답이 갈린다" 는 주장이 성립한다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const requiresSortedFacet: FacetJson = {
  id: 'facet:requiresSorted',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'The Sorted Precondition', ko: '정렬 전제' },
  description: {
    en: 'The same binary search on two rows of the same seven values — one sorted, one not. The unsorted row reports "not found" for a value that is right there.',
    ko: '같은 값 일곱을 줄 선 것과 흐트러진 것으로 놓고 같은 이진 탐색을 건다. 흐트러진 쪽은 거기 있는 값을 없다고 답한다.',
  },
  algorithm: 'module:requiresSorted',
  projector: 'module:requiresSorted',
  initialData: {
    type: 'requires-sorted',
    target: 3,
    stepMs: 850,
    rows: [
      { key: 'sorted', values: [1, 3, 5, 7, 9, 11, 13] },
      { key: 'shuffled', values: [9, 1, 13, 5, 3, 11, 7] },
    ],
  },
  blocks: {
    stage: { type: 'requires-sorted-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    // ── stage 라벨
    'label.target': {
      en: 'both rows look for this value',
      ko: '두 줄 모두 이 값을 찾는다',
    },
    'label.sortedRow': { en: 'in order', ko: '줄 서 있다' },
    'label.shuffledRow': { en: 'out of order', ko: '흐트러져 있다' },
    'verdict.found': { en: 'found at slot {i}', ko: '{i}번 자리에서 찾음' },
    'verdict.absent': { en: 'answers: not here', ko: '없다고 답함' },

    // ── 캡션. 문제를 세우고 → 절차를 걸고 → 답이 갈리는 순서다.
    'caption.setup': {
      en: 'Two rows, the same seven values, the same binary search. One row is in order, the other is not.',
      ko: '두 줄에 같은 값 일곱. 한 줄은 줄이 서 있고 한 줄은 아니다. 같은 이진 탐색을 둘에 건다.',
    },
    'caption.probeBoth': {
      en: 'The same procedure probes the middle of both rows — slot {i}.',
      ko: '같은 절차가 두 줄의 가운데를 짚는다 — {i}번 자리.',
    },
    'caption.probeOne': {
      en: 'Only the lower row is still running. It probes slot {i}.',
      ko: '아래 줄만 아직 돌고 있다. {i}번 자리를 짚는다.',
    },
    'caption.probeApart': {
      en: 'Each row probes the middle of its own live range.',
      ko: '두 줄이 각자 남은 구간의 가운데를 짚는다.',
    },
    'caption.dropRight': {
      en: '{target} is smaller than both probes, so both rows throw away the right half.',
      ko: '{target} 이 짚은 두 값보다 작으니 두 줄 다 오른쪽 절반을 버린다.',
    },
    'caption.dropLeft': {
      en: '{target} is larger than both probes, so both rows throw away the left half.',
      ko: '{target} 이 짚은 두 값보다 크니 두 줄 다 왼쪽 절반을 버린다.',
    },
    'caption.narrow': {
      en: 'Each row drops the half that cannot hold {target}.',
      ko: '두 줄 모두 {target} 이 있을 수 없는 절반을 버린다.',
    },
    'caption.lost': {
      en: 'The unordered row just threw away the half that actually holds {target}.',
      ko: '흐트러진 줄은 방금 {target} 이 실제로 든 절반을 버렸다.',
    },
    'caption.split': {
      en: 'The ordered row lands on {target} and stops. The other sees a smaller value and turns right.',
      ko: '줄 선 쪽은 {target} 을 짚고 멈춘다. 다른 쪽은 더 작은 값을 보고 오른쪽으로 돈다.',
    },
    'caption.empty': {
      en: 'The range closes on nothing. The lower row answers: {target} is not here.',
      ko: '구간이 아무것도 남기지 않고 닫힌다. 아래 줄은 {target} 이 없다고 답한다.',
    },
    'caption.verdict': {
      en: 'Same procedure, same seven values: found above, "not here" below — while {target} sits in the ringed slot all along.',
      ko: '같은 절차, 같은 일곱 값. 위는 찾고 아래는 없다고 답한다 — {target} 은 고리 두른 칸에 내내 있었는데도.',
    },
  },
};
