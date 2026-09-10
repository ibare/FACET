/**
 * @piece
 *
 * 질문: 트라이에서 말을 찾을 때, 글자를 따라 내려가는 길이 어떻게 세 가지
 * 다른 결말(있다 / 길은 있지만 말이 아니다 / 가지가 없어 못 내려간다)로
 * 갈리는가.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const walkPerCharacterFacet: FacetJson = {
  id: 'facet:walkPerCharacter',
  title: {
    en: 'Walking a trie, one character at a time',
    ko: '글자 단위로 트라이를 내려간다',
    ja: 'トライを一文字ずつたどる',
    zh: '沿着字典树，一次一个字符',
    ar: 'السير في شجرة البادئات حرفًا حرفًا',
    es: 'Recorrer un trie, carácter a carácter',
    fr: 'Parcourir un trie, un caractère à la fois',
    hi: 'ट्राई में एक-एक अक्षर करके उतरना',
    id: 'Menyusuri trie, satu huruf demi satu huruf',
    pt: 'Percorrer uma trie, um caractere por vez',
  },
  description: {
    en: 'The word is never compared whole — each character picks one branch, and a missing branch ends it.',
    ko: '말을 통째로 견주지 않는다. 글자 하나가 가지 하나를 고르고, 가지가 없으면 거기서 끝난다.',
    ja: '語をまるごと比べることはない。一文字が枝を一つ選び、枝がなければそこで終わる。',
    zh: '从不整词比较 — 每个字符选定一条分支，分支不在就到此为止。',
    ar: 'لا تُقارَن الكلمة كاملة — كل حرف يختار فرعًا، وغياب الفرع ينهي البحث.',
    es: 'La palabra nunca se compara entera: cada carácter elige una rama y, si falta, ahí termina.',
    fr: "Le mot n'est jamais comparé en entier : chaque caractère choisit une branche, et son absence arrête tout.",
    hi: 'शब्द की पूरी तुलना कभी नहीं होती — हर अक्षर एक शाखा चुनता है, और शाखा न हो तो वहीं अंत।',
    id: 'Kata tidak pernah dibandingkan utuh — tiap huruf memilih satu cabang, dan cabang yang hilang mengakhirinya.',
    pt: 'A palavra nunca é comparada inteira: cada caractere escolhe um ramo e, se faltar, ali termina.',
  },
  algorithm: 'module:walkPerCharacter',
  projector: 'module:walkPerCharacterProjector',
  initialData: {
    type: 'walk-per-character',
    words: ['to', 'tea', 'ten', 'in', 'inn'],
    queries: ['ten', 'te', 'tin'],
    stepMs: 580,
  },
  blocks: {
    stage: { type: 'walk-per-character-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.searchBegin': {
      en: 'looking for "{query}" ({i}/{n})',
      ko: '"{query}" 찾기 ({i}/{n})',
      ja: '"{query}" を探す ({i}/{n})',
      zh: '查找 "{query}" ({i}/{n})',
      ar: 'البحث عن "{query}" ({i}/{n})',
      es: 'buscando "{query}" ({i}/{n})',
      fr: 'recherche de "{query}" ({i}/{n})',
      hi: '"{query}" खोज रहे हैं ({i}/{n})',
      id: 'mencari "{query}" ({i}/{n})',
      pt: 'procurando "{query}" ({i}/{n})',
    },
    'caption.stepDown': {
      en: "follow '{char}' down one level",
      ko: "'{char}' 를 따라 한 칸 내려간다",
      ja: "'{char}' をたどって一段下りる",
      zh: "沿 '{char}' 向下走一层",
      ar: "اتبع '{char}' نزولًا مستوى واحدًا",
      es: "sigue '{char}' un nivel hacia abajo",
      fr: "suivre '{char}' d'un niveau vers le bas",
      hi: "'{char}' के पीछे एक स्तर नीचे",
      id: "ikuti '{char}' turun satu tingkat",
      pt: "siga '{char}' um nível abaixo",
    },
    'caption.found': {
      en: '"{query}" is a stored word — found',
      ko: '"{query}" — 담겨 있다',
      ja: '"{query}" は登録された語だ — 見つかった',
      zh: '"{query}" 是已存的词 — 找到了',
      ar: '"{query}" كلمة مخزَّنة — وُجدت',
      es: '"{query}" es una palabra guardada: encontrada',
      fr: '"{query}" est un mot enregistré — trouvé',
      hi: '"{query}" संग्रहित शब्द है — मिल गया',
      id: '"{query}" adalah kata tersimpan — ketemu',
      pt: '"{query}" é uma palavra guardada — encontrada',
    },
    'caption.noWord': {
      en: 'the path exists, but "{query}" isn’t a stored word',
      ko: '길은 있지만 "{query}" 는 담긴 말이 아니다',
      ja: '道はあるが "{query}" は登録された語ではない',
      zh: '路径存在，但 "{query}" 不是已存的词',
      ar: 'المسار موجود، لكن "{query}" ليست كلمة مخزَّنة',
      es: 'el camino existe, pero "{query}" no es una palabra guardada',
      fr: 'le chemin existe, mais "{query}" n’est pas un mot enregistré',
      hi: 'रास्ता तो है, पर "{query}" संग्रहित शब्द नहीं है',
      id: 'jalannya ada, tetapi "{query}" bukan kata tersimpan',
      pt: 'o caminho existe, mas "{query}" não é uma palavra guardada',
    },
    'caption.blocked': {
      en: "no branch for '{char}' — \"{query}\" stops here",
      ko: "'{char}' 가지가 없다 — \"{query}\" 는 여기서 멈춘다",
      ja: "'{char}' の枝がない — \"{query}\" はここで止まる",
      zh: "没有 '{char}' 这条分支 — \"{query}\" 到此为止",
      ar: "لا فرع لـ '{char}' — \"{query}\" تقف هنا",
      es: "no hay rama para '{char}' — \"{query}\" se detiene aquí",
      fr: "pas de branche pour '{char}' — \"{query}\" s'arrête ici",
      hi: "'{char}' के लिए कोई शाखा नहीं — \"{query}\" यहीं रुक जाता है",
      id: "tidak ada cabang untuk '{char}' — \"{query}\" berhenti di sini",
      pt: "não há ramo para '{char}' — \"{query}\" para aqui",
    },
  },
};
