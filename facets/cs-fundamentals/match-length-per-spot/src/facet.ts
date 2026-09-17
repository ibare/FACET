/**
 * matchLengthPerSpot — 조각(piece).
 *
 * @piece 자리마다 "맨 앞과 얼마나 겹치는가" 를 구할 때, 이미 본 구간 안이면
 *        거울에서 답을 빌린다는 한 주장만 말하고 멈춘다.
 *
 * 화면에 뜨는 문안은 전부 messages 에 있다 (C10). 좌표는 stage 가 셈한다.
 *
 * 화면은 장면(Scene) 방식이다 — 이벤트가 `MatchLengthPerSpotScene` 으로 쌓이고
 * stage 의 `render` 하나가 그 장면을 통째로 세운다. 그래서 스크럽 띠로 아무 걸음에나
 * 갈 수 있다 (S-scene).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const matchLengthPerSpotFacet: FacetJson = {
  id: 'facet:matchLengthPerSpot',
  title: {
    en: 'Match length per spot',
    ko: '자리마다 겹치는 길이',
    ja: '位置ごとの一致の長さ',
    zh: '每个位置的匹配长度',
    ar: 'طول التطابق عند كل موضع',
    es: 'Longitud de coincidencia por posición',
    fr: 'Longueur de correspondance par position',
    hi: 'हर स्थान पर मिलान की लंबाई',
    id: 'Panjang kecocokan tiap posisi',
    pt: 'Comprimento de correspondência por posição',
  },
  description: {
    en: 'Inside a window we have already checked, the answer is borrowed from the mirror spot instead of comparing again.',
    ko: '이미 본 구간 안이면 글자를 다시 견주지 않고 거울 자리에서 답을 빌린다.',
    ja: 'すでに確認した区間の中なら、比べ直さずに鏡の位置から答えを借りる。',
    zh: '若落在已确认的区间内，就不再逐字比较，而从镜像位置借来答案。',
    ar: 'داخل نافذة سبق التحقق منها، يُستعار الجواب من الموضع المرآتي بدل المقارنة من جديد.',
    es: 'Dentro de una ventana ya comprobada, la respuesta se toma prestada del punto espejo en lugar de comparar otra vez.',
    fr: "À l'intérieur d'une fenêtre déjà vérifiée, la réponse est empruntée à la position miroir au lieu d'être recomparée.",
    hi: 'पहले से जाँची गई खिड़की के भीतर उत्तर दोबारा तुलना किए बिना दर्पण स्थान से उधार लिया जाता है।',
    id: 'Di dalam jendela yang sudah diperiksa, jawaban dipinjam dari posisi cermin alih-alih dibandingkan ulang.',
    pt: 'Dentro de uma janela já verificada, a resposta é emprestada da posição espelho em vez de comparar de novo.',
  },
  algorithm: 'module:matchLengthPerSpot',
  scene: 'module:matchLengthPerSpotScene',
  initialData: {
    type: 'match-length-per-spot',
    text: 'aabaabaabx',
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'match-length-per-spot-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.whole': {
      en: 'The front spot matches the whole string — its answer is the full length.',
      ko: '맨 앞 자리의 답은 문자열 전체 길이다.',
      ja: '先頭の位置の答えは文字列全体の長さになる。',
      zh: '最前面位置的答案就是整个字符串的长度。',
      ar: 'جواب الموضع الأول هو طول السلسلة كاملة.',
      es: 'La respuesta de la primera posición es la longitud completa de la cadena.',
      fr: "La réponse de la première position est la longueur entière de la chaîne.",
      hi: 'सबसे आगे वाले स्थान का उत्तर पूरी स्ट्रिंग की लंबाई है।',
      id: 'Jawaban posisi paling depan adalah panjang seluruh teks.',
      pt: 'A resposta da primeira posição é o comprimento inteiro da cadeia.',
    },
    'caption.outside': {
      en: 'Outside the window. Compare the characters from the very front.',
      ko: '구간 밖이다. 맨 앞부터 글자를 하나씩 견준다.',
      ja: '区間の外だ。先頭から一文字ずつ比べる。',
      zh: '在区间之外。从最前面开始逐字比较。',
      ar: 'خارج النافذة. قارن الحروف بدءًا من المقدمة.',
      es: 'Fuera de la ventana. Compara los caracteres desde el principio.',
      fr: 'Hors de la fenêtre. On compare les caractères depuis le tout début.',
      hi: 'खिड़की के बाहर। अक्षरों की तुलना बिलकुल शुरू से करें।',
      id: 'Di luar jendela. Bandingkan huruf mulai dari paling depan.',
      pt: 'Fora da janela. Compare os caracteres desde o começo.',
    },
    'caption.extend': {
      en: 'What was borrowed is certain. Keep comparing from the window edge on.',
      ko: '빌린 만큼은 확실하다. 구간 끝부터 이어서 견준다.',
      ja: '借りた分までは確かだ。区間の端から続けて比べる。',
      zh: '借来的部分是确定的。从区间末端继续比较。',
      ar: 'ما استُعير مؤكد. تابع المقارنة من حافة النافذة.',
      es: 'Lo prestado es seguro. Sigue comparando desde el borde de la ventana.',
      fr: "Ce qui est emprunté est sûr. On poursuit la comparaison depuis le bord de la fenêtre.",
      hi: 'जो उधार लिया गया वह निश्चित है। खिड़की के किनारे से आगे तुलना जारी रखें।',
      id: 'Bagian yang dipinjam sudah pasti. Lanjutkan membandingkan dari tepi jendela.',
      pt: 'O que foi emprestado é certo. Continue comparando a partir da borda da janela.',
    },
    'caption.borrow': {
      en: 'Inside the window. Borrow the answer from the mirror spot on the left.',
      ko: '구간 안이다. 왼쪽 거울 자리에서 답을 빌려 온다.',
      ja: '区間の中だ。左の鏡の位置から答えを借りてくる。',
      zh: '在区间之内。从左边的镜像位置借来答案。',
      ar: 'داخل النافذة. استعر الجواب من الموضع المرآتي على اليسار.',
      es: 'Dentro de la ventana. Toma prestada la respuesta del punto espejo de la izquierda.',
      fr: "Dans la fenêtre. On emprunte la réponse à la position miroir, à gauche.",
      hi: 'खिड़की के भीतर। बाईं ओर के दर्पण स्थान से उत्तर उधार लें।',
      id: 'Di dalam jendela. Pinjam jawaban dari posisi cermin di sebelah kiri.',
      pt: 'Dentro da janela. Pegue emprestada a resposta da posição espelho à esquerda.',
    },
    'caption.capped': {
      en: 'What was borrowed reaches the window edge. Beyond it nothing is certain yet.',
      ko: '빌린 만큼이 구간 끝에 닿았다. 그 너머는 아직 확인된 적이 없다.',
      ja: '借りた分が区間の端に届いた。その先はまだ確かめられていない。',
      zh: '借来的部分触到了区间末端。再往后还没有被确认过。',
      ar: 'بلغ ما استُعير حافة النافذة. وما بعدها لم يُتحقق منه بعد.',
      es: 'Lo prestado llega al borde de la ventana. Más allá nada está confirmado aún.',
      fr: "Ce qui est emprunté atteint le bord de la fenêtre. Au-delà, rien n'est encore vérifié.",
      hi: 'उधार लिया गया हिस्सा खिड़की के किनारे तक पहुँच गया। उसके आगे अभी कुछ भी जाँचा नहीं गया।',
      id: 'Bagian yang dipinjam mencapai tepi jendela. Di luar itu belum ada yang dipastikan.',
      pt: 'O que foi emprestado alcança a borda da janela. Além dela nada foi confirmado ainda.',
    },
    'caption.window': {
      en: 'The overlap reached farther right. Move the window over there.',
      ko: '겹침이 더 오른쪽에 닿았다. 구간을 그리로 옮긴다.',
      ja: '重なりがより右まで届いた。区間をそこへ移す。',
      zh: '重叠触及了更右边。把区间移到那里。',
      ar: 'بلغ التداخل مدى أبعد إلى اليمين. انقل النافذة إلى هناك.',
      es: 'El solapamiento llegó más a la derecha. Mueve la ventana hasta allí.',
      fr: "Le chevauchement va plus loin à droite. On déplace la fenêtre là-bas.",
      hi: 'अतिव्यापन और दाईं ओर तक पहुँचा। खिड़की को वहीं ले जाएँ।',
      id: 'Tumpangnya mencapai lebih jauh ke kanan. Pindahkan jendela ke sana.',
      pt: 'A sobreposição alcançou mais à direita. Mova a janela para lá.',
    },
    'caption.done': {
      en: 'Of {spots} spots, {borrowed} never compared a character. Character pairs compared: {compares}.',
      ko: '자리 {spots} 가운데 {borrowed} 곳은 글자를 한 번도 견주지 않았다. 견준 글자 쌍은 모두 {compares}.',
      ja: '{spots} の位置のうち {borrowed} か所は一度も文字を比べていない。比べた文字の組は全部で {compares}。',
      zh: '{spots} 个位置中有 {borrowed} 个从未比较过字符。比较过的字符对共 {compares}。',
      ar: 'من بين {spots} موضعًا، {borrowed} لم تقارن حرفًا قط. أزواج الحروف المقارنة: {compares}.',
      es: 'De {spots} posiciones, {borrowed} nunca compararon un carácter. Pares de caracteres comparados: {compares}.',
      fr: 'Sur {spots} positions, {borrowed} n\'ont jamais comparé un caractère. Paires de caractères comparées : {compares}.',
      hi: '{spots} स्थानों में से {borrowed} ने कभी कोई अक्षर नहीं मिलाया। मिलाए गए अक्षर-युग्म: {compares}.',
      id: 'Dari {spots} posisi, {borrowed} tidak pernah membandingkan huruf. Pasangan huruf yang dibandingkan: {compares}.',
      pt: 'De {spots} posições, {borrowed} nunca compararam um caractere. Pares de caracteres comparados: {compares}.',
    },
    'label.mirror': {
      en: 'mirror',
      ko: '거울',
      ja: '鏡',
      zh: '镜像',
      ar: 'مرآة',
      es: 'espejo',
      fr: 'miroir',
      hi: 'दर्पण',
      id: 'cermin',
      pt: 'espelho',
    },
  },
};
