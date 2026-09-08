/**
 * @piece
 *
 * 질문: 트라이에서 말을 찾을 때, 글자를 따라 내려가는 길이 어떻게 세 가지
 * 다른 결말(있다 / 길은 있지만 말이 아니다 / 가지가 없어 못 내려간다)로
 * 갈리는가.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const walkPerCharacterFacet: FacetJson = {
  id: 'facet:walkPerCharacter',
  title: { en: 'Walking a trie, one character at a time', ko: '글자 단위로 트라이를 내려간다' },
  algorithm: 'module:walkPerCharacter',
  projector: 'module:walkPerCharacterProjector',
  initialData: {
    type: 'walk-per-character',
    words: ['to', 'tea', 'ten', 'in', 'inn'],
    queries: ['ten', 'te', 'tin'],
    stepMs: 580,
  },
  blocks: {
    stage: { type: 'walk-per-character-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.searchBegin': {
      en: 'looking for "{query}" ({i}/{n})',
      ko: '"{query}" 찾기 ({i}/{n})',
    },
    'caption.stepDown': {
      en: "follow '{char}' down one level",
      ko: "'{char}' 를 따라 한 칸 내려간다",
    },
    'caption.found': {
      en: '"{query}" is a stored word — found',
      ko: '"{query}" — 담겨 있다',
    },
    'caption.noWord': {
      en: 'the path exists, but "{query}" isn’t a stored word',
      ko: '길은 있지만 "{query}" 는 담긴 말이 아니다',
    },
    'caption.blocked': {
      en: "no branch for '{char}' — \"{query}\" stops here",
      ko: "'{char}' 가지가 없다 — \"{query}\" 는 여기서 멈춘다",
    },
  },
};
