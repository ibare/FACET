/**
 * @piece
 *
 * find-root — "뿌리를 찾아 올라간다" 는 질문 하나에 답한다. 자리 일곱과 그
 * 가리킴을 실측 데이터로 두고, 세 자리(3·6·2)에서 각각 올라가 어느 이름에
 * 닿는지, 그리고 자리로는 안 보이던 무리가 이름으로는 드러나는지를 보인다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const findRootFacet: FacetJson = {
  id: 'facet:findRoot',
  title: {
    en: 'Find the Root',
    ko: '뿌리 찾기',
    ja: '根を探す',
    zh: '找到根',
    ar: 'إيجاد الجذر',
    es: 'Encontrar la raíz',
    fr: 'Trouver la racine',
    hi: 'जड़ खोजें',
    id: 'Temukan Akarnya',
    pt: 'Encontrar a raiz',
  },
  description: {
    en: 'Every slot points upward; the one that points to itself is the name of the group.',
    ko: '자리마다 위를 가리키고, 자기를 가리키는 자리가 그 무리의 이름이다.',
    ja: 'どの位置も上を指し、自分自身を指す位置がその集まりの名前になる。',
    zh: '每个位置都指向上方，指向自己的那个位置就是这一组的名字。',
    ar: 'كل موضع يشير إلى أعلى، والموضع الذي يشير إلى نفسه هو اسم المجموعة.',
    es: 'Cada posición apunta hacia arriba; la que se apunta a sí misma es el nombre del grupo.',
    fr: 'Chaque case pointe vers le haut ; celle qui se pointe elle-même donne son nom au groupe.',
    hi: 'हर स्थान ऊपर की ओर इशारा करता है; जो खुद को इंगित करता है वही समूह का नाम है।',
    id: 'Setiap posisi menunjuk ke atas; yang menunjuk dirinya sendiri adalah nama kelompok itu.',
    pt: 'Cada posição aponta para cima; a que aponta para si mesma é o nome do grupo.',
  },
  algorithm: 'module:findRoot',
  projector: 'module:findRootProjector',
  initialData: {
    type: 'findRoot',
    // 자리 0~6 이 가리키는 자리. parent[i] === i 면 자기 자신 — 뿌리.
    parent: [0, 0, 1, 1, 4, 4, 5],
    // 차례로 올라가 볼 시작 자리 — 사양의 3 → 6 → 2 순서 그대로.
    queries: [3, 6, 2],
    stepMs: 640,
  },
  blocks: {
    stage: { type: 'find-root-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.start': {
      en: 'Start at slot {n}.',
      ko: '자리 {n} 에서 시작한다.',
      ja: '位置 {n} から始める。',
      zh: '从位置 {n} 开始。',
      ar: 'نبدأ من الموضع {n}.',
      es: 'Empezamos en la posición {n}.',
      fr: 'On part de la case {n}.',
      hi: 'स्थान {n} से शुरू।',
      id: 'Mulai dari posisi {n}.',
      pt: 'Começa-se na posição {n}.',
    },
    'caption.hop': {
      en: 'Slot {from} points to slot {to} — climb up.',
      ko: '자리 {from} 은 자리 {to} 를 가리킨다 — 오른다.',
      ja: '位置 {from} は位置 {to} を指している — 上る。',
      zh: '位置 {from} 指向位置 {to} — 往上走。',
      ar: 'الموضع {from} يشير إلى الموضع {to} — نصعد.',
      es: 'La posición {from} apunta a la posición {to}: subimos.',
      fr: 'La case {from} pointe vers la case {to} — on monte.',
      hi: 'स्थान {from} स्थान {to} की ओर इशारा करता है — ऊपर चढ़ें।',
      id: 'Posisi {from} menunjuk posisi {to} — naik.',
      pt: 'A posição {from} aponta para a posição {to} — sobe-se.',
    },
    'caption.root': {
      en: 'Slot {n} points to itself — the root. Its name is {n}.',
      ko: '자리 {n} 은 자기 자신을 가리킨다 — 뿌리다. 이름은 {n}.',
      ja: '位置 {n} は自分自身を指している — 根だ。名前は {n}。',
      zh: '位置 {n} 指向自己 — 这就是根。它的名字是 {n}。',
      ar: 'الموضع {n} يشير إلى نفسه — إنه الجذر. واسمه {n}.',
      es: 'La posición {n} se apunta a sí misma: es la raíz. Su nombre es {n}.',
      fr: 'La case {n} se pointe elle-même — la racine. Son nom est {n}.',
      hi: 'स्थान {n} खुद को इंगित करता है — यही जड़ है। इसका नाम {n} है।',
      id: 'Posisi {n} menunjuk dirinya sendiri — itulah akarnya. Namanya {n}.',
      pt: 'A posição {n} aponta para si mesma — é a raiz. O seu nome é {n}.',
    },
    'caption.compareSame': {
      en: 'Slot {a} and slot {b} both reach name {name} — same group.',
      ko: '자리 {a} 와 자리 {b} 는 둘 다 이름 {name} 에 닿는다 — 한 무리다.',
      ja: '位置 {a} と位置 {b} はどちらも名前 {name} に届く — 同じ集まりだ。',
      zh: '位置 {a} 与位置 {b} 都到达名字 {name} — 同一组。',
      ar: 'الموضعان {a} و{b} يصلان إلى الاسم {name} — المجموعة نفسها.',
      es: 'La posición {a} y la posición {b} llegan al nombre {name}: mismo grupo.',
      fr: 'Les cases {a} et {b} atteignent toutes deux le nom {name} — même groupe.',
      hi: 'स्थान {a} और स्थान {b} दोनों नाम {name} तक पहुँचते हैं — एक ही समूह।',
      id: 'Posisi {a} dan posisi {b} sama-sama sampai ke nama {name} — satu kelompok.',
      pt: 'A posição {a} e a posição {b} chegam ambas ao nome {name} — mesmo grupo.',
    },
    'caption.compareDiff': {
      en: 'Slot {a} reaches name {nameA}, slot {b} reaches name {nameB} — different groups.',
      ko: '자리 {a} 는 이름 {nameA} 에, 자리 {b} 는 이름 {nameB} 에 닿는다 — 남남이다.',
      ja: '位置 {a} は名前 {nameA} に、位置 {b} は名前 {nameB} に届く — 別々の集まりだ。',
      zh: '位置 {a} 到达名字 {nameA}，位置 {b} 到达名字 {nameB} — 不同的组。',
      ar: 'الموضع {a} يصل إلى الاسم {nameA}، والموضع {b} إلى الاسم {nameB} — مجموعتان مختلفتان.',
      es: 'La posición {a} llega al nombre {nameA} y la {b} al nombre {nameB}: grupos distintos.',
      fr: 'La case {a} atteint le nom {nameA}, la case {b} le nom {nameB} — groupes différents.',
      hi: 'स्थान {a} नाम {nameA} तक और स्थान {b} नाम {nameB} तक पहुँचता है — अलग-अलग समूह।',
      id: 'Posisi {a} sampai ke nama {nameA}, posisi {b} ke nama {nameB} — kelompok berbeda.',
      pt: 'A posição {a} chega ao nome {nameA} e a {b} ao nome {nameB} — grupos diferentes.',
    },
  },
};
