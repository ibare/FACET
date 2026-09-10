/**
 * relink-insert — 재연결 조각의 선언.
 *
 * @piece 한 질문에만 답한다 — 연결 리스트에 하나를 끼워 넣을 때 무엇이
 * 움직이는가. 답은 화살표 둘뿐이고 상자는 하나도 움직이지 않는다.
 *
 * 그래서 header (title-block) 도 metrics 도 두지 않는다. 제목은 이 그림을
 * 안고 있는 글의 문단이 주고, 셀 것은 없다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const relinkInsertFacet: FacetJson = {
  id: 'facet:relinkInsert',
  title: {
    en: 'Relinking',
    ko: '재연결',
    ja: 'つなぎ直し',
    zh: '重新连接',
    ar: 'إعادة الربط',
    es: 'Reenlazado',
    fr: 'Rechaînage',
    hi: 'फिर से जोड़ना',
    id: 'Penautan ulang',
    pt: 'Religação',
  },
  description: {
    en: 'Inserting into a linked list rewrites arrows, not positions.',
    ko: '연결 리스트의 삽입은 자리가 아니라 화살표를 고쳐 쓴다.',
    ja: '連結リストの挿入は、位置ではなく矢印を書き換える。',
    zh: '链表插入改写的是箭头，不是位置。',
    ar: 'الإدراج في القائمة المترابطة يعيد كتابة الأسهم لا المواضع.',
    es: 'Insertar en una lista enlazada reescribe flechas, no posiciones.',
    fr: 'Insérer dans une liste chaînée réécrit des flèches, pas des positions.',
    hi: 'लिंक्ड लिस्ट में सम्मिलन तीरों को बदलता है, जगहों को नहीं।',
    id: 'Menyisipkan ke linked list menulis ulang panah, bukan posisi.',
    pt: 'Inserir numa lista ligada reescreve setas, não posições.',
  },
  algorithm: 'module:relinkInsert',
  projector: 'module:relinkInsertProjector',
  initialData: {
    type: 'relink-insert',
    nodes: [
      { id: 'A', value: 4 },
      { id: 'B', value: 9 },
      { id: 'C', value: 2 },
    ],
    incoming: { id: 'X', value: 7 },
    insertAfter: 'A',
    // 걸음 사이에 읽을 시간을 준다. 조각은 지나가는 사람이 보는 그림이다.
    stepMs: 1200,
  },
  blocks: {
    stage: { type: 'relink-insert-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.chain': {
      en: 'Three boxes in a row. The arrows, not the boxes, set the order.',
      ko: '상자 셋이 줄지어 있다. 순서를 정하는 것은 상자가 아니라 화살표다.',
      ja: '箱が三つ並ぶ。順序を決めるのは箱ではなく矢印だ。',
      zh: '三个盒子排成一行。定顺序的是箭头，不是盒子。',
      ar: 'ثلاثة صناديق في صف. الأسهم لا الصناديق هي التي ترتّبها.',
      es: 'Tres cajas en fila. El orden lo fijan las flechas, no las cajas.',
      fr: "Trois boîtes alignées. Ce sont les flèches, non les boîtes, qui fixent l'ordre.",
      hi: 'तीन डिब्बे कतार में। क्रम तीर तय करते हैं, डिब्बे नहीं।',
      id: 'Tiga kotak berderet. Yang menentukan urutan adalah panah, bukan kotaknya.',
      pt: 'Três caixas em fila. Quem fixa a ordem são as setas, não as caixas.',
    },
    'caption.staged': {
      en: 'A new box holding {value} waits below, linked to nothing yet.',
      ko: '{value} 를 담은 새 상자가 아래에서 기다린다. 아직 어디에도 이어져 있지 않다.',
      ja: '{value} を入れた新しい箱が下で待つ。まだどこにもつながっていない。',
      zh: '装着 {value} 的新盒子在下面等着，还没连到任何地方。',
      ar: 'صندوق جديد يحمل {value} ينتظر في الأسفل، غير مرتبط بشيء بعد.',
      es: 'Una caja nueva con {value} espera abajo, aún sin enlazar.',
      fr: 'Une nouvelle boîte contenant {value} attend en bas, reliée à rien.',
      hi: '{value} वाला नया डिब्बा नीचे इंतज़ार करता है, अभी किसी से जुड़ा नहीं।',
      id: 'Kotak baru berisi {value} menunggu di bawah, belum tertaut ke mana pun.',
      pt: 'Uma caixa nova com {value} espera em baixo, ainda sem ligação.',
    },
    'caption.attachNew': {
      en: "First, point {source}'s next at {target}.",
      ko: '먼저 {source} 의 next 를 {target} 에 붙인다.',
      ja: 'まず {source} の next を {target} に向ける。',
      zh: '先把 {source} 的 next 指向 {target}。',
      ar: 'أولًا، وجّه next الخاص بـ {source} إلى {target}.',
      es: 'Primero, apunta el next de {source} a {target}.',
      fr: "D'abord, pointe le next de {source} vers {target}.",
      hi: 'पहले {source} के next को {target} की ओर करो।',
      id: 'Pertama, arahkan next milik {source} ke {target}.',
      pt: 'Primeiro, aponta o next de {source} para {target}.',
    },
    'caption.detach': {
      en: "Now unhook {source}'s next from {target}. For a moment it points nowhere.",
      ko: '이제 {source} 의 next 를 {target} 에서 뗀다. 그 사이 화살표는 아무 데도 가리키지 않는다.',
      ja: '次に {source} の next を {target} から外す。その間、矢印はどこも指さない。',
      zh: '再把 {source} 的 next 从 {target} 摘下。这一瞬它谁也不指。',
      ar: 'الآن افصل next الخاص بـ {source} عن {target}. للحظة لا يشير إلى شيء.',
      es: 'Ahora suelta el next de {source} de {target}. Por un instante no apunta a nada.',
      fr: 'Puis décroche le next de {source} de {target}. Un instant, il ne pointe nulle part.',
      hi: 'अब {source} के next को {target} से हटाओ। एक पल वह कहीं नहीं इशारा करता।',
      id: 'Sekarang lepaskan next milik {source} dari {target}. Sesaat ia tidak menunjuk ke mana-mana.',
      pt: 'Agora solta o next de {source} de {target}. Por um instante não aponta para nada.',
    },
    'caption.attachBack': {
      en: 'Drop that same arrow onto {target}. The tail never left {source}.',
      ko: '그 화살표를 그대로 {target} 에 내려놓는다. 꼬리는 {source} 를 떠난 적이 없다.',
      ja: 'その矢印をそのまま {target} に下ろす。根元は {source} を離れたことがない。',
      zh: '把那支箭头原样落到 {target} 上。尾巴从没离开过 {source}。',
      ar: 'أنزل السهم نفسه على {target}. ذيله لم يغادر {source} قط.',
      es: 'Deja esa misma flecha sobre {target}. La cola nunca salió de {source}.',
      fr: "Repose cette même flèche sur {target}. Sa queue n'a jamais quitté {source}.",
      hi: 'उसी तीर को {target} पर रख दो। उसकी पूँछ {source} से कभी हटी नहीं।',
      id: 'Turunkan panah yang sama itu ke {target}. Pangkalnya tak pernah meninggalkan {source}.',
      pt: 'Pousa essa mesma seta sobre {target}. A cauda nunca saiu de {source}.',
    },
    'caption.done': {
      en: 'Inserted — and every box sits exactly where it sat.',
      ko: '다 넣었다 — 그런데 어느 상자도 자리를 옮기지 않았다.',
      ja: '挿入は終わった — どの箱も元の場所のままだ。',
      zh: '插好了 — 可每个盒子都还在原处。',
      ar: 'تم الإدراج — وكل صندوق باقٍ في مكانه تمامًا.',
      es: 'Insertado, y cada caja sigue justo donde estaba.',
      fr: 'Inséré — et chaque boîte est restée exactement à sa place.',
      hi: 'सम्मिलन हो गया — और हर डिब्बा ठीक वहीं है जहाँ था।',
      id: 'Tersisip — dan tiap kotak tetap persis di tempatnya.',
      pt: 'Inserido — e cada caixa está exatamente onde estava.',
    },
    'label.tally': {
      en: 'Arrows rewritten: {rewires} · Boxes moved: {moves}',
      ko: '고쳐 쓴 화살표 {rewires}개 · 옮긴 상자 {moves}개',
      ja: '書き換えた矢印 {rewires} 本 · 動かした箱 {moves} 個',
      zh: '改写箭头 {rewires} 条 · 移动盒子 {moves} 个',
      ar: 'أسهم أُعيدت كتابتها: {rewires} · صناديق تحرّكت: {moves}',
      es: 'Flechas reescritas: {rewires} · Cajas movidas: {moves}',
      fr: 'Flèches réécrites : {rewires} · Boîtes déplacées : {moves}',
      hi: 'बदले गए तीर: {rewires} · हिले डिब्बे: {moves}',
      id: 'Panah ditulis ulang: {rewires} · Kotak berpindah: {moves}',
      pt: 'Setas reescritas: {rewires} · Caixas movidas: {moves}',
    },
    // 전제 각주 — 아래 줄은 그림의 사정이지 자료구조의 사정이 아니다 (S-piece).
  },
};
