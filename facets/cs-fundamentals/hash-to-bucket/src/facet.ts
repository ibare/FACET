/**
 * hashToBucket — 값을 자리 번호로 바꾼다.
 *
 * @piece 길이도 종류도 제각각인 키가 정해진 개수의 자리 중 하나로 접혀 들어간다는
 * 한 가지만 말하고 멈춘다. 해시 함수가 키를 하나의 정수로 접고, 나머지 연산이
 * 그 정수를 자리 수만큼으로 다시 접는다 — 두 번의 접힘이 전부다.
 *
 * header · metrics · layout 없음 (S-piece). 걸음 간격은 저작 결정이라
 * `initialData.stepMs` 로 선언한다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const hashToBucketFacet: FacetJson = {
  id: 'facet:hashToBucket',
  title: { en: 'Folding a key into a bucket', ko: '키를 자리로 접기' },
  description: {
    en: 'A hash function folds any key into one integer, and the remainder folds that integer into one of a fixed number of slots.',
    ko: '해시 함수가 어떤 키든 하나의 정수로 접고, 나머지 연산이 그 정수를 정해진 개수의 자리 중 하나로 다시 접는다.',
  },
  algorithm: 'module:hash-to-bucket',
  projector: 'module:hash-to-bucket',
  initialData: {
    type: 'hash-to-bucket',
    // 길이 4 · 3 · 5 · 6. "banana" 는 hashCode 가 음수라 부호 비트를 떨어뜨리는
    // 걸음이 눈에 보인다. 값은 algorithm 이 실제로 계산한다.
    keys: ['kiwi', 'fig', 'apple', 'banana'],
    bucketCount: 8,
    stepMs: 720,
  },
  blocks: {
    stage: { type: 'hash-to-bucket-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.key': {
      en: 'Keys differ in length — "{key}" has {len} characters.',
      ko: '키마다 길이가 다르다 — "{key}" 는 {len} 글자.',
    },
    'caption.fold': {
      en: 'The hash function folds it into one integer: {hash}',
      ko: '해시 함수가 그것을 하나의 정수로 접는다: {hash}',
    },
    'caption.mask': {
      en: 'Drop the sign bit: {hash} & 0x7FFFFFFF = {masked}',
      ko: '부호 비트를 떨어뜨린다: {hash} & 0x7FFFFFFF = {masked}',
    },
    'caption.bucket': {
      en: '{masked} mod {count} = slot {slot}',
      ko: '{masked} mod {count} = {slot}번 자리',
    },
    'caption.done': {
      en: 'Whatever the key, it folds into one of the {count} slots.',
      ko: '어떤 키든 {count}개 자리 중 하나로 접혀 들어간다.',
    },
  },
};
