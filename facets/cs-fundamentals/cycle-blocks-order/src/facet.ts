/**
 * cycleBlocksOrder facet 선언.
 *
 * @piece 조각(piece) — 한 질문에만 답한다: "고리가 있으면 왜 순서가 없는가."
 *
 * 조각의 규범대로 `header` 도 `metrics` 도 `layout` 도 두지 않는다 (S-piece).
 * 러너가 `column · gap 8 · blocks 키 순서` 로 배치한다.
 *
 * `initialData` 는 **구조만** 담는다. 각 정점이 이고 있는 수 같은 파생값은
 * algorithm 이 `edges` 를 세어 얻는다 — 손으로 적은 표는 언젠가 구조와 어긋난다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const cycleBlocksOrderFacet: FacetJson = {
  id: 'facet:cycleBlocksOrder',
  title: {
    en: 'A ring leaves no order',
    ko: '고리가 있으면 순서가 없다',
  },
  description: {
    en: 'Vertices caught in a ring wait for each other, so in the end nothing can come out',
    ko: '고리에 걸린 것들은 서로를 기다려, 끝내 아무것도 꺼낼 수 없게 된다',
  },
  algorithm: 'module:cycleBlocksOrder',
  projector: 'module:cycleBlocksOrderProjector',
  initialData: {
    type: 'digraph',
    vertices: ['p', 'q', 'r', 's', 't'],
    edges: [
      { from: 't', to: 'p' },
      { from: 'p', to: 'q' },
      { from: 'q', to: 'r' },
      { from: 'r', to: 'q' },
      { from: 'r', to: 's' },
    ],
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'cycle-blocks-order-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'label.order': { en: 'Order taken out', ko: '꺼낸 순서' },
    'caption.survey': {
      en: 'Each vertex carries the number of arrows aimed at it',
      ko: '각 정점은 자기를 겨눈 화살표의 수를 이고 있다',
    },
    'caption.ready': {
      en: '{ids} carries 0 — it can come out',
      ko: '{ids} 는 0 을 이고 있다 — 꺼낼 수 있다',
    },
    'caption.extract': {
      en: 'Take {id} out — the arrows it aimed are gone',
      ko: '{id} 를 꺼낸다 — 그것이 겨누던 화살표가 사라진다',
    },
    'caption.stall': {
      en: 'Nothing carries 0 anymore. Nothing can come out.',
      ko: '이제 0 을 이고 있는 것이 없다. 아무것도 꺼낼 수 없다.',
    },
    'caption.wait': {
      en: '{a} cannot move: it waits for {b}',
      ko: '{a} 는 못 움직인다 — {b} 를 기다린다',
    },
    'caption.ringClosed': {
      en: '{a} waits for {b}, and {b} waits for {a}',
      ko: '{a} 는 {b} 를, {b} 는 {a} 를 기다린다',
    },
    'caption.trail': {
      en: '{a} waits for {b}, which is caught in the ring',
      ko: '{a} 는 고리에 걸린 {b} 를 기다린다',
    },
    'caption.halt': {
      en: 'Only {out} of {total} came out — a ring leaves no order',
      ko: '{total} 중 {out} 만 나왔다 — 고리가 있으면 순서가 없다',
    },
  },
};
