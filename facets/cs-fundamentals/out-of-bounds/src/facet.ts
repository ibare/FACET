/**
 * @piece 경계 밖 접근 — 번호가 끝을 넘으면.
 *
 * 답하는 질문 하나: **배열의 길이를 넘는 번호를 쓰면 무엇이 읽히는가.**
 * 주소 셈은 길이를 모르므로 멈추지 않는다. 배열의 끝을 지난 자리를 가리키고,
 * 거기 있던 남의 값을 그대로 읽는다. 경계 검사는 그 셈이 자리에 닿기 전에
 * 세우는 벽이다.
 *
 * 조각이므로 header 도 metrics 도 두지 않는다 (S-piece). 제목은 글의 문단이 주고,
 * 셀 것은 없다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const outOfBoundsFacet: FacetJson = {
  id: 'facet:outOfBounds',
  title: {
    en: 'Out-of-bounds access',
    ko: '경계 밖 접근',
    ja: '範囲外アクセス',
    zh: '越界访问',
    ar: 'الوصول خارج الحدود',
    es: 'Acceso fuera de límites',
    fr: 'Accès hors limites',
    hi: 'सीमा-बाहर पहुँच',
    id: 'Akses di luar batas',
    pt: 'Acesso fora dos limites',
  },
  description: {
    en: 'What an index past the end of an array actually points at.',
    ko: '배열의 끝을 넘는 번호가 실제로 무엇을 가리키는가.',
    ja: '配列の終わりを越えた添字が実際に何を指すのか。',
    zh: '越过数组末尾的下标实际指向什么。',
    ar: 'إلى ماذا يشير فعليًا مؤشّر يتجاوز نهاية المصفوفة.',
    es: 'A qué apunta en realidad un índice que pasa el final del arreglo.',
    fr: 'Ce que désigne réellement un indice au-delà de la fin du tableau.',
    hi: 'सरणी के अंत से आगे का सूचकांक असल में किसकी ओर इशारा करता है।',
    id: 'Apa yang sebenarnya ditunjuk oleh indeks yang melewati ujung larik.',
    pt: 'Para o que aponta realmente um índice além do fim do arranjo.',
  },
  algorithm: 'module:outOfBounds',
  projector: 'module:outOfBoundsProjector',

  initialData: {
    type: 'out-of-bounds',
    arrayName: 'arr',
    // int32 다섯 개. 0x1000 부터 20바이트 (0x1000 ~ 0x1013) 를 차지한다.
    values: [11, 22, 33, 44, 55],
    baseAddress: 0x1000,
    stride: 4,
    // 배열 바로 뒤 0x1014 에 놓인 다른 변수.
    neighborName: 'count',
    neighborValue: 1000,
    safeIndex: 4,
    outIndex: 5,
    stepMs: 780,
  },


  blocks: {
    stage: { type: 'out-of-bounds-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },

  messages: {
    'caption.compute': {
      en: 'The index becomes an address: {base} + {i} × {stride} = {addr}.',
      ko: '번호가 주소가 된다: {base} + {i} × {stride} = {addr}.',
      ja: '添字が番地になる: {base} + {i} × {stride} = {addr}。',
      zh: '下标变成地址：{base} + {i} × {stride} = {addr}。',
      ar: 'يتحوّل المؤشّر إلى عنوان: {base} + {i} × {stride} = {addr}.',
      es: 'El índice se vuelve una dirección: {base} + {i} × {stride} = {addr}.',
      fr: "L'indice devient une adresse : {base} + {i} × {stride} = {addr}.",
      hi: 'सूचकांक पता बन जाता है: {base} + {i} × {stride} = {addr}।',
      id: 'Indeks menjadi alamat: {base} + {i} × {stride} = {addr}.',
      pt: 'O índice vira um endereço: {base} + {i} × {stride} = {addr}.',
    },
    'caption.inside': {
      en: '{name}[{i}] lands on the last cell the array owns.',
      ko: '{name}[{i}] — 배열이 가진 마지막 칸에 내려선다.',
      ja: '{name}[{i}] — 配列が持つ最後の枠に降り立つ。',
      zh: '{name}[{i}] 落在数组拥有的最后一格上。',
      ar: '{name}[{i}] يحطّ على آخر خانة تملكها المصفوفة.',
      es: '{name}[{i}] cae en la última casilla que posee el arreglo.',
      fr: '{name}[{i}] tombe sur la dernière case que possède le tableau.',
      hi: '{name}[{i}] सरणी के अपने आख़िरी खाने पर उतरता है।',
      id: '{name}[{i}] mendarat di kotak terakhir milik larik.',
      pt: '{name}[{i}] cai na última casa que o arranjo possui.',
    },
    'caption.readInside': {
      en: 'It reads {value}, the value the array keeps there.',
      ko: '읽히는 값은 {value}. 배열이 거기 담아 둔 것이다.',
      ja: '読まれる値は {value}。配列がそこに置いたものだ。',
      zh: '读到的是 {value}，正是数组存在那里的值。',
      ar: 'يقرأ {value}، وهي القيمة التي تحفظها المصفوفة هناك.',
      es: 'Lee {value}, el valor que el arreglo guarda ahí.',
      fr: 'Il lit {value}, la valeur que le tableau garde là.',
      hi: 'यह {value} पढ़ता है — वही मान जो सरणी ने वहाँ रखा है।',
      id: 'Terbaca {value}, nilai yang memang disimpan larik di situ.',
      pt: 'Lê {value}, o valor que o arranjo guarda ali.',
    },
    'caption.keepsCounting': {
      en: 'Now {i}. The arithmetic checks nothing — it just keeps counting: {addr}.',
      ko: '이번엔 {i}. 셈은 아무것도 확인하지 않고 그대로 이어진다 — {addr}.',
      ja: '今度は {i}。計算は何も確かめずそのまま進む — {addr}。',
      zh: '这次是 {i}。算式什么也不检查，只管往下算：{addr}。',
      ar: 'الآن {i}. الحساب لا يتحقّق من شيء — يواصل العدّ فحسب: {addr}.',
      es: 'Ahora {i}. La aritmética no comprueba nada: sigue contando sin más, {addr}.',
      fr: 'Maintenant {i}. Le calcul ne vérifie rien — il continue simplement : {addr}.',
      hi: 'अब {i}। गणित कुछ भी जाँचता नहीं — बस गिनता चला जाता है: {addr}।',
      id: 'Sekarang {i}. Hitungannya tidak memeriksa apa pun — ia terus saja: {addr}.',
      pt: 'Agora {i}. A aritmética não verifica nada — apenas continua a contar: {addr}.',
    },
    'caption.crossed': {
      en: '{addr} lies past the end of the array, on the next variable.',
      ko: '{addr} — 배열의 끝을 지난 자리다. 커서는 다음 변수 위에 서 있다.',
      ja: '{addr} は配列の終わりを越えた場所で、次の変数の上だ。',
      zh: '{addr} 已在数组末尾之外，落在下一个变量上。',
      ar: '{addr} يقع بعد نهاية المصفوفة، فوق المتغيّر التالي.',
      es: '{addr} queda más allá del final del arreglo, sobre la siguiente variable.',
      fr: '{addr} se trouve au-delà de la fin du tableau, sur la variable suivante.',
      hi: '{addr} सरणी के अंत के पार है — अगले चर के ऊपर।',
      id: '{addr} berada di luar ujung larik, tepat di variabel berikutnya.',
      pt: '{addr} fica além do fim do arranjo, sobre a variável seguinte.',
    },
    'caption.readsNeighbor': {
      en: '{name}[{i}] reads {value} all the same. That value belongs to someone else.',
      ko: '{name}[{i}] — 그래도 값을 읽어 온다: {value}. 그 값은 남의 것이다.',
      ja: '{name}[{i}] — それでも {value} を読んでくる。その値は他人のものだ。',
      zh: '{name}[{i}] 照样读出了 {value}。那个值是别人的。',
      ar: '{name}[{i}] يقرأ {value} رغم ذلك. تلك القيمة ملك لغيره.',
      es: '{name}[{i}] lee {value} igualmente. Ese valor es de otro.',
      fr: "{name}[{i}] lit quand même {value}. Cette valeur appartient à quelqu'un d'autre.",
      hi: '{name}[{i}] फिर भी {value} पढ़ लेता है। वह मान किसी और का है।',
      id: '{name}[{i}] tetap saja membaca {value}. Nilai itu milik orang lain.',
      pt: '{name}[{i}] lê {value} na mesma. Esse valor é de outro.',
    },
    'caption.guard': {
      en: 'A bounds check stands at the end and asks {lo} ≤ i < {hi} before any access.',
      ko: '경계 검사가 끝에 서서, 접근하기 전에 {lo} ≤ i < {hi} 인지 묻는다.',
      ja: '境界検査が端に立ち、アクセスの前に {lo} ≤ i < {hi} かを問う。',
      zh: '边界检查守在末端，访问之前先问 {lo} ≤ i < {hi}。',
      ar: 'يقف فحص الحدود عند الطرف ويسأل {lo} ≤ i < {hi} قبل أي وصول.',
      es: 'Una comprobación de límites se planta al final y pregunta {lo} ≤ i < {hi} antes de todo acceso.',
      fr: 'Un contrôle de bornes se tient au bout et demande {lo} ≤ i < {hi} avant tout accès.',
      hi: 'सीमा-जाँच किनारे पर खड़ी रहती है और हर पहुँच से पहले पूछती है {lo} ≤ i < {hi}।',
      id: 'Pemeriksaan batas berdiri di ujung dan bertanya {lo} ≤ i < {hi} sebelum akses apa pun.',
      pt: 'Uma verificação de limites fica no fim e pergunta {lo} ≤ i < {hi} antes de qualquer acesso.',
    },
    'caption.blocked': {
      en: '{name}[{i}] never reaches the address. It stops at the edge instead.',
      ko: '{name}[{i}] — 그 주소에 닿지 못한다. 경계 앞에서 멈춘다.',
      ja: '{name}[{i}] はその番地に届かない。境界の手前で止まる。',
      zh: '{name}[{i}] 根本到不了那个地址，在边界前就停下。',
      ar: '{name}[{i}] لا يبلغ ذلك العنوان. يتوقّف عند الحدّ.',
      es: '{name}[{i}] nunca llega a esa dirección: se detiene en el borde.',
      fr: "{name}[{i}] n'atteint jamais cette adresse. Il s'arrête à la limite.",
      hi: '{name}[{i}] उस पते तक पहुँचता ही नहीं — सीमा पर ही रुक जाता है।',
      id: 'Akses {name}[{i}] tak pernah sampai ke alamat itu. Ia berhenti di batas.',
      pt: '{name}[{i}] nunca chega a esse endereço. Para na borda.',
    },

    'label.arrayRange': {
      en: '{from} – {to} · {bytes} bytes',
      ko: '{from} – {to} · {bytes}바이트',
      ja: '{from} – {to} · {bytes} バイト',
      zh: '{from} – {to} · {bytes} 字节',
      ar: '{from} – {to} · {bytes} بايت',
      es: '{from} – {to} · {bytes} bytes',
      fr: '{from} – {to} · {bytes} octets',
      hi: '{from} – {to} · {bytes} बाइट',
      id: '{from} – {to} · {bytes} byte',
      pt: '{from} – {to} · {bytes} bytes',
    },
    // 전제를 밝히는 각주 (S-piece). 이 배치는 그림의 가정이고, 그 사실이 곧
    // 경계 밖 접근의 결과가 정해져 있지 않다는 말이기도 하다.
  },
};
