/**
 * unknownBecomesKnown — 모르는 낱말이 아는 조각으로 쪼개져 받아진다.
 *
 * 답하는 물음: **어휘에 없는 낱말이 오면 어떻게 되는가.**
 * 통째로는 어휘에 없는 낱말이 갈라지고, 갈라진 두 토막이 각각 어휘 안의 조각과
 * 맞물린다. 그래서 거절되지 않는다.
 *
 * `vocab` 은 말뭉치(낱말 22개와 빈도)를 BPE 로 30회 병합해 얻은 어휘 14종이다 —
 * 실제로 돌려 잰 값이다. `bold` 는 홀로만 나오고 파생형(`boldness` · `boldly` ·
 * `bolder`)은 말뭉치에 한 번도 없다. 그것이 이 조각의 장치다.
 *
 * `warm` 은 화면에 들이지 않는다. 어휘에 `warm</w>` 꼴로만 남아 뒤에 접미를 붙일
 * 수 없고 `warmness → w · arm · ness</w>` 가 되는데, 참이지만 다른 주장이라
 * 캡션이 둘이 된다. 데이터에는 남겨 두고 그 이야기는 description 이 한다.
 *
 * @piece
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const unknownBecomesKnownFacet: FacetJson = {
  id: 'facet:unknownBecomesKnown',
  title: {
    en: 'The unknown word gets taken in',
    ko: '모르는 낱말을 받아 낸다',
    ja: '知らない語を受け取る',
    zh: '接住陌生的词',
    ar: 'استقبال الكلمة المجهولة',
    es: 'La palabra desconocida se acepta',
    fr: 'Le mot inconnu est accueilli',
    hi: 'अनजान शब्द स्वीकार लिया जाता है',
    id: 'Kata asing tetap diterima',
    pt: 'A palavra desconhecida é acolhida',
  },
  description: {
    en: 'A word the vocabulary has never seen is cut into two halves it has seen, and comes through spelled out of them.',
    ko: '어휘가 한 번도 본 적 없는 낱말이 본 적 있는 두 토막으로 갈라져, 그 조각으로 적힌 채 지나간다.',
    ja: '語彙が一度も見たことのない語が、見たことのある二つの断片に割れ、その断片で綴られて通り抜ける。',
    zh: '词表从未见过的词被切成两个见过的碎片，然后以这些碎片拼写着通过。',
    ar: 'كلمة لم ترها المفردات قط تُقطَع إلى نصفين رأتهما من قبل، فتمر مكتوبةً بهما.',
    es: 'Una palabra que el vocabulario nunca vio se corta en dos mitades que sí vio, y pasa escrita con ellas.',
    fr: "Un mot que le vocabulaire n'a jamais vu est coupé en deux moitiés qu'il connaît, et passe écrit avec elles.",
    hi: 'जो शब्द शब्दकोश ने कभी नहीं देखा, वह दो देखे हुए हिस्सों में कटता है और उन्हीं से लिखा जाकर निकल जाता है।',
    id: 'Kata yang belum pernah dilihat kosakata dibelah jadi dua bagian yang pernah dilihat, lalu lewat dieja dengan keduanya.',
    pt: 'Uma palavra que o vocabulário nunca viu é cortada em duas metades que ele viu, e passa escrita com elas.',
  },
  algorithm: 'module:unknownBecomesKnown',
  projector: 'module:unknownBecomesKnownProjector',
  initialData: {
    type: 'unknown-becomes-known',
    // 병합 30회 끝에 낱말들이 잘려 있던 조각들. 선반에 세울 것을 정하는 **보여
    // 주기 위한 산물**이며, 자르는 데에는 쓰이지 않는다 (자르는 것은 아래 merges).
    // 어휘를 얻는 과정은 다른 조각의 몫이라 여기서는 이미 가진 것으로 놓는다.
    // 자리는 stage 가 셈한다.
    vocab: [
      '</w>',
      'bold',
      'cold',
      'cold</w>',
      'dark',
      'dark</w>',
      'er</w>',
      'kind',
      'kind</w>',
      'ly</w>',
      'ness</w>',
      'soft',
      'warm</w>',
      'weak',
    ],
    // 배운 차례 그대로의 병합 규칙 30개. **자르는 것은 이것이다** — 낱말의
    // 글자를 떼어 놓고 이 열을 차례대로 한 번씩 훑으며 맞는 짝을 합친다.
    // 짝 빈도가 같을 때는 "<왼쪽> <오른쪽>" 의 사전순 최소를 골라 얻었다.
    // 마지막 규칙이 ['b','old'] 라는 점이 이 조각의 장치다 — `bold` 는 서른
    // 번째에야 한 조각으로 서고, 그래서 `boldness` 가 두 조각으로 잘린다.
    merges: [
      ['a', 'r'], ['l', 'd'], ['o', 'ld'], ['e', 'r'], ['er', '</w>'],
      ['i', 'n'], ['in', 'd'], ['k', 'ind'], ['e', 's'], ['es', 's'],
      ['ess', '</w>'], ['n', 'ess</w>'], ['ar', 'k'], ['c', 'old'], ['d', 'ark'],
      ['l', 'y'], ['ly', '</w>'], ['f', 't'], ['o', 'ft'], ['s', 'oft'],
      ['a', 'k'], ['e', 'ak'], ['w', 'eak'], ['cold', '</w>'], ['kind', '</w>'],
      ['ar', 'm'], ['arm', '</w>'], ['dark', '</w>'], ['w', 'arm</w>'], ['b', 'old'],
    ],
    // 말뭉치에 있던 낱말. 자르는 일이 예사로운 일임을 먼저 보인다.
    corpusWord: 'kindness',
    // 말뭉치에 한 번도 없던 낱말들. 셋 다 어휘 안의 조각 둘로 받아진다.
    unknownWords: ['boldness', 'boldly', 'bolder'],
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'unknown-becomes-known-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.vocab': {
      en: 'These pieces are all it knows. Pieces: {n}.',
      ko: '아는 조각은 이것뿐이다. 조각 수: {n}.',
      ja: '知っている断片はこれだけ。断片の数: {n}。',
      zh: '它认识的碎片只有这些。碎片数: {n}。',
      ar: 'هذه القطع هي كل ما يعرفه. عدد القطع: {n}.',
      es: 'Estas piezas son todo lo que conoce. Piezas: {n}.',
      fr: 'Ces morceaux sont tout ce qu\'il connaît. Morceaux : {n}.',
      hi: 'यही टुकड़े उसकी पूरी जानकारी हैं। टुकड़े: {n}।',
      id: 'Kepingan ini saja yang dikenalnya. Jumlah kepingan: {n}.',
      pt: 'Estas peças são tudo o que ele conhece. Peças: {n}.',
    },
    'caption.seenSplit': {
      en: '"{word}" was in the corpus. Reading it just means cutting it into pieces: {pieces}.',
      ko: '말뭉치에 있던 낱말: "{word}". 읽는다는 것은 조각으로 자르는 일이다 — {pieces}.',
      ja: '"{word}" はコーパスにあった語。読むとは断片に切ることにすぎない: {pieces}。',
      zh: '"{word}" 出现在语料里。读它不过是切成碎片: {pieces}。',
      ar: '"{word}" كانت في المدونة. قراءتها تعني ببساطة تقطيعها إلى قطع: {pieces}.',
      es: '"{word}" estaba en el corpus. Leerla es solo cortarla en piezas: {pieces}.',
      fr: '"{word}" était dans le corpus. La lire, c\'est simplement la couper en morceaux : {pieces}.',
      hi: '"{word}" संग्रह में था। उसे पढ़ना यानी टुकड़ों में काटना: {pieces}।',
      id: '"{word}" ada di korpus. Membacanya berarti memotongnya jadi kepingan: {pieces}.',
      pt: '"{word}" estava no corpus. Lê-la é apenas cortá-la em peças: {pieces}.',
    },
    'caption.seenTaken': {
      en: 'Both pieces are in the vocabulary, so "{word}" comes back whole. Nothing unusual yet.',
      ko: '두 조각 다 어휘 안에 있어 통째로 돌아온다 — "{word}". 여기까지는 예사로운 일이다.',
      ja: '二つの断片はどちらも語彙にあるので "{word}" はそのまま戻る。ここまでは普通のこと。',
      zh: '两个碎片都在词表里，所以 "{word}" 完整地回来了。到这里都很平常。',
      ar: 'كلتا القطعتين في المفردات، لذا تعود "{word}" كاملة. لا شيء غريب حتى الآن.',
      es: 'Ambas piezas están en el vocabulario, así que "{word}" vuelve entera. Nada raro todavía.',
      fr: 'Les deux morceaux sont dans le vocabulaire, donc "{word}" revient entier. Rien d\'inhabituel pour l\'instant.',
      hi: 'दोनों टुकड़े शब्दकोश में हैं, इसलिए "{word}" पूरा लौट आता है। अब तक कुछ असामान्य नहीं।',
      id: 'Kedua kepingan ada di kosakata, jadi "{word}" kembali utuh. Belum ada yang aneh.',
      pt: 'As duas peças estão no vocabulário, então "{word}" volta inteira. Nada de estranho ainda.',
    },
    'caption.missed': {
      en: '"{word}" never appeared in the corpus. Swept whole across the vocabulary, it matches nothing.',
      ko: '말뭉치에 한 번도 없던 낱말: "{word}". 통째로 어휘를 훑어도 맞는 것이 없다.',
      ja: '"{word}" はコーパスに一度も現れなかった。丸ごと語彙をなぞっても合うものがない。',
      zh: '"{word}" 从未在语料中出现。整个词在词表上扫过一遍，没有一个对得上。',
      ar: '"{word}" لم تظهر قط في المدونة. بمسحها كاملة عبر المفردات، لا تطابق شيئًا.',
      es: '"{word}" nunca apareció en el corpus. Recorrida entera por el vocabulario, no coincide con nada.',
      fr: '"{word}" n\'est jamais apparu dans le corpus. Passé entier sur le vocabulaire, il ne correspond à rien.',
      hi: '"{word}" संग्रह में कभी नहीं आया। पूरे शब्द को शब्दकोश पर फेरने पर कुछ भी मेल नहीं खाता।',
      id: '"{word}" tidak pernah muncul di korpus. Disapu utuh ke seluruh kosakata, tak ada yang cocok.',
      pt: '"{word}" nunca apareceu no corpus. Varrida inteira pelo vocabulário, não casa com nada.',
    },
    'caption.split': {
      en: 'So "{word}" is cut apart: {pieces}.',
      ko: '그래서 가른다. "{word}" → {pieces}.',
      ja: 'そこで "{word}" を割る: {pieces}。',
      zh: '于是把 "{word}" 切开: {pieces}。',
      ar: 'لذا تُقطَّع "{word}": {pieces}.',
      es: 'Así que "{word}" se parte: {pieces}.',
      fr: 'Alors "{word}" est coupé : {pieces}.',
      hi: 'इसलिए "{word}" को चीर दिया जाता है: {pieces}।',
      id: 'Maka "{word}" dibelah: {pieces}.',
      pt: 'Então "{word}" é partida: {pieces}.',
    },
    'caption.lock': {
      en: 'Each half meets a piece that is already in the vocabulary: {pieces}.',
      ko: '갈라진 토막이 저마다 어휘 안의 조각과 맞물린다: {pieces}.',
      ja: '割れた断片は、それぞれ語彙の中の断片とかみ合う: {pieces}。',
      zh: '每一半都与词表里已有的碎片咬合: {pieces}。',
      ar: 'كل نصف يلتقي بقطعة موجودة أصلًا في المفردات: {pieces}.',
      es: 'Cada mitad encaja con una pieza que ya está en el vocabulario: {pieces}.',
      fr: 'Chaque moitié s\'emboîte avec un morceau déjà présent dans le vocabulaire : {pieces}.',
      hi: 'हर आधा हिस्सा शब्दकोश में पहले से मौजूद टुकड़े से जुड़ जाता है: {pieces}।',
      id: 'Tiap belahan bertaut dengan kepingan yang sudah ada di kosakata: {pieces}.',
      pt: 'Cada metade se encaixa numa peça que já está no vocabulário: {pieces}.',
    },
    'caption.received': {
      en: '"{word}" is taken in, spelled out of known pieces: {pieces}.',
      ko: '아는 조각으로 적어 받아 낸다. "{word}" → {pieces}.',
      ja: '"{word}" は知っている断片で綴られて受け取られる: {pieces}。',
      zh: '"{word}" 被已知的碎片拼写出来，于是被接住: {pieces}。',
      ar: 'تُستقبَل "{word}" مكتوبةً من قطع معروفة: {pieces}.',
      es: '"{word}" se acepta, escrita con piezas conocidas: {pieces}.',
      fr: '"{word}" est accueilli, écrit avec des morceaux connus : {pieces}.',
      hi: '"{word}" को जाने-पहचाने टुकड़ों से लिखकर स्वीकार लिया जाता है: {pieces}।',
      id: '"{word}" diterima, dieja dari kepingan yang dikenal: {pieces}.',
      pt: '"{word}" é aceita, escrita com peças conhecidas: {pieces}.',
    },
    'caption.done': {
      en: 'An unknown word is never turned away. Words taken in: {n}.',
      ko: '모르는 낱말도 거절되지 않는다. 받아 낸 낱말: {n}.',
      ja: '知らない語も追い返されない。受け取った語: {n}。',
      zh: '陌生的词也不会被拒之门外。接住的词: {n}。',
      ar: 'لا تُرفض الكلمة المجهولة أبدًا. الكلمات المستقبَلة: {n}.',
      es: 'Una palabra desconocida nunca se rechaza. Palabras aceptadas: {n}.',
      fr: 'Un mot inconnu n\'est jamais rejeté. Mots accueillis : {n}.',
      hi: 'अनजान शब्द कभी लौटाया नहीं जाता। स्वीकारे गए शब्द: {n}।',
      id: 'Kata asing tak pernah ditolak. Kata yang diterima: {n}.',
      pt: 'Uma palavra desconhecida nunca é recusada. Palavras aceitas: {n}.',
    },
  },
};
