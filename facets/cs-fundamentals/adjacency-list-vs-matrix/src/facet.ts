/**
 * @piece 인접 리스트와 인접 행렬 — 이웃을 목록으로 두는가, 표로 두는가.
 *
 * 이 facet 이 답하는 질문:
 *   "같은 그래프를 두 그릇에 담으면, 물음마다 어느 쪽이 싼가?"
 *
 * 다섯 간선을 인접 리스트(목록)와 인접 행렬(표)에 동시에 채우고, 두 물음을
 * 실제로 세어 비용을 비교한다 — "A 와 E 는 이웃인가" 는 행렬이 싸고(1번),
 * "A 의 이웃을 모두 대라" 는 리스트가 싸다(2번 vs 5번). 어느 하나가 나은 게
 * 아니라 무엇을 자주 묻느냐가 고른다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 + 한 걸음) / 제목 없음 / 메트릭 없음 /
 * 캔버스 폭 620.
 *
 * 데이터는 호스트가 확정한 실측값이다 — 정점 A~E, 간선 A-B·A-C·B-D·C-D·D-E.
 * 걸음이 실제로 세는 값(목록 길이 2·2·2·3·1, 물음 비용 2/1 과 2/5)은 전부
 * algorithm 이 이 데이터를 순회해 낸다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const adjacencyListVsMatrixFacet: FacetJson = {
  id: 'facet:adjacencyListVsMatrix',
  title: { en: 'Adjacency List vs. Matrix', ko: '인접 리스트와 인접 행렬' },
  description: {
    en: 'The same edges land in a list that grows and a table that was already there',
    ko: '같은 간선이 자라는 목록과, 이미 잡혀 있던 표에 함께 떨어진다',
  },
  algorithm: 'module:adjacencyListVsMatrix',
  projector: 'module:adjacencyListVsMatrixProjector',
  initialData: {
    type: 'adjacency-list-vs-matrix',
    vertices: ['A', 'B', 'C', 'D', 'E'],
    edges: [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'D'],
      ['C', 'D'],
      ['D', 'E'],
    ],
    stepMs: 700,
  },
  shuffleOnReset: false,
  messages: {
    // 비용 배지 — 수는 굳히지 않고 자리만 둔다 (C10).
    'badge.list': { en: 'list {n}', ko: '목록 {n}' },
    'badge.matrix': { en: 'matrix {n}', ko: '표 {n}' },
    'caption.init': {
      en: 'The list starts with no cells; the matrix already holds {cells} reserved cells.',
      ko: '목록은 아직 칸이 없고, 표는 {cells}칸을 이미 잡아 두었다.',
    },
    'caption.q1': {
      en: 'Are {a} and {b} neighbors?',
      ko: '{a} 와 {b} 는 이웃인가?',
    },
    'caption.q2': {
      en: 'List all of {a}’s neighbors.',
      ko: '{a} 의 이웃을 모두 대라.',
    },
    'caption.result': {
      en: 'List touched {list} cell(s) · Matrix touched {matrix} cell(s).',
      ko: '목록은 {list}번 · 행렬은 {matrix}번 짚었다.',
    },
    'label.list': { en: 'Adjacency list', ko: '인접 리스트' },
    'label.matrix': { en: 'Adjacency matrix', ko: '인접 행렬' },
  },
  blocks: {
    stage: { type: 'adjacency-list-vs-matrix-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
};
