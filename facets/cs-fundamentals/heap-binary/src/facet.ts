/**
 * heap-binary — 이진 힙(최소 힙) 완결형 선언.
 *
 * 조각이 아니다. 조각 넷(`heapProperty` · `siftUp` · `siftDown` · `arrayAsTree`)이
 * 부품을 갖췄고, 이것은 그 부품이 한 물건이 되는 자리다. 그래서 조각에 없는
 * 것들을 갖는다 — 자기 값을 넣는 입력, 누적 메트릭, 코드 패널, 그리고 조각
 * 어디에도 없던 두 연산(heapify · 정렬).
 *
 * 식별자 (C1): `index:<i>` 만 쓴다. 배열의 칸과 나무의 자리가 같은 것이라
 * 번호 하나로 족하다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const heapBinaryFacet: FacetJson = {
  id: 'facet:heapBinary',
  // 제목은 카탈로그 카드의 이름과 같다. 변별은 id(`heapBinary`)가 맡는다 —
  // `linkedListSingly` 가 "연결 리스트", `hashTableChaining` 이 "해시 테이블"
  // 인 것과 같은 규약이다 (C4).
  title: {
    en: 'Heap',
    ko: '힙',
    ja: 'ヒープ',
    zh: '堆',
    ar: 'كومة',
    es: 'Montículo',
    fr: 'Tas',
    hi: 'हीप',
    id: 'Heap',
    pt: 'Heap',
  },
  description: {
    en: 'Think of it as a tree, keep it in an array — the smallest is always on top.',
    ko: '나무처럼 생각하고 배열에 담는다 — 가장 작은 값이 늘 꼭대기에 있다',
    ja: '木のように考え、配列に収める — 最小値がつねに頂上にある。',
    zh: '按树来想，用数组来存 — 最小的总在顶端。',
    ar: 'فكّر فيها كشجرة واحفظها في مصفوفة — الأصغر دائمًا في القمة.',
    es: 'Piénsalo como un árbol y guárdalo en un arreglo: el menor siempre está arriba.',
    fr: "Pensez-le comme un arbre, rangez-le dans un tableau — le plus petit est toujours au sommet.",
    hi: 'सोचें पेड़ की तरह, रखें सरणी में — सबसे छोटा हमेशा शीर्ष पर।',
    id: 'Pikirkan sebagai pohon, simpan dalam larik — yang terkecil selalu di puncak.',
    pt: 'Pense como uma árvore, guarde num vetor — o menor está sempre no topo.',
  },
  algorithm: 'module:heapBinary',
  projector: 'module:heapBinaryProjector',
  initialData: {
    type: 'heap-binary',
    // 시연에서 하나씩 넣어 볼 값. 넣는 순서가 오름차순이 아니라야 오르는 걸음이
    // 실제로 보인다 — 오름차순이면 새 값이 언제나 끝자리에 머문다.
    seed: [9, 4, 7, 1, 8, 3],
    capacity: 15,
    stepMs: 620,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'header' }, { ref: 'stage', padding: '8px 0' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  messages: {
    'caption.start': {
      en: 'Building a heap — each value climbs to its place.',
      ko: '힙을 세운다 — 값마다 제 자리까지 오른다',
      ja: 'ヒープを組み立てる — 値はそれぞれの位置まで上がる。',
      zh: '正在建堆 — 每个值都爬到自己的位置。',
      ar: 'نبني الكومة — كل قيمة تصعد إلى موضعها.',
      es: 'Construyendo el montículo: cada valor sube a su sitio.',
      fr: 'Construction du tas — chaque valeur monte à sa place.',
      hi: 'हीप बन रहा है — हर मान अपनी जगह तक चढ़ता है।',
      id: 'Menyusun heap — tiap nilai naik ke tempatnya.',
      pt: 'Construindo o heap — cada valor sobe até o seu lugar.',
    },
    'caption.append': {
      en: '{v} sits at the end — now it climbs.',
      ko: '{v} 이 끝자리에 앉는다 — 이제 오른다',
      ja: '{v} が末尾に座る — ここから上がる。',
      zh: '{v} 落在末尾 — 现在开始上爬。',
      ar: '{v} يجلس في النهاية — والآن يصعد.',
      es: '{v} se sienta al final; ahora sube.',
      fr: '{v} se pose à la fin — il monte maintenant.',
      hi: '{v} अंत में बैठता है — अब यह चढ़ेगा।',
      id: '{v} duduk di ujung — sekarang naik.',
      pt: '{v} senta no fim — agora sobe.',
    },
    'caption.compare': {
      en: '{a} vs {b} — {ahead} comes first.',
      ko: '{a} 과 {b} 를 견준다 — {ahead} 가 앞선다',
      ja: '{a} と {b} を比べる — {ahead} が先。',
      zh: '{a} 与 {b} 相比 — {ahead} 在前。',
      ar: '{a} مقابل {b} — {ahead} يأتي أولًا.',
      es: '{a} frente a {b}: {ahead} va primero.',
      fr: '{a} contre {b} — {ahead} passe devant.',
      hi: '{a} बनाम {b} — {ahead} पहले आता है।',
      id: '{a} lawan {b} — {ahead} lebih dulu.',
      pt: '{a} contra {b} — {ahead} vem primeiro.',
    },
    'caption.swap': {
      en: 'Slots {a} and {b} trade places.',
      ko: '{a} 번과 {b} 번 자리가 값을 맞바꾼다',
      ja: '{a} 番と {b} 番が入れ替わる。',
      zh: '第 {a} 位与第 {b} 位交换。',
      ar: 'الموضعان {a} و {b} يتبادلان.',
      es: 'Las posiciones {a} y {b} intercambian.',
      fr: 'Les places {a} et {b} échangent.',
      hi: 'स्थान {a} और {b} आपस में बदलते हैं।',
      id: 'Posisi {a} dan {b} bertukar.',
      pt: 'As posições {a} e {b} trocam.',
    },
    'caption.settle': {
      en: 'This is its place.',
      ko: '여기가 제 자리다',
      ja: 'ここがその位置だ。',
      zh: '这就是它的位置。',
      ar: 'هذا موضعه.',
      es: 'Este es su sitio.',
      fr: "C'est sa place.",
      hi: 'यही इसकी जगह है।',
      id: 'Inilah tempatnya.',
      pt: 'Este é o seu lugar.',
    },
    'caption.extract': {
      en: '{v} leaves the top; the last value takes its seat and sinks.',
      ko: '{v} 이 꼭대기에서 나가고, 맨 끝 값이 그 자리에 올라 내려간다',
      ja: '{v} が頂上を離れ、末尾の値がその席に就いて沈む。',
      zh: '{v} 离开顶端，末尾的值坐上去并下沉。',
      ar: '{v} يغادر القمة، وتأخذ القيمة الأخيرة مكانه ثم تهبط.',
      es: '{v} deja la cima; el último valor ocupa su sitio y se hunde.',
      fr: '{v} quitte le sommet ; la dernière valeur prend sa place et descend.',
      hi: '{v} शीर्ष छोड़ता है; अंतिम मान उसकी जगह लेकर नीचे जाता है।',
      id: '{v} meninggalkan puncak; nilai terakhir mengambil tempatnya lalu turun.',
      pt: '{v} deixa o topo; o último valor assume o lugar e afunda.',
    },
    'caption.sortedOut': {
      en: '{v} is settled — the sorted tail grows from the back.',
      ko: '{v} 이 제자리에 놓인다 — 정렬된 꼬리가 뒤에서 자란다',
      ja: '{v} が定位置に収まる — 整列済みの尾が後ろから伸びる。',
      zh: '{v} 就位 — 已排序的尾部从后面生长。',
      ar: '{v} استقر — الذيل المرتَّب ينمو من الخلف.',
      es: '{v} queda fijo: la cola ordenada crece desde atrás.',
      fr: '{v} est fixé — la queue triée grandit par l\'arrière.',
      hi: '{v} जम गया — क्रमित पूँछ पीछे से बढ़ती है।',
      id: '{v} sudah pada tempatnya — ekor terurut tumbuh dari belakang.',
      pt: '{v} está fixo — a cauda ordenada cresce a partir de trás.',
    },
    'caption.overflow': {
      en: 'No room for {v} — the heap holds {cap}.',
      ko: '{v} 을 담을 자리가 없다 — 이 힙은 {cap} 개까지다',
      ja: '{v} を入れる場所がない — このヒープは {cap} 個までだ。',
      zh: '放不下 {v} — 这个堆最多 {cap} 个。',
      ar: 'لا مكان لـ {v} — هذه الكومة تسع {cap}.',
      es: 'No hay sitio para {v}: el montículo guarda {cap}.',
      fr: "Pas de place pour {v} — ce tas contient {cap}.",
      hi: '{v} के लिए जगह नहीं — यह हीप {cap} तक रखता है।',
      id: 'Tak ada tempat untuk {v} — heap ini memuat {cap}.',
      pt: 'Sem espaço para {v} — este heap guarda {cap}.',
    },
    'caption.done': {
      en: 'Your turn — insert, extract, heapify or sort.',
      ko: '이제 직접 — 넣기 · 빼기 · 한 번에 힙으로 · 정렬',
      ja: 'あなたの番 — 挿入・取り出し・一括ヒープ化・整列。',
      zh: '轮到你了 — 插入、取出、一次建堆或排序。',
      ar: 'دورك — أدرج أو اسحب أو كوّم دفعة واحدة أو رتّب.',
      es: 'Te toca: inserta, extrae, apila de una vez u ordena.',
      fr: 'À vous — insérer, extraire, tasser d\'un coup ou trier.',
      hi: 'आपकी बारी — डालें, निकालें, एक बार में हीप बनाएँ या क्रमित करें।',
      id: 'Giliranmu — sisipkan, ambil, jadikan heap sekaligus, atau urutkan.',
      pt: 'Sua vez — inserir, extrair, empilhar de uma vez ou ordenar.',
    },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'heap-binary-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'value-input',
          name: 'value',
          action: 'input',
          label: { en: 'Value', ko: '값', ja: '値', zh: '值', ar: 'القيمة', es: 'Valor', fr: 'Valeur', hi: 'मान', id: 'Nilai', pt: 'Valor' },
          placeholder: { en: 'e.g. 5', ko: '예: 5', ja: '例: 5', zh: '例: 5', ar: 'مثال: 5', es: 'p. ej. 5', fr: 'ex. 5', hi: 'जैसे 5', id: 'mis. 5', pt: 'ex.: 5' },
          default: '',
        },
        CONTROL.insert,
        {
          widget: 'button',
          action: 'extract',
          label: { en: 'Extract', ko: '빼기', ja: '取り出す', zh: '取出', ar: 'سحب', es: 'Extraer', fr: 'Extraire', hi: 'निकालें', id: 'Ambil', pt: 'Extrair' },
        },
        {
          widget: 'button',
          action: 'heapify',
          label: { en: 'Heapify', ko: '한 번에 힙으로', ja: '一括ヒープ化', zh: '一次建堆', ar: 'تكويم دفعة', es: 'Apilar de una vez', fr: "Tasser d'un coup", hi: 'एक बार में हीप', id: 'Heap sekaligus', pt: 'Empilhar de uma vez' },
        },
        {
          widget: 'button',
          action: 'sort',
          label: { en: 'Sort', ko: '정렬', ja: '整列', zh: '排序', ar: 'ترتيب', es: 'Ordenar', fr: 'Trier', hi: 'क्रमित करें', id: 'Urutkan', pt: 'Ordenar' },
        },
        CONTROL.reset,
      ],
      metrics: [
        { name: 'compare-count', label: { en: 'Compares', ko: '견줌', ja: '比較', zh: '比较', ar: 'مقارنات', es: 'Comparaciones', fr: 'Comparaisons', hi: 'तुलनाएँ', id: 'Perbandingan', pt: 'Comparações' }, initial: 0 },
        { name: 'swap-count', label: { en: 'Swaps', ko: '맞바꿈', ja: '交換', zh: '交换', ar: 'تبديلات', es: 'Intercambios', fr: 'Échanges', hi: 'अदला-बदली', id: 'Tukar', pt: 'Trocas' }, initial: 0 },
        { name: 'insert-count', label: { en: 'Inserts', ko: '넣기', ja: '挿入', zh: '插入', ar: 'إدراجات', es: 'Inserciones', fr: 'Insertions', hi: 'प्रविष्टियाँ', id: 'Penyisipan', pt: 'Inserções' }, initial: 0 },
        { name: 'extract-count', label: { en: 'Extracts', ko: '빼기', ja: '取り出し', zh: '取出', ar: 'سحوبات', es: 'Extracciones', fr: 'Extractions', hi: 'निष्कर्षण', id: 'Pengambilan', pt: 'Extrações' }, initial: 0 },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드', ja: 'コード', zh: '代码', ar: 'الشيفرة', es: 'Código', fr: 'Code', hi: 'कोड', id: 'Kode', pt: 'Código' },
      ir: 'ir:heap-sift',
    },
  },
};
