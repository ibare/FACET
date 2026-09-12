/**
 * @piece 자주 붙어 다닌 둘 — 가장 많이 붙은 짝을 하나로 합친다.
 *
 * 답하는 질문 하나: **어휘 조각은 어디서 오는가.** 미리 정한 사전이 아니라, 말뭉치
 * 에서 가장 자주 붙어 다닌 짝을 하나로 합치는 일을 되풀이해 얻는다.
 *
 * 말뭉치는 낱말 넷과 빈도 넷뿐이고 짝의 빈도표는 algorithm 이 거기서 셈한다.
 * 이 넷은 다섯 걸음 내내 1등이 유일하도록 고른 것이다 — 흔히 쓰이는 예시
 * (`low/lower/newest/widest`) 는 첫 걸음부터 셋이 동률이라, 화면이 "가장 많이 붙은
 * 짝을 고른다" 고 말해도 왜 그것을 골랐는지 그림이 지지 못한다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const mergeTheFrequentPairFacet: FacetJson = {
  id: 'facet:mergeTheFrequentPair',
  title: {
    en: 'Merge the frequent pair',
    ko: '자주 붙어 다닌 둘을 합친다',
    ja: 'よく隣り合う組を合わせる',
    zh: '合并最常相邻的一对',
    ar: 'دمج الزوج الأكثر تكرارًا',
    es: 'Fusionar el par frecuente',
    fr: 'Fusionner la paire fréquente',
    hi: 'बार-बार साथ आने वाली जोड़ी मिलाएँ',
    id: 'Gabungkan pasangan yang sering muncul',
    pt: 'Fundir o par frequente',
  },
  description: {
    en: 'The pair that sticks together most often becomes one piece, and the same seam closes everywhere in the corpus at once.',
    ko: '가장 자주 붙어 다닌 짝이 한 조각이 되고, 같은 이음매가 말뭉치 전체에서 한꺼번에 닫힌다.',
    ja: '最も頻繁に隣り合う組が一つの断片になり、同じ継ぎ目がコーパス全体で一度に閉じる。',
    zh: '最常相邻的一对合成一个片段，同一道接缝在整个语料里同时合上。',
    ar: 'الزوج الأكثر التصاقًا يصير قطعة واحدة، وتنغلق الوصلة نفسها في المدونة كلها دفعة واحدة.',
    es: 'El par que más se repite junto se vuelve una pieza, y la misma costura se cierra a la vez en todo el corpus.',
    fr: 'La paire la plus souvent collée devient une seule pièce, et la même couture se ferme partout à la fois.',
    hi: 'जो जोड़ी सबसे अधिक बार साथ आती है वह एक टुकड़ा बन जाती है, और वही जोड़ पूरे संग्रह में एक साथ बंद होता है।',
    id: 'Pasangan yang paling sering menempel menjadi satu potongan, dan sambungan yang sama menutup serentak di seluruh korpus.',
    pt: 'O par que mais aparece junto vira uma peça, e a mesma costura fecha de uma vez em todo o corpus.',
  },
  algorithm: 'module:mergeTheFrequentPair',
  projector: 'module:mergeTheFrequentPairProjector',
  initialData: {
    type: 'mergeTheFrequentPair',
    // 1차 데이터. 낱말과 빈도뿐이고 쪼개기·셈·합치기는 algorithm 의 몫이다.
    words: [
      { text: 'fast', freq: 5 },
      { text: 'faster', freq: 2 },
      { text: 'fastest', freq: 4 },
      { text: 'last', freq: 3 },
    ],
    // 어디서 멈출지는 저작 결정이다. 다섯이면 `fast</w>` 까지 자라고, 나눠 쓰는
    // 조각(`ast`)도 이미 나와 있다.
    merges: 5,
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'merge-the-frequent-pair-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.split': {
      en: 'Each word is cut into letters, closed by the end mark {mark}.',
      ko: '낱말마다 낱글자로 쪼갠다. 끝을 알리는 표식: {mark}',
      ja: '各単語を1文字ずつに切る。末尾を示す記号: {mark}',
      zh: '把每个词切成单字。标记词尾的记号：{mark}',
      ar: 'تُقطَّع كل كلمة إلى حروف. علامة نهاية الكلمة: {mark}',
      es: 'Cada palabra se corta en letras. La marca de fin: {mark}',
      fr: 'Chaque mot est découpé en lettres. La marque de fin : {mark}',
      hi: 'हर शब्द अक्षरों में कटता है। अंत का चिह्न: {mark}',
      id: 'Setiap kata dipotong menjadi huruf. Tanda akhir kata: {mark}',
      pt: 'Cada palavra é cortada em letras. A marca de fim: {mark}',
    },
    'caption.weigh': {
      en: 'Count every neighbouring pair across the whole corpus. Heaviest seam: {pair} at {count}.',
      ko: '말뭉치 전체에서 이웃한 짝을 센다. 가장 무거운 이음매는 {pair}, 셈은 {count}.',
      ja: 'コーパス全体で隣り合う組を数える。最も重い継ぎ目は {pair}、数は {count}。',
      zh: '在整个语料里数每一对相邻片段。最重的接缝是 {pair}，计数 {count}。',
      ar: 'نَعُدّ كل زوج متجاور في المدونة كلها. أثقل وصلة: {pair} بعدد {count}.',
      es: 'Cuenta cada par vecino en todo el corpus. La costura más pesada: {pair} con {count}.',
      fr: 'On compte chaque paire voisine dans tout le corpus. Couture la plus lourde : {pair} à {count}.',
      hi: 'पूरे संग्रह में हर पड़ोसी जोड़ी गिनें। सबसे भारी जोड़: {pair}, गिनती {count}।',
      id: 'Hitung setiap pasangan bertetangga di seluruh korpus. Sambungan terberat: {pair} dengan {count}.',
      pt: 'Conte cada par vizinho em todo o corpus. A costura mais pesada: {pair} com {count}.',
    },
    'caption.merge': {
      en: 'The seam closes: {pair} becomes {token}, in every word at once.',
      ko: '이음매가 닫힌다. {pair} → {token}, 모든 낱말에서 한꺼번에.',
      ja: '継ぎ目が閉じる。{pair} → {token}、すべての単語で一度に。',
      zh: '接缝合上：{pair} → {token}，所有词里同时发生。',
      ar: 'تنغلق الوصلة: {pair} يصير {token}، في كل الكلمات دفعة واحدة.',
      es: 'La costura se cierra: {pair} se vuelve {token}, en todas las palabras a la vez.',
      fr: 'La couture se ferme : {pair} devient {token}, dans tous les mots à la fois.',
      hi: 'जोड़ बंद होता है: {pair} बनता है {token}, हर शब्द में एक साथ।',
      id: 'Sambungan menutup: {pair} menjadi {token}, di semua kata sekaligus.',
      pt: 'A costura fecha: {pair} vira {token}, em todas as palavras de uma vez.',
    },
    'caption.done': {
      en: 'Five merges, and the vocabulary stops here. Distinct pieces: {n}.',
      ko: '다섯 번 합쳤고 어휘는 여기서 멈춘다. 조각 종류: {n}.',
      ja: '5回合わせて語彙はここで止まる。断片の種類: {n}。',
      zh: '合并五次，词表到此为止。片段种类：{n}。',
      ar: 'خمس عمليات دمج، وتقف المفردات هنا. أنواع القطع: {n}.',
      es: 'Cinco fusiones y el vocabulario se detiene aquí. Piezas distintas: {n}.',
      fr: "Cinq fusions, et le vocabulaire s'arrête là. Pièces distinctes : {n}.",
      hi: 'पाँच विलय, और शब्दावली यहीं रुकती है। अलग टुकड़े: {n}।',
      id: 'Lima penggabungan, dan kosakata berhenti di sini. Jenis potongan: {n}.',
      pt: 'Cinco fusões e o vocabulário para aqui. Peças distintas: {n}.',
    },
  },
};
