/**
 * greedyCanFail facet 선언.
 *
 * @piece 조각(piece) — 질문 하나에 답하고 멈춘다 (S-piece).
 *
 * 답하는 질문: **"눈앞의 가장 큰 것을 집는 규칙이 언제 최선을 놓치는가?"**
 *
 * 9 · 6 · 1 로 12 를 만든다. 큰 것부터 집으면 9 를 집는 순간 6 둘로 가는 길이
 * 닫혀 9·1·1·1 넷이 되고, 개수를 최소로 하면 6·6 둘이다. 두 줄의 길이 차이가
 * 곧 결론이며, 그 차이는 우연이 아니라 **뒤를 보지 않아서** 생긴다.
 *
 * 화면에 뜨는 수는 하나도 여기 적혀 있지 않다 — 넷도 둘도 algorithm 이 셈한다.
 * 이 선언이 정하는 것은 동전 묶음과 목표, 그리고 읽을 시간(stepMs)뿐이다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const greedyCanFailFacet: FacetJson = {
  id: 'facet:greedyCanFail',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'When Greedy Fails', ko: '그리디의 한계' },
  description: {
    en: 'Two rows make the same amount from the same coins. Taking the biggest coin first ends up using more of them.',
    ko: '같은 동전으로 같은 금액을 만드는 두 줄. 큰 것부터 집은 쪽이 오히려 더 많이 쓴다.',
  },
  algorithm: 'module:greedyCanFail',
  projector: 'module:greedyCanFailProjector',
  initialData: {
    type: 'greedyCanFail',
    /** 액면. 9 를 집으면 6 둘로 가는 길이 닫히도록 고른 묶음이다. */
    coins: [9, 6, 1],
    target: 12,
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'greedy-can-fail-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    // ── 줄 이름과 눈금. 도식 라벨이지만 원어 그대로 통용되는 용어가 아니라
    //    한국어로 읽혀야 한다 (C10 판정 4).
    'label.laneGreedy': { en: 'largest first', ko: '큰 것부터' },
    'label.laneFewest': { en: 'fewest coins', ko: '가장 적게' },
    'label.target': { en: 'target', ko: '목표' },
    'label.count': { en: '{n} coins', ko: '{n} 개' },

    // ── 캡션. 지금 화면에서 무슨 일이 일어나는지만 말한다.
    'caption.setup': {
      en: 'Both rows share the shelf above and may take any coin as often as they need.',
      ko: '위 선반의 동전은 두 줄이 함께 쓴다. 어느 액면이든 몇 개든 집을 수 있다.',
    },
    'caption.goal': {
      en: 'Both rows set out from the same target — {target}.',
      ko: '두 줄 다 같은 목표에서 출발한다 — {target}.',
    },
    'caption.fork': {
      en: 'The first pick already splits them. One row takes {a}, the other {b}. Left over — {ra} and {rb}.',
      ko: '첫 집음에서 이미 갈린다. 한 줄은 {a} 짜리를, 다른 줄은 {b} 짜리를 집는다. 남은 몫 — {ra} · {rb}.',
    },
    'caption.round': {
      en: 'Each row takes one more coin by its own rule. Left over — {ra} and {rb}.',
      ko: '두 줄이 각자의 규칙대로 하나씩 더 집는다. 남은 몫 — {ra} · {rb}.',
    },
    'caption.alone': {
      en: 'Only the row that is still short moves now. It takes {a}, leaving {ra}.',
      ko: '아직 모자란 줄만 움직인다. {a} 짜리를 하나 더 집어 남은 몫 — {ra}.',
    },
    'caption.settled': {
      en: 'One row is already finished with {n} coins. The other is still short — {r}.',
      ko: '한 줄은 벌써 {n} 개로 끝났다. 다른 줄은 아직 모자라다 — {r}.',
    },
    'caption.verdict': {
      en: 'Same coins, same target: {g} coins for largest first, {f} for fewest. The bigger first pick cost {d} more.',
      ko: '같은 동전, 같은 목표. 큰 것부터 집은 줄은 {g} 개, 가장 적게 집은 줄은 {f} 개. 첫 집음이 {d} 개를 더 쓰게 했다.',
    },
  },
};
