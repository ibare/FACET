/**
 * divideConquerCombine facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "쪼개는 것과 합치는 것이 어떻게 한 절차인가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음 / 제목 없음 / 한 주장 / 메트릭 없음 / layout 없음 /
 * 캔버스 폭은 러너가 PIECE_CANVAS_W 로 정한다.
 *
 * 걸음 순서가 논증이다. 문제 하나를 세우고(1걸음), 답 없이 갈라져 내려가고
 * (3걸음), 바닥에서 방향이 바뀌고(1걸음), 되짚어 오르며 답이 생기고(3걸음),
 * 맨 처음 자른 자리가 맨 마지막에 합쳐진 것을 남긴다(1걸음). 합침부터 보이면
 * 무엇이 되짚어 오르는 것인지 알 수 없다.
 *
 * 화면에 뜨는 쪼갬/합침 횟수는 algorithm 의 `computeDivideConquerCombinePlan` 이
 * 실제로 센 값이다 — 선언에 박아 둔 수가 아니다 (S-piece).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const divideConquerCombineFacet: FacetJson = {
  id: 'facet:divideConquerCombine',
  title: {
    en: 'Divide and Conquer',
    ko: '분할 정복',
    ja: '分割統治',
    zh: '分治',
    ar: 'فرّق تسُد',
    es: 'Divide y vencerás',
    fr: 'Diviser pour régner',
    hi: 'विभाजन और विजय',
    id: 'Bagi dan taklukkan',
    pt: 'Dividir para conquistar',
  },
  description: {
    en: 'Splitting goes down and answers come back up — the same places, in reverse order',
    ko: '쪼개어 내려가고 답이 되어 올라온다 — 같은 자리를 거꾸로 되짚는다',
    ja: '割りながら下り、答えになって上がる — 同じ場所を逆にたどる',
    zh: '一路向下切分，再一路向上带回答案 — 同样的地方，顺序相反',
    ar: 'التقسيم ينزل والإجابات تصعد — المواضع نفسها بترتيب معكوس',
    es: 'La división baja y las respuestas suben: los mismos sitios, en orden inverso',
    fr: "La découpe descend et les réponses remontent — les mêmes endroits, dans l'ordre inverse",
    hi: 'बँटवारा नीचे जाता है और उत्तर ऊपर लौटते हैं — वही जगहें, उलटे क्रम में',
    id: 'Pemecahan turun dan jawaban naik kembali — tempat yang sama, urutan terbalik',
    pt: 'A divisão desce e as respostas sobem — os mesmos lugares, na ordem inversa',
  },
  algorithm: 'module:divideConquerCombine',
  projector: 'module:divideConquerCombineProjector',
  initialData: {
    type: 'divide-conquer-combine',
    values: [3, 1, 4, 2],
    stepMs: 750,
  },
  // 자를 자리와 되짚는 순서가 이 조각의 주장이라 매번 같은 값으로 보인다.
  shuffleOnReset: false,
  messages: {
    'caption.problem': {
      en: 'One problem: put these values in order.',
      ko: '문제 하나 — 이 값들을 줄 세운다.',
      ja: '問題はひとつ — これらの値を並べる。',
      zh: '一个问题：把这些值排好序。',
      ar: 'مسألة واحدة: رتّب هذه القيم.',
      es: 'Un problema: ordenar estos valores.',
      fr: 'Un problème : mettre ces valeurs en ordre.',
      hi: 'एक समस्या: इन मानों को क्रम में लगाना।',
      id: 'Satu masalah: urutkan nilai-nilai ini.',
      pt: 'Um problema: pôr estes valores em ordem.',
    },
    'caption.splitRoot': {
      en: 'Cut it in half. No answer yet — just a smaller problem.',
      ko: '반으로 자른다. 아직 답은 없고 더 작은 문제만 생긴다.',
      ja: '半分に切る。まだ答えはなく、小さな問題が増えただけだ。',
      zh: '从中间切开。还没有答案 — 只是更小的问题。',
      ar: 'اقطعها نصفين. لا جواب بعد — مجرد مسألة أصغر.',
      es: 'Pártelo por la mitad. Aún no hay respuesta: solo un problema más pequeño.',
      fr: 'Coupe en deux. Pas encore de réponse — juste un problème plus petit.',
      hi: 'इसे आधा काटें। अभी उत्तर नहीं — बस एक छोटी समस्या।',
      id: 'Potong jadi dua. Belum ada jawaban — hanya masalah yang lebih kecil.',
      pt: 'Corta ao meio. Ainda sem resposta — só um problema menor.',
    },
    'caption.split': {
      en: 'Cut again. Still going down.',
      ko: '또 자른다. 아직 내려가는 중이다.',
      ja: 'また切る。まだ下りている。',
      zh: '再切一次。还在往下走。',
      ar: 'اقطع مرة أخرى. ما زلنا ننزل.',
      es: 'Corta otra vez. Seguimos bajando.',
      fr: 'On coupe encore. On descend toujours.',
      hi: 'फिर काटें। अभी नीचे ही जा रहे हैं।',
      id: 'Potong lagi. Masih terus turun.',
      pt: 'Corta de novo. Ainda a descer.',
    },
    'caption.bottom': {
      en: 'A single value is already an answer. The bottom turns the trip around.',
      ko: '값 하나는 그 자체로 답이다. 바닥에서 방향이 바뀐다.',
      ja: '値ひとつはそれ自体が答えだ。底で向きが変わる。',
      zh: '单个值本身就是答案。到了底部，方向调转。',
      ar: 'القيمة الواحدة جواب بذاتها. عند القاع ينعكس الاتجاه.',
      es: 'Un solo valor ya es una respuesta. El fondo da la vuelta al viaje.',
      fr: 'Une seule valeur est déjà une réponse. Le fond inverse le trajet.',
      hi: 'अकेला मान अपने आप में उत्तर है। तल पर यात्रा मुड़ जाती है।',
      id: 'Satu nilai sudah merupakan jawaban. Di dasar, arahnya berbalik.',
      pt: 'Um único valor já é uma resposta. O fundo inverte a viagem.',
    },
    'caption.merge': {
      en: 'The layer that was cut later is combined first.',
      ko: '늦게 잘린 층이 먼저 합쳐진다.',
      ja: '後から切られた層が先に合わさる。',
      zh: '后切开的那层先合起来。',
      ar: 'الطبقة التي قُطعت لاحقًا تُدمج أولًا.',
      es: 'La capa que se cortó después se combina primero.',
      fr: 'La couche coupée en dernier est recombinée en premier.',
      hi: 'जो परत बाद में कटी थी, वह पहले जुड़ती है।',
      id: 'Lapisan yang dipotong belakangan digabung lebih dulu.',
      pt: 'A camada que foi cortada depois é combinada primeiro.',
    },
    'caption.mergeRoot': {
      en: 'The place cut first is combined last — only now is there one whole answer.',
      ko: '맨 처음 자른 자리가 맨 마지막에 합쳐진다. 이제야 온전한 답이 하나 있다.',
      ja: '最初に切った場所が最後に合わさる — ここでようやく答えがひとつになる。',
      zh: '最先切开的地方最后合并 — 到这时才有了一个完整的答案。',
      ar: 'الموضع الذي قُطع أولًا يُدمج أخيرًا — الآن فقط صار هناك جواب واحد كامل.',
      es: 'El sitio que se cortó primero se combina el último: solo ahora hay una respuesta entera.',
      fr: "L'endroit coupé en premier est recombiné en dernier — c'est seulement maintenant qu'il y a une réponse entière.",
      hi: 'जो जगह सबसे पहले कटी थी, वह सबसे आख़िर में जुड़ती है — अब जाकर एक पूरा उत्तर है।',
      id: 'Tempat yang dipotong pertama digabung terakhir — baru sekarang ada satu jawaban utuh.',
      pt: 'O lugar cortado primeiro é combinado por último — só agora existe uma resposta inteira.',
    },
    'caption.done': {
      en: '{splits} cuts going down, {merges} combines coming up — the same places, in reverse.',
      ko: '내려가며 {splits}번 자르고 올라오며 {merges}번 합쳤다 — 같은 자리를 거꾸로 되짚은 것이다.',
      ja: '下りながら {splits} 回切り、上りながら {merges} 回合わせた — 同じ場所を逆にたどったのだ。',
      zh: '向下切了 {splits} 次，向上合了 {merges} 次 — 同样的地方，反着走了一遍。',
      ar: '{splits} قطعة أثناء النزول و{merges} دمجة أثناء الصعود — المواضع نفسها بترتيب معكوس.',
      es: '{splits} cortes al bajar, {merges} uniones al subir: los mismos sitios, al revés.',
      fr: "{splits} coupes en descendant, {merges} fusions en remontant — les mêmes endroits, à l'envers.",
      hi: 'नीचे जाते हुए {splits} कटाव, ऊपर आते हुए {merges} जोड़ — वही जगहें, उलटे क्रम में।',
      id: '{splits} potongan saat turun, {merges} penggabungan saat naik — tempat yang sama, terbalik.',
      pt: '{splits} cortes ao descer, {merges} junções ao subir — os mesmos lugares, ao contrário.',
    },
  },
  blocks: {
    stage: { type: 'divide-conquer-combine-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
