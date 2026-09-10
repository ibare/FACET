/**
 * one-more-round-drops 의 선언.
 *
 * @piece 한 주장만 말하고 멈추는 조각이다 (S-piece) — "다 끝났어야 할 바퀴에서
 * 수가 또 줄면, 돌수록 짧아지는 고리가 있다는 뜻이다."
 *
 * 그래프는 정점 넷에 방향 간선 넷이다. A→B→C→A 가 고리이고 그 무게의 합이 음수라,
 * n−1 = 3 바퀴를 다 돌고도 값이 계속 내려간다. 몇 바퀴까지 보이고 멈출지는
 * `initialData.rounds` 에 둔 저작 결정이다 — 주장은 "멎지 않는다" 이지만 화면은
 * 멈춰야 한다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const oneMoreRoundDropsFacet: FacetJson = {
  id: 'facet:oneMoreRoundDrops',
  title: {
    en: 'One more round, and it drops again',
    ko: '한 바퀴 더 돌면 또 내려간다',
    ja: 'もう一周すると、また下がる',
    zh: '再走一轮，又降下去',
    ar: 'جولة أخرى، وينخفض من جديد',
    es: 'Una vuelta más y vuelve a bajar',
    fr: 'Un tour de plus, et ça baisse encore',
    hi: 'एक और चक्कर, और फिर गिर जाता है',
    id: 'Satu putaran lagi, dan turun lagi',
    pt: 'Mais uma volta, e cai de novo',
  },
  description: {
    en: 'If a distance still falls after round n−1, the graph has a negative cycle.',
    ko: 'n−1 바퀴를 다 돌고도 수가 내려가면 음수 고리가 있다는 뜻이다.',
    ja: 'n−1 周を終えてもなお距離が下がるなら、グラフに負の閉路がある。',
    zh: '走完 n−1 轮后距离仍在下降，说明图里有负权环。',
    ar: 'إذا استمرت المسافة في الانخفاض بعد الجولة n−1، ففي الرسم دورة سالبة.',
    es: 'Si una distancia sigue bajando tras la ronda n−1, el grafo tiene un ciclo negativo.',
    fr: 'Si une distance baisse encore après le tour n−1, le graphe a un cycle négatif.',
    hi: 'अगर n−1 चक्कर के बाद भी दूरी घटती रहे, तो ग्राफ में ऋणात्मक चक्र है।',
    id: 'Jika jarak masih turun setelah putaran n−1, graf punya siklus negatif.',
    pt: 'Se uma distância ainda cai depois da rodada n−1, o grafo tem um ciclo negativo.',
  },
  algorithm: 'module:oneMoreRoundDrops',
  projector: 'module:oneMoreRoundDropsProjector',
  initialData: {
    type: 'one-more-round-drops',
    nodes: ['S', 'A', 'B', 'C'],
    edges: [
      { from: 'S', to: 'A', w: 1 },
      { from: 'A', to: 'B', w: 2 },
      { from: 'B', to: 'C', w: -5 },
      { from: 'C', to: 'A', w: 1 },
    ],
    source: 'S',
    // 멎어야 할 바퀴는 셋이다. 그 뒤로 셋을 더 보여 같은 폭으로 내려가는 것을
    // 보이고 멈춘다.
    rounds: 6,
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'one-more-round-drops-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.round': {
      en: 'Round {n}',
      ko: '{n}바퀴',
      ja: '{n} 周目',
      zh: '第 {n} 轮',
      ar: 'الجولة {n}',
      es: 'Ronda {n}',
      fr: 'Tour {n}',
      hi: 'चक्कर {n}',
      id: 'Putaran {n}',
      pt: 'Rodada {n}',
    },
    'caption.start': {
      en: 'Only the start is 0. The rest are still unknown.',
      ko: '출발점만 0, 나머지는 아직 모른다.',
      ja: '出発点だけ 0。ほかはまだ分からない。',
      zh: '只有起点是 0，其余还不知道。',
      ar: 'البداية وحدها 0. والبقية ما زالت مجهولة.',
      es: 'Solo el inicio vale 0. El resto sigue sin saberse.',
      fr: 'Seul le départ vaut 0. Le reste est encore inconnu.',
      hi: 'सिर्फ शुरुआत 0 है। बाकी अभी अज्ञात हैं।',
      id: 'Hanya titik awal yang 0. Sisanya masih tak diketahui.',
      pt: 'Só o início é 0. O resto ainda é desconhecido.',
    },
    'caption.round': {
      en: 'Round {n}: the numbers drop.',
      ko: '{n}바퀴 — 수가 내려간다.',
      ja: '{n} 周目 — 数が下がる。',
      zh: '第 {n} 轮 — 数值下降。',
      ar: 'الجولة {n}: تنخفض الأرقام.',
      es: 'Ronda {n}: los números bajan.',
      fr: 'Tour {n} : les nombres baissent.',
      hi: 'चक्कर {n} — संख्याएँ गिरती हैं।',
      id: 'Putaran {n}: angkanya turun.',
      pt: 'Rodada {n}: os números caem.',
    },
    'caption.floor': {
      en: 'Round {n} is over. This is where they should stop.',
      ko: '{n}바퀴를 마쳤다. 여기가 바닥이어야 한다.',
      ja: '{n} 周目を終えた。ここが底のはずだ。',
      zh: '第 {n} 轮结束。这里应该就是底了。',
      ar: 'انتهت الجولة {n}. هنا يجب أن تتوقف.',
      es: 'Terminó la ronda {n}. Aquí deberían pararse.',
      fr: "Le tour {n} est fini. C'est ici qu'ils devraient s'arrêter.",
      hi: 'चक्कर {n} पूरा हुआ। यहीं रुक जाना चाहिए।',
      id: 'Putaran {n} selesai. Di sinilah seharusnya berhenti.',
      pt: 'A rodada {n} acabou. É aqui que deveriam parar.',
    },
    'caption.beyond': {
      en: 'Round {n}: they fall through the floor.',
      ko: '{n}바퀴째 — 바닥을 뚫고 또 내려간다.',
      ja: '{n} 周目 — 底を突き抜けてさらに下がる。',
      zh: '第 {n} 轮 — 穿过底部继续下降。',
      ar: 'الجولة {n}: تخترق القاع وتواصل الانخفاض.',
      es: 'Ronda {n}: atraviesan el suelo y siguen bajando.',
      fr: 'Tour {n} : ils traversent le plancher et descendent encore.',
      hi: 'चक्कर {n} — तल को भेदकर और नीचे गिरते हैं।',
      id: 'Putaran {n}: menembus dasar dan terus turun.',
      pt: 'Rodada {n}: furam o piso e caem mais.',
    },
    'caption.never': {
      en: 'Every round, the same drop. It never stops.',
      ko: '바퀴마다 같은 폭. 멎지 않는다.',
      ja: '周ごとに同じ下げ幅。止まらない。',
      zh: '每一轮都降同样多。停不下来。',
      ar: 'في كل جولة الانخفاض نفسه. لا يتوقف أبدًا.',
      es: 'Cada ronda, la misma caída. No para nunca.',
      fr: "À chaque tour, la même baisse. Cela ne s'arrête jamais.",
      hi: 'हर चक्कर में उतनी ही गिरावट। यह कभी नहीं रुकता।',
      id: 'Tiap putaran, turun sebanyak itu juga. Tak pernah berhenti.',
      pt: 'A cada rodada, a mesma queda. Nunca para.',
    },
  },
};
