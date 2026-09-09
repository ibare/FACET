/**
 * @piece 서포트 벡터 — 경계에 닿은 것만 선을 정한다.
 *
 * 답하는 질문: **열 개의 점 중 몇 개가 이 선을 정했는가.**
 *
 * 닿지 않은 여섯을 통째로 버려도, 그중 하나를 두 칸이나 멀리 보내도 선은
 * 제자리다. 닿은 하나를 한 칸 내리면 선이 따라오고 띠가 반으로 좁아진다.
 * 손질의 크기가 아니라 **닿았느냐**가 가른다.
 *
 * 화면에 뜨는 수는 전부 알고리즘이 좌표에서 셈한 것이다 — 선의 계수도, 띠
 * 두께도, 닿은 점의 수도 선언에 없다. 여기 적는 것은 점 열과 손질 셋뿐이다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const supportVectorsOnlyFacet: FacetJson = {
  id: 'facet:supportVectorsOnly',
  title: {
    en: 'Only the ones on the edge',
    ko: '선을 정하는 것은 닿은 것뿐',
  },
  description: {
    en: 'Of ten points, how many decided this line?',
    ko: '열 개의 점 중 몇 개가 이 선을 정했는가.',
  },
  algorithm: 'module:supportVectorsOnly',
  projector: 'module:supportVectorsOnlyProjector',
  initialData: {
    type: 'support-vectors-only',
    points: [
      { x: 1, y: 2, group: 'A' },
      { x: 4, y: 5, group: 'A' },
      { x: 2, y: 1, group: 'A' },
      { x: 5, y: 3, group: 'A' },
      { x: 3, y: 0, group: 'A' },
      { x: 1, y: 4, group: 'B' },
      { x: 3, y: 6, group: 'B' },
      { x: 2, y: 7, group: 'B' },
      { x: 5, y: 9, group: 'B' },
      { x: 0, y: 5, group: 'B' },
    ],
    edits: [
      { kind: 'dropUntouched' },
      { kind: 'move', index: 2, toX: 2, toY: -1 },
      { kind: 'move', index: 6, toX: 3, toY: 5 },
    ],
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'support-vectors-only-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.place': {
      en: 'Points on the board: {n}. Group A below, group B above.',
      ko: '무대에 놓인 점은 {n}. 아래 무리 A, 위 무리 B.',
    },
    'caption.solve': {
      en: 'Sweeping every direction for the widest gap between the groups.',
      ko: '두 무리가 가장 크게 벌어지는 방향을 훑어 찾는다.',
    },
    'caption.touching': {
      en: 'Touching the edge: {n}. The other {rest} had no say.',
      ko: '가장자리에 닿은 것은 {n}. 선에 손대지 못한 것은 {rest}.',
    },
    'caption.drop': {
      en: 'Throw away everything that was not touching: {n}.',
      ko: '닿지 않은 것을 모두 버린다. 버린 것은 {n}.',
    },
    'caption.moveFree': {
      en: 'Back to the start, then one non-touching point moves {n} steps.',
      ko: '되돌리고, 가장자리에 닿지 않았던 점 하나를 {n} 칸 옮긴다.',
    },
    'caption.moveSupport': {
      en: 'Back to the start, then one touching point moves {n} steps.',
      ko: '되돌리고, 가장자리에 닿았던 점 하나를 {n} 칸 옮긴다.',
    },
    'caption.same': {
      en: 'Solved again — the line lands right back on its first place. Touching: {n}.',
      ko: '다시 풀어도 선은 처음 자리로 되돌아온다. 닿은 것은 {n}.',
    },
    'caption.moved': {
      en: 'Solved again — the line followed, and the band narrowed. Touching: {n}.',
      ko: '다시 푸니 선이 따라 움직였고 띠도 좁아졌다. 닿은 것은 {n}.',
    },
    'caption.done': {
      en: 'Only the points sitting on the edge decide where the line goes.',
      ko: '선을 정하는 것은 가장자리에 닿은 점뿐이다.',
    },
    'label.record': { en: 'Where the line sits', ko: '선의 자리' },
    'label.origin': { en: 'first position', ko: '처음 자리' },
    'label.original': { en: 'start', ko: '원래' },
    'label.trial': { en: 'edit {n}', ko: '손질 {n}' },
  },
};
