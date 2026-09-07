/**
 * BubbleSort facet JSON 선언.
 *
 * 레이아웃은 버블 정렬의 시각적 정체성을 드러내도록 구성:
 *  - 양 끝의 startPreview / goalPreview 가 항상 참조점 제공
 *  - stage 가 rising-marker / sorted-boundary 표시
 *  - passTracker 가 패스 구조를 별도 패널로 노출
 *  - snapshotStrip 이 매 패스 결과를 누적 보존
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const bubblesortFacet: FacetJson = {
  id: 'facet:bubbleSort',
  title: { en: 'Bubble Sort', ko: '버블 정렬', ja: 'バブルソート', zh: '冒泡排序', ar: 'الترتيب الفقاعي', es: 'Ordenamiento burbuja', fr: 'Tri à bulles', hi: 'बुलबुला छँटाई', id: 'Pengurutan gelembung', pt: 'Ordenação por bolha' },
  description: { en: 'Adjacent compare/swap waves push the largest value to the end each pass', ko: '인접 비교·교환 파도가 매 패스마다 가장 큰 값을 맨 뒤로 떠올린다', ja: '隣どうしの比較と交換の波が、パスごとに最大値を末尾へ押し上げる', zh: '相邻比较与交换的浪，每一趟把最大值推到末尾', ar: 'موجات المقارنة والتبديل بين الجارين تدفع أكبر قيمة إلى النهاية في كل جولة', es: 'Olas de comparación e intercambio entre vecinos empujan el mayor valor al final en cada pasada', fr: 'Des vagues de comparaison-échange entre voisins poussent la plus grande valeur en fin de passe', hi: 'पड़ोसी तुलना-अदला-बदली की लहरें हर चक्र में सबसे बड़े मान को अंत तक धकेलती हैं', id: 'Gelombang banding-tukar antartetangga mendorong nilai terbesar ke ujung tiap lintasan', pt: 'Ondas de comparação e troca entre vizinhos empurram o maior valor para o fim a cada passagem' },
  algorithm: 'module:bubblesort',
  projector: 'module:bubblesortProjector',
  initialData: { type: 'array', values: [5, 2, 8, 1, 9, 3, 7, 4] },
  shuffleOnReset: true,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      {
        type: 'row',
        gap: 8,
        align: 'stretch',
        children: [
          { ref: 'stage', grow: 1 },
          {
            type: 'column',
            gap: 8,
            children: [
              { ref: 'startPreview' },
              { ref: 'goalPreview' },
            ],
          },
        ],
      },
      { ref: 'passTracker' },
      { ref: 'snapshotStrip' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    startPreview: {
      type: 'goal-preview',
      title: { en: 'Start', ko: '시작', ja: '開始', zh: '起始', ar: 'البداية', es: 'Inicio', fr: 'Départ', hi: 'आरंभ', id: 'Awal', pt: 'Início' },
      computeFrom: 'initial',
    },
    stage: {
      type: 'bar-chart',
      height: 220,
      features: ['rising-marker', 'sorted-boundary'],
    },
    goalPreview: {
      type: 'goal-preview',
      title: { en: 'Goal', ko: '목표', ja: '目標', zh: '目标', ar: 'الهدف', es: 'Meta', fr: 'But', hi: 'लक्ष्य', id: 'Tujuan', pt: 'Meta' },
      computeFrom: 'sorted',
    },
    passTracker: { type: 'pass-tracker', maxPasses: 7 },
    snapshotStrip: { type: 'snapshot-strip', maxSnapshots: 8 },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.playback,
      metrics: [
        { name: 'compare-count', label: { en: 'Compare', ko: '비교', ja: '比較', zh: '比较', ar: 'مقارنة', es: 'Comparar', fr: 'Comparer', hi: 'तुलना', id: 'Banding', pt: 'Comparar' }, initial: 0 },
        { name: 'swap-count', label: { en: 'Swap', ko: '교환', ja: '交換', zh: '交换', ar: 'تبديل', es: 'Intercambio', fr: 'Échange', hi: 'अदला-बदली', id: 'Tukar', pt: 'Troca' }, initial: 0 },
        { name: 'pass-count', label: { en: 'Pass', ko: '패스', ja: 'パス', zh: '趟次', ar: 'جولة', es: 'Pasada', fr: 'Passe', hi: 'चक्र', id: 'Lintasan', pt: 'Passagem' }, initial: 0 },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드', ja: 'コード', zh: '代码', ar: 'الشيفرة', es: 'Código', fr: 'Code', hi: 'कोड', id: 'Kode', pt: 'Código' },
      ir: 'ir:bubblesort-imperative',
    },
  },
};
