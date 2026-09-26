/**
 * branchCoverage 선언 — 커버리지와 변이 점수.
 *
 * initialData 는 구조뿐이다: 대상 함수 fee 의 줄 글자와 구조(첫 값 · 결정 · 빼기 · 돌려줌), 조건 둘,
 * 시험 넷(이 차례가 데이터), 변이 다섯(바뀐 줄 글자와 바뀜의 구조), 시험 수 사다리.
 * 밟은 줄 · 결정 · 짝 · 변이 판정 · 백분율은 알고리즘이 실제로 돌려 셈한다.
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';
import type { BranchCoverageData } from './algorithm.js';

const initialData: BranchCoverageData = {
  type: 'branch-coverage',
  stepMs: 700,
  motionMs: 250,
  fn: {
    name: 'fee',
    params: ['age', 'member'],
    lines: [
      { no: 1, text: 'function fee(age, member)' },
      { no: 2, text: '    let f = 10' },
      { no: 3, text: '    if age >= 65 and member' },
      { no: 4, text: '        f = f - 5' },
      { no: 5, text: '    return f' },
    ],
    init: { line: 2, value: 10 },
    decision: { line: 3, combine: 'and', conditions: ['A', 'B'] },
    adjust: { line: 4, op: '-', amount: 5 },
    ret: { line: 5 },
  },
  conditions: [
    { id: 'A', text: 'age >= 65', kind: 'compare', param: 'age', op: '>=', operand: 65 },
    { id: 'B', text: 'member', kind: 'flag', param: 'member' },
  ],
  tests: [
    { id: 'T1', args: [70, true], expect: 5 },
    { id: 'T2', args: [30, true], expect: 10 },
    { id: 'T3', args: [70, false], expect: 10 },
    { id: 'T4', args: [65, true], expect: 5 },
  ],
  mutants: [
    { id: 'M1', line: 3, text: '    if age > 65 and member', change: { kind: 'compare', condition: 'A', from: '>=', to: '>' } },
    { id: 'M2', line: 3, text: '    if age >= 65 or member', change: { kind: 'combine', from: 'and', to: 'or' } },
    { id: 'M3', line: 4, text: '        f = f + 5', change: { kind: 'arith', from: '-', to: '+' } },
    { id: 'M4', line: 3, text: '    if age >= 65', change: { kind: 'drop-condition', condition: 'B' } },
    { id: 'M5', line: 3, text: '    if member', change: { kind: 'drop-condition', condition: 'A' } },
  ],
  testCounts: [1, 2, 3, 4],
  testCount: 2,
};

export const branchCoverageFacet: FacetJson = {
  id: 'facet:branchCoverage',
  title: {
    en: 'Coverage and mutation score',
    ko: '커버리지와 변이 점수',
    ja: 'カバレッジとミューテーションスコア',
    zh: '覆盖率与变异分数',
    ar: 'التغطية ودرجة الطفرات',
    es: 'Cobertura y puntuación de mutación',
    fr: 'Couverture et score de mutation',
    hi: 'कवरेज और म्यूटेशन स्कोर',
    id: 'Cakupan dan skor mutasi',
    pt: 'Cobertura e pontuação de mutação',
  },
  description: {
    en: 'One test suite, four gauges of different depth: lines fill first, then branches, condition pairs and the mutation score, one test later each.',
    ko: '같은 시험 모음을 네 계기가 다른 깊이로 잰다 — 줄이 먼저 차고, 갈래 · 조건 가름 · 변이 점수가 시험 하나씩 늦게 찬다.',
    ja: '同じテスト群を四つの計器が異なる深さで測る。行が先に満ち、分岐・条件の判別・ミューテーションスコアがテスト一つずつ遅れて満ちる。',
    zh: '同一组测试，四个仪表以不同深度衡量：行先填满，分支、条件判别与变异分数依次各晚一个测试填满。',
    ar: 'مجموعة اختبارات واحدة وأربعة مقاييس بأعماق مختلفة: تمتلئ الأسطر أولًا، ثم الفروع وأزواج الشروط ودرجة الطفرات، كلٌّ بعد اختبار إضافي.',
    es: 'Un mismo conjunto de pruebas, cuatro medidores de distinta profundidad: las líneas se llenan primero; ramas, pares de condición y puntuación de mutación, una prueba después cada uno.',
    fr: 'Une même suite de tests, quatre jauges de profondeur différente : les lignes se remplissent d’abord, puis les branches, les paires de conditions et le score de mutation, un test plus tard chacun.',
    hi: 'एक ही टेस्ट समूह, अलग गहराई के चार मीटर: पंक्तियाँ पहले भरती हैं, फिर शाखाएँ, शर्त-जोड़े और म्यूटेशन स्कोर, हर एक एक टेस्ट बाद।',
    id: 'Satu rangkaian uji, empat meter dengan kedalaman berbeda: baris penuh lebih dulu, lalu cabang, pasangan kondisi, dan skor mutasi, masing-masing satu uji kemudian.',
    pt: 'Um mesmo conjunto de testes, quatro medidores de profundidade diferente: as linhas enchem primeiro; ramos, pares de condição e pontuação de mutação, um teste depois cada.',
  },
  algorithm: 'module:branchCoverage',
  projector: 'module:branchCoverageProjector',
  initialData,
  layout: {
    type: 'column',
    gap: 12,
    children: [{ ref: 'header' }, { ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'branch-coverage-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'test-count',
          name: 'test-count',
          label: {
            en: 'Tests run',
            ko: '시험 수',
            ja: 'テスト数',
            zh: '测试数',
            ar: 'عدد الاختبارات',
            es: 'Pruebas',
            fr: 'Tests lancés',
            hi: 'टेस्ट संख्या',
            id: 'Jumlah uji',
            pt: 'Testes',
          },
          segments: [
            { value: 1, label: '1' },
            { value: 2, label: '2', default: true },
            { value: 3, label: '3' },
            { value: 4, label: '4' },
          ],
        },
      ],
      metrics: [
        {
          name: 'line-coverage',
          label: {
            en: 'Lines %',
            ko: '줄 %',
            ja: '行 %',
            zh: '行 %',
            ar: 'الأسطر %',
            es: 'Líneas %',
            fr: 'Lignes %',
            hi: 'पंक्तियाँ %',
            id: 'Baris %',
            pt: 'Linhas %',
          },
          initial: 0,
        },
        {
          name: 'branch-coverage',
          label: {
            en: 'Branches %',
            ko: '갈래 %',
            ja: '分岐 %',
            zh: '分支 %',
            ar: 'الفروع %',
            es: 'Ramas %',
            fr: 'Branches %',
            hi: 'शाखाएँ %',
            id: 'Cabang %',
            pt: 'Ramos %',
          },
          initial: 0,
        },
        {
          name: 'condition-pairs',
          label: {
            en: 'Condition pairs %',
            ko: '조건 가름 %',
            ja: '条件の判別 %',
            zh: '条件判别 %',
            ar: 'أزواج الشروط %',
            es: 'Pares de condición %',
            fr: 'Paires de conditions %',
            hi: 'शर्त-जोड़े %',
            id: 'Pasangan kondisi %',
            pt: 'Pares de condição %',
          },
          initial: 0,
        },
        {
          name: 'mutation-score',
          label: {
            en: 'Mutation score %',
            ko: '변이 점수 %',
            ja: 'ミューテーションスコア %',
            zh: '变异分数 %',
            ar: 'درجة الطفرات %',
            es: 'Puntuación de mutación %',
            fr: 'Score de mutation %',
            hi: 'म्यूटेशन स्कोर %',
            id: 'Skor mutasi %',
            pt: 'Pontuação de mutação %',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:branch-coverage-imperative',
      label: {
        en: 'Target function',
        ko: '대상 함수',
        ja: '対象の関数',
        zh: '目标函数',
        ar: 'الدالة المستهدفة',
        es: 'Función bajo prueba',
        fr: 'Fonction testée',
        hi: 'लक्ष्य फ़ंक्शन',
        id: 'Fungsi sasaran',
        pt: 'Função testada',
      },
    },
  },
  messages: {
    'label.tests': {
      en: 'Tests', ko: '시험', ja: 'テスト', zh: '测试', ar: 'الاختبارات', es: 'Pruebas', fr: 'Tests', hi: 'टेस्ट', id: 'Uji', pt: 'Testes',
    },
    'label.mutants': {
      en: 'Mutants', ko: '변이', ja: 'ミュータント', zh: '变异体', ar: 'الطفرات', es: 'Mutantes', fr: 'Mutants', hi: 'म्यूटेंट', id: 'Mutan', pt: 'Mutantes',
    },
    'label.conditions': {
      en: 'Conditions', ko: '조건', ja: '条件', zh: '条件', ar: 'الشروط', es: 'Condiciones', fr: 'Conditions', hi: 'शर्तें', id: 'Kondisi', pt: 'Condições',
    },
    'label.lines': {
      en: 'Lines', ko: '줄', ja: '行', zh: '行', ar: 'الأسطر', es: 'Líneas', fr: 'Lignes', hi: 'पंक्तियाँ', id: 'Baris', pt: 'Linhas',
    },
    'label.branches': {
      en: 'Branches', ko: '갈래', ja: '分岐', zh: '分支', ar: 'الفروع', es: 'Ramas', fr: 'Branches', hi: 'शाखाएँ', id: 'Cabang', pt: 'Ramos',
    },
    'label.pairs': {
      en: 'Condition pairs', ko: '조건 가름', ja: '条件の判別', zh: '条件判别', ar: 'أزواج الشروط', es: 'Pares de condición', fr: 'Paires de conditions', hi: 'शर्त-जोड़े', id: 'Pasangan kondisi', pt: 'Pares de condição',
    },
    'label.mutationScore': {
      en: 'Mutation score', ko: '변이 점수', ja: 'ミューテーションスコア', zh: '变异分数', ar: 'درجة الطفرات', es: 'Puntuación de mutación', fr: 'Score de mutation', hi: 'म्यूटेशन स्कोर', id: 'Skor mutasi', pt: 'Pontuação de mutação',
    },
    'label.waiting': {
      en: 'waiting', ko: '대기', ja: '待機', zh: '等待', ar: 'بانتظار', es: 'en espera', fr: 'en attente', hi: 'प्रतीक्षा', id: 'menunggu', pt: 'aguardando',
    },
    'label.running': {
      en: 'running', ko: '도는 중', ja: '実行中', zh: '运行中', ar: 'قيد التشغيل', es: 'ejecutando', fr: 'en cours', hi: 'चल रहा', id: 'berjalan', pt: 'executando',
    },
    'label.unused': {
      en: 'not used', ko: '안 씀', ja: '未使用', zh: '未使用', ar: 'غير مستخدم', es: 'sin usar', fr: 'non utilisé', hi: 'अप्रयुक्त', id: 'tidak dipakai', pt: 'não usado',
    },
    'label.passed': {
      en: 'pass: {result}', ko: '통과: {result}', ja: '合格: {result}', zh: '通过: {result}', ar: 'نجح: {result}', es: 'pasa: {result}', fr: 'réussi : {result}', hi: 'पास: {result}', id: 'lulus: {result}', pt: 'passa: {result}',
    },
    'label.survived': {
      en: 'survived', ko: '살아남음', ja: '生存', zh: '存活', ar: 'نجت', es: 'sobrevive', fr: 'survit', hi: 'बचा', id: 'selamat', pt: 'sobrevive',
    },
    'label.killed': {
      en: 'killed ← {test}', ko: '잡힘 ← {test}', ja: '検出 ← {test}', zh: '被杀 ← {test}', ar: 'قُتلت ← {test}', es: 'eliminado ← {test}', fr: 'tué ← {test}', hi: 'पकड़ा ← {test}', id: 'terbunuh ← {test}', pt: 'morto ← {test}',
    },
    'label.pair': {
      en: 'pair {pair}', ko: '짝 {pair}', ja: 'ペア {pair}', zh: '配对 {pair}', ar: 'زوج {pair}', es: 'par {pair}', fr: 'paire {pair}', hi: 'जोड़ा {pair}', id: 'pasangan {pair}', pt: 'par {pair}',
    },
    'label.noPair': {
      en: 'no pair', ko: '짝 없음', ja: 'ペアなし', zh: '无配对', ar: 'لا زوج', es: 'sin par', fr: 'pas de paire', hi: 'कोई जोड़ा नहीं', id: 'tanpa pasangan', pt: 'sem par',
    },
    'label.line': {
      en: 'line {n}', ko: '줄 {n}', ja: '{n} 行', zh: '第 {n} 行', ar: 'السطر {n}', es: 'línea {n}', fr: 'ligne {n}', hi: 'पंक्ति {n}', id: 'baris {n}', pt: 'linha {n}',
    },
    'caption.state': {
      en: 'f = {f}', ko: 'f = {f}', ja: 'f = {f}', zh: 'f = {f}', ar: 'f = {f}', es: 'f = {f}', fr: 'f = {f}', hi: 'f = {f}', id: 'f = {f}', pt: 'f = {f}',
    },
  },
};
