import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * @notation native
 *
 * 질문: `.menu li a` 같은 선택자가 한 요소에 맞는지, 브라우저는 선택자의 어느 쪽부터 보고
 * 문서의 어느 쪽으로 따라가는가?
 *
 * 선택자는 오른쪽 끝부터 읽히고, 문서에서는 후보 요소에서 부모로 한 칸씩 거슬러 오른다.
 * 두 자리가 함께 오르는 것이 주인공이다. 선택자 · 태그 · 클래스 · 아이디는 CSS 와 HTML 그 자체라
 * 번역하지 않는 자료로 initialData 에 둔다.
 */
export const selectorRightToLeftFacet: FacetJson = {
  id: 'facet:selectorRightToLeft',
  title: {
    en: 'A selector is matched from the right',
    ko: '선택자는 오른쪽부터 맞춘다',
    ja: 'セレクタは右から照合される',
    zh: '选择器从右往左匹配',
    ar: 'يُطابَق المحدِّد من اليمين',
    es: 'Un selector se compara desde la derecha',
    fr: 'Un sélecteur se vérifie par la droite',
    hi: 'सिलेक्टर दाईं ओर से मिलाया जाता है',
    id: 'Selektor dicocokkan dari kanan',
    pt: 'Um seletor é comparado a partir da direita',
  },
  description: {
    en: 'The browser reads the selector from its rightmost part and climbs the document from the candidate element up through its parents.',
    ko: '브라우저는 선택자를 오른쪽 끝부터 읽고, 문서에서는 후보 요소에서 부모로 한 칸씩 거슬러 오르며 맞는지 본다.',
    ja: 'ブラウザはセレクタを右端から読み、文書では候補の要素から親へ一段ずつさかのぼって照合する。',
    zh: '浏览器从选择器最右边的部分读起，在文档中从候选元素开始逐级向父元素回溯。',
    ar: 'يقرأ المتصفح المحدِّد من جزئه الأيمن، ويصعد في المستند من العنصر المرشَّح عبر آبائه واحدًا تلو الآخر.',
    es: 'El navegador lee el selector desde su parte derecha y sube por el documento desde el elemento candidato a través de sus padres.',
    fr: 'Le navigateur lit le sélecteur par sa partie la plus à droite et remonte le document depuis l’élément candidat, parent après parent.',
    hi: 'ब्राउज़र सिलेक्टर को सबसे दाएँ हिस्से से पढ़ता है और दस्तावेज़ में उम्मीदवार तत्व से माता-पिता की ओर एक-एक सीढ़ी ऊपर चढ़ता है।',
    id: 'Peramban membaca selektor dari bagian paling kanan dan menaiki dokumen dari elemen kandidat melalui induk-induknya.',
    pt: 'O navegador lê o seletor a partir da parte mais à direita e sobe no documento do elemento candidato pelos seus pais.',
  },
  algorithm: 'module:selectorRightToLeft',
  scene: 'module:selectorRightToLeftScene',
  initialData: {
    type: 'selector-right-to-left',
    stepMs: 1100,
    selector: '.menu li a',
    dom: [
      { tag: 'html' },
      { tag: 'body', parent: 0 },
      { tag: 'nav', cls: ['menu'], parent: 1 },
      { tag: 'ul', parent: 2 },
      { tag: 'li', parent: 3 },
      { tag: 'a', id: 'home', parent: 4 },
      { tag: 'footer', parent: 1 },
      { tag: 'p', parent: 6 },
      { tag: 'a', id: 'terms', parent: 7 },
    ],
  },
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'The rule is filed under its rightmost part. Candidates: {n}',
      ko: '규칙은 오른쪽 끝 단순 선택자 아래 묶여 있다. 후보: {n}',
      ja: '規則は右端の単純セレクタの下にまとめられている。候補: {n}',
      zh: '规则按最右边的简单选择器归档。候选: {n}',
      ar: 'القاعدة مُصنَّفة تحت جزئها الأيمن. المرشَّحون: {n}',
      es: 'La regla se archiva bajo su parte derecha. Candidatos: {n}',
      fr: 'La règle est rangée sous sa partie de droite. Candidats : {n}',
      hi: 'नियम अपने सबसे दाएँ हिस्से के नीचे रखा है। उम्मीदवार: {n}',
      id: 'Aturan disimpan di bawah bagian paling kanannya. Kandidat: {n}',
      pt: 'A regra fica arquivada sob sua parte mais à direita. Candidatos: {n}',
    },
    'caption.hit': {
      en: '{part} ↔ {node}: match. The selector moves one part left, the document one level up.',
      ko: '{part} ↔ {node}: 맞음. 선택자는 한 칸 왼쪽으로, 문서는 한 칸 위로.',
      ja: '{part} ↔ {node}: 一致。セレクタは一つ左へ、文書は一段上へ。',
      zh: '{part} ↔ {node}: 匹配。选择器左移一格，文档上移一级。',
      ar: '{part} ↔ {node}: مطابق. ينتقل المحدِّد جزءًا واحدًا إلى اليسار، والمستند مستوى واحدًا إلى الأعلى.',
      es: '{part} ↔ {node}: coincide. El selector avanza una parte a la izquierda y el documento sube un nivel.',
      fr: '{part} ↔ {node} : correspond. Le sélecteur recule d’une partie vers la gauche, le document monte d’un niveau.',
      hi: '{part} ↔ {node}: मेल। सिलेक्टर एक हिस्सा बाएँ, दस्तावेज़ एक स्तर ऊपर।',
      id: '{part} ↔ {node}: cocok. Selektor bergeser satu bagian ke kiri, dokumen naik satu tingkat.',
      pt: '{part} ↔ {node}: corresponde. O seletor anda uma parte à esquerda e o documento sobe um nível.',
    },
    'caption.miss': {
      en: '{part} ↔ {node}: no match. Only the document moves one level up.',
      ko: '{part} ↔ {node}: 아님. 문서 자리만 한 칸 위로.',
      ja: '{part} ↔ {node}: 不一致。文書の位置だけが一段上へ。',
      zh: '{part} ↔ {node}: 不匹配。只有文档位置上移一级。',
      ar: '{part} ↔ {node}: غير مطابق. المستند وحده يصعد مستوى واحدًا.',
      es: '{part} ↔ {node}: no coincide. Solo el documento sube un nivel.',
      fr: '{part} ↔ {node} : ne correspond pas. Seul le document monte d’un niveau.',
      hi: '{part} ↔ {node}: मेल नहीं। केवल दस्तावेज़ एक स्तर ऊपर।',
      id: '{part} ↔ {node}: tidak cocok. Hanya dokumen yang naik satu tingkat.',
      pt: '{part} ↔ {node}: não corresponde. Só o documento sobe um nível.',
    },
    'caption.matched': {
      en: '{part} ↔ {node}: match. The leftmost part is found. {cand}: match.',
      ko: '{part} ↔ {node}: 맞음. 선택자 왼쪽 끝까지 맞았다. {cand}: 맞음.',
      ja: '{part} ↔ {node}: 一致。左端まで見つかった。{cand}: 一致。',
      zh: '{part} ↔ {node}: 匹配。最左边的部分也找到了。{cand}: 匹配。',
      ar: '{part} ↔ {node}: مطابق. وُجد الجزء الأيسر. {cand}: مطابق.',
      es: '{part} ↔ {node}: coincide. Se encontró la parte izquierda. {cand}: coincide.',
      fr: '{part} ↔ {node} : correspond. La partie de gauche est trouvée. {cand} : correspond.',
      hi: '{part} ↔ {node}: मेल। सबसे बायाँ हिस्सा मिल गया। {cand}: मेल।',
      id: '{part} ↔ {node}: cocok. Bagian paling kiri ditemukan. {cand}: cocok.',
      pt: '{part} ↔ {node}: corresponde. A parte mais à esquerda foi encontrada. {cand}: corresponde.',
    },
    'caption.missSelf': {
      en: '{part} ↔ {node}: no match. {cand}: no match.',
      ko: '{part} ↔ {node}: 아님. {cand}: 맞지 않음.',
      ja: '{part} ↔ {node}: 不一致。{cand}: 一致しない。',
      zh: '{part} ↔ {node}: 不匹配。{cand}: 不匹配。',
      ar: '{part} ↔ {node}: غير مطابق. {cand}: لا يطابق.',
      es: '{part} ↔ {node}: no coincide. {cand}: no coincide.',
      fr: '{part} ↔ {node} : ne correspond pas. {cand} : ne correspond pas.',
      hi: '{part} ↔ {node}: मेल नहीं। {cand}: मेल नहीं।',
      id: '{part} ↔ {node}: tidak cocok. {cand}: tidak cocok.',
      pt: '{part} ↔ {node}: não corresponde. {cand}: não corresponde.',
    },
    'caption.pastRoot': {
      en: 'Past the root with {part} still unfound. {cand}: no match.',
      ko: '뿌리를 지났다. 끝내 못 찾은 것: {part}. {cand}: 맞지 않음.',
      ja: '根を越えた。最後まで見つからなかったもの: {part}。{cand}: 一致しない。',
      zh: '越过了根。始终没找到: {part}。{cand}: 不匹配。',
      ar: 'تجاوزنا الجذر ولم يُعثر على {part}. {cand}: لا يطابق.',
      es: 'Pasamos la raíz sin encontrar {part}. {cand}: no coincide.',
      fr: 'Racine dépassée sans trouver {part}. {cand} : ne correspond pas.',
      hi: 'जड़ पार हो गई, {part} नहीं मिला। {cand}: मेल नहीं।',
      id: 'Melewati akar tanpa menemukan {part}. {cand}: tidak cocok.',
      pt: 'Passou da raiz sem encontrar {part}. {cand}: não corresponde.',
    },
    'label.selector': {
      en: 'Selector', ko: '선택자', ja: 'セレクタ', zh: '选择器', ar: 'المحدِّد',
      es: 'Selector', fr: 'Sélecteur', hi: 'सिलेक्टर', id: 'Selektor', pt: 'Seletor',
    },
    'label.document': {
      en: 'Document', ko: '문서', ja: '文書', zh: '文档', ar: 'المستند',
      es: 'Documento', fr: 'Document', hi: 'दस्तावेज़', id: 'Dokumen', pt: 'Documento',
    },
    'label.noParent': {
      en: 'No parent', ko: '부모 없음', ja: '親なし', zh: '没有父元素', ar: 'لا أب',
      es: 'Sin padre', fr: 'Pas de parent', hi: 'कोई माता-पिता नहीं', id: 'Tanpa induk', pt: 'Sem pai',
    },
    'label.candidate': {
      en: 'Candidate', ko: '후보', ja: '候補', zh: '候选', ar: 'مرشَّح',
      es: 'Candidato', fr: 'Candidat', hi: 'उम्मीदवार', id: 'Kandidat', pt: 'Candidato',
    },
    'label.match': {
      en: 'Match', ko: '맞음', ja: '一致', zh: '匹配', ar: 'مطابق',
      es: 'Coincide', fr: 'Correspond', hi: 'मेल', id: 'Cocok', pt: 'Corresponde',
    },
    'label.noMatch': {
      en: 'No match', ko: '맞지 않음', ja: '一致しない', zh: '不匹配', ar: 'لا يطابق',
      es: 'No coincide', fr: 'Ne correspond pas', hi: 'मेल नहीं', id: 'Tidak cocok', pt: 'Não corresponde',
    },
    'label.compares': {
      en: 'Comparisons: {n}', ko: '견줌: {n}', ja: '照合: {n}', zh: '比较: {n}', ar: 'المقارنات: {n}',
      es: 'Comparaciones: {n}', fr: 'Comparaisons : {n}', hi: 'तुलनाएँ: {n}', id: 'Perbandingan: {n}', pt: 'Comparações: {n}',
    },
    'label.total': {
      en: 'Total comparisons: {n}', ko: '견줌 합: {n}', ja: '照合の合計: {n}', zh: '比较总数: {n}',
      ar: 'مجموع المقارنات: {n}', es: 'Comparaciones en total: {n}', fr: 'Comparaisons au total : {n}',
      hi: 'कुल तुलनाएँ: {n}', id: 'Total perbandingan: {n}', pt: 'Comparações no total: {n}',
    },
  },
  blocks: {
    stage: { type: 'selector-right-to-left-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
