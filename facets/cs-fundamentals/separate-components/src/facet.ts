/**
 * separateComponents facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "한 번의 탐색으로 그래프 전체를 볼 수 없는 이유는 무엇인가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음 / 제목 없음 / 한 주장 / 메트릭 없음 /
 * 캔버스 폭은 러너가 정함 / 코드 패널 없음 / layout 선언 없음.
 *
 * initialData 에는 **구조만** 있다. 덩어리가 몇 개인지, 각각 크기가 얼마인지,
 * 몇 번 출발해야 하는지는 전부 알고리즘이 이 구조를 훑어 셈해 화면에 올린다.
 * (셋 · 3 2 3 · 세 번이 나오지만 그 숫자는 선언 어디에도 적혀 있지 않다.)
 *
 * `holdMs` 는 한 번의 탐색이 끝난 자리에서 화면을 붙잡아 두는 시간이다. 곧바로
 * 다음 출발로 넘어가면 "남는다" 는 주장이 사라지므로, 얼마나 오래 멈춰 있을지도
 * 저작 결정으로 선언에 둔다 (걸음 간격과 같은 이유).
 *
 * title / description / messages 는 열 언어를 채웠다 (S-piece).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const separateComponentsFacet: FacetJson = {
  id: 'facet:separateComponents',
  title: {
    en: 'Separate Components',
    ko: '나뉜 덩어리',
    ja: '分かれた連結成分',
    zh: '互不相连的分块',
    ar: 'المكوّنات المنفصلة',
    es: 'Componentes separadas',
    fr: 'Composantes séparées',
    hi: 'अलग-अलग घटक',
    id: 'Komponen terpisah',
    pt: 'Componentes separadas',
  },
  description: {
    en: 'One search never leaves its own group — the rest stay unlit until you start over',
    ko: '한 번의 탐색은 자기 덩어리 밖으로 나가지 못한다 — 나머지는 새로 출발해야 켜진다',
    ja: '一度の探索は自分の塊から外へ出られない — 残りは出発し直さないと灯らない',
    zh: '一次搜索走不出自己所在的分块 — 其余的要重新出发才会亮',
    ar: 'بحث واحد لا يغادر مجموعته أبدًا — والبقية تبقى مطفأة حتى تبدأ من جديد',
    es: 'Una búsqueda nunca sale de su propio grupo: el resto sigue apagado hasta que empiezas de nuevo',
    fr: "Une recherche ne sort jamais de son propre groupe — le reste reste éteint tant qu'on ne repart pas",
    hi: 'एक खोज अपने ही समूह से बाहर नहीं जाती — बाकी तब तक बुझे रहते हैं जब तक नए सिरे से शुरू न करें',
    id: 'Satu penelusuran tidak pernah keluar dari kelompoknya — sisanya tetap padam sampai kamu mulai lagi',
    pt: 'Uma busca nunca sai do próprio grupo — o resto fica apagado até você recomeçar',
  },
  algorithm: 'module:separateComponents',
  projector: 'module:separateComponentsProjector',
  initialData: {
    type: 'separate-components',
    // 정점 순서가 곧 "남은 것 중 어디서 다시 출발할지" 를 정한다. 첫 출발은 A.
    nodes: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    // 무방향 간선. 잇지 않은 자리는 화면에서 빈 자리로 남는다.
    edges: [
      ['A', 'B'],
      ['B', 'C'],
      ['A', 'C'],
      ['D', 'E'],
      ['F', 'G'],
      ['G', 'H'],
    ],
    stepMs: 800,
    holdMs: 1500,
  },
  // 정점 순서가 출발 순서를 정하므로 섞으면 안 된다.
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'The search starts at {node} and lights up whatever it reaches.',
      ko: '{node} 에서 탐색을 시작해 닿는 것을 켠다.',
      ja: '探索は {node} から始まり、届いたものを灯していく。',
      zh: '搜索从 {node} 出发，把能到达的都点亮。',
      ar: 'يبدأ البحث من {node} ويضيء كل ما يصل إليه.',
      es: 'La búsqueda arranca en {node} e ilumina todo lo que alcanza.',
      fr: "La recherche part de {node} et allume tout ce qu'elle atteint.",
      hi: 'खोज {node} से शुरू होती है और जहाँ तक पहुँचती है उसे जला देती है।',
      id: 'Penelusuran mulai dari {node} dan menyalakan apa pun yang dijangkaunya.',
      pt: 'A busca começa em {node} e acende tudo o que alcança.',
    },
    'caption.remains': {
      en: 'The search is over — {lit} lit, and {remaining} stay dark.',
      ko: '탐색이 끝났다 — {lit} 개가 켜지고 {remaining} 개는 꺼진 채 남는다.',
      ja: '探索が終わった — {lit} 個が灯り、{remaining} 個は消えたまま残る。',
      zh: '搜索结束 — 亮了 {lit} 个，{remaining} 个仍是暗的。',
      ar: 'انتهى البحث — أضاء {lit} وبقي {remaining} مطفأً.',
      es: 'La búsqueda terminó: {lit} encendidos y {remaining} siguen a oscuras.',
      fr: 'La recherche est finie — {lit} allumés, et {remaining} restent éteints.',
      hi: 'खोज खत्म — {lit} जले, और {remaining} अँधेरे में रह गए।',
      id: 'Penelusuran selesai — {lit} menyala, {remaining} tetap gelap.',
      pt: 'A busca acabou — {lit} acesos e {remaining} continuam apagados.',
    },
    'caption.restart': {
      en: 'It cannot cross over — only a fresh start reaches what is left.',
      ko: '건너가지 못한다 — 남은 것에서 새로 출발해야 비로소 켜진다.',
      ja: '渡っていくことはできない — 残ったところから出発し直して初めて灯る。',
      zh: '过不去 — 只有重新出发，剩下的才会亮。',
      ar: 'لا يمكنه العبور — لا يصل إلى ما تبقّى إلا بداية جديدة.',
      es: 'No puede cruzar: solo un nuevo arranque alcanza lo que queda.',
      fr: 'La recherche ne peut pas traverser — seul un nouveau départ atteint ce qui reste.',
      hi: 'यह पार नहीं जा सकती — बचे हुए तक सिर्फ़ नई शुरुआत ही पहुँचती है।',
      id: 'Ia tidak bisa menyeberang — hanya awal yang baru menjangkau sisanya.',
      pt: 'Ela não consegue atravessar — só um novo começo alcança o que restou.',
    },
    'caption.done': {
      en: '{starts} starts were needed — {starts} separate groups, sized {sizes}.',
      ko: '출발이 {starts} 번 필요했다 — 나뉜 덩어리가 {starts} 개, 크기는 {sizes}.',
      ja: '出発が {starts} 回必要だった — 分かれた塊が {starts} 個、大きさは {sizes}。',
      zh: '一共需要出发 {starts} 次 — 分块有 {starts} 个，大小是 {sizes}。',
      ar: 'لزم {starts} من البدايات — {starts} مجموعات منفصلة بأحجام {sizes}.',
      es: 'Hicieron falta {starts} arranques: {starts} grupos separados, de tamaños {sizes}.',
      fr: 'Il a fallu {starts} départs — {starts} groupes séparés, de tailles {sizes}.',
      hi: '{starts} बार शुरू करना पड़ा — {starts} अलग समूह, आकार {sizes}।',
      id: 'Dibutuhkan {starts} kali mulai — {starts} kelompok terpisah, berukuran {sizes}.',
      pt: 'Foram precisos {starts} começos — {starts} grupos separados, de tamanhos {sizes}.',
    },
  },
  blocks: {
    stage: { type: 'separate-components-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
