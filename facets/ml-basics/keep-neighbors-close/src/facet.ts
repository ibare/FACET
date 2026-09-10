/**
 * @piece 지역 구조 보존 — 가까운 것만 가깝게 남긴다.
 *
 * 답하는 질문 하나: 멀고 가까움을 다 지킬 수 없다면 무엇을 지켜야 하는가.
 *
 * 선언이 담는 것은 구조뿐이다 — 고리 위 점의 자리, 어디를 끊을지, 곁들여 견줄
 * 마주 보는 쌍, 그리고 읽을 시간(`stepMs`). 거리·배수는 알고리즘이 좌표에서
 * 셈하고, 화면 위의 자리는 무대가 캔버스에서 역산한다 (S-piece).
 *
 * 점은 반지름 3, 중심 (4,4) 인 고리를 열로 고르게 나눈 자리다. 번호 0 이
 * 오른쪽 끝이고 시계 반대로 돈다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const keepNeighborsCloseFacet: FacetJson = {
  id: 'facet:keepNeighborsClose',
  title: {
    en: 'Keeping neighbors close',
    ko: '가까운 것만 가깝게',
  },
  description: {
    en: 'Ten points on a ring unroll into a line: nine neighbor gaps survive, one tears open.',
    ko: '고리 위 열 점을 한 줄로 편다. 이웃 아홉 쌍은 지켜지고 한 쌍이 찢어진다.',
  },
  algorithm: 'module:keepNeighborsClose',
  projector: 'module:keepNeighborsCloseProjector',
  initialData: {
    type: 'keep-neighbors-close',
    points: [
      { id: 0, x: 7.0, y: 4.0 },
      { id: 1, x: 6.4271, y: 5.7634 },
      { id: 2, x: 4.9271, y: 6.8532 },
      { id: 3, x: 3.0729, y: 6.8532 },
      { id: 4, x: 1.5729, y: 5.7634 },
      { id: 5, x: 1.0, y: 4.0 },
      { id: 6, x: 1.5729, y: 2.2366 },
      { id: 7, x: 3.0729, y: 1.1468 },
      { id: 8, x: 4.9271, y: 1.1468 },
      { id: 9, x: 6.4271, y: 2.2366 },
    ],
    cutAt: 9,
    farPair: [0, 5],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'keep-neighbors-close-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.ring': {
      en: 'Ten points on a ring: every neighboring pair sits the same distance apart, {d}.',
      ko: '고리 위 열 점. 이웃한 열 쌍의 거리가 모두 같다: {d}.',
    },
    'caption.cut': {
      en: 'A ring is closed, a line is open. So one link has to go: {a}-{b}.',
      ko: '고리는 닫혀 있고 줄은 열려 있다. 그래서 한 곳을 끊는다: {a}–{b}.',
    },
    'caption.unroll': {
      en: 'The ring straightens into a line. Every neighbor gap is carried over as it was.',
      ko: '고리를 한 줄로 편다. 이웃 간격은 그대로 옮긴다.',
    },
    'caption.kept': {
      en: 'Nine of the ten neighbor pairs keep their distance exactly.',
      ko: '열 쌍 가운데 아홉 쌍은 거리가 그대로다.',
    },
    'caption.torn': {
      en: 'The cut pair pays for all of it: {before} becomes {after}, a factor of {ratio}.',
      ko: '끊긴 한 쌍이 그 값을 다 치른다. 거리 {before} → {after}, 배수 {ratio}배.',
    },
    'caption.far': {
      en: 'Distant pairs are not exact either. {a} and {b}: was {before}, now {after}.',
      ko: '멀었던 쌍도 정확하지 않다. 마주 보는 쌍 {a}–{b}: 원래 {before}, 편 뒤 {after}.',
    },
    'caption.done': {
      en: 'You can choose where to cut. You cannot choose not to cut.',
      ko: '어디를 끊을지는 고를 수 있어도, 끊지 않을 수는 없다.',
    },
    'label.torn': {
      en: '{before} - {after} ({ratio}x)',
      ko: '{before} → {after} · {ratio}배',
    },
  },
};
