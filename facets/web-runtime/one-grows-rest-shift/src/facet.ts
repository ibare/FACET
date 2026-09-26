/**
 * @piece
 * @notation native
 *
 * 질문: 문서 흐름 한가운데 상자 하나가 커지면, 그 앞과 뒤의 상자들은 각각 어떻게 되는가.
 *
 * 태그 이름(h1 · p · img) · 요소 식별자 · px 은 번역하지 않는 자료라 initialData 에 둔다.
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';
import type { OneGrowsRestShiftFacetData } from './algorithm.js';

const data: OneGrowsRestShiftFacetData = {
  type: 'one-grows-rest-shift',
  stepMs: 1600,
  lineHeights: { h1: 40, p: 24 },
  blocks: [
    { id: 'title', tag: 'h1', lines: 1 },
    { id: 'p1', tag: 'p', lines: 2 },
    { id: 'p2', tag: 'p', lines: 2 },
    { id: 'p3', tag: 'p', lines: 1 },
    { id: 'photo', tag: 'img', height: 96 },
    { id: 'p4', tag: 'p', lines: 3 },
  ],
  change: { id: 'p2', lines: 4 },
};

export const oneGrowsRestShiftFacet: FacetJson = {
  id: 'facet:oneGrowsRestShift',
  title: {
    en: 'One box grows, the rest shift down',
    ko: '하나가 자라면 뒤가 밀린다',
    ja: '一つが伸びると後ろがずれる',
    zh: '一个变高，后面的都被推下',
    ar: 'يكبر صندوق واحد فتنزاح البقية',
    es: 'Una caja crece y las demás se desplazan',
    fr: 'Une boîte grandit, les suivantes glissent',
    hi: 'एक बॉक्स बढ़ा, बाकी नीचे खिसके',
    id: 'Satu kotak membesar, sisanya bergeser',
    pt: 'Uma caixa cresce e as outras descem',
  },
  description: {
    en: 'When one block in the flow gets taller, the blocks before it stay put and every block after it is pushed down by the same distance.',
    ko: '흐름 속 블록 하나가 커지면 그 앞의 블록은 제자리에 있고, 뒤의 블록은 모두 같은 거리만큼 아래로 밀린다.',
    ja: 'フロー内のブロックが一つ高くなると、前のブロックはそのまま、後ろのブロックはすべて同じ距離だけ下に押し出される。',
    zh: '流中的一个块变高时，它前面的块不动，后面的块都被向下推同样的距离。',
    ar: 'حين يزداد ارتفاع كتلة واحدة في التدفق، تبقى الكتل التي قبلها مكانها، وتُدفع كل كتلة بعدها إلى الأسفل بالمسافة نفسها.',
    es: 'Cuando un bloque del flujo se hace más alto, los bloques anteriores se quedan quietos y todos los posteriores bajan la misma distancia.',
    fr: 'Quand un bloc du flux grandit, les blocs qui le précèdent restent en place et tous ceux qui le suivent descendent de la même distance.',
    hi: 'प्रवाह में एक ब्लॉक ऊँचा होने पर उससे पहले के ब्लॉक अपनी जगह रहते हैं, और उसके बाद का हर ब्लॉक उतनी ही दूरी नीचे धकेला जाता है।',
    id: 'Saat satu blok dalam aliran bertambah tinggi, blok sebelumnya tetap di tempat dan setiap blok sesudahnya terdorong turun sejauh yang sama.',
    pt: 'Quando um bloco do fluxo fica mais alto, os blocos anteriores ficam no lugar e todos os seguintes descem a mesma distância.',
  },
  algorithm: 'module:oneGrowsRestShift',
  scene: 'module:oneGrowsRestShiftScene',
  initialData: data,
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'Before the change. Container height: {h}px',
      ko: '바뀌기 전. 담는 상자 높이: {h}px',
      ja: '変わる前。包むボックスの高さ: {h}px',
      zh: '变化之前。容器高度：{h}px',
      ar: 'قبل التغيير. ارتفاع الحاوية: {h}px',
      es: 'Antes del cambio. Altura del contenedor: {h}px',
      fr: 'Avant le changement. Hauteur du conteneur : {h}px',
      hi: 'बदलाव से पहले। कंटेनर की ऊँचाई: {h}px',
      id: 'Sebelum perubahan. Tinggi wadah: {h}px',
      pt: 'Antes da mudança. Altura do contêiner: {h}px',
    },
    'caption.grow': {
      en: 'Grows: {id} — lines {from} → {to}, height {h0} → {h1} ({d}). y stays {y}.',
      ko: '자라는 상자: {id} — 줄 {from} → {to} · 높이 {h0} → {h1} ({d}) · y 그대로 {y}',
      ja: '伸びる: {id} — 行 {from} → {to}、高さ {h0} → {h1} ({d})。y はそのまま {y}。',
      zh: '变高：{id} — 行数 {from} → {to}，高度 {h0} → {h1}（{d}）。y 不变：{y}。',
      ar: 'يكبر: {id} — الأسطر {from} → {to}، الارتفاع {h0} → {h1} ({d}). يبقى y عند {y}.',
      es: 'Crece: {id} — líneas {from} → {to}, altura {h0} → {h1} ({d}). y sigue en {y}.',
      fr: 'Grandit : {id} — lignes {from} → {to}, hauteur {h0} → {h1} ({d}). y reste à {y}.',
      hi: 'बढ़ा: {id} — पंक्तियाँ {from} → {to}, ऊँचाई {h0} → {h1} ({d})। y वही: {y}।',
      id: 'Membesar: {id} — baris {from} → {to}, tinggi {h0} → {h1} ({d}). y tetap {y}.',
      pt: 'Cresce: {id} — linhas {from} → {to}, altura {h0} → {h1} ({d}). y fica em {y}.',
    },
    'caption.shift': {
      en: 'Pushed down: {id} — y {from} → {to} ({d}). Height stays {h}.',
      ko: '밀려 내려감: {id} — y {from} → {to} ({d}) · 높이 그대로 {h}',
      ja: '押し下げ: {id} — y {from} → {to} ({d})。高さはそのまま {h}。',
      zh: '被推下：{id} — y {from} → {to}（{d}）。高度不变：{h}。',
      ar: 'دُفع إلى الأسفل: {id} — y {from} → {to} ({d}). يبقى الارتفاع {h}.',
      es: 'Empujado hacia abajo: {id} — y {from} → {to} ({d}). La altura sigue en {h}.',
      fr: 'Poussé vers le bas : {id} — y {from} → {to} ({d}). La hauteur reste {h}.',
      hi: 'नीचे धकेला गया: {id} — y {from} → {to} ({d})। ऊँचाई वही: {h}।',
      id: 'Terdorong turun: {id} — y {from} → {to} ({d}). Tinggi tetap {h}.',
      pt: 'Empurrado para baixo: {id} — y {from} → {to} ({d}). A altura fica em {h}.',
    },
    'caption.container': {
      en: 'Container height: {from} → {to} ({d})',
      ko: '담는 상자 높이: {from} → {to} ({d})',
      ja: '包むボックスの高さ: {from} → {to} ({d})',
      zh: '容器高度：{from} → {to}（{d}）',
      ar: 'ارتفاع الحاوية: {from} → {to} ({d})',
      es: 'Altura del contenedor: {from} → {to} ({d})',
      fr: 'Hauteur du conteneur : {from} → {to} ({d})',
      hi: 'कंटेनर की ऊँचाई: {from} → {to} ({d})',
      id: 'Tinggi wadah: {from} → {to} ({d})',
      pt: 'Altura do contêiner: {from} → {to} ({d})',
    },
    'caption.tally': {
      en: 'Unchanged: {kept} · Pushed down: {moved}',
      ko: '그대로: {kept} · 밀려 내려감: {moved}',
      ja: 'そのまま: {kept} · 押し下げ: {moved}',
      zh: '不变：{kept} · 被推下：{moved}',
      ar: 'دون تغيير: {kept} · دُفع إلى الأسفل: {moved}',
      es: 'Sin cambio: {kept} · Empujados hacia abajo: {moved}',
      fr: 'Inchangés : {kept} · Poussés vers le bas : {moved}',
      hi: 'अपरिवर्तित: {kept} · नीचे धकेले गए: {moved}',
      id: 'Tetap: {kept} · Terdorong turun: {moved}',
      pt: 'Sem mudança: {kept} · Empurrados para baixo: {moved}',
    },
    'label.container': {
      en: 'container',
      ko: '담는 상자',
      ja: '包むボックス',
      zh: '容器',
      ar: 'الحاوية',
      es: 'contenedor',
      fr: 'conteneur',
      hi: 'कंटेनर',
      id: 'wadah',
      pt: 'contêiner',
    },
  },
  blocks: {
    stage: { type: 'one-grows-rest-shift-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
