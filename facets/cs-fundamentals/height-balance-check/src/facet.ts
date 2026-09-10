/**
 * height-balance-check — FacetJson 선언. 로직 없음, 선언만 (S-facet).
 *
 * @piece
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const heightBalanceCheckFacet: FacetJson = {
  id: 'facet:heightBalanceCheck',
  title: { en: 'Height Balance Check', ko: '균형 인수' },
  description: {
    en: 'The balance factor is not read from above — it is carried up from the leaves.',
    ko: '균형 인수는 위에서 내려다보아 얻는 것이 아니라 잎에서부터 올라오며 쌓인다.',
    ja: '均衡因子は上から見て得るものではなく、葉から上へ運ばれて積み上がる。',
    zh: '平衡因子不是从上往下看出来的，而是从叶子一层层带上来的。',
    ar: 'عامل التوازن لا يُقرأ من الأعلى، بل يُحمل صاعدًا من الأوراق.',
    es: 'El factor de equilibrio no se lee desde arriba: sube desde las hojas.',
    fr: "Le facteur d'équilibre ne se lit pas d'en haut : il remonte depuis les feuilles.",
    hi: 'संतुलन गुणांक ऊपर से नहीं पढ़ा जाता — यह पत्तियों से ऊपर की ओर चढ़ता है।',
    id: 'Faktor keseimbangan tidak dibaca dari atas — ia dibawa naik dari daun.',
    pt: 'O fator de equilíbrio não se lê de cima: ele sobe a partir das folhas.',
  },
  algorithm: 'module:heightBalanceCheck',
  projector: 'module:heightBalanceCheckProjector',
  initialData: {
    type: 'height-balance-check',
    stepMs: 680,
    root: {
      value: 30,
      left: {
        value: 20,
        left: { value: 10 },
      },
      right: {
        value: 40,
        right: {
          value: 50,
          right: { value: 60 },
        },
      },
    },
  },
  blocks: {
    stage: { type: 'height-balance-check-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
