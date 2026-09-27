/**
 * HandshakeLemma facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "간선을 하나씩 놓아 갈 때 정점들의 차수를 모두 더하면 왜 늘 간선 수의 두 배인가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 데이터는 예로 정한 무향 단순 그래프다 — 정점 여섯, 간선 일곱을 놓는 차례대로.
 * 차수와 그 합은 알고리즘이 셈한다. 대조(사양): 끝 차수 1:2 · 2:2 · 3:4 · 4:2 · 5:3 · 6:1,
 * 합 14, 간선 7.
 *
 * 정점 이름(정수)은 번역하지 않는 수식 기호라 initialData 에 둔다.
 * title / description / messages 는 열 언어를 모두 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const handshakeLemmaFacet: FacetJson = {
  id: 'facet:handshakeLemma',
  title: {
    en: 'Handshake Lemma',
    ko: '악수 정리',
    ja: '握手補題',
    zh: '握手引理',
    ar: 'مبرهنة المصافحة',
    es: 'Lema del apretón de manos',
    fr: 'Lemme des poignées de main',
    hi: 'हाथ मिलाने की प्रमेयिका',
    id: 'Lema jabat tangan',
    pt: 'Lema do aperto de mãos',
  },
  description: {
    en: 'Each edge splits into two ends, adding one to the degree of each end vertex',
    ko: '간선 하나가 두 끝으로 나뉘어 양 끝 정점의 차수에 하나씩 들어간다',
    ja: '辺は一本ごとに二つの端に分かれ、両端の頂点の次数に一つずつ入る',
    zh: '每条边分成两端，分别给两个端点的度各加一',
    ar: 'كل حافة تنقسم إلى طرفين، فتضيف واحدًا إلى درجة كل رأس من طرفيها',
    es: 'Cada arista se parte en dos extremos y suma uno al grado de cada vértice extremo',
    fr: 'Chaque arête se scinde en deux bouts et ajoute un au degré de chacun de ses sommets',
    hi: 'हर किनारा दो सिरों में बँटकर दोनों सिरों के शीर्षों की डिग्री में एक-एक जोड़ता है',
    id: 'Setiap sisi terbelah menjadi dua ujung dan menambah satu ke derajat tiap simpul ujungnya',
    pt: 'Cada aresta se divide em duas pontas e soma um ao grau de cada vértice da ponta',
  },
  algorithm: 'module:handshakeLemma',
  scene: 'module:handshakeLemmaScene',
  initialData: {
    type: 'handshake-lemma',
    vertices: [1, 2, 3, 4, 5, 6],
    // 놓는 차례대로
    edges: [
      [1, 2],
      [2, 3],
      [1, 3],
      [3, 4],
      [4, 5],
      [3, 5],
      [5, 6],
    ],
    stepMs: 1600,
  },
  shuffleOnReset: false,
  blocks: {
    stage: { type: 'handshake-lemma-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'label.sum': {
      en: 'Degree sum',
      ko: '차수 합',
      ja: '次数の和',
      zh: '度数和',
      ar: 'مجموع الدرجات',
      es: 'Suma de grados',
      fr: 'Somme des degrés',
      hi: 'डिग्री का योग',
      id: 'Jumlah derajat',
      pt: 'Soma dos graus',
    },
    'caption.start': {
      en: 'Vertices: {n} · No edges yet',
      ko: '정점: {n} · 아직 간선 없음',
      ja: '頂点: {n} · 辺はまだない',
      zh: '顶点: {n} · 还没有边',
      ar: 'الرؤوس: {n} · لا حواف بعد',
      es: 'Vértices: {n} · Aún sin aristas',
      fr: 'Sommets : {n} · Aucune arête pour l’instant',
      hi: 'शीर्ष: {n} · अभी कोई किनारा नहीं',
      id: 'Simpul: {n} · Belum ada sisi',
      pt: 'Vértices: {n} · Ainda sem arestas',
    },
    'caption.place': {
      en: 'Edge {u}–{v} · degree of {u}: {fromU} → {toU} · degree of {v}: {fromV} → {toV}',
      ko: '간선 {u}–{v} · 정점 {u} 차수 {fromU} → {toU} · 정점 {v} 차수 {fromV} → {toV}',
      ja: '辺 {u}–{v} · 頂点 {u} の次数 {fromU} → {toU} · 頂点 {v} の次数 {fromV} → {toV}',
      zh: '边 {u}–{v} · 顶点 {u} 的度 {fromU} → {toU} · 顶点 {v} 的度 {fromV} → {toV}',
      ar: 'الحافة {u}–{v} · درجة {u}: {fromU} → {toU} · درجة {v}: {fromV} → {toV}',
      es: 'Arista {u}–{v} · grado de {u}: {fromU} → {toU} · grado de {v}: {fromV} → {toV}',
      fr: 'Arête {u}–{v} · degré de {u} : {fromU} → {toU} · degré de {v} : {fromV} → {toV}',
      hi: 'किनारा {u}–{v} · {u} की डिग्री: {fromU} → {toU} · {v} की डिग्री: {fromV} → {toV}',
      id: 'Sisi {u}–{v} · derajat {u}: {fromU} → {toU} · derajat {v}: {fromV} → {toV}',
      pt: 'Aresta {u}–{v} · grau de {u}: {fromU} → {toU} · grau de {v}: {fromV} → {toV}',
    },
    'caption.tally': {
      en: 'Degree sum: {sum} · Edges: {m}',
      ko: '차수 합: {sum} · 간선: {m}',
      ja: '次数の和: {sum} · 辺: {m}',
      zh: '度数和: {sum} · 边: {m}',
      ar: 'مجموع الدرجات: {sum} · الحواف: {m}',
      es: 'Suma de grados: {sum} · Aristas: {m}',
      fr: 'Somme des degrés : {sum} · Arêtes : {m}',
      hi: 'डिग्री का योग: {sum} · किनारे: {m}',
      id: 'Jumlah derajat: {sum} · Sisi: {m}',
      pt: 'Soma dos graus: {sum} · Arestas: {m}',
    },
  },
};
