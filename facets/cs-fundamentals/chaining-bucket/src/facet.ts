/**
 * chaining-bucket facet 선언.
 *
 * @piece 조각(piece) — 질문 하나에 답하고 멈춘다.
 *   "같은 자리에 둘 이상이 오면 어떻게 되는가."
 *
 * 해시값은 Java `String.hashCode` 실측이고 자리는 `(h & 0x7FFFFFFF) % 8` 이다.
 * 지어낸 값은 하나도 없다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const chainingBucketFacet: FacetJson = {
  id: 'facet:chainingBucket',
  title: {
    en: 'Chaining — same slot, hang it there',
    ko: '체이닝 — 같은 자리면 매달아 둔다',
    ja: 'チェイン法 — 同じ枠なら、そこにぶら下げる',
    zh: '链地址法 — 落到同一格，就挂在那里',
    ar: 'التسلسل — الخانة نفسها، عَلِّقه فيها',
    es: 'Encadenamiento: misma casilla, cuélgalo ahí',
    fr: 'Chaînage — même case, on accroche dessus',
    hi: 'चेनिंग — वही खाना हो तो वहीं टाँग दो',
    id: 'Chaining — slot yang sama, gantungkan di situ',
    pt: 'Encadeamento — mesma casa, pendura ali',
  },
  description: {
    en: 'When a second key hashes to a slot that is already taken, nothing is pushed out. It hooks onto the chain hanging from that slot, and a lookup walks only that chain.',
    ko: '이미 찬 자리에 다음 키가 와도 아무것도 밀려나지 않는다. 그 자리에 매달린 사슬 끝에 걸리고, 찾을 때는 그 사슬만 훑는다.',
    ja: '二つ目のキーが埋まった枠に来ても、何も押し出されない。その枠からぶら下がる鎖の端に掛かり、探すときはその鎖だけをたどる。',
    zh: '第二个键落到已被占用的格子时，什么也不会被挤出去。它挂到那一格垂下的链尾，查找时只沿着那条链走。',
    ar: 'حين يصل مفتاح ثانٍ إلى خانة مشغولة، لا يُطرد شيء. يتعلّق بطرف السلسلة المتدلية من تلك الخانة، والبحث يمشي على تلك السلسلة وحدها.',
    es: 'Cuando una segunda clave cae en una casilla ya ocupada, nada sale expulsado. Se engancha al final de la cadena que cuelga de esa casilla, y la búsqueda solo recorre esa cadena.',
    fr: "Quand une deuxième clé tombe sur une case déjà prise, rien n'est chassé. Elle s'accroche au bout de la chaîne qui pend de cette case, et la recherche ne parcourt que cette chaîne.",
    hi: 'जब दूसरी कुंजी पहले से भरे खाने पर आती है, तो कुछ भी बाहर नहीं धकेला जाता। वह उस खाने से लटकी शृंखला के छोर पर जुड़ जाती है, और खोज सिर्फ़ उसी शृंखला पर चलती है।',
    id: 'Ketika kunci kedua jatuh ke slot yang sudah terisi, tidak ada yang terdorong keluar. Ia mengait di ujung rantai yang menggantung dari slot itu, dan pencarian hanya menyusuri rantai tersebut.',
    pt: 'Quando uma segunda chave cai numa casa já ocupada, nada é expulso. Ela se engata na ponta da corrente pendurada nessa casa, e a busca percorre apenas essa corrente.',
  },
  algorithm: 'module:chainingBucket',
  projector: 'module:chainingBucketProjector',
  initialData: {
    type: 'chaining-bucket',
    bucketCount: 8,
    // Java String.hashCode 실측값. 자리는 (hash & 0x7FFFFFFF) % 8.
    entries: [
      { key: 'apple', hash: 93029210, bucket: 2 },
      { key: 'elder', hash: 96592394, bucket: 2 },
      { key: 'mango', hash: 103662530, bucket: 2 },
      { key: 'fig', hash: 101380, bucket: 4 },
      { key: 'kiwi', hash: 3292336, bucket: 0 },
    ],
    lookupKey: 'mango',
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'chaining-bucket-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.hangFirst': {
      en: '{key} hashes to slot {bucket}. Nothing hangs there yet, so it hangs alone.',
      ko: '{key} 는 자리 {bucket}. 아직 아무것도 없어서 혼자 매달린다.',
      ja: '{key} は枠 {bucket}。まだ何も掛かっていないので、ひとりでぶら下がる。',
      zh: '{key} 落在格 {bucket}。那里还空着，所以它独自挂上。',
      ar: '{key} يقع في الخانة {bucket}. لا شيء معلّق هناك بعد، فيُعلَّق وحده.',
      es: '{key} va a la casilla {bucket}. Aún no cuelga nada, así que cuelga solo.',
      fr: "{key} tombe dans la case {bucket}. Rien n'y pend encore, il pend donc seul.",
      hi: '{key} खाने {bucket} पर जाता है। वहाँ अभी कुछ नहीं लटका, तो वह अकेला लटकता है।',
      id: '{key} jatuh ke slot {bucket}. Belum ada yang menggantung di sana, jadi ia menggantung sendiri.',
      pt: '{key} vai para a casa {bucket}. Nada pende ali ainda, então ele pende sozinho.',
    },
    'caption.hangCollide': {
      en: '{key} lands on slot {bucket} too. Nothing is pushed out — it hooks onto the end of that chain.',
      ko: '{key} 도 자리 {bucket}. 아무것도 밀려나지 않고, 그 사슬 끝에 걸린다.',
      ja: '{key} も枠 {bucket}。何も押し出されず、その鎖の端に掛かる。',
      zh: '{key} 也落在格 {bucket}。什么也没被挤出去 — 它挂到那条链的尾端。',
      ar: '{key} يقع أيضًا في الخانة {bucket}. لا شيء يُطرد — بل يتعلّق بطرف تلك السلسلة.',
      es: '{key} cae también en la casilla {bucket}. Nada sale expulsado: se engancha al final de esa cadena.',
      fr: "{key} tombe aussi dans la case {bucket}. Rien n'est chassé — il s'accroche au bout de cette chaîne.",
      hi: '{key} भी खाने {bucket} पर आता है। कुछ बाहर नहीं धकेला जाता — वह उसी शृंखला के छोर पर जुड़ जाता है।',
      id: '{key} juga mendarat di slot {bucket}. Tidak ada yang terdorong keluar — ia mengait di ujung rantai itu.',
      pt: '{key} também cai na casa {bucket}. Nada é expulso — ele se engata na ponta dessa corrente.',
    },
    'caption.probeJump': {
      en: 'Looking for {key}: go straight to slot {bucket}. No other slot is touched.',
      ko: '{key} 를 찾는다. 자리 {bucket} 로 한 번에 간다. 다른 자리는 건드리지 않는다.',
      ja: '{key} を探す。枠 {bucket} へ一度で行く。ほかの枠には触れない。',
      zh: '找 {key}：直接去格 {bucket}。别的格子一概不碰。',
      ar: 'بحثًا عن {key}: اذهب مباشرة إلى الخانة {bucket}. لا تُمسّ أي خانة أخرى.',
      es: 'Buscamos {key}: vamos directos a la casilla {bucket}. Ninguna otra se toca.',
      fr: "On cherche {key} : on va droit à la case {bucket}. Aucune autre case n'est touchée.",
      hi: '{key} खोजना है: सीधे खाने {bucket} पर जाएँ। कोई और खाना छुआ नहीं जाता।',
      id: 'Mencari {key}: langsung ke slot {bucket}. Slot lain tidak disentuh.',
      pt: 'Procurando {key}: vá direto à casa {bucket}. Nenhuma outra casa é tocada.',
    },
    'caption.probeMiss': {
      en: '{key} is not it. Step one link down the chain.',
      ko: '{key} 가 아니다. 사슬을 한 칸 내려간다.',
      ja: '{key} ではない。鎖をひと駒だけ下る。',
      zh: '不是 {key}。沿着链往下走一环。',
      ar: 'ليس {key}. انزل حلقة واحدة على السلسلة.',
      es: 'No es {key}. Bajamos un eslabón por la cadena.',
      fr: "Ce n'est pas {key}. On descend d'un maillon dans la chaîne.",
      hi: 'यह {key} नहीं है। शृंखला में एक कड़ी नीचे जाएँ।',
      id: 'Bukan {key}. Turun satu mata rantai.',
      pt: 'Não é {key}. Desce um elo da corrente.',
    },
    'caption.probeHit': {
      en: '{key} matches.',
      ko: '{key} 다. 찾았다.',
      ja: '{key} だ。見つかった。',
      zh: '就是 {key}。找到了。',
      ar: '{key} مطابق.',
      es: '{key} coincide.',
      fr: '{key} correspond.',
      hi: '{key} मिल गया।',
      id: '{key} cocok.',
      pt: '{key} corresponde.',
    },
    'caption.done': {
      en: 'Found in slot {bucket} after {comparisons} comparisons — only that one chain was walked.',
      ko: '자리 {bucket} 에서 {comparisons} 번 견주고 찾았다. 훑은 것은 그 사슬 하나뿐이다.',
      ja: '枠 {bucket} で {comparisons} 回見比べて見つけた。たどったのはその鎖ひとつだけ。',
      zh: '在格 {bucket} 里比较 {comparisons} 次后找到 — 只走了那一条链。',
      ar: 'وُجد في الخانة {bucket} بعد {comparisons} مقارنات — ولم تُمشَ سوى تلك السلسلة الواحدة.',
      es: 'Encontrado en la casilla {bucket} tras {comparisons} comparaciones: solo se recorrió esa cadena.',
      fr: 'Trouvé dans la case {bucket} après {comparisons} comparaisons — une seule chaîne a été parcourue.',
      hi: 'खाने {bucket} में {comparisons} तुलनाओं के बाद मिला — सिर्फ़ वही एक शृंखला चली गई।',
      id: 'Ditemukan di slot {bucket} setelah {comparisons} perbandingan — hanya rantai itu yang disusuri.',
      pt: 'Encontrado na casa {bucket} após {comparisons} comparações — só aquela corrente foi percorrida.',
    },
  },
};
