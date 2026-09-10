/**
 * bottomUpTable facet JSON 선언.
 *
 * @piece 조각 — "아래에서부터 표를 채우면 재귀가 어디로 가는가" 하나에만
 * 답한다. 캔버스와 컨트롤바뿐이라 `layout` 은 러너에 맡기고, 제목(title-block)과
 * metrics 는 두지 않는다 (S-piece).
 *
 * 진행 모델은 reactive — mount 하면 스스로 표를 채우기 시작하고, 걸음 간격은
 * `initialData.stepMs` 가 정한다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const bottomUpTableFacet: FacetJson = {
  id: 'facet:bottomUpTable',
  title: {
    en: 'Bottom-Up Table',
    ko: '상향식 표 채우기',
    ja: 'ボトムアップの表',
    zh: '自底向上填表',
    ar: 'جدول من الأسفل إلى الأعلى',
    es: 'Tabla ascendente',
    fr: 'Table ascendante',
    hi: 'नीचे-से-ऊपर तालिका',
    id: 'Tabel dari bawah ke atas',
    pt: 'Tabela de baixo para cima',
  },
  description: {
    en: 'Fill the table from the small end and the recursion is simply gone',
    ko: '작은 것부터 표를 채워 올라가면 재귀가 아예 없다',
    ja: '小さいほうから表を埋めていけば、再帰はそもそも要らない',
    zh: '从小的一端开始填表，递归就干脆不存在了',
    ar: 'املأ الجدول من الطرف الصغير فيختفي الاستدعاء الذاتي تمامًا',
    es: 'Rellena la tabla desde el extremo pequeño y la recursión simplemente desaparece',
    fr: 'Remplir la table depuis le petit bout et la récursion disparaît tout simplement',
    hi: 'तालिका को छोटे सिरे से भरें और पुनरावृत्ति बस ग़ायब हो जाती है',
    id: 'Isi tabel dari ujung yang kecil dan rekursinya lenyap begitu saja',
    pt: 'Preencha a tabela pela ponta pequena e a recursão simplesmente some',
  },
  algorithm: 'module:bottomUpTable',
  projector: 'module:bottomUpTableProjector',
  initialData: {
    type: 'bottom-up-table',
    n: 5,
    stepMs: 700,
  },
  messages: {
    'caption.seed': {
      en: 'T[{i}] = {v} — the definition hands over the bottom two cells',
      ko: 'T[{i}] = {v} — 정의가 그냥 주는 바닥 두 칸',
      ja: 'T[{i}] = {v} — 定義がそのまま与える下ふたつの枠',
      zh: 'T[{i}] = {v} — 定义直接给出最底下的两格',
      ar: 'T[{i}] = {v} — التعريف يمنحنا الخانتين الأدنى مباشرة',
      es: 'T[{i}] = {v}: la definición ya da las dos primeras casillas',
      fr: 'T[{i}] = {v} — la définition donne directement les deux premières cases',
      hi: 'T[{i}] = {v} — परिभाषा ही नीचे के दो खाने दे देती है',
      id: 'T[{i}] = {v} — definisinya langsung memberi dua sel terbawah',
      pt: 'T[{i}] = {v} — a definição já entrega as duas primeiras casas',
    },
    'caption.fill': {
      en: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — both values already sit to the left',
      ko: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — 두 값 모두 이미 왼쪽에 있다',
      ja: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — どちらの値もすでに左にある',
      zh: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — 两个值都已经在左边',
      ar: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — كلتا القيمتين موجودتان على اليسار بالفعل',
      es: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v}: los dos valores ya están a la izquierda',
      fr: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — les deux valeurs sont déjà à gauche',
      hi: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — दोनों मान पहले से बाईं ओर मौजूद हैं',
      id: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — kedua nilainya sudah ada di sebelah kiri',
      pt: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — os dois valores já estão à esquerda',
    },
    'caption.done': {
      en: '{cells} cells filled left to right in {fills} additions — {calls} recursive calls',
      ko: '칸 {cells} 개를 왼쪽부터 덧셈 {fills} 번으로 채웠다 — 재귀 호출은 {calls} 번',
      ja: '{cells} 個の枠を左から {fills} 回の足し算で埋めた — 再帰呼び出しは {calls} 回',
      zh: '从左到右用 {fills} 次加法填满 {cells} 格 — 递归调用 {calls} 次',
      ar: 'مُلئت {cells} خانة من اليسار إلى اليمين بـ {fills} عملية جمع — و{calls} استدعاء ذاتي',
      es: '{cells} casillas rellenadas de izquierda a derecha con {fills} sumas: {calls} llamadas recursivas',
      fr: '{cells} cases remplies de gauche à droite en {fills} additions — {calls} appels récursifs',
      hi: '{cells} खाने बाएँ से दाएँ {fills} जोड़ों में भरे — {calls} पुनरावर्ती कॉल',
      id: '{cells} sel diisi dari kiri ke kanan dengan {fills} penjumlahan — {calls} panggilan rekursif',
      pt: '{cells} casas preenchidas da esquerda para a direita em {fills} somas — {calls} chamadas recursivas',
    },
    'caption.doneNote': {
      en: 'Every cell looked only at the two before it, so keeping those two is enough',
      ko: '어느 칸도 바로 앞 둘만 보았다 — 그 둘만 들고 있으면 표 전체는 필요 없다',
      ja: 'どの枠も直前のふたつしか見ていない — そのふたつだけ持っていれば足りる',
      zh: '每一格都只看了前面两格，所以只留那两个就够了',
      ar: 'كل خانة نظرت إلى الخانتين السابقتين فقط، فيكفي الاحتفاظ بهما',
      es: 'Cada casilla solo miró las dos anteriores, así que basta con guardar esas dos',
      fr: "Chaque case n'a regardé que les deux précédentes : garder ces deux-là suffit",
      hi: 'हर खाने ने बस पिछले दो को देखा, इसलिए उन दो को रखना ही काफ़ी है',
      id: 'Tiap sel hanya melihat dua sel sebelumnya, jadi cukup menyimpan dua itu',
      pt: 'Cada casa olhou só as duas anteriores, então guardar essas duas basta',
    },
  },
  blocks: {
    stage: { type: 'bottom-up-table-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
};
