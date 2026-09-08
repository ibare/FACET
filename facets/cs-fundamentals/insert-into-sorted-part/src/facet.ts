/**
 * @piece 정렬부 삽입 — 조각(piece) facet 선언.
 *
 * 답하는 질문 하나: **"끼워 넣는다" 는 자리가 저절로 벌어지는 일인가?**
 * 벌어지는 자리는 누군가 비켜서야 생기고, 비켜서는 순서는 뒤에서부터여야 하며,
 * 왼쪽이 이미 줄 서 있으므로 걸음은 왼쪽 끝에 닿기 전에 멈춘다.
 *
 * 제목·metrics·layout 을 두지 않는다 — 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없으며, stage 와 controls 뿐이라 배치는 러너 기본값으로 족하다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const insertIntoSortedPartFacet: FacetJson = {
  id: 'facet:insertIntoSortedPart',
  title: { en: 'Insert into the sorted part', ko: '정렬부 삽입' },
  description: {
    en: 'A new value is lifted out of the row, values step aside from the back, and it settles into the gap.',
    ko: '새 값이 줄에서 들리고, 값들이 뒤에서부터 비켜서고, 빈자리가 나면 내려앉는다.',
  },
  algorithm: 'module:insertIntoSortedPart',
  projector: 'module:insertIntoSortedPartProjector',
  initialData: {
    type: 'insert-into-sorted-part',
    sorted: [2, 5, 8],
    incoming: 4,
    // 걸음 간격. 무대의 이동 애니메이션이 이 위에 더해지므로 걸음 하나는
    // 대략 1.1초다 (S-piece).
    stepMs: 750,
  },
  blocks: {
    stage: { type: 'insert-into-sorted-part-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.begin': {
      en: 'The left side is already in order. {value} goes in next.',
      ko: '왼쪽은 이미 줄이 서 있다. 다음 차례는 새 값({value}).',
    },
    'caption.lift': {
      en: 'Lift {value} out of the row. That slot is empty now.',
      ko: '새 값({value})을 줄에서 들어 올린다. 그 칸은 이제 비었다.',
    },
    'caption.compareYields': {
      en: '{other} > {value} — {other} has to step aside.',
      ko: '{other} > {value} — 큰 값({other})이 비켜서야 한다.',
    },
    'caption.compareHolds': {
      en: '{other} is not greater than {value}.',
      ko: '견준 값({other})은 새 값({value})보다 크지 않다.',
    },
    'caption.stepAside': {
      en: '{value} moves one slot to the right. The gap comes one slot closer.',
      ko: '값({value})이 오른쪽으로 한 칸 비켜선다. 빈자리가 한 칸 왼쪽으로 옮겨 온다.',
    },
    'caption.stop': {
      en: '{other} stays put — the walk stops here, short of the left end.',
      ko: '이 값({other})은 비키지 않는다 — 왼쪽 끝에 닿기 전에 걸음이 멈춘다.',
    },
    'caption.settle': {
      en: 'The gap is the slot {value} belongs in. It comes down.',
      ko: '빈자리가 곧 새 값({value})의 자리다. 그 자리로 내려앉는다.',
    },
    'caption.done': {
      en: '{compares} comparisons, {shifts} step-asides — the walk never reached the left end.',
      ko: '견줌 {compares}회 · 비켜섬 {shifts}회 — 왼쪽 끝까지 가지 않았다.',
    },
  },
};
