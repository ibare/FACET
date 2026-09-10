/**
 * enqueue-dequeue-ends facet 선언 (조각).
 *
 * @piece 한쪽으로 넣고 반대쪽으로 뺀다 — 드나드는 문이 서로 반대편이면 차례가 어떻게 되는가.
 *
 * 조각이므로 header 도 metrics 도 layout 도 두지 않는다. 러너가 `column · gap 8 ·
 * blocks 키 순서` 로 배치하고, 가로는 `PIECE_CANVAS_W` 로 정한다 (S-piece).
 * 컨트롤 둘은 눌러야 완성되는 조작이 아니다 — 자동 재생만 보고 지나가도 화면은 할 말을 마친다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const enqueueDequeueEndsFacet: FacetJson = {
  id: 'facet:enqueueDequeueEnds',
  title: {
    en: 'In one end, out the other',
    ko: '한쪽으로 넣고 반대쪽으로 뺀다',
    ja: '一方から入れ、反対から出す',
    zh: '一头进，另一头出',
    ar: 'يدخل من طرف ويخرج من الآخر',
    es: 'Entra por un extremo, sale por el otro',
    fr: "Entrée d'un côté, sortie de l'autre",
    hi: 'एक सिरे से अंदर, दूसरे से बाहर',
    id: 'Masuk dari satu ujung, keluar dari ujung lain',
    pt: 'Entra por uma ponta, sai pela outra',
  },
  description: {
    en: 'The two doors sit at opposite ends, so the first one in is the first one out.',
    ko: '드나드는 문이 서로 반대편이라, 먼저 들어온 것이 먼저 나온다.',
    ja: '出入り口が両端にあるので、先に入ったものが先に出る。',
    zh: '两道门分处两端，所以先进的先出。',
    ar: 'البابان على طرفين متقابلين، فأول الداخلين هو أول الخارجين.',
    es: 'Las dos puertas están en extremos opuestos, así que el primero en entrar es el primero en salir.',
    fr: 'Les deux portes sont aux extrémités opposées : le premier entré est le premier sorti.',
    hi: 'दोनों दरवाज़े आमने-सामने के सिरों पर हैं, इसलिए जो पहले आया वही पहले जाता है।',
    id: 'Kedua pintunya ada di ujung yang berlawanan, jadi yang masuk lebih dulu keluar lebih dulu.',
    pt: 'As duas portas ficam em pontas opostas, por isso o primeiro a entrar é o primeiro a sair.',
  },
  algorithm: 'module:enqueueDequeueEnds',
  projector: 'module:enqueueDequeueEndsProjector',
  initialData: {
    type: 'enqueue-dequeue-ends',
    values: [3, 7, 1],
    stepMs: 620,
  },
  blocks: {
    stage: { type: 'enqueue-dequeue-ends-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.doors': {
      en: 'Two doors, one at each end.',
      ko: '드나드는 문이 둘, 서로 반대편에 있다.',
      ja: '出入り口が二つ、それぞれの端にある。',
      zh: '两道门，一头一个。',
      ar: 'بابان، واحد عند كل طرف.',
      es: 'Dos puertas, una en cada extremo.',
      fr: 'Deux portes, une à chaque bout.',
      hi: 'दो दरवाज़े, हर सिरे पर एक।',
      id: 'Dua pintu, satu di tiap ujung.',
      pt: 'Duas portas, uma em cada ponta.',
    },
    'caption.in': {
      en: 'In through the back door — {value}',
      ko: '뒤쪽 문으로 들어간다 — {value}',
      ja: '後ろの扉から入る — {value}',
      zh: '从后门进来 — {value}',
      ar: 'يدخل من الباب الخلفي — {value}',
      es: 'Entra por la puerta de atrás — {value}',
      fr: 'Entrée par la porte arrière — {value}',
      hi: 'पिछले दरवाज़े से अंदर — {value}',
      id: 'Masuk lewat pintu belakang — {value}',
      pt: 'Entra pela porta de trás — {value}',
    },
    'caption.out': {
      en: 'Out through the front door — {value}',
      ko: '앞쪽 문으로 나온다 — {value}',
      ja: '前の扉から出る — {value}',
      zh: '从前门出去 — {value}',
      ar: 'يخرج من الباب الأمامي — {value}',
      es: 'Sale por la puerta de delante — {value}',
      fr: 'Sortie par la porte avant — {value}',
      hi: 'अगले दरवाज़े से बाहर — {value}',
      id: 'Keluar lewat pintu depan — {value}',
      pt: 'Sai pela porta da frente — {value}',
    },
    'caption.sameOrder': {
      en: 'In {inOrder} — out {outOrder}. The order held.',
      ko: '들어간 차례 {inOrder} — 나온 차례 {outOrder}. 차례가 그대로다.',
      ja: '入った順は {inOrder} — 出た順は {outOrder}。順序はそのままだ。',
      zh: '进来的次序 {inOrder} — 出去的次序 {outOrder}。次序没变。',
      ar: 'الدخول {inOrder} — الخروج {outOrder}. الترتيب محفوظ.',
      es: 'Entraron {inOrder} y salieron {outOrder}. El orden se mantuvo.',
      fr: "Entrés {inOrder} — sortis {outOrder}. L'ordre a tenu.",
      hi: 'अंदर {inOrder} — बाहर {outOrder}। क्रम वही रहा।',
      id: 'Masuk {inOrder} — keluar {outOrder}. Urutannya tetap.',
      pt: 'Entraram {inOrder} — saíram {outOrder}. A ordem manteve-se.',
    },
  },
};
