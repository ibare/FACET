/**
 * @piece
 *
 * sift-down — 하향 재배치. 꼭대기를 빼면 자리가 비고, 맨 끝 값이 그 자리로
 * 올라가 두 자식 중 앞선 쪽과 맞바꾸며 한 칸씩 내려간다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const siftDownFacet: FacetJson = {
  id: 'facet:siftDown',
  title: { en: 'Sift Down', ko: '하향 재배치' },
  description: {
    en: 'The last value fills the empty top, then walks down one step at a time until it fits.',
    ko: '맨 끝 값이 빈 꼭대기를 메우고, 제 자리를 찾을 때까지 한 칸씩 내려간다.',
    ja: '最後の値が空いた頂上を埋め、収まる場所まで一段ずつ降りていく。',
    zh: '最后一个值填上空出的顶端，再一格一格往下走到合适的位置。',
    ar: 'تملأ القيمة الأخيرة القمة الفارغة، ثم تنزل خطوة خطوة حتى تستقر.',
    es: 'El último valor ocupa la cima vacía y baja un paso a la vez hasta encajar.',
    fr: 'La dernière valeur comble le sommet vide, puis descend une case à la fois.',
    hi: 'अंतिम मान खाली शिखर को भरता है, फिर एक-एक कदम नीचे उतरकर अपनी जगह पाता है।',
    id: 'Nilai terakhir mengisi puncak yang kosong, lalu turun setapak demi setapak sampai pas.',
    pt: 'O último valor preenche o topo vazio e desce um passo de cada vez até se encaixar.',
  },
  algorithm: 'module:siftDown',
  projector: 'module:siftDownProjector',
  initialData: {
    type: 'sift-down',
    values: [3, 5, 8, 9, 6, 12, 10],
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'sift-down-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.extract': { en: 'Remove the top value {v}', ko: '꼭대기 값 {v} 을 뺀다' },
    'caption.fill': {
      en: 'Move the last value {v} into the empty top',
      ko: '맨 끝 값 {v} 을 빈 자리로 올린다',
    },
    'caption.compareTwo': {
      en: 'Compare children {l} and {r} — {w} is smaller',
      ko: '두 자식 {l} · {r} 중 {w} 이 더 작다',
    },
    'caption.compareOne': {
      en: 'Only one child, {l} — compare with it',
      ko: '자식이 {l} 하나뿐이라 그쪽과 견준다',
    },
    'caption.swap': { en: 'Swap places and sink down', ko: '자리를 맞바꾸며 한 칸 내려간다' },
    'caption.settle': {
      en: 'Smaller than both children (or none left) — stop here',
      ko: '두 자식보다 앞서거나 자식이 없어 멈춘다',
    },
  },
};
