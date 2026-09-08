/**
 * 적재율과 재해싱 — 조각(piece) facet 선언.
 *
 * @piece 한 질문에만 답한다 — **판을 넓히면 담긴 것들의 자리는 어떻게 되는가.**
 * 헤더도 메트릭도 두지 않고, 레이아웃은 러너에게 맡긴다 (S-piece).
 *
 * initialData 의 수는 전부 실측값이다. `hashCode` 는 Java `String.hashCode()`
 * 이고 `masked` 는 `hashCode & 0x7FFFFFFF`, 자리는 `masked % 버킷수` 다.
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';
import type { LoadFactorRehashData } from './algorithm.js';

const loadFactorRehashData: LoadFactorRehashData = {
  type: 'load-factor-rehash',
  buckets: 8,
  grownBuckets: 16,
  threshold: 0.75,
  incoming: 'date',
  stepMs: 740,
  keys: [
    { key: 'kiwi', hashCode: 3292336, masked: 3292336, slotSmall: 0, slotLarge: 0 },
    { key: 'cherry', hashCode: -1361513063, masked: 785970585, slotSmall: 1, slotLarge: 9 },
    { key: 'apple', hashCode: 93029210, masked: 93029210, slotSmall: 2, slotLarge: 10 },
    { key: 'fig', hashCode: 101380, masked: 101380, slotSmall: 4, slotLarge: 4 },
    { key: 'banana', hashCode: -1396355227, masked: 751128421, slotSmall: 5, slotLarge: 5 },
    { key: 'date', hashCode: 3076014, masked: 3076014, slotSmall: 6, slotLarge: 14 },
  ],
};

export const loadFactorRehashFacet: FacetJson = {
  id: 'facet:loadFactorRehash',
  title: { en: 'Load factor and rehashing', ko: '적재율과 재해싱' },
  description: {
    en: 'When the table gets too full it grows, and every key is placed again from scratch.',
    ko: '너무 차면 판을 넓혀 다시 뿌린다.',
  },
  algorithm: 'module:loadFactorRehash',
  projector: 'module:loadFactorRehashProjector',
  initialData: loadFactorRehashData,
  blocks: {
    stage: { type: 'load-factor-rehash-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'label.loadFactor': { en: 'load factor', ko: '적재율' },
    'caption.threshold': {
      en: 'One more key fills {count} of {buckets} buckets — the load factor reaches the {threshold} threshold.',
      ko: '하나가 더 들어오자 {buckets} 칸 중 {count} 이 찼다. 적재율이 임계 {threshold} 에 닿는다.',
    },
    'caption.grow': {
      en: 'The table doubles, so the same {count} keys now fill far less of it.',
      ko: '판을 두 배로 넓힌다. 같은 {count} 인데 차지하는 몫이 확 줄었다.',
    },
    'caption.recompute': {
      en: 'Nothing is carried over. Every key is divided again by the new bucket count.',
      ko: '옛 자리를 그대로 옮기지 않는다. 새 버킷 수로 전부 다시 나눈다.',
    },
    'caption.result': {
      en: '{moved} keys landed somewhere else. {stayed} happened to stay.',
      ko: '{moved} 은 자리가 바뀌었고, {stayed} 은 우연히 그대로 남았다.',
    },
  },
};
