/**
 * sharePrefixPath facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "같은 앞글자로 시작하는 낱말들은 자리를 어떻게 나눠 쓰는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나 + 한 걸음씩 짚기 하나) / 제목
 * 없음 / 한 주장 / 메트릭 없음 / 캔버스 폭 620 / 전제를 글에서 밝힌다.
 *
 * words 는 실측 순서 그대로다 — car → cart → cat → dog. 결과 자리 수(뿌리 포함
 * 아홉), 따로 담았을 때의 글자 수(3+4+3+3=13), 아낀 수(4)는 전부 algorithm 이
 * words 를 실제로 순회해 계산한 값이다 (지어내지 않는다, S-piece MUST).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const sharePrefixPathFacet: FacetJson = {
  id: 'facet:sharePrefixPath',
  title: { en: 'Shared Prefix Path', ko: '접두사 공유' },
  description: {
    en: 'Words that share a beginning ride the same path until the letters split',
    ko: '같은 앞글자는 글자가 갈라지기 전까지 같은 길을 탄다',
  },
  algorithm: 'module:sharePrefixPath',
  projector: 'module:sharePrefixPathProjector',
  initialData: {
    type: 'share-prefix-path',
    words: ['car', 'cart', 'cat', 'dog'],
    stepMs: 620,
  },
  shuffleOnReset: false,
  messages: {
    'caption.begin': {
      en: "Inserting '{word}'.",
      ko: "'{word}' 를 넣는다.",
    },
    'caption.wordEnd': {
      en: "'{word}': rode {rode}, grew {grown}.",
      ko: "'{word}': 탄 자리 {rode} · 새 자리 {grown}.",
    },
    'caption.summary': {
      en: '{wordCount} words, {totalSeats} seats (root included) instead of {rawChars} separate ones — saved {saved}.',
      ko: '낱말 {wordCount}개, 자리 {totalSeats}개(뿌리 포함) — 따로 담았다면 {rawChars}개, {saved}개를 아꼈다.',
    },
  },
  blocks: {
    stage: { type: 'share-prefix-path-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
