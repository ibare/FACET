/**
 * @piece 결과 행렬의 한 칸은 어디서 오는가 — A 의 행 하나와 B 의 열 하나가
 * 맞물려 만든다는 것 하나만 말하고 멈춘다.
 *
 * 1차 데이터는 두 행렬뿐이다. 곱도 합도 알고리즘이 그 자리에서 셈한다 — 여기
 * 적힌 수가 화면에 뜨는 전부이며, 파생값을 옮겨 적지 않는다.
 *
 * 2×3 과 3×2 인 까닭: 맞물리는 길이(3)와 결과의 모양(2×2)이 다른 수라야 무엇이
 * 맞물리고 무엇이 결과의 모양을 정하는지가 갈린다. 정사각이면 둘이 겹쳐 안 보인다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const rowTimesColumnFacet: FacetJson = {
  id: 'facet:rowTimesColumn',
  title: {
    en: 'Row times column',
    ko: '행 곱하기 열',
    ja: '行かける列',
    zh: '行乘列',
    ar: 'صف في عمود',
    es: 'Fila por columna',
    fr: 'Ligne fois colonne',
    hi: 'पंक्ति गुणा स्तंभ',
    id: 'Baris kali kolom',
    pt: 'Linha vezes coluna',
  },
  description: {
    en: 'Where one cell of the product comes from: a row of A and a column of B meshing in a single place.',
    ko: '곱의 한 칸은 어디서 오는가 — A 의 행 하나와 B 의 열 하나가 한 자리에서 맞물린다.',
    ja: '積の1マスはどこから来るのか — Aの行1つとBの列1つが1か所で噛み合う。',
    zh: '乘积的一格从何而来 — A 的一行与 B 的一列在同一处咬合。',
    ar: 'من أين تأتي خانة واحدة من حاصل الضرب: صف من A وعمود من B يتشابكان في مكان واحد.',
    es: 'De dónde sale una casilla del producto: una fila de A y una columna de B se engranan en un solo lugar.',
    fr: "D'où vient une case du produit : une ligne de A et une colonne de B s'engrènent en un seul endroit.",
    hi: 'गुणनफल का एक खाना कहाँ से आता है — A की एक पंक्ति और B का एक स्तंभ एक ही जगह जुड़ते हैं।',
    id: 'Dari mana satu sel hasil kali berasal: satu baris A dan satu kolom B bertaut di satu tempat.',
    pt: 'De onde vem uma célula do produto: uma linha de A e uma coluna de B se engrenam num único lugar.',
  },
  algorithm: 'module:rowTimesColumn',
  projector: 'module:rowTimesColumnProjector',
  initialData: {
    type: 'row-times-column',
    a: [
      [1, 2, 3],
      [4, 5, 6],
    ],
    b: [
      [7, 8],
      [9, 10],
      [11, 12],
    ],
    // 걸음이 열둘을 넘으므로 낮춰 잡았다. 읽을 시간을 주는 것은 저작 결정이다 (S-piece).
    stepMs: 620,
  },
  blocks: {
    stage: { type: 'row-times-column-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.pairMeet': {
      en: 'Row {row} of A and column {col} of B mesh — running total {sum}.',
      ko: 'A 의 행 {row}, B 의 열 {col} — 맞물린 자리의 합: {sum}.',
      ja: 'Aの行 {row}、Bの列 {col} — 噛み合った所までの合計: {sum}。',
      zh: 'A 的第 {row} 行与 B 的第 {col} 列咬合 — 累计: {sum}。',
      ar: 'الصف {row} من A والعمود {col} من B يتشابكان — المجموع حتى الآن: {sum}.',
      es: 'La fila {row} de A y la columna {col} de B se engranan: total acumulado {sum}.',
      fr: "La ligne {row} de A et la colonne {col} de B s'engrènent : total courant {sum}.",
      hi: 'A की पंक्ति {row} और B का स्तंभ {col} जुड़ते हैं — अब तक का योग: {sum}।',
      id: 'Baris {row} dari A dan kolom {col} dari B bertaut — total sejauh ini: {sum}.',
      pt: 'A linha {row} de A e a coluna {col} de B se engrenam — total até aqui: {sum}.',
    },
    'caption.cellFormed': {
      en: 'C[{row}][{col}] = {value} — {count} products, one cell.',
      ko: 'C[{row}][{col}] = {value}. 곱 {count} 개가 한 칸에 모였다.',
      ja: 'C[{row}][{col}] = {value}。{count} 個の積が 1 つのマスに集まった。',
      zh: 'C[{row}][{col}] = {value}。{count} 个乘积汇入一格。',
      ar: 'C[{row}][{col}] = {value} — {count} من حواصل الضرب في خانة واحدة.',
      es: 'C[{row}][{col}] = {value}: {count} productos en una sola casilla.',
      fr: 'C[{row}][{col}] = {value} : {count} produits dans une seule case.',
      hi: 'C[{row}][{col}] = {value} — {count} गुणनफल, एक ही खाना।',
      id: 'C[{row}][{col}] = {value} — {count} hasil kali dalam satu sel.',
      pt: 'C[{row}][{col}] = {value} — {count} produtos em uma única célula.',
    },
    'caption.done': {
      en: 'Every cell of C comes from one row of A and one column of B.',
      ko: 'C 의 모든 칸은 A 의 행 하나와 B 의 열 하나에서 나온다.',
      ja: 'Cのどのマスも、Aの行1つとBの列1つから生まれる。',
      zh: 'C 的每一格都来自 A 的一行与 B 的一列。',
      ar: 'كل خانة في C تأتي من صف واحد في A وعمود واحد في B.',
      es: 'Cada casilla de C proviene de una fila de A y de una columna de B.',
      fr: "Chaque case de C vient d'une ligne de A et d'une colonne de B.",
      hi: 'C का हर खाना A की एक पंक्ति और B के एक स्तंभ से आता है।',
      id: 'Setiap sel C berasal dari satu baris A dan satu kolom B.',
      pt: 'Cada célula de C vem de uma linha de A e de uma coluna de B.',
    },
  },
};
