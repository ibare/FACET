/**
 * @piece
 *
 * 경로 압축 — 뿌리를 찾아 오른 김에, 지나온 자리 전부를 뿌리에 곧장 다시
 * 붙이면 그 길 위의 모든 자리가 함께 싸진다는 것을 보여준다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const pathCompressionFacet: FacetJson = {
  id: 'facet:pathCompression',
  title: { en: 'Path Compression', ko: '경로 압축' },
  description: {
    en: 'Climbing to the root pays off for every node on the way, not just the one you asked about.',
    ko: '뿌리까지 오르는 수고는 물어본 자리 하나가 아니라 그 길 위의 모든 자리를 함께 싸게 만든다.',
  },
  algorithm: 'module:pathCompression',
  projector: 'module:pathCompressionProjector',
  initialData: {
    type: 'path-compression',
    parent: [0, 0, 1, 2, 3],
    query: 4,
    stepMs: 680,
  },
  blocks: {
    stage: { type: 'path-compression-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.queryBegin': {
      en: 'Ask where {node} leads, all the way to the root',
      ko: '{node}가 어디로 이어지는지, 뿌리까지 묻는다',
    },
    'caption.climb': {
      en: '{from} points up to {to}',
      ko: '{from}은 {to}를 가리킨다',
    },
    'caption.rootFirst': {
      en: '{node} reached root {root} after {hops} hops',
      ko: '{node}는 {hops}칸을 올라 뿌리 {root}에 닿았다',
    },
    'caption.rootAfter': {
      en: '{node} now reaches {root} in {hops} hop — it used to take {hopsBefore}',
      ko: '{node}는 이제 {hops}칸 만에 {root}에 닿는다 — 전에는 {hopsBefore}칸이었다',
    },
    'caption.compress': {
      en: 'Compressing — every node on the path now points straight to {root}',
      ko: '접는다 — 지나온 자리 전부가 이제 {root}를 곧장 가리킨다',
    },
    'caption.summary': {
      en: '{before} hops become {after}',
      ko: '{before}칸이 {after}칸이 된다',
    },
    'caption.rewind': {
      en: 'Replaying from the start',
      ko: '처음부터 다시 보여준다',
    },
    'label.hopCount': {
      en: 'hop {n}',
      ko: '{n}칸',
    },
  },
};
