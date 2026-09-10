/**
 * assignThenMove — 할당과 갱신이 번갈아 도는 한 걸음 (k-평균).
 *
 * 답하는 질문: **무리의 가운데가 어디인지 모르는데 어떻게 찾는가.**
 * 붙이고 옮기기를 번갈아 하다가 아무도 안 움직이면 멎는다.
 *
 * 중심 셋은 일부러 가운데에 몰아 놓는다 — 어느 덩이에도 맞지 않는 자리라
 * 첫 걸음에 크게 움직이고, 그래서 왕복이 눈에 보인다.
 *
 * @piece
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const assignThenMoveFacet: FacetJson = {
  id: 'facet:assignThenMove',
  title: { en: 'Assign, then move', ko: '붙이고, 옮긴다' },
  description: {
    en: 'Points grab the nearest center; each center slides to the middle of what grabbed it. The two take turns until nothing moves.',
    ko: '점이 가장 가까운 중심을 잡고, 중심은 저를 잡은 것들의 가운데로 옮겨 간다. 아무도 안 움직일 때까지 둘이 번갈아 돈다.',
  },
  algorithm: 'module:assignThenMove',
  projector: 'module:assignThenMoveProjector',
  initialData: {
    type: 'assign-then-move',
    // 세 덩이로 놓인 점 열셋. 좌표는 데이터이고, 화면의 자리는 stage 가 셈한다.
    points: [
      { x: 1, y: 1 },
      { x: 1.5, y: 2 },
      { x: 2, y: 1.2 },
      { x: 1.2, y: 2.5 },
      { x: 2.2, y: 2.2 },
      { x: 6, y: 1.5 },
      { x: 6.5, y: 2.2 },
      { x: 7, y: 1 },
      { x: 6.2, y: 2.8 },
      { x: 3.5, y: 6 },
      { x: 4.2, y: 6.5 },
      { x: 3, y: 6.8 },
      { x: 4.5, y: 5.8 },
    ],
    // 어느 덩이에도 맞지 않는 자리. 일부러 가운데에 몰아 놓고 시작한다.
    seeds: [
      { x: 4, y: 2 },
      { x: 4.5, y: 3 },
      { x: 3, y: 4 },
    ],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'assign-then-move-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.start': {
      en: 'Three centers sit where no cluster is.',
      ko: '중심 셋이 어느 덩이에도 맞지 않는 자리에 몰려 있다.',
    },
    'caption.attach': {
      en: 'Round {round} · attach: every point grabs its nearest center. Sizes {sizes}.',
      ko: '{round}회 · 붙는다: 점마다 가장 가까운 중심을 잡는다. 무리 크기 {sizes}.',
    },
    'caption.move': {
      en: 'Round {round} · move: each center slides to the middle of its own points. Moved {dists}.',
      ko: '{round}회 · 옮긴다: 중심이 제 점들의 가운데로 미끄러진다. 옮긴 거리 {dists}.',
    },
    'caption.settled': {
      en: 'Nobody moved, so it stops. Rounds: {rounds}.',
      ko: '아무도 움직이지 않았다. 그래서 멎는다. 돈 횟수 {rounds}.',
    },
    'caption.capped': {
      en: 'Still moving. Rounds: {rounds}.',
      ko: '아직 움직인다. 돈 횟수 {rounds}.',
    },
    'label.attach': { en: 'attach', ko: '붙는다' },
    'label.move': { en: 'move', ko: '옮긴다' },
    'label.ledger': { en: 'how far each center moved', ko: '중심이 옮긴 거리' },
    'label.round': { en: 'round {n}', ko: '{n}회' },
    'label.settled': { en: 'no movement', ko: '움직임 없음' },
  },
};
