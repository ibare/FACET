/**
 * @piece 창을 밀 때 해시를 처음부터 다시 셈하지 않는 법.
 *
 * 질문 하나에 답하고 멈춘다 — 창이 한 칸 갈 때 만지는 것은 빠지는 글자 하나와
 * 들어오는 글자 하나뿐이고, 그 두 번의 손질로 값이 다음 값이 된다.
 *
 * 좌표는 stage 가 셈한다. 선언에 두는 것은 구조(텍스트 · 조각 · 밑 · 법)와
 * 읽을 시간(`stepMs`) 뿐이다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const rollingHashFacet: FacetJson = {
  id: 'facet:rollingHash',
  title: {
    en: 'Rolling hash',
    ko: '굴러가는 해시',
    ja: '転がるハッシュ',
    zh: '滚动哈希',
    ar: 'التجزئة المتدحرجة',
    es: 'Hash rodante',
    fr: 'Empreinte roulante',
    hi: 'रोलिंग हैश',
    id: 'Hash bergulir',
    pt: 'Hash rolante',
  },
  description: {
    en: 'Slide the window one step: drop the front letter, add the back one, and the hash rolls to the next value.',
    ko: '창을 한 칸 밀 때 앞을 빼고 뒤를 더하면 해시가 다음 값으로 굴러간다.',
    ja: '窓を一つずらすとき、前を引いて後ろを足せば、ハッシュは次の値へ転がる。',
    zh: '窗口每移一格，减去前面的字母、加上后面的字母，哈希就滚到下一个值。',
    ar: 'عند إزاحة النافذة خطوة واحدة: اطرح الحرف الأول وأضف الأخير، فتتدحرج التجزئة إلى القيمة التالية.',
    es: 'Al desplazar la ventana un paso: quita la letra del frente y añade la del final; el hash rueda al siguiente valor.',
    fr: 'En décalant la fenêtre d’un cran : la lettre de tête sort, celle de queue entre, et l’empreinte roule vers la valeur suivante.',
    hi: 'खिड़की एक कदम खिसकाओ: आगे का अक्षर घटाओ, पीछे का जोड़ो — हैश अगले मान तक लुढ़क जाता है।',
    id: 'Geser jendela satu langkah: kurangi huruf depan, tambahkan huruf belakang, dan hash menggelinding ke nilai berikutnya.',
    pt: 'Desloque a janela um passo: tire a letra da frente, some a de trás, e o hash rola para o próximo valor.',
  },
  algorithm: 'module:rollingHash',
  projector: 'module:rollingHashProjector',
  initialData: {
    type: 'rolling-hash',
    text: 'abracadabra',
    pattern: 'cada',
    base: 31,
    mod: 1000,
    stepMs: 720,
  },
  blocks: {
    stage: { type: 'rolling-hash-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.pattern': {
      en: 'Hash of the pattern: {h}.',
      ko: '찾는 조각의 해시: {h}.',
      ja: '探す断片のハッシュ: {h}.',
      zh: '所找片段的哈希: {h}。',
      ar: 'تجزئة النمط: {h}.',
      es: 'Hash del patrón: {h}.',
      fr: 'Empreinte du motif : {h}.',
      hi: 'पैटर्न का हैश: {h}.',
      id: 'Hash dari pola: {h}.',
      pt: 'Hash do padrão: {h}.',
    },
    'caption.first': {
      en: 'The first window reads every letter. Hash: {h}.',
      ko: '첫 창은 글자를 하나씩 다 읽는다. 해시: {h}.',
      ja: '最初の窓は文字を一つずつすべて読む。ハッシュ: {h}.',
      zh: '第一个窗口要逐个读完所有字母。哈希: {h}。',
      ar: 'النافذة الأولى تقرأ كل حرف على حدة. التجزئة: {h}.',
      es: 'La primera ventana lee todas las letras, una a una. Hash: {h}.',
      fr: 'La première fenêtre lit chaque lettre, une par une. Empreinte : {h}.',
      hi: 'पहली खिड़की हर अक्षर एक-एक करके पढ़ती है। हैश: {h}.',
      id: 'Jendela pertama membaca setiap huruf satu per satu. Hash: {h}.',
      pt: 'A primeira janela lê cada letra, uma a uma. Hash: {h}.',
    },
    'caption.roll': {
      en: 'Two touches: one letter out, one in. Hash: {h}.',
      ko: '손질은 둘 — 하나는 빠지고 하나는 들어온다. 해시: {h}.',
      ja: '触れるのは二つだけ。一つ抜けて一つ入る。ハッシュ: {h}.',
      zh: '只动两处: 一个出去, 一个进来。哈希: {h}。',
      ar: 'لمستان فقط: حرف يخرج وحرف يدخل. التجزئة: {h}.',
      es: 'Solo dos toques: sale una letra, entra otra. Hash: {h}.',
      fr: 'Deux gestes seulement : une lettre sort, une entre. Empreinte : {h}.',
      hi: 'सिर्फ़ दो बदलाव: एक अक्षर बाहर, एक अंदर। हैश: {h}.',
      id: 'Hanya dua sentuhan: satu huruf keluar, satu masuk. Hash: {h}.',
      pt: 'Apenas dois toques: uma letra sai, outra entra. Hash: {h}.',
    },
    'caption.match': {
      en: 'The same hash as the pattern: {h}.',
      ko: '조각과 해시가 같다: {h}.',
      ja: '断片と同じハッシュ: {h}.',
      zh: '与片段的哈希相同: {h}。',
      ar: 'التجزئة نفسها كتجزئة النمط: {h}.',
      es: 'El mismo hash que el patrón: {h}.',
      fr: 'La même empreinte que le motif : {h}.',
      hi: 'पैटर्न जैसा ही हैश: {h}.',
      id: 'Hash sama dengan pola: {h}.',
      pt: 'O mesmo hash do padrão: {h}.',
    },
    'caption.wrapped': {
      en: 'Back to the same letters, and the same hash: {h}.',
      ko: '같은 글자로 돌아왔다. 해시도 처음 값: {h}.',
      ja: '同じ文字に戻り、ハッシュも最初の値: {h}.',
      zh: '回到相同的字母, 哈希也回到起点: {h}。',
      ar: 'عادت الحروف نفسها، وعادت معها التجزئة: {h}.',
      es: 'Vuelven las mismas letras, y el mismo hash: {h}.',
      fr: 'Les mêmes lettres reviennent, et la même empreinte : {h}.',
      hi: 'वही अक्षर लौट आए, और वही हैश: {h}.',
      id: 'Huruf yang sama kembali, dan hash-nya pun sama: {h}.',
      pt: 'As mesmas letras voltam, e o mesmo hash: {h}.',
    },
    'caption.done': {
      en: '{windows} windows, {rolls} rolls — each roll touched two letters.',
      ko: '창의 수는 {windows}, 구르기는 {rolls}. 구를 때마다 만진 글자는 둘.',
      ja: '窓は {windows}、転がりは {rolls}。一度ごとに触れた文字は二つ。',
      zh: '窗口 {windows} 个, 滚动 {rolls} 次; 每次只碰两个字母。',
      ar: 'النوافذ {windows} والتدحرجات {rolls}؛ كل تدحرج يلمس حرفين فقط.',
      es: '{windows} ventanas, {rolls} desplazamientos: cada uno tocó dos letras.',
      fr: '{windows} fenêtres, {rolls} roulements : chacun n’a touché que deux lettres.',
      hi: '{windows} खिड़कियाँ, {rolls} सरकाव — हर बार सिर्फ़ दो अक्षर छुए गए।',
      id: '{windows} jendela, {rolls} gulingan — tiap gulingan menyentuh dua huruf.',
      pt: '{windows} janelas, {rolls} rolagens — cada uma tocou duas letras.',
    },
  },
};
