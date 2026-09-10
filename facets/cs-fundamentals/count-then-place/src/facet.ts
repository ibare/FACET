/**
 * @piece 계수 배치 — 값의 범위가 좁으면 세는 것만으로 자리가 정해지고, 견줌이 아예
 * 필요 없다는 것을 보이는 조각.
 *
 * 정렬을 "견주는 일" 과 동의어로 아는 독자에게, 견줌 횟수의 하한(n log n)이 여기에
 * 적용되지 않는 까닭을 화면으로 말한다. 그래서 이 조각의 화면에는 두 값을 나란히
 * 놓는 장면이 한 번도 없다.
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const countThenPlaceFacet: FacetJson = {
  id: 'facet:countThenPlace',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'Counting Sort Placement',
    ko: '계수 배치',
    ja: '計数ソートの配置',
    zh: '计数排序的放置',
    ar: 'ترتيب العد والتوزيع',
    es: 'Colocación por conteo',
    fr: 'Placement par comptage',
    hi: 'गिनती से स्थान-निर्धारण',
    id: 'Penempatan urut-hitung',
    pt: 'Colocação por contagem',
  },
  description: {
    en: 'Tallying each value fixes every slot in advance — no value is ever compared with another.',
    ko: '값마다 세어 두면 자리가 미리 정해진다 — 값끼리 견주는 일이 한 번도 없다.',
    ja: '値ごとに数えておけば、置き場所はあらかじめ決まる — 値どうしを見比べることは一度もない。',
    zh: '把每个值先数一遍，位置就都提前定下了 — 从不拿两个值互相比较。',
    ar: 'إحصاء كل قيمة يحدد كل خانة مسبقًا — ولا تُقارن قيمة بأخرى قط.',
    es: 'Contar cada valor fija de antemano todas las casillas: nunca se compara un valor con otro.',
    fr: "Compter chaque valeur fixe d'avance toutes les places — aucune valeur n'est jamais comparée à une autre.",
    hi: 'हर मान की गिनती कर लेने से हर खाना पहले ही तय हो जाता है — किसी मान की तुलना दूसरे से होती ही नहीं।',
    id: 'Menghitung tiap nilai menetapkan semua slot lebih dulu — tak ada nilai yang pernah dibandingkan dengan yang lain.',
    pt: 'Contar cada valor fixa todas as casas de antemão — nenhum valor é comparado com outro.',
  },
  algorithm: 'module:countThenPlace',
  projector: 'module:countThenPlaceProjector',
  initialData: {
    type: 'count-then-place',
    values: [2, 0, 1, 2, 0, 2],
    range: 3,
    stepMs: 500,
  },
  blocks: {
    stage: { type: 'count-then-place-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.count': {
      en: 'Tally how many of each value there are',
      ko: '값마다 몇 개인지 눈금을 쌓는다',
      ja: '値ごとに何個あるかを数え上げる',
      zh: '数一数每个值各有多少个',
      ar: 'أحصِ كم عدد كل قيمة',
      es: 'Cuenta cuántos hay de cada valor',
      fr: 'Compter combien il y a de chaque valeur',
      hi: 'गिनें कि हर मान कितनी बार आया',
      id: 'Hitung ada berapa untuk tiap nilai',
      pt: 'Conte quantos há de cada valor',
    },
    'caption.settle': {
      en: 'The tallies harden into starting slot numbers',
      ko: '눈금 더미가 시작 자리 번호로 굳는다',
      ja: '数えた山が、開始位置の番号へと固まる',
      zh: '这些计数凝成各自的起始位置编号',
      ar: 'تتحول الإحصاءات إلى أرقام مواضع البداية',
      es: 'Los conteos se cuajan en números de casilla inicial',
      fr: 'Les comptes se figent en numéros de case de départ',
      hi: 'गिनतियाँ जमकर शुरुआती खाने के नंबर बन जाती हैं',
      id: 'Hitungan itu mengeras menjadi nomor slot awal',
      pt: 'As contagens endurecem em números de casa inicial',
    },
    'caption.place': {
      en: 'Each value goes straight to its own number',
      ko: '값이 제 번호로 곧장 간다',
      ja: '値はそれぞれ自分の番号へ真っ直ぐ行く',
      zh: '每个值径直走向属于自己的编号',
      ar: 'كل قيمة تذهب مباشرة إلى رقمها',
      es: 'Cada valor va derecho a su propio número',
      fr: 'Chaque valeur va droit à son propre numéro',
      hi: 'हर मान सीधे अपने नंबर पर चला जाता है',
      id: 'Tiap nilai langsung menuju nomornya sendiri',
      pt: 'Cada valor vai direto ao seu próprio número',
    },
    'caption.done': {
      en: 'Sorted without comparing a single pair',
      ko: '한 쌍도 견주지 않고 정렬이 끝났다',
      ja: '一組も見比べずに並び終わった',
      zh: '没比过任何一对，就排好了',
      ar: 'تم الترتيب دون مقارنة زوج واحد',
      es: 'Ordenado sin comparar un solo par',
      fr: 'Trié sans comparer une seule paire',
      hi: 'एक भी जोड़ी की तुलना किए बिना क्रम लग गया',
      id: 'Terurut tanpa membandingkan satu pasang pun',
      pt: 'Ordenado sem comparar um único par',
    },
  },
};
