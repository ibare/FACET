/**
 * dequeBothEnds — 양방향 큐 조각(piece) 선언.
 *
 * @piece 양끝이 모두 열려 있다. 문이 넷이 아니라 둘인데, 그 둘이 저마다 넣기와
 * 빼기를 겸한다 — 어느 끝에서든 넣고 어느 끝에서든 뺀다.
 *
 * 조각이므로 header 도 metrics 도 layout 도 두지 않는다 (S-piece).
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const dequeBothEndsFacet: FacetJson = {
  id: 'facet:dequeBothEnds',
  title: {
    en: 'Open at both ends',
    ko: '양끝이 모두 열려 있다',
    ja: '両端がどちらも開いている',
    zh: '两端都是开的',
    ar: 'مفتوح من الطرفين',
    es: 'Abierto por los dos extremos',
    fr: 'Ouvert aux deux bouts',
    hi: 'दोनों सिरे खुले हैं',
    id: 'Terbuka di kedua ujung',
    pt: 'Aberto nas duas pontas',
  },
  description: {
    en: 'A deque has two doors, not four — and each door both takes values in and lets them out.',
    ko: '양방향 큐의 문은 넷이 아니라 둘이고, 그 둘이 저마다 넣기와 빼기를 겸한다.',
    ja: '両端キューの扉は四つではなく二つで、その二つが出入りを兼ねる。',
    zh: '双端队列的门不是四扇而是两扇 — 每扇门既进也出。',
    ar: 'للطابور ذي الطرفين بابان لا أربعة — وكل باب يُدخل القيم ويُخرجها.',
    es: 'Una deque tiene dos puertas, no cuatro, y cada puerta sirve para entrar y para salir.',
    fr: "Une deque a deux portes, pas quatre — et chaque porte sert à la fois d'entrée et de sortie.",
    hi: 'डेक में चार नहीं, दो दरवाज़े होते हैं — और हर दरवाज़ा अंदर लेने और बाहर निकालने, दोनों का काम करता है।',
    id: 'Deque punya dua pintu, bukan empat — dan tiap pintu sekaligus memasukkan dan mengeluarkan nilai.',
    pt: 'Uma deque tem duas portas, não quatro — e cada porta serve tanto para entrar quanto para sair.',
  },
  algorithm: 'module:dequeBothEnds',
  projector: 'module:dequeBothEndsProjector',
  initialData: {
    type: 'dequeBothEnds',
    values: [4, 9],
    frontValue: 2,
    backValue: 6,
    capacity: 4,
    stepMs: 660,
  },
  blocks: {
    stage: { type: 'deque-both-ends-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.pushFront': {
      en: 'In through the front door',
      ko: 'front 문으로 들어간다',
      ja: 'front の扉から入る',
      zh: '从 front 门进入',
      ar: 'الدخول من باب front',
      es: 'Entra por la puerta front',
      fr: 'Entrée par la porte front',
      hi: 'front दरवाज़े से अंदर',
      id: 'Masuk lewat pintu front',
      pt: 'Entra pela porta front',
    },
    'caption.pushBack': {
      en: 'In through the back door',
      ko: 'back 문으로 들어간다',
      ja: 'back の扉から入る',
      zh: '从 back 门进入',
      ar: 'الدخول من باب back',
      es: 'Entra por la puerta back',
      fr: 'Entrée par la porte back',
      hi: 'back दरवाज़े से अंदर',
      id: 'Masuk lewat pintu back',
      pt: 'Entra pela porta back',
    },
    'caption.popFront': {
      en: 'Out through that same front door',
      ko: '들어갔던 그 front 문으로 나온다',
      ja: '入ったその front の扉から出る',
      zh: '从同一扇 front 门出去',
      ar: 'الخروج من باب front نفسه',
      es: 'Sale por esa misma puerta front',
      fr: 'Sortie par cette même porte front',
      hi: 'उसी front दरवाज़े से बाहर',
      id: 'Keluar lewat pintu front yang sama',
      pt: 'Sai por essa mesma porta front',
    },
    'caption.popBack': {
      en: 'Out through that same back door',
      ko: '들어갔던 그 back 문으로 나온다',
      ja: '入ったその back の扉から出る',
      zh: '从同一扇 back 门出去',
      ar: 'الخروج من باب back نفسه',
      es: 'Sale por esa misma puerta back',
      fr: 'Sortie par cette même porte back',
      hi: 'उसी back दरवाज़े से बाहर',
      id: 'Keluar lewat pintu back yang sama',
      pt: 'Sai por essa mesma porta back',
    },
    'caption.bothEnds': {
      en: 'Two doors, four operations — each end both takes in and gives out',
      ko: '문은 둘, 조작은 넷 — 두 끝이 저마다 넣기와 빼기를 겸한다',
      ja: '扉は二つ、操作は四つ — 両端がそれぞれ出入りを兼ねる',
      zh: '两扇门，四种操作 — 每一端都既进又出',
      ar: 'بابان وأربع عمليات — كل طرف يُدخل ويُخرج',
      es: 'Dos puertas, cuatro operaciones: cada extremo mete y saca',
      fr: 'Deux portes, quatre opérations — chaque bout fait entrer et sortir',
      hi: 'दो दरवाज़े, चार क्रियाएँ — हर सिरा अंदर भी लेता है और बाहर भी देता है',
      id: 'Dua pintu, empat operasi — tiap ujung memasukkan sekaligus mengeluarkan',
      pt: 'Duas portas, quatro operações — cada ponta mete e tira',
    },
  },
};
