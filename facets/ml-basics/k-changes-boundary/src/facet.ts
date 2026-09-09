/**
 * k 값의 영향 — "몇을 물어보느냐가 답을 바꾸는가" 에 답하는 조각.
 *
 * @piece 물음점을 둘러싼 테두리가 자라며 안에 드는 이웃이 늘고, 어느 순간
 * 다수가 바뀌어 답이 뒤집힌다. 같은 점, 같은 데이터, 같은 방법인데 답이 둘이다.
 *
 * initialData 에는 **구조만** 둔다 — 물음점 · 이름표 있는 점 열 · 보일 k 값.
 * 거리 · 표 · 테두리 반지름은 algorithm 이 셈하고, 화면 좌표는 stage 가 캔버스
 * 에서 역산한다 (S-piece). `stepMs` 만 예외로 여기 둔다 — 읽을 시간을 주는 것은
 * 그림의 결과가 아니라 저작 결정이다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const kChangesBoundaryFacet: FacetJson = {
  id: 'facet:kChangesBoundary',
  title: { en: 'How k changes the answer', ko: 'k 가 답을 바꾼다' },
  description: {
    en: 'The nearest neighbour says one thing, the nearest three say another.',
    ko: '가장 가까운 하나와 가장 가까운 셋이 서로 다른 답을 낸다.',
  },
  algorithm: 'module:kChangesBoundary',
  projector: 'module:kChangesBoundaryProjector',
  initialData: {
    type: 'k-changes-boundary',
    query: { x: 4, y: 4 },
    points: [
      { x: 3.05, y: 5.0, label: 'A' },
      { x: 2.0, y: 3.0, label: 'A' },
      { x: 3.5, y: 6.55, label: 'A' },
      { x: 2.5, y: 1.5, label: 'A' },
      { x: 1.0, y: 4.0, label: 'A' },
      { x: 5.55, y: 4.5, label: 'B' },
      { x: 4.55, y: 2.0, label: 'B' },
      { x: 5.0, y: 6.1, label: 'B' },
      { x: 6.0, y: 2.5, label: 'B' },
      { x: 7.05, y: 4.0, label: 'B' },
    ],
    ks: [1, 3, 5, 7],
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'k-changes-boundary-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.start': {
      en: 'The point in the middle has no label. Its neighbours will vote.',
      ko: '가운데 점에는 이름표가 없다. 이웃이 표를 던져 정한다.',
    },
    'caption.grow': {
      en: 'The boundary grows until it holds the nearest {k}.',
      ko: '테두리가 자라 가장 가까운 이웃을 담는다: {k}.',
    },
    'caption.first': {
      en: 'Votes {la} {ca} : {lb} {cb} — the answer reads {verdict}.',
      ko: '표는 {la} {ca} 대 {lb} {cb}. 답은 {verdict}.',
    },
    'caption.hold': {
      en: 'Votes {la} {ca} : {lb} {cb} — the answer stays {verdict}.',
      ko: '표는 {la} {ca} 대 {lb} {cb}. 답은 그대로 {verdict}.',
    },
    'caption.flip': {
      en: 'Votes {la} {ca} : {lb} {cb} — the answer flips to {verdict}.',
      ko: '표는 {la} {ca} 대 {lb} {cb}. 답이 뒤집혔다 → {verdict}.',
    },
    'caption.done': {
      en: 'The nearest one is {nearest}. Ask a few more and the answer becomes {verdict}.',
      ko: '가장 가까운 하나는 {nearest}. 그런데 몇을 더 물으면 답은 {verdict}.',
    },
  },
};
