/**
 * @piece 음수 간선이 확정을 깨뜨린다.
 *
 * 답하는 질문 하나: **가장 가까운 것부터 굳히는 방법에 음수 간선을 넣으면
 * 무엇이 잘못되는가.** "쓰면 안 된다" 는 규칙을 말하지 않는다 — 규칙을 어겼을 때
 * 화면에 실제로 틀린 수가 남는 것을 보인다.
 *
 * 정점 넷과 간선 넷뿐인 것은 축소판이라서가 아니라, 확정이 깨지는 데 필요한
 * 최소 구성이기 때문이다: 굳은 뒤에 닿는 더 짧은 길 하나와, 그 소식이 나가야 할
 * 곳 하나.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const negativeEdgeBreaksFacet: FacetJson = {
  id: 'facet:negativeEdgeBreaks',
  title: {
    en: 'A negative edge breaks settling',
    ko: '음수 간선이 확정을 깨뜨린다',
  },
  description: {
    en: 'Settling the nearest first leaves a wrong number when an edge is negative.',
    ko: '가장 가까운 것부터 굳히는 방법은 음수 간선 앞에서 틀린 답을 낸다.',
  },
  algorithm: 'module:negativeEdgeBreaks',
  projector: 'module:negativeEdgeBreaksProjector',
  initialData: {
    type: 'negative-edge-breaks',
    nodes: ['S', 'A', 'B', 'T'],
    edges: [
      { from: 'S', to: 'A', w: 3 },
      { from: 'S', to: 'B', w: 4 },
      { from: 'B', to: 'A', w: -2 },
      { from: 'A', to: 'T', w: 1 },
    ],
    start: 'S',
    goal: 'T',
    stepMs: 950,
  },
  blocks: {
    stage: { type: 'negative-edge-breaks-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.start': {
      en: 'Start at {start}. Nothing is settled yet.',
      ko: '{start} 에서 출발한다. 아직 굳은 곳은 없다.',
    },
    'caption.settle': {
      en: 'The nearest one left is {node} at {d} — settle it.',
      ko: '아직 굳지 않은 것 중 가장 가까운 것은 {node} — 거리는 {d}. 여기서 굳는다.',
    },
    'caption.accept': {
      en: 'Relax {from}→{to}: {d}. {to} takes it.',
      ko: '{from}→{to} 를 펴면 {d}. {to} 가 받는다.',
    },
    'caption.sealed': {
      en: '{from}→{to} gives {cand}, shorter than {kept}. But {to} is settled and refuses it.',
      ko: '{from}→{to} 는 {cand} — {kept} 보다 짧다. 그런데 {to} 는 이미 굳어 받지 않는다.',
    },
    'caption.kept': {
      en: '{from}→{to} gives {cand}, no better than {kept}. Nothing moves.',
      ko: '{from}→{to} 는 {cand} — {kept} 보다 낫지 않아 그대로 둔다.',
    },
    'caption.blocked': {
      en: 'So {wouldBe} never leaves {node}, and {to} stays {stays}.',
      ko: '{wouldBe} 은 {node} 밖으로 나가지 못하고 {to} 는 {stays} 로 남는다.',
    },
    'caption.truth': {
      en: 'The real shortest path is {path} = {total}.',
      ko: '참 최단은 {path} 로 {total} 이다.',
    },
    'caption.verdict': {
      en: '{goal} keeps {settled}, but the answer is {truth}. The settled number is wrong.',
      ko: '{goal} 에 남은 수는 {settled}, 참 최단은 {truth}. 굳힌 수가 틀렸다.',
    },
    'label.settled': { en: 'settled', ko: '확정' },
    'label.true': { en: 'true', ko: '참' },
  },
};
