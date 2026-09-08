/**
 * HashChain facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "지난 기록을 몰래 고치면 왜 들통나는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 데이터는 실측 SHA-256 이다. 각 칸의 hash 는 sha256(prev + data) 이고, 첫 칸의
 * prev 는 0 으로 채웠다. 2번 칸을 'withdraw 90' 으로 고치면 그 칸부터 끝까지
 * 세 칸의 값이 전부 갈린다.
 *
 * 각주가 밝히는 전제: 뒤를 전부 다시 계산하면 사슬 자체는 다시 맞는다. 그래도
 * 마지막 해시를 따로 갖고 있는 사람에게는 어긋남이 드러난다 — 사슬이 막는 것은
 * 조용한 수정이지 수정 자체가 아니다.
 *
 * title / description / messages 는 en·ko 만 채웠다 (조각 방식 1차 시험).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const hashChainFacet: FacetJson = {
  id: 'facet:hashChain',
  title: { en: 'Hash Chain', ko: '해시 체인' },
  description: {
    en: 'Each entry carries the previous hash, so one edit breaks everything after it',
    ko: '칸마다 앞의 해시를 품고 있어, 한 번의 수정이 그 뒤를 전부 어긋나게 한다',
  },
  algorithm: 'module:hashChain',
  projector: 'module:hashChainProjector',
  initialData: {
    type: 'hash-chain',
    algorithmLabel: 'SHA-256',
    // 전부 실측 SHA-256. hash = sha256(prev + data), 첫 칸의 prev 는 0 으로 채웠다.
    blocks: [
      {
        data: 'deposit 50',
        prev: '0000000000000000000000000000000000000000000000000000000000000000',
        hash: '0c6513b27fd55a42279d6b7ebdbeb229c75c896e437b0b9af2cbd6ae22e05bab',
      },
      {
        data: 'withdraw 20',
        prev: '0c6513b27fd55a42279d6b7ebdbeb229c75c896e437b0b9af2cbd6ae22e05bab',
        hash: 'fe56a4cedab058595c97176dadbb5ccd8f78c25847efa8fe54af35bb6524f89c',
      },
      {
        data: 'deposit 10',
        prev: 'fe56a4cedab058595c97176dadbb5ccd8f78c25847efa8fe54af35bb6524f89c',
        hash: '2cf4fa4ea76711097f19bddaa064b144ccb549ba1e17180ca7fd77013218c5ba',
      },
      {
        data: 'withdraw 5',
        prev: '2cf4fa4ea76711097f19bddaa064b144ccb549ba1e17180ca7fd77013218c5ba',
        hash: '492b3daec7b50381578e86195a41fff61a4525aaeff64b97c56ebf96106555e1',
      },
    ],
    tamper: {
      index: 1,
      data: 'withdraw 90',
      blocks: [
        {
          data: 'deposit 50',
          prev: '0000000000000000000000000000000000000000000000000000000000000000',
          hash: '0c6513b27fd55a42279d6b7ebdbeb229c75c896e437b0b9af2cbd6ae22e05bab',
        },
        {
          data: 'withdraw 90',
          prev: '0c6513b27fd55a42279d6b7ebdbeb229c75c896e437b0b9af2cbd6ae22e05bab',
          hash: '3ba861d8bc6e9f056d87a15b41f4a6e1a87e5da002cff848186fffb74887993e',
        },
        {
          data: 'deposit 10',
          prev: '3ba861d8bc6e9f056d87a15b41f4a6e1a87e5da002cff848186fffb74887993e',
          hash: '01ebd178d465e257d3957e5d636dba36be4b752358dbb9339fd92128fe149a34',
        },
        {
          data: 'withdraw 5',
          prev: '01ebd178d465e257d3957e5d636dba36be4b752358dbb9339fd92128fe149a34',
          hash: '66c72b4c7f47eaaaa1d68e07a904fde103c63c58c3ac159f6615c2342d140c18',
        },
      ],
    },
    stepMs: 1000,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },
  messages: {
    'caption.linked': {
      en: 'Every entry holds the hash of the one before it.',
      ko: '모든 칸이 앞 칸의 해시를 쥐고 있다.',
    },
    'caption.tampered': {
      en: 'Someone edits an old entry.',
      ko: '누군가 지난 칸의 내용을 고친다.',
    },
    'caption.broken': {
      en: 'Its hash changes, and the next entry is holding the old one.',
      ko: '그 칸의 해시가 바뀌는데, 다음 칸은 옛 값을 쥐고 있다.',
    },
    'caption.cascaded': {
      en: 'The mismatch runs all the way to the end.',
      ko: '어긋남이 끝까지 번진다.',
    },
    'label.prev': { en: 'prev', ko: '앞' },
    'label.hash': { en: 'hash', ko: '해시' },
  },
  blocks: {
    stage: { type: 'chain-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
