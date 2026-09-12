/**
 * @piece 이웃을 미리 이어 둔다 — 길이 있으면 걸어서 찾아간다.
 *
 * 질문 하나에 답한다: 전부 재지 않고 어떻게 가장 가까운 점에 다다르는가.
 * 그래프를 어떻게 짓는지, 층을 어떻게 나누는지는 다른 조각의 몫이다.
 *
 * 선언에 두는 것은 구조다 — 점의 좌표, 질의, 이웃 수, 출발점. 이웃 목록과 거리는
 * algorithm 이 좌표에서 셈하고, 화면의 자리는 stage 가 캔버스에서 역산한다 (S-piece).
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const neighborsLinkedAheadFacet: FacetJson = {
  id: 'facet:neighborsLinkedAhead',
  title: {
    en: 'Neighbours linked ahead',
    ko: '이웃을 미리 이어 둔다',
    ja: '近い点をあらかじめつないでおく',
    zh: '预先连好邻居',
    ar: 'الجيران موصولون مسبقًا',
    es: 'Vecinos enlazados de antemano',
    fr: "Voisins reliés à l'avance",
    hi: 'पड़ोसी पहले से जुड़े हुए',
    id: 'Tetangga yang sudah terhubung lebih dulu',
    pt: 'Vizinhos ligados de antemão',
  },
  description: {
    en: 'If the paths are already there, you can walk to the answer instead of measuring everything.',
    ko: '길이 미리 놓여 있으면, 전부 재는 대신 걸어서 답에 다다를 수 있다.',
    ja: '道が先に引かれていれば、すべてを測らずに歩いて答えにたどり着ける。',
    zh: '路若已经铺好，就不必逐一度量，走过去便能找到答案。',
    ar: 'إذا كانت المسارات موجودة مسبقًا، يمكنك السير إلى الإجابة بدل قياس كل شيء.',
    es: 'Si los caminos ya existen, puedes caminar hasta la respuesta en vez de medirlo todo.',
    fr: "Si les chemins existent déjà, on marche jusqu'à la réponse au lieu de tout mesurer.",
    hi: 'यदि रास्ते पहले से बने हों, तो सब कुछ नापने के बजाय चलकर उत्तर तक पहुँचा जा सकता है।',
    id: 'Kalau jalannya sudah ada, kita bisa berjalan ke jawaban alih-alih mengukur semuanya.',
    pt: 'Se os caminhos já existem, dá para caminhar até a resposta em vez de medir tudo.',
  },
  algorithm: 'module:neighborsLinkedAhead',
  projector: 'module:neighborsLinkedAheadProjector',
  initialData: {
    type: 'neighbors-linked-ahead',
    points: [
      { x: 1, y: 1 },
      { x: 2, y: 3 },
      { x: 4, y: 2 },
      { x: 5, y: 4 },
      { x: 7, y: 3 },
      { x: 8, y: 5 },
      { x: 3, y: 6 },
      { x: 6, y: 7 },
      { x: 9, y: 8 },
      { x: 2, y: 8 },
      { x: 5, y: 9 },
      { x: 8, y: 1 },
    ],
    query: { x: 7, y: 8 },
    neighborCount: 5,
    /**
     * 출발점. 여기서 세 걸음(p0 → p3 → p5 → p7)에 닿아 "거기서 다시 더 가까운
     * 이웃으로" 가 두 번 이상 보인다.
     *
     * **첫 걸음에 동점이 있다** — p0 에서 p3 와 p6 이 질의로부터 똑같이 떨어져
     * 있어 이웃 차례가 가른다. 옮기고 싶어질 자리인데, 열두 점을 전부 재 보면
     * **세 걸음짜리 출발점은 p0 · p1 · p2 셋뿐이고 그 셋이 전부 같은 동점을
     * 만난다.** 동점을 피하면 걸음이 둘 이하로 줄어(p11 은 두 걸음, 나머지는
     * 한 걸음) 이 조각이 보이려는 되풀이가 한 번밖에 남지 않는다.
     *
     * 즉 세 걸음과 동점 없음은 이 데이터에서 양립하지 않는다. 어느 쪽을 골라도
     * p7 에 닿으므로 화면이 거짓을 말하지는 않는다.
     */
    start: 0,
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'neighbors-linked-ahead-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.begin': {
      en: 'Every dot is already linked to its {k} nearest. Stand on one.',
      ko: '점마다 가장 가까운 {k} 개가 이미 이어져 있다. 한 곳에 선다.',
      ja: '点はそれぞれ最も近い {k} 個とすでにつながっている。まず一つに立つ。',
      zh: '每个点都已与最近的 {k} 个相连。先站到其中一个上。',
      ar: 'كل نقطة موصولة سلفًا بأقرب {k} نقاط. قف على واحدة منها.',
      es: 'Cada punto ya está enlazado con sus {k} más cercanos. Sitúate en uno.',
      fr: "Chaque point est déjà relié à ses {k} plus proches. Placez-vous sur l'un d'eux.",
      hi: 'हर बिंदु अपने निकटतम {k} से पहले ही जुड़ा है। किसी एक पर खड़े हों।',
      id: 'Setiap titik sudah terhubung ke {k} tetangga terdekatnya. Berdirilah di salah satunya.',
      pt: 'Cada ponto já está ligado aos seus {k} mais próximos. Fique sobre um deles.',
    },
    'caption.probe': {
      en: 'Look only at the neighbours of where you stand.',
      ko: '선 자리의 이웃만 본다.',
      ja: '今立っている点の隣だけを見る。',
      zh: '只看当前所站点的邻居。',
      ar: 'انظر إلى جيران موضعك فقط.',
      es: 'Mira solo los vecinos de donde estás.',
      fr: 'Ne regardez que les voisins de votre position.',
      hi: 'जहाँ खड़े हैं, केवल उसके पड़ोसियों को देखें।',
      id: 'Lihat hanya tetangga dari tempat berdiri.',
      pt: 'Olhe apenas os vizinhos de onde você está.',
    },
    'caption.move': {
      en: 'One of them sits closer to the query. Step onto it.',
      ko: '그중 하나가 질의에 더 가깝다. 그쪽으로 발을 옮긴다.',
      ja: 'その中の一つが問い合わせ点により近い。そこへ足を移す。',
      zh: '其中一个离查询点更近。把脚移过去。',
      ar: 'إحداها أقرب إلى نقطة الاستعلام. انتقل إليها.',
      es: 'Uno de ellos está más cerca de la consulta. Da el paso hacia él.',
      fr: "L'un d'eux est plus proche de la requête. Faites un pas vers lui.",
      hi: 'उनमें से एक प्रश्न-बिंदु के अधिक निकट है। वहीं कदम बढ़ाएँ।',
      id: 'Salah satunya lebih dekat ke titik kueri. Melangkahlah ke sana.',
      pt: 'Um deles está mais perto da consulta. Dê o passo até ele.',
    },
    'caption.settle': {
      en: 'No neighbour is closer. The walk stops here.',
      ko: '더 가까운 이웃이 없다. 걸음은 여기서 멎는다.',
      ja: 'より近い隣はない。歩みはここで止まる。',
      zh: '没有更近的邻居了。行走到此为止。',
      ar: 'لا يوجد جار أقرب. تتوقف المسيرة هنا.',
      es: 'Ningún vecino está más cerca. El recorrido termina aquí.',
      fr: "Aucun voisin n'est plus proche. La marche s'arrête ici.",
      hi: 'कोई पड़ोसी और निकट नहीं है। चाल यहीं रुक जाती है।',
      id: 'Tidak ada tetangga yang lebih dekat. Langkah berhenti di sini.',
      pt: 'Nenhum vizinho está mais perto. A caminhada para aqui.',
    },
  },
};
