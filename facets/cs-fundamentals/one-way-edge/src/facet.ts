/**
 * @piece — 조각(piece) facet. 질문 하나에 답하고 멈춘다 (S-piece).
 *
 * 답하는 질문: **같은 선이라도 화살이 붙으면 무엇이 달라지는가.**
 *
 * 다섯 정점이 고리로 이어져 있다. 무방향일 때 S 에서 다섯 모두에 닿지만,
 * 같은 다섯 선에 방향이 붙으면 C 로 들어가는 화살이 하나도 없어 C 가 닿지
 * 못하는 자리로 밀려난다.
 *
 * header(title-block) 도 metrics 도 layout 도 두지 않는다 — 제목은 글의
 * 문단이 주고, 조각은 셀 것이 없으며, 배치는 stage 와 controls 뿐이라 러너의
 * 기본 배치로 족하다.
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';
import type { OneWayEdgeData } from './algorithm.js';

export const oneWayEdgeFacet: FacetJson = {
  id: 'facet:oneWayEdge',
  title: {
    en: 'Directed edge',
    ko: '방향 간선',
    ja: '有向辺',
    zh: '有向边',
    ar: 'حافة موجّهة',
    es: 'Arista dirigida',
    fr: 'Arête orientée',
    hi: 'दिशात्मक किनारा',
    id: 'Sisi berarah',
    pt: 'Aresta dirigida',
  },
  description: {
    en: 'The same line, once it carries an arrow, loses the way back.',
    ko: '같은 선이라도 화살이 붙으면 되돌아오는 길이 사라진다.',
    ja: '同じ線でも、矢が付けば戻る道が消える。',
    zh: '同一条线，一旦带上箭头，回头的路就没了。',
    ar: 'الخط نفسه، ما إن يحمل سهمًا حتى يفقد طريق العودة.',
    es: 'La misma línea, en cuanto lleva una flecha, pierde el camino de vuelta.',
    fr: "La même ligne, dès qu'elle porte une flèche, perd le chemin du retour.",
    hi: 'वही लकीर, तीर लगते ही लौटने का रास्ता खो देती है।',
    id: 'Garis yang sama, begitu membawa panah, kehilangan jalan pulang.',
    pt: 'A mesma linha, assim que ganha uma seta, perde o caminho de volta.',
  },
  algorithm: 'module:oneWayEdge',
  projector: 'module:oneWayEdgeProjector',
  initialData: {
    type: 'one-way-edge',
    // 다섯 정점이 이룬 고리. 아래 다섯 선은 무방향으로 먼저 놓이고,
    // 2단계에서 `dir` 이 가리키는 한 방향씩만 남는다.
    //   'uv' → u 에서 v 로,  'vu' → v 에서 u 로.
    nodes: ['S', 'A', 'B', 'T', 'C'],
    edges: [
      { u: 'S', v: 'A', dir: 'uv' },
      { u: 'A', v: 'B', dir: 'uv' },
      { u: 'B', v: 'T', dir: 'uv' },
      { u: 'S', v: 'C', dir: 'vu' },
      { u: 'C', v: 'T', dir: 'uv' },
    ],
    source: 'S',
    // 걸음 간격. stage 의 이동 애니메이션이 이 위에 더해진다 (S-piece).
    stepMs: 800,
  } satisfies OneWayEdgeData,
  blocks: {
    stage: { type: 'one-way-edge-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.undirected': {
      en: 'No arrows yet — every line runs both ways.',
      ko: '아직 화살이 없다 — 모든 선이 양쪽으로 통한다.',
      ja: 'まだ矢がない — どの線も両方向に通じる。',
      zh: '还没有箭头 — 每条线都两头通。',
      ar: 'لا أسهم بعد — كل خط يسير في الاتجاهين.',
      es: 'Aún no hay flechas: cada línea va en los dos sentidos.',
      fr: 'Pas encore de flèches — chaque ligne va dans les deux sens.',
      hi: 'अभी कोई तीर नहीं — हर लकीर दोनों ओर चलती है।',
      id: 'Belum ada panah — setiap garis tembus dua arah.',
      pt: 'Ainda sem setas — cada linha corre nos dois sentidos.',
    },
    'caption.openReach': {
      en: 'From {source}, every one of the {total} vertices is reachable.',
      ko: '{source} 에서 {total} 개 정점 모두에 닿는다.',
      ja: '{source} から {total} 個の頂点すべてに届く。',
      zh: '从 {source} 出发，{total} 个顶点全都到得了。',
      ar: 'من {source} يمكن بلوغ كل الرؤوس {total}.',
      es: 'Desde {source} se llega a los {total} vértices.',
      fr: 'Depuis {source}, les {total} sommets sont tous atteignables.',
      hi: '{source} से सभी {total} शीर्षों तक पहुँचा जा सकता है।',
      id: 'Dari {source}, semua {total} simpul bisa dicapai.',
      pt: 'A partir de {source}, todos os {total} vértices são alcançáveis.',
    },
    'caption.directed': {
      en: 'The same {lines} lines take arrows. Each keeps one way only.',
      ko: '같은 {lines} 개의 선에 화살이 붙는다. 한 방향만 남는다.',
      ja: '同じ {lines} 本の線に矢が付く。どれも一方向だけが残る。',
      zh: '同样的 {lines} 条线加上箭头。每条只留一个方向。',
      ar: 'الخطوط الـ{lines} نفسها تأخذ أسهمًا. كل واحد يحتفظ باتجاه واحد فقط.',
      es: 'Las mismas {lines} líneas reciben flechas. Cada una conserva un solo sentido.',
      fr: "Les mêmes {lines} lignes reçoivent des flèches. Chacune ne garde qu'un seul sens.",
      hi: 'उन्हीं {lines} लकीरों पर तीर लग जाते हैं। हर एक में सिर्फ़ एक दिशा बचती है।',
      id: '{lines} garis yang sama diberi panah. Masing-masing hanya menyisakan satu arah.',
      pt: 'As mesmas {lines} linhas recebem setas. Cada uma guarda um só sentido.',
    },
    'caption.blocked': {
      en: 'Every line at {node} points away — nothing arrives.',
      ko: '{node} 에 닿은 선은 모두 밖으로 향한다 — 들어오는 화살이 없다.',
      ja: '{node} に触れる線はどれも外を向く — 入ってくる矢がない。',
      zh: '{node} 上的线全都朝外 — 没有一条箭头进来。',
      ar: 'كل خط عند {node} يشير إلى الخارج — ولا شيء يصل إليه.',
      es: 'Todas las líneas de {node} apuntan hacia afuera: no llega ninguna.',
      fr: "Toutes les lignes de {node} pointent vers l'extérieur — rien n'y arrive.",
      hi: '{node} की हर लकीर बाहर की ओर जाती है — कुछ भी अंदर नहीं आता।',
      id: 'Semua garis di {node} mengarah keluar — tidak ada yang masuk.',
      pt: 'Todas as linhas em {node} apontam para fora — nada chega.',
    },
    'caption.stranded': {
      en: 'From {source}: {reached} of {total}. {nodes} is out of reach.',
      ko: '{source} 에서 {total} 중 {reached} — {nodes} 는 닿지 못한다.',
      ja: '{source} から {total} 中 {reached} — {nodes} には届かない。',
      zh: '从 {source} 出发：{total} 中到了 {reached}。{nodes} 够不着。',
      ar: 'من {source}: {reached} من {total}. {nodes} خارج المتناول.',
      es: 'Desde {source}: {reached} de {total}. {nodes} queda fuera de alcance.',
      fr: 'Depuis {source} : {reached} sur {total}. {nodes} reste hors de portée.',
      hi: '{source} से: {total} में से {reached}। {nodes} तक नहीं पहुँचा जा सकता।',
      id: 'Dari {source}: {reached} dari {total}. {nodes} tak tercapai.',
      pt: 'A partir de {source}: {reached} de {total}. {nodes} fica fora de alcance.',
    },
  },
};
