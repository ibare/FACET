/**
 * union-find — 서로소 집합 완결형 선언.
 *
 * 조각 셋(`findRoot` · `unionByRank` · `pathCompression`)이 연산은 다 덮는다.
 * 이 완제품이 더하는 것은 **누적**이다 — "모두 찾기" 를 두 번 누르면 두 번째가
 * 거의 공짜가 되는 것. 그것이 경로 압축의 값어치이고, 한 번의 압축만 보이는
 * 조각으로는 원리상 말할 수 없다.
 *
 * 슬라이더로 규칙을 갈아 끼우면 씨앗 짝을 처음부터 다시 쌓는다. 옛 규칙으로
 * 만든 모양 위에 새 규칙을 얹으면 무엇이 무엇 때문인지 가려진다.
 *
 * 식별자 (C1): `node:<i>` 만 쓴다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const unionFindFacet: FacetJson = {
  id: 'facet:unionFind',
  // 제목은 카탈로그 카드의 이름과 같다. 변별은 id 가 맡는다 (C4).
  title: {
    en: 'Union-Find',
    ko: '유니온-파인드',
    ja: 'ユニオン・ファインド',
    zh: '并查集',
    ar: 'الاتحاد والبحث',
    es: 'Union-Find',
    fr: 'Union-Find',
    hi: 'यूनियन-फाइंड',
    id: 'Union-Find',
    pt: 'Union-Find',
  },
  description: {
    en: 'Ask twice and the second answer is nearly free — the path folds as you climb.',
    ko: '두 번 물으면 두 번째는 거의 공짜다 — 오르는 김에 길이 접힌다',
    ja: '二度尋ねれば二度目はほぼ無料 — 上るついでに道が畳まれる。',
    zh: '问两次，第二次几乎免费 — 上爬的同时路被折叠。',
    ar: 'اسأل مرتين والإجابة الثانية شبه مجانية — الطريق ينطوي أثناء الصعود.',
    es: 'Pregunta dos veces y la segunda sale casi gratis: el camino se pliega al subir.',
    fr: 'Demandez deux fois et la seconde est presque gratuite — le chemin se replie en montant.',
    hi: 'दो बार पूछें और दूसरी बार लगभग मुफ़्त — चढ़ते-चढ़ते रास्ता मुड़ जाता है।',
    id: 'Tanya dua kali dan yang kedua nyaris gratis — jalannya melipat saat naik.',
    pt: 'Pergunte duas vezes e a segunda sai quase de graça — o caminho se dobra na subida.',
  },
  algorithm: 'module:unionFind',
  projector: 'module:unionFindProjector',
  initialData: {
    type: 'union-find',
    size: 10,
    // 씨앗 짝. 사슬이 생기도록 잇는다 — 최적화를 껐을 때 줄이 길어지는 것이
    // 보여야 켰을 때의 차이도 보인다. 다섯이면 두 줄과 홀로 남은 셋이 생긴다.
    seed: [
      [1, 0],
      [2, 1],
      [3, 2],
      [5, 4],
      [6, 5],
    ],
    stepMs: 380,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { type: 'row', gap: 8, children: [{ ref: 'costHud' }, { ref: 'heightHud' }] },
      { ref: 'controls' },
    ],
  },
  messages: {
    'caption.start': {
      en: 'Merging groups — each union picks a root to go under.',
      ko: '무리를 합친다 — 합칠 때마다 어느 뿌리를 아래로 넣을지 고른다',
      ja: 'グループを併合する — 合併のたびにどの根を下に入れるか選ぶ。',
      zh: '正在合并 — 每次合并都要选哪个根放到下面。',
      ar: 'ندمج المجموعات — كل اتحاد يختار جذرًا ليوضع تحته.',
      es: 'Uniendo grupos: cada unión elige qué raíz va debajo.',
      fr: 'Fusion des groupes — chaque union choisit la racine qui passe dessous.',
      hi: 'समूह मिल रहे हैं — हर संघ तय करता है कौन-सी जड़ नीचे जाएगी।',
      id: 'Menggabung kelompok — tiap union memilih akar mana yang masuk ke bawah.',
      pt: 'Unindo grupos — cada união escolhe qual raiz vai por baixo.',
    },
    'caption.hop': {
      en: '{from} points at {to} — climb one.',
      ko: '{from} 이 {to} 를 가리킨다 — 한 칸 오른다',
      ja: '{from} は {to} を指す — 一段上る。',
      zh: '{from} 指向 {to} — 上爬一格。',
      ar: '{from} يشير إلى {to} — نصعد درجة.',
      es: '{from} apunta a {to}: sube uno.',
      fr: '{from} pointe vers {to} — on monte d\'un cran.',
      hi: '{from} {to} की ओर इशारा करता है — एक कदम ऊपर।',
      id: '{from} menunjuk {to} — naik satu.',
      pt: '{from} aponta para {to} — sobe um.',
    },
    'caption.rootFound': {
      en: '{start} belongs to {root} — {n} hops.',
      ko: '{start} 은 {root} 의 무리다 — {n} 칸 올랐다',
      ja: '{start} は {root} の仲間だ — {n} 段上った。',
      zh: '{start} 属于 {root} — 上爬 {n} 格。',
      ar: '{start} ينتمي إلى {root} — {n} درجات.',
      es: '{start} pertenece a {root}: {n} saltos.',
      fr: '{start} appartient à {root} — {n} sauts.',
      hi: '{start} {root} का है — {n} कदम।',
      id: '{start} milik {root} — {n} lompatan.',
      pt: '{start} pertence a {root} — {n} saltos.',
    },
    'caption.compare': {
      en: 'Rank {ra} vs {rb} — the lower one goes under.',
      ko: '랭크 {ra} 와 {rb} 를 견준다 — 낮은 쪽이 아래로 간다',
      ja: 'ランク {ra} と {rb} を比べる — 低いほうが下に入る。',
      zh: '秩 {ra} 与 {rb} 相比 — 低的放到下面。',
      ar: 'الرتبة {ra} مقابل {rb} — الأدنى يذهب تحت.',
      es: 'Rango {ra} frente a {rb}: el menor va debajo.',
      fr: 'Rang {ra} contre {rb} — le plus bas passe dessous.',
      hi: 'रैंक {ra} बनाम {rb} — नीचा वाला नीचे जाता है।',
      id: 'Peringkat {ra} lawan {rb} — yang lebih rendah masuk ke bawah.',
      pt: 'Posto {ra} contra {rb} — o menor vai por baixo.',
    },
    'caption.attachGrew': {
      en: '{lo} goes under {wi} — the height grows by one.',
      ko: '{lo} 이 {wi} 밑으로 — 키가 하나 는다',
      ja: '{lo} が {wi} の下へ — 高さが一つ増える。',
      zh: '{lo} 放到 {wi} 下面 — 高度增加一。',
      ar: '{lo} يذهب تحت {wi} — يزداد الارتفاع واحدًا.',
      es: '{lo} va bajo {wi}: la altura crece uno.',
      fr: '{lo} passe sous {wi} — la hauteur augmente d\'un.',
      hi: '{lo} {wi} के नीचे — ऊँचाई एक बढ़ती है।',
      id: '{lo} masuk ke bawah {wi} — tingginya bertambah satu.',
      pt: '{lo} vai sob {wi} — a altura cresce um.',
    },
    'caption.attachSame': {
      en: '{lo} goes under {wi} — the height stays.',
      ko: '{lo} 이 {wi} 밑으로 — 키는 그대로다',
      ja: '{lo} が {wi} の下へ — 高さはそのまま。',
      zh: '{lo} 放到 {wi} 下面 — 高度不变。',
      ar: '{lo} يذهب تحت {wi} — يبقى الارتفاع كما هو.',
      es: '{lo} va bajo {wi}: la altura no cambia.',
      fr: '{lo} passe sous {wi} — la hauteur ne bouge pas.',
      hi: '{lo} {wi} के नीचे — ऊँचाई वही रहती है।',
      id: '{lo} masuk ke bawah {wi} — tingginya tetap.',
      pt: '{lo} vai sob {wi} — a altura permanece.',
    },
    'caption.compress': {
      en: '{n} seats now point straight at {root}.',
      ko: '{n} 개 자리가 이제 {root} 를 곧장 가리킨다',
      ja: '{n} 個の席が {root} を直接指すようになった。',
      zh: '{n} 个位置现在直接指向 {root}。',
      ar: '{n} مواضع تشير الآن مباشرة إلى {root}.',
      es: '{n} posiciones apuntan ahora directamente a {root}.',
      fr: '{n} places pointent désormais directement vers {root}.',
      hi: '{n} स्थान अब सीधे {root} की ओर इशारा करते हैं।',
      id: '{n} posisi kini menunjuk langsung ke {root}.',
      pt: '{n} posições agora apontam direto para {root}.',
    },
    'caption.already': {
      en: '{a} and {b} share a root already.',
      ko: '{a} 와 {b} 는 이미 한 무리다',
      ja: '{a} と {b} はすでに同じ仲間だ。',
      zh: '{a} 和 {b} 已经是同一组。',
      ar: '{a} و {b} يتشاركان الجذر بالفعل.',
      es: '{a} y {b} ya comparten raíz.',
      fr: '{a} et {b} partagent déjà une racine.',
      hi: '{a} और {b} पहले से एक ही जड़ के हैं।',
      id: '{a} dan {b} sudah satu akar.',
      pt: '{a} e {b} já compartilham a raiz.',
    },
    'hud.cost': {
      en: '{hops} hops / {finds} finds',
      ko: '{finds} 번에 {hops} 칸',
      ja: '{finds} 回で {hops} 段',
      zh: '{finds} 次共 {hops} 格',
      ar: '{hops} درجات / {finds} بحث',
      es: '{hops} saltos / {finds} búsquedas',
      fr: '{hops} sauts / {finds} recherches',
      hi: '{finds} खोज में {hops} कदम',
      id: '{hops} lompatan / {finds} pencarian',
      pt: '{hops} saltos / {finds} buscas',
    },
    'hud.height': {
      en: '{n}',
      ko: '{n}',
      ja: '{n}',
      zh: '{n}',
      ar: '{n}',
      es: '{n}',
      fr: '{n}',
      hi: '{n}',
      id: '{n}',
      pt: '{n}',
    },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'union-find-stage' },
    costHud: {
      type: 'text-display',
      label: { en: 'This run', ko: '이번 조작', ja: '今回の操作', zh: '本次操作', ar: 'هذه الجولة', es: 'Esta ronda', fr: 'Cette manche', hi: 'यह बार', id: 'Putaran ini', pt: 'Esta rodada' },
    },
    heightHud: {
      type: 'text-display',
      label: { en: 'Tallest tree', ko: '가장 높은 나무', ja: '最も高い木', zh: '最高的树', ar: 'أطول شجرة', es: 'Árbol más alto', fr: 'Arbre le plus haut', hi: 'सबसे ऊँचा पेड़', id: 'Pohon tertinggi', pt: 'Árvore mais alta' },
    },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'value-input',
          name: 'a',
          action: 'input',
          label: { en: 'a', ko: 'a', ja: 'a', zh: 'a', ar: 'أ', es: 'a', fr: 'a', hi: 'a', id: 'a', pt: 'a' },
          placeholder: { en: '0–9', ko: '0–9', ja: '0–9', zh: '0–9', ar: '0–9', es: '0–9', fr: '0–9', hi: '0–9', id: '0–9', pt: '0–9' },
          default: '',
        },
        {
          widget: 'value-input',
          name: 'b',
          action: 'input',
          label: { en: 'b', ko: 'b', ja: 'b', zh: 'b', ar: 'ب', es: 'b', fr: 'b', hi: 'b', id: 'b', pt: 'b' },
          placeholder: { en: '0–9', ko: '0–9', ja: '0–9', zh: '0–9', ar: '0–9', es: '0–9', fr: '0–9', hi: '0–9', id: '0–9', pt: '0–9' },
          default: '',
        },
        {
          widget: 'button',
          action: 'union',
          label: { en: 'Union', ko: '합치기', ja: '併合', zh: '合并', ar: 'اتحاد', es: 'Unir', fr: 'Unir', hi: 'जोड़ें', id: 'Gabung', pt: 'Unir' },
        },
        {
          widget: 'button',
          action: 'find',
          label: { en: 'Find a', ko: 'a 찾기', ja: 'a を探す', zh: '查找 a', ar: 'ابحث عن أ', es: 'Buscar a', fr: 'Trouver a', hi: 'a खोजें', id: 'Cari a', pt: 'Buscar a' },
        },
        {
          widget: 'button',
          action: 'find-all',
          label: { en: 'Find all', ko: '모두 찾기', ja: 'すべて探す', zh: '全部查找', ar: 'ابحث عن الكل', es: 'Buscar todos', fr: 'Tout trouver', hi: 'सब खोजें', id: 'Cari semua', pt: 'Buscar todos' },
        },
        {
          widget: 'segmented-slider',
          name: 'value',
          action: 'mode',
          label: { en: 'Rule', ko: '규칙', ja: '規則', zh: '规则', ar: 'القاعدة', es: 'Regla', fr: 'Règle', hi: 'नियम', id: 'Aturan', pt: 'Regra' },
          segments: [
            { value: 0, label: { en: 'Plain', ko: '그냥', ja: '素', zh: '朴素', ar: 'بسيط', es: 'Simple', fr: 'Simple', hi: 'सादा', id: 'Polos', pt: 'Simples' }, default: true },
            { value: 1, label: { en: 'Rank', ko: '랭크', ja: 'ランク', zh: '按秩', ar: 'رتبة', es: 'Rango', fr: 'Rang', hi: 'रैंक', id: 'Peringkat', pt: 'Posto' } },
            { value: 2, label: { en: 'Compress', ko: '압축', ja: '圧縮', zh: '压缩', ar: 'ضغط', es: 'Compresión', fr: 'Compression', hi: 'संपीड़न', id: 'Kompresi', pt: 'Compressão' } },
            { value: 3, label: { en: 'Both', ko: '둘 다', ja: '両方', zh: '两者', ar: 'كلاهما', es: 'Ambos', fr: 'Les deux', hi: 'दोनों', id: 'Keduanya', pt: 'Ambos' } },
          ],
        },
        CONTROL.reset,
      ],
      metrics: [
        { name: 'union-count', label: { en: 'Unions', ko: '합치기', ja: '併合', zh: '合并', ar: 'اتحادات', es: 'Uniones', fr: 'Unions', hi: 'संघ', id: 'Penggabungan', pt: 'Uniões' }, initial: 0 },
        { name: 'find-count', label: { en: 'Finds', ko: '찾기', ja: '探索', zh: '查找', ar: 'عمليات بحث', es: 'Búsquedas', fr: 'Recherches', hi: 'खोजें', id: 'Pencarian', pt: 'Buscas' }, initial: 0 },
        { name: 'hop-count', label: { en: 'Hops', ko: '오른 칸', ja: '上った段', zh: '上爬格数', ar: 'درجات', es: 'Saltos', fr: 'Sauts', hi: 'कदम', id: 'Lompatan', pt: 'Saltos' }, initial: 0 },
      ],
    },
  },
};
