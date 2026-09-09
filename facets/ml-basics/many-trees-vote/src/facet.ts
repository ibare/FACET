/**
 * 앙상블 투표 — 여러 나무가 투표한다.
 *
 * @piece 질문 하나: 제각기 틀리는 것들을 모으면 왜 나아지는가.
 *
 * 선언에 두는 것은 **구조**뿐이다 — 나무 · 물음 · 선택지 · 정답 · 스물다섯 개의
 * 답. 어디에 무엇을 놓을지는 stage 가 캔버스에서 역산한다 (S-piece).
 * `stepMs` 만 예외로 여기 둔다. 읽을 시간을 주는 것은 저작 결정이다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const manyTreesVoteFacet: FacetJson = {
  id: 'facet:manyTreesVote',
  title: { en: 'Ensemble vote', ko: '앙상블 투표' },
  description: {
    en: 'Five trees answer the same five questions. None gets them all; the vote does.',
    ko: '나무 다섯이 같은 물음 다섯에 답한다. 다 맞힌 나무는 없는데 다수결은 다 맞힌다.',
  },
  algorithm: 'module:manyTreesVote',
  projector: 'module:manyTreesVoteProjector',
  initialData: {
    type: 'many-trees-vote',
    trees: ['T1', 'T2', 'T3', 'T4', 'T5'],
    questions: ['q1', 'q2', 'q3', 'q4', 'q5'],
    options: ['A', 'B'],
    truth: ['A', 'B', 'A', 'B', 'A'],
    answers: [
      ['A', 'B', 'B', 'A', 'A'],
      ['A', 'A', 'A', 'B', 'A'],
      ['B', 'B', 'A', 'B', 'A'],
      ['A', 'B', 'B', 'B', 'B'],
      ['A', 'B', 'A', 'A', 'A'],
    ],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'many-trees-vote-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.intro': {
      en: '{trees} trees, {questions} questions, {total} answers.',
      ko: '나무 {trees} · 물음 {questions} · 판에 놓인 답 {total}.',
    },
    'caption.split': {
      en: '{q}: the answers split — {countA} chose {optionA}, {countB} chose {optionB}.',
      ko: '{q} — 답이 갈린다. {optionA} 쪽 {countA}, {optionB} 쪽 {countB}.',
    },
    'caption.gatherRight': {
      en: 'The larger side gathers into one answer: {majority}. The truth is {truth}.',
      ko: '다수 쪽이 하나로 모인다 — {majority}. 정답도 {truth}.',
    },
    'caption.gatherWrong': {
      en: 'The larger side gathers into one answer: {majority}. But the truth is {truth}.',
      ko: '다수 쪽이 하나로 모인다 — {majority}. 그러나 정답은 {truth}.',
    },
    'caption.doneNone': {
      en: 'No tree got all {total}. Best tree: {best}/{total}. The vote: {majorityScore}/{total}.',
      ko: '다 맞힌 나무는 하나도 없다. 나무 중 최고: {best}/{total}. 다수결: {majorityScore}/{total}.',
    },
    'caption.donePerfect': {
      en: 'Trees with all {total}: {perfect}. Best tree: {best}/{total}. The vote: {majorityScore}/{total}.',
      ko: '다 맞힌 나무: {perfect}. 나무 중 최고: {best}/{total}. 다수결: {majorityScore}/{total}.',
    },
    'label.majority': { en: 'Majority', ko: '다수결' },
    'label.truth': { en: 'Truth', ko: '정답' },
    'label.score': { en: 'Correct', ko: '맞힌 수' },
  },
};
