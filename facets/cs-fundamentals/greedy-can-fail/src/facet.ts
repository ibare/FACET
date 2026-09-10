/**
 * greedyCanFail facet 선언.
 *
 * @piece 조각(piece) — 질문 하나에 답하고 멈춘다 (S-piece).
 *
 * 답하는 질문: **"눈앞의 가장 큰 것을 집는 규칙이 언제 최선을 놓치는가?"**
 *
 * 9 · 6 · 1 로 12 를 만든다. 큰 것부터 집으면 9 를 집는 순간 6 둘로 가는 길이
 * 닫혀 9·1·1·1 넷이 되고, 개수를 최소로 하면 6·6 둘이다. 두 줄의 길이 차이가
 * 곧 결론이며, 그 차이는 우연이 아니라 **뒤를 보지 않아서** 생긴다.
 *
 * 화면에 뜨는 수는 하나도 여기 적혀 있지 않다 — 넷도 둘도 algorithm 이 셈한다.
 * 이 선언이 정하는 것은 동전 묶음과 목표, 그리고 읽을 시간(stepMs)뿐이다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const greedyCanFailFacet: FacetJson = {
  id: 'facet:greedyCanFail',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: {
    en: 'When Greedy Fails',
    ko: '그리디의 한계',
    ja: '貪欲法が失敗するとき',
    zh: '贪心失效的时候',
    ar: 'حين يفشل الجشع',
    es: 'Cuando lo voraz falla',
    fr: 'Quand le glouton échoue',
    hi: 'जब लालची तरीका चूक जाता है',
    id: 'Saat Greedy Gagal',
    pt: 'Quando o guloso falha',
  },
  description: {
    en: 'Two rows make the same amount from the same coins. Taking the biggest coin first ends up using more of them.',
    ko: '같은 동전으로 같은 금액을 만드는 두 줄. 큰 것부터 집은 쪽이 오히려 더 많이 쓴다.',
    ja: '同じ硬貨で同じ金額を作る二列。大きいほうから取った列のほうが枚数は多くなる。',
    zh: '两行用同样的硬币凑出同样的金额。先拿最大面额的那行反而用得更多。',
    ar: 'صفّان يكوّنان المبلغ نفسه من العملات نفسها. من يبدأ بالأكبر ينتهي مستخدماً عدداً أكثر.',
    es: 'Dos filas forman la misma cantidad con las mismas monedas. Tomar primero la mayor acaba usando más.',
    fr: "Deux rangées font le même montant avec les mêmes pièces. Prendre la plus grosse d'abord en consomme davantage.",
    hi: 'दो पंक्तियाँ एक ही सिक्कों से एक ही रकम बनाती हैं। सबसे बड़ा सिक्का पहले लेने वाली ज़्यादा सिक्के खर्च करती है।',
    id: 'Dua baris menyusun jumlah yang sama dari koin yang sama. Yang mengambil koin terbesar dulu justru memakai lebih banyak.',
    pt: 'Duas fileiras formam o mesmo valor com as mesmas moedas. Pegar a maior primeiro acaba usando mais.',
  },
  algorithm: 'module:greedyCanFail',
  projector: 'module:greedyCanFailProjector',
  initialData: {
    type: 'greedyCanFail',
    /** 액면. 9 를 집으면 6 둘로 가는 길이 닫히도록 고른 묶음이다. */
    coins: [9, 6, 1],
    target: 12,
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'greedy-can-fail-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    // ── 줄 이름과 눈금. 도식 라벨이지만 원어 그대로 통용되는 용어가 아니라
    //    한국어로 읽혀야 한다 (C10 판정 4).
    'label.laneGreedy': {
      en: 'largest first',
      ko: '큰 것부터',
      ja: '大きい順',
      zh: '先拿大的',
      ar: 'الأكبر أولاً',
      es: 'la mayor primero',
      fr: "la plus grosse d'abord",
      hi: 'सबसे बड़ा पहले',
      id: 'terbesar dulu',
      pt: 'a maior primeiro',
    },
    'label.laneFewest': {
      en: 'fewest coins',
      ko: '가장 적게',
      ja: '最少枚数',
      zh: '硬币最少',
      ar: 'أقل عدد',
      es: 'menos monedas',
      fr: 'le moins de pièces',
      hi: 'सबसे कम सिक्के',
      id: 'koin paling sedikit',
      pt: 'menos moedas',
    },
    'label.target': {
      en: 'target',
      ko: '목표',
      ja: '目標',
      zh: '目标',
      ar: 'الهدف',
      es: 'objetivo',
      fr: 'objectif',
      hi: 'लक्ष्य',
      id: 'target',
      pt: 'alvo',
    },
    'label.count': {
      en: '{n} coins',
      ko: '{n} 개',
      ja: '{n} 枚',
      zh: '{n} 枚',
      ar: '{n} عملة',
      es: '{n} monedas',
      fr: '{n} pièces',
      hi: '{n} सिक्के',
      id: '{n} koin',
      pt: '{n} moedas',
    },

    // ── 캡션. 지금 화면에서 무슨 일이 일어나는지만 말한다.
    'caption.setup': {
      en: 'Both rows share the shelf above and may take any coin as often as they need.',
      ko: '위 선반의 동전은 두 줄이 함께 쓴다. 어느 액면이든 몇 개든 집을 수 있다.',
      ja: '上の棚の硬貨は二列で共用する。どの額面でも何枚でも取れる。',
      zh: '上方架子上的硬币两行共用，任何面额都可以取任意多枚。',
      ar: 'يتشارك الصفّان الرفّ في الأعلى، ولكلٍّ أن يأخذ أي عملة بأي عدد.',
      es: 'Las dos filas comparten el estante de arriba y pueden tomar cualquier moneda las veces que haga falta.',
      fr: "Les deux rangées partagent l'étagère du haut et peuvent prendre n'importe quelle pièce autant de fois qu'il le faut.",
      hi: 'ऊपर की शेल्फ़ दोनों पंक्तियाँ साझा करती हैं और कोई भी सिक्का जितनी बार चाहें ले सकती हैं।',
      id: 'Kedua baris berbagi rak di atas dan boleh mengambil koin mana pun sebanyak yang diperlukan.',
      pt: 'As duas fileiras dividem a prateleira de cima e podem pegar qualquer moeda quantas vezes precisarem.',
    },
    'caption.goal': {
      en: 'Both rows set out from the same target — {target}.',
      ko: '두 줄 다 같은 목표에서 출발한다 — {target}.',
      ja: '二列とも同じ目標から始める — {target}。',
      zh: '两行都从同一个目标出发 — {target}。',
      ar: 'ينطلق الصفّان من الهدف نفسه — {target}.',
      es: 'Las dos filas parten del mismo objetivo — {target}.',
      fr: 'Les deux rangées partent du même objectif — {target}.',
      hi: 'दोनों पंक्तियाँ एक ही लक्ष्य से चलती हैं — {target}।',
      id: 'Kedua baris berangkat dari target yang sama — {target}.',
      pt: 'As duas fileiras partem do mesmo alvo — {target}.',
    },
    'caption.fork': {
      en: 'The first pick already splits them. One row takes {a}, the other {b}. Left over — {ra} and {rb}.',
      ko: '첫 집음에서 이미 갈린다. 한 줄은 {a} 짜리를, 다른 줄은 {b} 짜리를 집는다. 남은 몫 — {ra} · {rb}.',
      ja: '最初の一枚でもう分かれる。一方は {a}、もう一方は {b} を取る。残り — {ra} と {rb}。',
      zh: '第一次取就分道了。一行取 {a}，另一行取 {b}。剩下 — {ra} 和 {rb}。',
      ar: 'الاختيار الأول يفرّقهما. صفّ يأخذ {a} والآخر {b}. المتبقّي — {ra} و{rb}.',
      es: 'La primera elección ya los separa. Una fila toma {a}, la otra {b}. Queda — {ra} y {rb}.',
      fr: "Le premier choix les sépare déjà. Une rangée prend {a}, l'autre {b}. Reste — {ra} et {rb}.",
      hi: 'पहली ही पसंद उन्हें अलग कर देती है। एक पंक्ति {a} लेती है, दूसरी {b}। बचा — {ra} और {rb}।',
      id: 'Pilihan pertama sudah memisahkan keduanya. Satu baris ambil {a}, satunya {b}. Sisa — {ra} dan {rb}.',
      pt: 'A primeira escolha já os separa. Uma fileira pega {a}, a outra {b}. Sobra — {ra} e {rb}.',
    },
    'caption.round': {
      en: 'Each row takes one more coin by its own rule. Left over — {ra} and {rb}.',
      ko: '두 줄이 각자의 규칙대로 하나씩 더 집는다. 남은 몫 — {ra} · {rb}.',
      ja: '各列が自分の規則でもう一枚取る。残り — {ra} と {rb}。',
      zh: '每行按自己的规则再取一枚。剩下 — {ra} 和 {rb}。',
      ar: 'يأخذ كل صفّ عملة أخرى وفق قاعدته. المتبقّي — {ra} و{rb}.',
      es: 'Cada fila toma otra moneda según su regla. Queda — {ra} y {rb}.',
      fr: 'Chaque rangée prend une pièce de plus selon sa règle. Reste — {ra} et {rb}.',
      hi: 'हर पंक्ति अपने नियम से एक और सिक्का लेती है। बचा — {ra} और {rb}।',
      id: 'Tiap baris mengambil satu koin lagi menurut aturannya. Sisa — {ra} dan {rb}.',
      pt: 'Cada fileira pega mais uma moeda pela sua regra. Sobra — {ra} e {rb}.',
    },
    'caption.alone': {
      en: 'Only the row that is still short moves now. It takes {a}, leaving {ra}.',
      ko: '아직 모자란 줄만 움직인다. {a} 짜리를 하나 더 집어 남은 몫 — {ra}.',
      ja: 'まだ足りない列だけが動く。{a} を取って残りは {ra}。',
      zh: '只有还差的那行继续。取 {a}，剩下 {ra}。',
      ar: 'يتحرّك الآن الصفّ الناقص وحده. يأخذ {a} فيبقى {ra}.',
      es: 'Ahora solo se mueve la fila a la que aún le falta. Toma {a} y quedan {ra}.',
      fr: 'Seule la rangée encore en manque avance. Elle prend {a}, il reste {ra}.',
      hi: 'अब सिर्फ़ वही पंक्ति चलती है जिसमें कमी है। वह {a} लेती है, बचा {ra}।',
      id: 'Kini hanya baris yang masih kurang yang bergerak. Ia ambil {a}, sisa {ra}.',
      pt: 'Agora só a fileira que ainda falta se move. Pega {a} e restam {ra}.',
    },
    'caption.settled': {
      en: 'One row is already finished with {n} coins. The other is still short — {r}.',
      ko: '한 줄은 벌써 {n} 개로 끝났다. 다른 줄은 아직 모자라다 — {r}.',
      ja: '一方は {n} 枚でもう終わった。もう一方はまだ足りない — {r}。',
      zh: '一行已经用 {n} 枚结束了。另一行还差 — {r}。',
      ar: 'انتهى صفّ بـ{n} عملة، والآخر ما زال ناقصاً — {r}.',
      es: 'Una fila ya terminó con {n} monedas. A la otra aún le falta — {r}.',
      fr: "Une rangée a déjà fini avec {n} pièces. À l'autre il manque encore — {r}.",
      hi: 'एक पंक्ति {n} सिक्कों में पूरी हो गई। दूसरी में अब भी कमी है — {r}।',
      id: 'Satu baris sudah selesai dengan {n} koin. Satunya masih kurang — {r}.',
      pt: 'Uma fileira já terminou com {n} moedas. À outra ainda falta — {r}.',
    },
    'caption.verdict': {
      en: 'Same coins, same target: {g} coins for largest first, {f} for fewest. The bigger first pick cost {d} more.',
      ko: '같은 동전, 같은 목표. 큰 것부터 집은 줄은 {g} 개, 가장 적게 집은 줄은 {f} 개. 첫 집음이 {d} 개를 더 쓰게 했다.',
      ja: '同じ硬貨、同じ目標。大きい順は {g} 枚、最少は {f} 枚。最初に大きく取ったことが {d} 枚を余計にさせた。',
      zh: '同样的硬币，同样的目标：先拿大的用了 {g} 枚，最少的用了 {f} 枚。第一次取大的多花了 {d} 枚。',
      ar: 'العملات نفسها والهدف نفسه: {g} عملة للأكبر أولاً و{f} للأقل. الاختيار الأول الأكبر كلّف {d} زيادة.',
      es: 'Mismas monedas, mismo objetivo: {g} monedas tomando la mayor primero y {f} con el mínimo. Esa primera elección grande costó {d} más.',
      fr: "Mêmes pièces, même objectif : {g} pièces pour la plus grosse d'abord, {f} pour le minimum. Ce premier gros choix a coûté {d} de plus.",
      hi: 'वही सिक्के, वही लक्ष्य: बड़ा पहले लेने पर {g} सिक्के, सबसे कम पर {f}। पहला बड़ा चुनाव {d} ज़्यादा ले गया।',
      id: 'Koin sama, target sama: {g} koin untuk terbesar dulu, {f} untuk paling sedikit. Pilihan besar pertama itu memakan {d} lebih banyak.',
      pt: 'Mesmas moedas, mesmo alvo: {g} moedas pegando a maior primeiro, {f} no mínimo. Essa primeira escolha grande custou {d} a mais.',
    },
  },
};
