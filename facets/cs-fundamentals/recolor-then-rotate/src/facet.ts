/**
 * RecolorThenRotate facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "빨강 아래 빨강이 걸렸을 때, 색만 바꿔 풀릴 때와 돌려야 풀릴 때를 가르는
 *   것은 무엇인가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 데이터는 20, 10, 30, 5, 3 을 이 순서로 넣는 실제 삽입이다 — 미리 계산해 둔
 * 스냅샷이 아니라 algorithm 이 진짜 레드-블랙 트리 삽입+수선을 수행한다.
 * `shuffleOnReset` 은 반드시 false — 순서가 바로 이 논증의 재료다 (5는 첫
 * 위반을 색칠로, 3은 두 번째 위반을 회전으로 풀게 만드는 것이 이 순서다).
 *
 * title / description / messages 는 열 개 언어를 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const recolorThenRotateFacet: FacetJson = {
  id: 'facet:recolorThenRotate',
  title: {
    en: 'Recolor, Then Rotate',
    ko: '재색칠과 회전',
    ja: '塗り替え、そして回転',
    zh: '先重涂，再旋转',
    ar: 'إعادة التلوين ثم الدوران',
    es: 'Recolorear y luego rotar',
    fr: 'Recolorer, puis pivoter',
    hi: 'पहले रंग बदलें, फिर घुमाएँ',
    id: 'Warnai Ulang, Lalu Putar',
    pt: 'Recolorir e depois rodar',
  },
  description: {
    en: 'The same violation happens twice — the color next door decides whether recoloring is enough or the tree must turn',
    ko: '같은 위반이 두 번 일어난다 — 옆자리의 색이 색칠로 끝날지 돌아야 할지를 가른다',
    ja: '同じ違反が二度起こる — 隣の色が、塗り替えで済むか回さねばならないかを分ける',
    zh: '同样的违规发生两次 — 旁边那个的颜色决定重涂就够，还是必须旋转',
    ar: 'تتكرر المخالفة نفسها مرتين — ولون الجار يحدد أتكفي إعادة التلوين أم لا بد من الدوران',
    es: 'La misma violación ocurre dos veces: el color de al lado decide si basta recolorear o el árbol debe girar',
    fr: "La même violation se produit deux fois — la couleur du voisin décide si recolorer suffit ou si l'arbre doit tourner",
    hi: 'वही उल्लंघन दो बार होता है — बगल का रंग तय करता है कि रंग बदलना काफी है या पेड़ को घूमना पड़ेगा',
    id: 'Pelanggaran yang sama terjadi dua kali — warna di sebelahnya menentukan cukup diwarnai ulang atau pohon harus berputar',
    pt: 'A mesma violação acontece duas vezes — a cor do vizinho decide se recolorir basta ou se a árvore tem de girar',
  },
  algorithm: 'module:recolorThenRotate',
  projector: 'module:recolorThenRotateProjector',
  initialData: {
    type: 'recolor-then-rotate',
    values: [20, 10, 30, 5, 3],
    stepMs: 600,
  },
  shuffleOnReset: false,
  messages: {
    'caption.insertRoot': {
      en: '{value} starts the tree — the root is always black.',
      ko: '{value}이 트리를 시작한다 — 뿌리는 항상 검정이다.',
      ja: '{value} が木を始める — 根はつねに黒だ。',
      zh: '{value} 开启这棵树 — 根总是黑色。',
      ar: '{value} يبدأ الشجرة — والجذر أسود دائمًا.',
      es: '{value} inicia el árbol: la raíz siempre es negra.',
      fr: "{value} commence l'arbre — la racine est toujours noire.",
      hi: '{value} पेड़ शुरू करता है — जड़ हमेशा काली होती है।',
      id: '{value} memulai pohon — akar selalu hitam.',
      pt: '{value} inicia a árvore — a raiz é sempre preta.',
    },
    'caption.insertRed': {
      en: '{value} enters red, under {parent}.',
      ko: '{value}이 {parent} 아래 빨강으로 들어온다.',
      ja: '{value} が {parent} の下に赤で入る。',
      zh: '{value} 以红色进入 {parent} 之下。',
      ar: '{value} يدخل أحمر تحت {parent}.',
      es: '{value} entra en rojo, bajo {parent}.',
      fr: '{value} entre en rouge, sous {parent}.',
      hi: '{value} लाल होकर {parent} के नीचे आता है।',
      id: '{value} masuk merah, di bawah {parent}.',
      pt: '{value} entra vermelho, sob {parent}.',
    },
    'caption.violationRed': {
      en: '{child} lands red under red {parent}. Its sibling {uncle} is red too — recoloring will settle it.',
      ko: '{parent} 아래 {child} — 또 빨강 아래 빨강이다. 옆자리 {uncle}도 빨강이니 색칠로 풀린다.',
      ja: '{parent} の下に {child} — また赤の下に赤だ。隣の {uncle} も赤なので塗り替えで収まる。',
      zh: '{parent} 之下的 {child} — 又是红下红。旁边的 {uncle} 也是红的，重涂即可解决。',
      ar: '{child} تحت {parent} — أحمر تحت أحمر مرة أخرى. والجار {uncle} أحمر أيضًا، فتكفي إعادة التلوين.',
      es: '{child} cae en rojo bajo el rojo {parent}. Su vecino {uncle} también es rojo: basta recolorear.',
      fr: '{child} arrive en rouge sous le rouge {parent}. Son voisin {uncle} est rouge aussi — recolorer suffira.',
      hi: '{parent} के नीचे {child} — फिर लाल के नीचे लाल। बगल का {uncle} भी लाल है, इसलिए रंग बदलने से हल हो जाएगा।',
      id: '{child} jatuh merah di bawah {parent} yang merah. Tetangganya {uncle} juga merah — cukup diwarnai ulang.',
      pt: '{child} cai vermelho sob o vermelho {parent}. O vizinho {uncle} também é vermelho — recolorir resolve.',
    },
    'caption.violationNil': {
      en: '{child} lands red under red {parent}, and the empty spot beside {parent} counts as black — recoloring alone will not fix this.',
      ko: '{parent} 아래 {child} — 또 빨강 아래 빨강이다. {parent} 옆 빈 자리는 검정이라 색칠만으로는 안 풀린다.',
      ja: '{parent} の下に {child} — また赤の下に赤だ。{parent} の隣の空きは黒と数えるので、塗り替えだけでは直らない。',
      zh: '{parent} 之下的 {child} — 又是红下红。{parent} 旁边的空位算作黑色，光靠重涂解决不了。',
      ar: '{child} تحت {parent} — أحمر تحت أحمر، والموضع الفارغ بجانب {parent} يُحسب أسود، فلا تكفي إعادة التلوين وحدها.',
      es: '{child} cae en rojo bajo el rojo {parent}, y el hueco junto a {parent} cuenta como negro: recolorear no bastará.',
      fr: "{child} arrive en rouge sous le rouge {parent}, et la place vide à côté de {parent} compte comme noire — recolorer ne suffira pas.",
      hi: '{parent} के नीचे {child} — फिर लाल के नीचे लाल, और {parent} के बगल की खाली जगह काली गिनी जाती है, इसलिए सिर्फ रंग बदलने से बात नहीं बनेगी।',
      id: '{child} jatuh merah di bawah {parent} yang merah, dan tempat kosong di sebelah {parent} dihitung hitam — mewarnai ulang saja tidak cukup.',
      pt: '{child} cai vermelho sob o vermelho {parent}, e o lugar vazio ao lado de {parent} conta como preto — só recolorir não resolve.',
    },
    'caption.recolorApplied': {
      en: '{parent} and {uncle} turn black, {grandparent} turns red.',
      ko: '{parent}와 {uncle}은 검정으로, {grandparent}는 빨강으로 바뀐다.',
      ja: '{parent} と {uncle} が黒に、{grandparent} が赤になる。',
      zh: '{parent} 与 {uncle} 变黑，{grandparent} 变红。',
      ar: '{parent} و{uncle} يصيران أسودين، و{grandparent} يصير أحمر.',
      es: '{parent} y {uncle} pasan a negro; {grandparent}, a rojo.',
      fr: '{parent} et {uncle} deviennent noirs, {grandparent} devient rouge.',
      hi: '{parent} और {uncle} काले हो जाते हैं, {grandparent} लाल।',
      id: '{parent} dan {uncle} jadi hitam, {grandparent} jadi merah.',
      pt: '{parent} e {uncle} ficam pretos, {grandparent} fica vermelho.',
    },
    'caption.rootFixApplied': {
      en: '{root} is the root, so it turns back to black.',
      ko: '{root}는 뿌리라서 다시 검정이 된다.',
      ja: '{root} は根なので、また黒に戻る。',
      zh: '{root} 是根，所以又变回黑色。',
      ar: '{root} هو الجذر، فيعود أسود.',
      es: '{root} es la raíz, así que vuelve a negro.',
      fr: '{root} est la racine, elle redevient donc noire.',
      hi: '{root} जड़ है, इसलिए फिर काला हो जाता है।',
      id: '{root} adalah akar, jadi kembali hitam.',
      pt: '{root} é a raiz, por isso volta a preto.',
    },
    'caption.rotateApplied': {
      en: '{grandparent} rotates — {parent} moves up in its place.',
      ko: '{grandparent}가 돈다 — {parent}가 그 자리로 올라온다.',
      ja: '{grandparent} が回る — {parent} がその位置へ上がる。',
      zh: '{grandparent} 旋转 — {parent} 升到它的位置。',
      ar: '{grandparent} يدور — و{parent} يصعد إلى مكانه.',
      es: '{grandparent} gira: {parent} sube a su lugar.',
      fr: '{grandparent} pivote — {parent} monte à sa place.',
      hi: '{grandparent} घूमता है — {parent} उसकी जगह ऊपर आ जाता है।',
      id: '{grandparent} berputar — {parent} naik ke tempatnya.',
      pt: '{grandparent} gira — {parent} sobe para o seu lugar.',
    },
    'caption.rotateSwapApplied': {
      en: '{parent} turns black, {grandparent} turns red.',
      ko: '{parent}는 검정으로, {grandparent}는 빨강으로 바뀐다.',
      ja: '{parent} が黒に、{grandparent} が赤になる。',
      zh: '{parent} 变黑，{grandparent} 变红。',
      ar: '{parent} يصير أسود، و{grandparent} يصير أحمر.',
      es: '{parent} pasa a negro; {grandparent}, a rojo.',
      fr: '{parent} devient noir, {grandparent} devient rouge.',
      hi: '{parent} काला हो जाता है, {grandparent} लाल।',
      id: '{parent} jadi hitam, {grandparent} jadi merah.',
      pt: '{parent} fica preto, {grandparent} fica vermelho.',
    },
  },
  blocks: {
    stage: { type: 'recolor-then-rotate-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
