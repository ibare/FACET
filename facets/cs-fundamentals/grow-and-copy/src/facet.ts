/**
 * grow-and-copy facet 선언.
 *
 * @piece 칸이 차면 새 자리로 옮긴다.
 *
 * 답하는 질문 하나 — "꽉 찬 배열에 하나를 더 넣으면 무슨 일이 일어나는가."
 * 답: 더 큰 자리를 새로 얻고, 있던 값을 하나씩 복사해 옮기고, 옛 자리를 버린다.
 * 주소가 바뀐다.
 *
 * 조각이므로 title-block 도 metrics 도 두지 않는다. 제목은 글의 문단이 주고,
 * 셀 것은 없다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const growAndCopyFacet: FacetJson = {
  id: 'facet:growAndCopy',
  title: { en: 'Grow and copy', ko: '재할당' },
  description: {
    en: 'When a block is full, a bigger one is taken elsewhere, every value is copied over, and the old block is released. The address changes.',
    ko: '칸이 차면 더 큰 자리를 새로 얻어 있던 값을 하나씩 복사해 옮기고 옛 자리를 버린다. 주소가 바뀐다.',
  },
  algorithm: 'module:growAndCopy',
  projector: 'module:growAndCopyProjector',
  initialData: {
    type: 'grow-and-copy',
    stepMs: 780,
    elementBytes: 4,
    oldAddress: '0x1000',
    oldCapacity: 4,
    values: [7, 3, 9, 1],
    newAddress: '0x2000',
    newCapacity: 8,
    incoming: 4,
  },
  blocks: {
    stage: { type: 'grow-and-copy-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },
  messages: {
    'caption.blocked': {
      en: 'One more value arrives: {value}. Every one of the {capacity} slots is taken, and the block cannot stretch.',
      ko: '값이 하나 더 온다 — {value}. {capacity}칸이 모두 찼고, 자리는 늘어나지 않는다.',
    },
    'caption.allocated': {
      en: 'So a bigger block is taken somewhere else: {bytes} bytes at {address}, room for {capacity}.',
      ko: '그래서 더 큰 자리를 다른 곳에 얻는다 — {address} 에 {bytes}바이트, {capacity}칸.',
    },
    'caption.copying': {
      en: 'Nothing moves itself. Each value is copied over, one at a time — {done} of {total}.',
      ko: '저절로 옮겨지지 않는다. 값을 하나씩 복사해 옮긴다 — {total}개 가운데 {done}개.',
    },
    'caption.freed': {
      en: 'The old block at {oldAddress} is given back. The array lives at {newAddress} now — the address changed.',
      ko: '옛 자리 {oldAddress} 는 돌려준다. 배열은 이제 {newAddress} 에 산다 — 주소가 바뀌었다.',
    },
    'caption.appended': {
      en: 'Now {value} fits. It goes into index {index}.',
      ko: '이제 {value} 가 들어갈 자리가 있다. {index}번 칸에 쓴다.',
    },
    'caption.done': {
      en: 'Capacity {capacity}, {size} values, {free} slots to spare — and a different address than the one it started at.',
      ko: '용량 {capacity}, 값 {size}개, 빈 칸 {free}개 — 그리고 처음과 다른 주소.',
    },
    'label.meta': {
      en: '{bytes} bytes / {capacity} slots',
      ko: '{bytes}바이트 / {capacity}칸',
    },
  },
};
