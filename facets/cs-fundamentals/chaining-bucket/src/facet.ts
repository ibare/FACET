/**
 * chaining-bucket facet 선언.
 *
 * @piece 조각(piece) — 질문 하나에 답하고 멈춘다.
 *   "같은 자리에 둘 이상이 오면 어떻게 되는가."
 *
 * 해시값은 Java `String.hashCode` 실측이고 자리는 `(h & 0x7FFFFFFF) % 8` 이다.
 * 지어낸 값은 하나도 없다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const chainingBucketFacet: FacetJson = {
  id: 'facet:chainingBucket',
  title: {
    en: 'Chaining — same slot, hang it there',
    ko: '체이닝 — 같은 자리면 매달아 둔다',
  },
  description: {
    en: 'When a second key hashes to a slot that is already taken, nothing is pushed out. It hooks onto the chain hanging from that slot, and a lookup walks only that chain.',
    ko: '이미 찬 자리에 다음 키가 와도 아무것도 밀려나지 않는다. 그 자리에 매달린 사슬 끝에 걸리고, 찾을 때는 그 사슬만 훑는다.',
  },
  algorithm: 'module:chainingBucket',
  projector: 'module:chainingBucketProjector',
  initialData: {
    type: 'chaining-bucket',
    bucketCount: 8,
    // Java String.hashCode 실측값. 자리는 (hash & 0x7FFFFFFF) % 8.
    entries: [
      { key: 'apple', hash: 93029210, bucket: 2 },
      { key: 'elder', hash: 96592394, bucket: 2 },
      { key: 'mango', hash: 103662530, bucket: 2 },
      { key: 'fig', hash: 101380, bucket: 4 },
      { key: 'kiwi', hash: 3292336, bucket: 0 },
    ],
    lookupKey: 'mango',
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'chaining-bucket-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.hangFirst': {
      en: '{key} hashes to slot {bucket}. Nothing hangs there yet, so it hangs alone.',
      ko: '{key} 는 자리 {bucket}. 아직 아무것도 없어서 혼자 매달린다.',
    },
    'caption.hangCollide': {
      en: '{key} lands on slot {bucket} too. Nothing is pushed out — it hooks onto the end of that chain.',
      ko: '{key} 도 자리 {bucket}. 아무것도 밀려나지 않고, 그 사슬 끝에 걸린다.',
    },
    'caption.probeJump': {
      en: 'Looking for {key}: go straight to slot {bucket}. No other slot is touched.',
      ko: '{key} 를 찾는다. 자리 {bucket} 로 한 번에 간다. 다른 자리는 건드리지 않는다.',
    },
    'caption.probeMiss': {
      en: '{key} is not it. Step one link down the chain.',
      ko: '{key} 가 아니다. 사슬을 한 칸 내려간다.',
    },
    'caption.probeHit': {
      en: '{key} matches.',
      ko: '{key} 다. 찾았다.',
    },
    'caption.done': {
      en: 'Found in slot {bucket} after {comparisons} comparisons — only that one chain was walked.',
      ko: '자리 {bucket} 에서 {comparisons} 번 견주고 찾았다. 훑은 것은 그 사슬 하나뿐이다.',
    },
  },
};
