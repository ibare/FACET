/**
 * 연관도 — 한 자리에 여럿을 두면 덜 밀린다.
 *
 * @piece
 *
 * 답하는 질문 하나: **캐시를 키우지 않고도 미스를 줄일 수 있는가.**
 *
 * 칸 수는 넷으로 고정하고 묶는 법만 바꾼다. 선언에 두는 것은 1차 데이터뿐이다 —
 * 칸 수 · 라인 크기 · 견줄 연관도 · 접근열. 자리 수 · 인덱스 · 태그 · 히트/미스 ·
 * 축출은 algorithm 이 그 자리에서 셈하고, 좌표는 stage 가 캔버스에서 역산한다
 * (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const associativityReliefFacet: FacetJson = {
  id: 'facet:associativityRelief',
  title: {
    en: 'Associativity: room to sit together',
    ko: '연관도 — 한 자리에 여럿을 두면 덜 밀린다',
    ja: '連想度 — 一つの席に複数置けば追い出されにくい',
    zh: '组相联 — 一个位置能放多个就少被挤出',
    ar: 'الترابط: مقعد يتسع لأكثر من سطر',
    es: 'Asociatividad: sitio para sentarse juntos',
    fr: "Associativité : de la place pour s'asseoir ensemble",
    hi: 'एसोसिएटिविटी — एक जगह पर कई रखें तो कम बेदखली',
    id: 'Asosiativitas: satu tempat untuk beberapa baris',
    pt: 'Associatividade: espaço para sentar junto',
  },
  description: {
    en: 'The same four lines, regrouped. One line per set thrashes; two per set lets the rivals sit side by side.',
    ko: '같은 네 칸을 다시 묶는다. 한 자리에 하나씩이면 서로 밀어내고, 둘씩이면 나란히 앉는다.',
    ja: '同じ四つの枠をまとめ直す。一席に一つなら追い出し合い、二つなら隣り合って座る。',
    zh: '同样的四个块，换一种分组。每个位置放一个就互相挤出，放两个就并排坐下。',
    ar: 'نفس الأسطر الأربعة بتجميع مختلف. سطر واحد لكل مجموعة يسبب الطرد المتبادل، وسطران يتيحان الجلوس جنبًا إلى جنب.',
    es: 'Las mismas cuatro líneas, reagrupadas. Una por conjunto provoca expulsiones; dos permiten sentarse juntas.',
    fr: 'Les mêmes quatre lignes, regroupées autrement. Une par ensemble et elles se chassent ; deux et elles cohabitent.',
    hi: 'वही चार ब्लॉक, नए समूह में। हर सेट में एक हो तो आपस में बेदखली, दो हों तो साथ-साथ।',
    id: 'Empat baris yang sama, dikelompokkan ulang. Satu per set saling mengusir; dua per set bisa berdampingan.',
    pt: 'As mesmas quatro linhas, reagrupadas. Uma por conjunto gera expulsões; duas permitem sentar lado a lado.',
  },
  algorithm: 'module:associativityRelief',
  projector: 'module:associativityReliefProjector',
  initialData: {
    type: 'associativity-relief',
    lineBytes: 16,
    totalLines: 4,
    ways: [1, 2],
    accesses: [0, 64, 0, 64, 0, 64],
    stepMs: 750,
  },
  blocks: {
    stage: { type: 'associativity-relief-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.fillEmpty': {
      en: '{addr} lands in set {set}. The way is free, so it just moves in.',
      ko: '{addr} → {set}번 자리. 빈 칸이라 그대로 올라간다.',
      ja: '{addr} → セット {set}。空いている枠なのでそのまま入る。',
      zh: '{addr} → 第 {set} 组。该路空着，直接放入。',
      ar: '{addr} يقع في المجموعة {set}. الطريق فارغ، فيدخل مباشرة.',
      es: '{addr} cae en el conjunto {set}. La vía está libre, así que entra sin más.',
      fr: "{addr} tombe dans l'ensemble {set}. La voie est libre, il entre directement.",
      hi: '{addr} सेट {set} में जाता है। रास्ता खाली है, इसलिए सीधे बैठ जाता है।',
      id: '{addr} masuk ke set {set}. Jalurnya kosong, jadi langsung menempati.',
      pt: '{addr} vai para o conjunto {set}. A via está livre, então simplesmente entra.',
    },
    'caption.sitTogether': {
      en: '{addr} wants set {set} too. This seat holds two, so it sits alongside.',
      ko: '{addr} → 같은 {set}번 자리. 이 자리는 둘을 담으므로 밀어내지 않고 곁에 앉는다.',
      ja: '{addr} も同じセット {set}。この席は二つ入るので、追い出さず隣に座る。',
      zh: '{addr} 也要第 {set} 组。这个位置能坐两个，于是并排坐下。',
      ar: '{addr} يريد المجموعة {set} أيضًا. هذا المقعد يتسع لاثنين، فيجلس بجانبه.',
      es: '{addr} también quiere el conjunto {set}. Este asiento admite dos, así que se sienta al lado.',
      fr: "{addr} vise aussi l'ensemble {set}. Ce siège en accueille deux : il s'assoit à côté.",
      hi: '{addr} को भी सेट {set} चाहिए। इस जगह पर दो बैठ सकते हैं, तो वह बगल में बैठ जाता है।',
      id: '{addr} juga menuju set {set}. Tempat ini memuat dua, jadi ia duduk berdampingan.',
      pt: '{addr} também quer o conjunto {set}. Este assento cabe dois, então senta ao lado.',
    },
    'caption.evict': {
      en: '{addr} wants set {set} too, but the only way is taken. {victim} is pushed out.',
      ko: '{addr} → 같은 {set}번 자리. 하나뿐인 칸이 차 있어 밀어낸다. 나가는 것은 {victim}.',
      ja: '{addr} も同じセット {set}。唯一の枠が埋まっているので追い出す。出るのは {victim}。',
      zh: '{addr} 也要第 {set} 组，但唯一的路已被占。被挤出去的是 {victim}。',
      ar: '{addr} يريد المجموعة {set} أيضًا، لكن الطريق الوحيد مشغول. يُطرد {victim}.',
      es: '{addr} también quiere el conjunto {set}, pero la única vía está ocupada. Sale {victim}.',
      fr: "{addr} vise aussi l'ensemble {set}, mais l'unique voie est occupée. {victim} est expulsé.",
      hi: '{addr} को भी सेट {set} चाहिए, पर इकलौता रास्ता भरा है। बाहर जाता है {victim}।',
      id: '{addr} juga menuju set {set}, tetapi satu-satunya jalur sudah terisi. Yang terusir adalah {victim}.',
      pt: '{addr} também quer o conjunto {set}, mas a única via está ocupada. Sai {victim}.',
    },
    'caption.hit': {
      en: '{addr} is still sitting in set {set}. Nobody pushed it out — hit.',
      ko: '{addr} → {set}번 자리에 그대로 있다. 밀어낸 것이 없으니 히트.',
      ja: '{addr} はセット {set} にそのまま残っている。誰も追い出さなかったのでヒット。',
      zh: '{addr} 仍坐在第 {set} 组。没人把它挤走，命中。',
      ar: '{addr} ما زال في المجموعة {set}. لم يطرده أحد — إصابة.',
      es: '{addr} sigue en el conjunto {set}. Nadie lo echó: acierto.',
      fr: "{addr} est toujours dans l'ensemble {set}. Personne ne l'a chassé : succès.",
      hi: '{addr} अब भी सेट {set} में है। किसी ने बेदखल नहीं किया — हिट।',
      id: '{addr} masih ada di set {set}. Tidak ada yang mengusirnya — hit.',
      pt: '{addr} continua no conjunto {set}. Ninguém o expulsou: acerto.',
    },
    'caption.regroup': {
      en: 'Still four lines — only the grouping changes: {ways} per seat, {sets} seats.',
      ko: '칸 수는 넷 그대로. 묶는 법만 바꾼다 — 한 자리에 {ways}칸씩, 자리는 {sets}.',
      ja: '枠は四つのまま。まとめ方だけを変える — 一席に {ways} 枠ずつ、席は {sets}。',
      zh: '仍是四个块，只改分组方式 — 每个位置放 {ways} 个，位置共 {sets} 个。',
      ar: 'ما زالت أربعة أسطر — يتغير التجميع فقط: {ways} لكل مقعد، وعدد المقاعد {sets}.',
      es: 'Siguen siendo cuatro líneas; solo cambia la agrupación: {ways} por asiento, {sets} asientos.',
      fr: 'Toujours quatre lignes — seul le regroupement change : {ways} par siège, {sets} sièges.',
      hi: 'ब्लॉक अब भी चार — केवल समूह बदलता है: हर जगह {ways}, कुल जगहें {sets}।',
      id: 'Tetap empat baris — hanya pengelompokannya berubah: {ways} per tempat, {sets} tempat.',
      pt: 'Ainda quatro linhas — só o agrupamento muda: {ways} por assento, {sets} assentos.',
    },
    'caption.done': {
      en: 'Same four lines, same accesses. Misses: {before} → {after}.',
      ko: '같은 네 칸, 같은 접근. 미스: {before} → {after}.',
      ja: '同じ四枠、同じアクセス。ミス: {before} → {after}。',
      zh: '同样四个块，同样的访问。未命中: {before} → {after}。',
      ar: 'نفس الأسطر الأربعة، ونفس الوصول. الإخفاقات: {before} → {after}.',
      es: 'Las mismas cuatro líneas, los mismos accesos. Fallos: {before} → {after}.',
      fr: 'Les mêmes quatre lignes, les mêmes accès. Défauts : {before} → {after}.',
      hi: 'वही चार ब्लॉक, वही पहुँच। मिस: {before} → {after}।',
      id: 'Empat baris yang sama, akses yang sama. Miss: {before} → {after}.',
      pt: 'As mesmas quatro linhas, os mesmos acessos. Falhas: {before} → {after}.',
    },
  },
};
