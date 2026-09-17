/**
 * @piece 전부 견주기 — 다 보는 것은 정확하지만, 수가 늘면 못 버틴다.
 *
 * 답하는 질문 하나: **후보를 하나도 빠뜨리지 않고 다 보면 얼마가 드는가.**
 *
 * 선언은 후보 수와 차원의 짝만 들고 있다. 곱셈 횟수는 algorithm 이 `n × d` 로
 * 셈하고, 어디에 얼마만큼 그릴지는 stage 가 캔버스에서 역산한다 (S-piece).
 *
 * 어떻게 덜 보는가(그래프로 걷기 · 칸 나누기 · 양자화)와 무엇을 견주는가
 * (코사인이냐 거리냐)는 여기서 다루지 않는다 — 다른 조각의 몫이다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const compareWithAllFacet: FacetJson = {
  id: 'facet:compareWithAll',
  title: {
    en: 'Compare with all',
    ko: '전부 견주기',
    ja: 'すべてと見比べる',
    zh: '与全部比较',
    ar: 'المقارنة مع الجميع',
    es: 'Comparar con todos',
    fr: 'Comparer avec tous',
    hi: 'सभी से तुलना',
    id: 'Bandingkan dengan semua',
    pt: 'Comparar com todos',
  },
  description: {
    en: 'Exact, but it does not hold up as the numbers grow — the multiplications pile up as candidates times dimensions.',
    ko: '정확하지만 수가 늘면 못 버틴다 — 곱셈이 후보 수 곱하기 차원만큼 쌓인다.',
    ja: '正確だが数が増えると持ちこたえられない — 掛け算が候補数かける次元だけ積み上がる。',
    zh: '精确，但数量一大就撑不住 — 乘法按候选数乘以维度不断堆积。',
    ar: 'دقيق، لكنه لا يصمد مع ازدياد الأعداد — تتراكم عمليات الضرب بعدد المرشحين في الأبعاد.',
    es: 'Exacto, pero no aguanta cuando los números crecen: las multiplicaciones se acumulan como candidatos por dimensiones.',
    fr: "Exact, mais intenable quand les nombres grandissent — les multiplications s'accumulent en candidats fois dimensions.",
    hi: 'सटीक, लेकिन संख्या बढ़ने पर टिकता नहीं — गुणा उम्मीदवारों गुणा आयामों जितना जमा होता है।',
    id: 'Tepat, tetapi tidak bertahan saat jumlahnya membesar — perkalian menumpuk sebanyak kandidat kali dimensi.',
    pt: 'Exato, mas não se sustenta quando os números crescem — as multiplicações acumulam como candidatos vezes dimensões.',
  },
  algorithm: 'module:compareWithAll',
  // 화면을 명령이 아니라 **장면**으로 만든다 (`scene:`) — 어느 걸음의 화면이든
  // 셈으로 얻으므로 띠로 아무 자리에나 갈 수 있다 (S-scene).
  scene: 'module:compareWithAllScene',
  initialData: {
    type: 'compare-with-all',
    // 실제로 하나씩 훑어 보는 작은 판.
    board: { n: 8, dims: 4 },
    // 수를 키운 줄들. 곱셈 횟수는 여기 적지 않는다 — algorithm 이 셈한다.
    scales: [
      { n: 32, dims: 4 },
      { n: 32, dims: 64 },
      { n: 128, dims: 64 },
    ],
    // 실제 크기에 가까운 줄 — 문서 천 개, 임베딩 차원 768.
    real: { n: 1000, dims: 768 },
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'compare-with-all-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.sweep': {
      en: 'Candidate {i} of {n} — multiplications so far: {total}.',
      ko: '후보 {i} / {n} — 여기까지 쌓인 곱셈: {total}.',
      ja: '候補 {i} / {n} — ここまでの掛け算: {total}.',
      zh: '候选 {i} / {n} — 目前的乘法次数：{total}。',
      ar: 'المرشح {i} من {n} — عمليات الضرب حتى الآن: {total}.',
      es: 'Candidato {i} de {n}: multiplicaciones hasta ahora: {total}.',
      fr: "Candidat {i} sur {n} — multiplications jusqu'ici : {total}.",
      hi: 'उम्मीदवार {i} / {n} — अब तक गुणा: {total}.',
      id: 'Kandidat {i} dari {n} — perkalian sejauh ini: {total}.',
      pt: 'Candidato {i} de {n} — multiplicações até agora: {total}.',
    },
    'caption.fuse': {
      en: 'Every candidate checked — multiplications: {total}.',
      ko: '후보를 하나도 빠뜨리지 않았다. 곱셈: {total}.',
      ja: '候補を一つも飛ばさずに見た。掛け算: {total}.',
      zh: '每个候选都看过了 — 乘法次数：{total}。',
      ar: 'تم فحص كل مرشح — عمليات الضرب: {total}.',
      es: 'Todos los candidatos revisados: multiplicaciones: {total}.',
      fr: 'Tous les candidats examinés — multiplications : {total}.',
      hi: 'हर उम्मीदवार जाँच लिया — गुणा: {total}.',
      id: 'Semua kandidat diperiksa — perkalian: {total}.',
      pt: 'Todos os candidatos verificados — multiplicações: {total}.',
    },
    'caption.grow': {
      en: '{n} candidates × {d} dimensions — multiplications: {total}.',
      ko: '후보 {n} × 차원 {d} — 곱셈: {total}.',
      ja: '候補 {n} × 次元 {d} — 掛け算: {total}.',
      zh: '候选 {n} × 维度 {d} — 乘法次数：{total}。',
      ar: '{n} مرشح × {d} بعد — عمليات الضرب: {total}.',
      es: '{n} candidatos × {d} dimensiones — multiplicaciones: {total}.',
      fr: '{n} candidats × {d} dimensions — multiplications : {total}.',
      hi: '{n} उम्मीदवार × {d} आयाम — गुणा: {total}.',
      id: '{n} kandidat × {d} dimensi — perkalian: {total}.',
      pt: '{n} candidatos × {d} dimensões — multiplicações: {total}.',
    },
    'caption.real': {
      en: '{n} documents × {d} dimensions — the pile grows past the frame: {total}.',
      ko: '문서 {n} × 차원 {d} — 더미가 화면 밖으로 자란다. 곱셈: {total}.',
      ja: '文書 {n} × 次元 {d} — 積み上がりが画面の外へ伸びる。掛け算: {total}.',
      zh: '文档 {n} × 维度 {d} — 堆积长到画面之外，乘法次数：{total}。',
      ar: '{n} مستند × {d} بعد — تنمو الكومة خارج الإطار: {total}.',
      es: '{n} documentos × {d} dimensiones — la pila crece fuera del marco: {total}.',
      fr: '{n} documents × {d} dimensions — la pile dépasse le cadre : {total}.',
      hi: '{n} दस्तावेज़ × {d} आयाम — ढेर फ़्रेम से बाहर बढ़ता है: {total}.',
      id: '{n} dokumen × {d} dimensi — tumpukan tumbuh melewati bingkai: {total}.',
      pt: '{n} documentos × {d} dimensões — a pilha cresce para fora do quadro: {total}.',
    },
  },
};
