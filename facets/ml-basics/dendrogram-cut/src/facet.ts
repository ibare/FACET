/**
 * @piece 덴드로그램 절단 — 나무를 다 만들어 놓고, 무리 수는 어떻게 정하는가.
 *
 * 가로선 하나가 나무를 가로질러 위아래로 옮겨 다닌다. 그 선이 지나는 세로
 * 가지의 수가 곧 무리 수다. 자르는 일에는 셈이 없다 — 높이 하나를 고르는
 * 것뿐이고, 고르는 것은 사람이다.
 *
 * `initialData` 에는 구조만 둔다 — 잎이 될 점 여덟과 걸음 간격. 나무의 모양도
 * 자를 높이도 알고리즘이 좌표에서 셈하고, 화면의 자리는 무대가 캔버스에서
 * 역산한다 (S-piece).
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const dendrogramCutFacet: FacetJson = {
  id: 'facet:dendrogramCut',
  title: {
    en: 'Cutting the dendrogram',
    ko: '덴드로그램 절단',
    ja: 'デンドログラムを切る',
    zh: '切分树状图',
    ar: 'قطع المخطط الشجري',
    es: 'Cortar el dendrograma',
    fr: 'Couper le dendrogramme',
    hi: 'डेंड्रोग्राम काटना',
    id: 'Memotong dendrogram',
    pt: 'Cortar o dendrograma',
  },
  description: {
    en: 'Where you cut the tree is what decides how many clusters you get.',
    ko: '어디서 자르느냐로 무리 수가 정해진다.',
    ja: '木のどこで切るかが、まとまりの数を決める。',
    zh: '在树的哪个高度切开，决定了你得到几个簇。',
    ar: 'موضع القطع في الشجرة هو ما يحدد عدد العناقيد.',
    es: 'Dónde cortes el árbol es lo que decide cuántos grupos obtienes.',
    fr: "L'endroit où l'on coupe l'arbre décide du nombre de groupes.",
    hi: 'पेड़ को कहाँ काटा जाए, यही तय करता है कि कितने समूह मिलेंगे।',
    id: 'Di mana pohon dipotong itulah yang menentukan berapa banyak klaster.',
    pt: 'Onde você corta a árvore é o que decide quantos grupos aparecem.',
  },
  algorithm: 'module:dendrogramCut',
  projector: 'module:dendrogramCutProjector',
  initialData: {
    type: 'dendrogram-cut',
    points: [
      { id: 'a', x: 0.0, y: 0.0 },
      { id: 'b', x: 0.5, y: 0.0 },
      { id: 'c', x: 0.0, y: 2.0 },
      { id: 'd', x: 0.62, y: 2.0 },
      { id: 'e', x: 5.0, y: 0.0 },
      { id: 'f', x: 5.74, y: 0.0 },
      { id: 'g', x: 5.0, y: 2.4 },
      { id: 'h', x: 5.86, y: 2.4 },
    ],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'dendrogram-cut-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.grown': {
      en: 'The tree is already fully grown.',
      ko: '나무는 이미 다 자라 있다.',
      ja: '木はすでに育ちきっている。',
      zh: '这棵树已经完全长成。',
      ar: 'الشجرة نمت بالكامل بالفعل.',
      es: 'El árbol ya está completamente formado.',
      fr: "L'arbre est déjà entièrement construit.",
      hi: 'पेड़ पहले ही पूरी तरह बन चुका है।',
      id: 'Pohonnya sudah tumbuh sepenuhnya.',
      pt: 'A árvore já está completamente formada.',
    },
    'caption.cut': {
      en: 'Cut height {h} — clusters {n}',
      ko: '자른 높이 {h} · 무리 {n}',
      ja: '切る高さ {h} — まとまり {n}',
      zh: '切分高度 {h} — 簇数 {n}',
      ar: 'ارتفاع القطع {h} — العناقيد {n}',
      es: 'Altura de corte {h} — grupos {n}',
      fr: 'Hauteur de coupe {h} — groupes {n}',
      hi: 'कटाव की ऊँचाई {h} — समूह {n}',
      id: 'Tinggi potong {h} — klaster {n}',
      pt: 'Altura de corte {h} — grupos {n}',
    },
    'caption.bands': {
      en: 'Wide empty bands between the crossbars: {n}',
      ko: '가로대 사이가 넓게 빈 구간: {n}',
      ja: '横棒のあいだが大きく空いた帯: {n}',
      zh: '横杆之间的大片空白区间：{n}',
      ar: 'الفجوات الواسعة بين العوارض: {n}',
      es: 'Franjas vacías anchas entre los travesaños: {n}',
      fr: 'Bandes vides larges entre les barres : {n}',
      hi: 'आड़ी छड़ों के बीच चौड़े खाली पट्टे: {n}',
      id: 'Pita kosong lebar di antara palang: {n}',
      pt: 'Faixas vazias largas entre as barras: {n}',
    },
    'caption.settled': {
      en: 'Cut inside a wide band — clusters {n}',
      ko: '넓은 구간 안에서 끊었다. 무리 {n}',
      ja: '広く空いた帯の中で切った — まとまり {n}',
      zh: '在大片空白区间中切开 — 簇数 {n}',
      ar: 'قطعنا داخل فجوة واسعة — العناقيد {n}',
      es: 'Cortado dentro de una franja ancha: grupos {n}',
      fr: 'Coupe dans une bande large — groupes {n}',
      hi: 'चौड़े पट्टे के भीतर काटा — समूह {n}',
      id: 'Dipotong di dalam pita lebar — klaster {n}',
      pt: 'Cortado dentro de uma faixa larga — grupos {n}',
    },
    'caption.done': {
      en: 'The tree does not choose. A person does.',
      ko: '나무는 고르지 않는다. 고르는 것은 사람이다.',
      ja: '木は選ばない。選ぶのは人だ。',
      zh: '树不做选择。做选择的是人。',
      ar: 'الشجرة لا تختار. الإنسان هو من يختار.',
      es: 'El árbol no elige. Elige una persona.',
      fr: "L'arbre ne choisit pas. C'est une personne qui choisit.",
      hi: 'पेड़ नहीं चुनता। चुनता इंसान है।',
      id: 'Pohon tidak memilih. Manusialah yang memilih.',
      pt: 'A árvore não escolhe. Quem escolhe é uma pessoa.',
    },
    'label.height': {
      en: 'height',
      ko: '높이',
      ja: '高さ',
      zh: '高度',
      ar: 'الارتفاع',
      es: 'altura',
      fr: 'hauteur',
      hi: 'ऊँचाई',
      id: 'tinggi',
      pt: 'altura',
    },
    'label.clusters': {
      en: 'clusters',
      ko: '무리',
      ja: 'まとまり',
      zh: '簇',
      ar: 'عناقيد',
      es: 'grupos',
      fr: 'groupes',
      hi: 'समूह',
      id: 'klaster',
      pt: 'grupos',
    },
  },
};
