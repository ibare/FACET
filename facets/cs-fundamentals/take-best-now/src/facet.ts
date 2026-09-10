/**
 * take-best-now — FacetJson 선언.
 *
 * @piece 조각. 한 질문에만 답한다 —
 *        "그리디는 매 순간 무엇을 보고 무엇을 하는가."
 *        답: 지금 남은 몫 하나만 보고 거기 들어가는 가장 큰 것을 집는다.
 *        재는 걸음도 무르는 걸음도 없어서 절차가 짧다.
 *
 * 동전 25 · 10 · 5 · 1 로 41 을 만든다. 집는 차례와 남은 몫은 알고리즘이 셈한다 —
 * 여기에는 재료(동전과 금액)만 있고 답은 없다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const takeBestNowFacet: FacetJson = {
  id: 'facet:takeBestNow',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Greedy Choice',
    ko: '그리디 선택',
    ja: '貪欲な選択',
    zh: '贪心选择',
    ar: 'الاختيار الجشع',
    es: 'Elección voraz',
    fr: 'Choix glouton',
    hi: 'लालची चयन',
    id: 'Pilihan serakah',
    pt: 'Escolha gulosa',
  },
  description: {
    en: 'One rule, one pick, no second look — the largest coin that still fits comes down, and what is left shrinks',
    ko: '기준 하나로 하나를 집고 돌아보지 않는다 — 남은 몫에 들어가는 가장 큰 동전이 내려오고 몫이 줄어든다',
    ja: '基準ひとつで一枚を取り、振り返らない — 残りに収まる最大の硬貨が下り、残りが減る',
    zh: '一条规则，取一枚，绝不回头 — 还装得下的最大硬币落下，余额随之变小',
    ar: 'قاعدة واحدة واختيار واحد بلا تراجع — تنزل أكبر عملة لا تزال تناسب، فيتقلّص الباقي',
    es: 'Una regla, una elección, sin mirar atrás: baja la moneda más grande que aún cabe y lo que resta se encoge',
    fr: 'Une règle, un choix, sans retour en arrière — la plus grosse pièce qui tient encore descend et le reste diminue',
    hi: 'एक नियम, एक चुनाव, कोई पुनर्विचार नहीं — जो सबसे बड़ा सिक्का अब भी समाता है वह उतरता है और बचा हुआ घटता है',
    id: 'Satu aturan, satu pilihan, tanpa menoleh — koin terbesar yang masih muat turun dan sisanya menyusut',
    pt: 'Uma regra, uma escolha, sem olhar para trás — desce a maior moeda que ainda cabe e o que resta encolhe',
  },
  algorithm: 'module:takeBestNow',
  projector: 'module:takeBestNowProjector',
  initialData: {
    type: 'take-best-now',
    coins: [25, 10, 5, 1],
    target: 41,
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'take-best-now-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'label.taken': {
      en: 'Taken',
      ko: '집은 것',
      ja: '取った',
      zh: '已取',
      ar: 'المأخوذ',
      es: 'Tomadas',
      fr: 'Prises',
      hi: 'लिए गए',
      id: 'Diambil',
      pt: 'Pegas',
    },
    'label.remaining': {
      en: 'Remaining',
      ko: '남은 몫',
      ja: '残り',
      zh: '剩余',
      ar: 'المتبقي',
      es: 'Restante',
      fr: 'Reste',
      hi: 'शेष',
      id: 'Sisa',
      pt: 'Restante',
    },
    'caption.goal': {
      en: 'Make {target} out of these.',
      ko: '이것들로 {target}을 만든다.',
      ja: 'これらで {target} をつくる。',
      zh: '用这些凑出 {target}。',
      ar: 'كوّن {target} من هذه.',
      es: 'Forma {target} con estas.',
      fr: 'Former {target} avec celles-ci.',
      hi: 'इनसे {target} बनाएँ।',
      id: 'Bentuk {target} dari koin-koin ini.',
      pt: 'Formar {target} com estas.',
    },
    'caption.take': {
      en: 'Takes {coin} — the largest that fits in {before}.',
      ko: '{before}에 들어가는 가장 큰 것은 {coin}. 집어 내린다.',
      ja: '{before} に収まる最大は {coin} — それを取る。',
      zh: '取 {coin} — 装得进 {before} 的最大面额。',
      ar: 'يأخذ {coin} — الأكبر الذي يناسب {before}.',
      es: 'Toma {coin}: la mayor que cabe en {before}.',
      fr: 'Prend {coin} — la plus grosse qui tient dans {before}.',
      hi: '{coin} लिया — {before} में समाने वाला सबसे बड़ा।',
      id: 'Ambil {coin} — terbesar yang muat dalam {before}.',
      pt: 'Pega {coin} — a maior que cabe em {before}.',
    },
    'caption.done': {
      en: '{count} coins make {target}. Not one was put back.',
      ko: '동전 {count}닢으로 {target}. 무른 것은 하나도 없다.',
      ja: '硬貨 {count} 枚で {target}。戻したものは一枚もない。',
      zh: '{count} 枚硬币凑成 {target}。一枚也没退回。',
      ar: '{count} عملات تُكوّن {target}. لم تُعَد أي واحدة.',
      es: '{count} monedas hacen {target}. Ninguna se devolvió.',
      fr: "{count} pièces font {target}. Aucune n'a été rendue.",
      hi: '{count} सिक्कों से {target}। एक भी वापस नहीं रखा गया।',
      id: '{count} koin menjadi {target}. Tak satu pun dikembalikan.',
      pt: '{count} moedas fazem {target}. Nenhuma foi devolvida.',
    },
  },
};
