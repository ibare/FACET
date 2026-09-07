/**
 * HashSalt facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "같은 비밀번호를 쓴 두 사람이 왜 다르게 저장되는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 걸음 순서가 논증이다. 소금 없이 저장하면 두 값이 같아진다는 문제를 먼저 보이고
 * (2걸음), 소금이 붙는 순간을 주인공으로 세운 뒤 (3걸음), 값이 갈리는 것으로
 * 끝낸다 (4걸음). 소금부터 보이면 무엇을 푸는 장치인지 알 수 없다.
 *
 * 해시는 전부 실측 SHA-256 이다. 소금은 앞에 붙였다 — sha256(salt + password).
 *
 * 각주가 밝히는 전제: 소금은 비밀이 아니라 해시 옆에 그대로 저장된다. 감추는
 * 장치가 아니라 저장값을 저마다 다르게 만드는 장치다.
 *
 * title / description / messages 는 en·ko 만 채웠다 (조각 방식 1차 시험).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const hashSaltFacet: FacetJson = {
  id: 'facet:hashSalt',
  title: { en: 'Same Password, Different Rows', ko: '같은 비밀번호, 다른 저장값' },
  description: {
    en: 'A per-account salt keeps two identical passwords from being stored identically',
    ko: '계정마다 다른 소금이 같은 비밀번호를 같게 저장되지 않도록 막는다',
  },
  algorithm: 'module:hashSalt',
  projector: 'module:hashSaltProjector',
  initialData: {
    type: 'hash-salt',
    algorithmLabel: 'SHA-256',
    password: 'hunter2',
    // 전부 실측 SHA-256. unsaltedHash 는 sha256(password), 각 행은 sha256(salt + password).
    unsaltedHash: 'f52fbd32b2b3b86ff88ef6c490628285f482af15ddcb29541f94bcf526a3f6c7',
    users: [
      {
        name: 'alice',
        salt: 'x7Kq2m',
        hash: 'c7d1f6a6c63dabd2d2419fd0a65fbd4e44fe5e41959ef681de2f814084533ef4',
      },
      {
        name: 'bob',
        salt: '9pLw4z',
        hash: '8d20da998cc6f4bb2d6e1b63bd534a576410854f2d7ce9ce262a91327fc74454',
      },
    ],
    stepMs: 1000,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },
  messages: {
    'caption.base': {
      en: 'Two people picked the same password, but what gets stored is not the same.',
      ko: '두 사람이 같은 비밀번호를 골랐는데, 저장되는 값은 같지 않다.',
    },
    'caption.samePassword': {
      en: 'Both chose the same password.',
      ko: '둘이 같은 비밀번호를 골랐다.',
    },
    'caption.unsalted': {
      en: 'Hashed as they are, both rows store the same value — cracking one cracks the other.',
      ko: '그대로 해싱하면 두 행이 같은 값을 저장한다 — 하나가 뚫리면 다른 하나도 뚫린다.',
    },
    'caption.salting': {
      en: 'Each account gets its own salt, put in front of the password.',
      ko: '계정마다 자기 소금을 받아 비밀번호 앞에 붙인다.',
    },
    'caption.salted': {
      en: 'The same password now stores two unrelated values.',
      ko: '같은 비밀번호가 이제 아무 관계 없는 두 값으로 저장된다.',
    },
    'label.password': { en: 'password', ko: '비밀번호' },
    'label.salt': { en: 'salt', ko: '소금' },
    'label.stored': { en: 'what gets stored', ko: '저장되는 값' },
    'label.identical': { en: 'identical', ko: '똑같다' },
    'label.different': { en: 'different', ko: '갈렸다' },
    'label.note': {
      en: 'The salt is stored in the clear next to the hash — it is not a secret, only a way to make every stored value unique.',
      ko: '소금은 해시 옆에 그대로 저장된다 — 비밀이 아니라 저장값을 저마다 다르게 만드는 장치다.',
    },
  },
  blocks: {
    stage: { type: 'salt-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
};
