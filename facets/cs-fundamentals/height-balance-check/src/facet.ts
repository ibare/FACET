/**
 * height-balance-check — FacetJson 선언. 로직 없음, 선언만 (S-facet).
 *
 * 화면은 **장면**에서 만들어진다 (`scene.ts`) — projector 가 stage 메서드를 부르는
 * 대신, 이벤트가 장면이 되고 `render` 가 그 장면의 화면을 통째로 세운다. 그래서 띠를
 * 끌어 어느 걸음으로 가도 같은 화면이 선다 (S-scene).
 *
 * @piece
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const heightBalanceCheckFacet: FacetJson = {
  id: 'facet:heightBalanceCheck',
  title: {
    en: 'Height Balance Check',
    ko: '균형 인수',
    ja: '高さの均衡チェック',
    zh: '高度平衡检查',
    ar: 'فحص توازن الارتفاع',
    es: 'Comprobación del equilibrio de altura',
    fr: "Vérification de l'équilibre des hauteurs",
    hi: 'ऊँचाई संतुलन जाँच',
    id: 'Pemeriksaan keseimbangan tinggi',
    pt: 'Verificação do equilíbrio de altura',
  },
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
  scene: 'module:heightBalanceCheckScene',
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
      controls: CONTROL_SET.pieceScrub,
    },
  },
};
