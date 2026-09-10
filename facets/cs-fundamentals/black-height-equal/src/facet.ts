/**
 * BlackHeightEqual facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "어느 길로 가도 검은 수가 같다는 게 무슨 뜻인가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭은 러너가 정함(PIECE_CANVAS_W) / 전제를 각주로
 * 밝히지 않음.
 *
 * 데이터는 호스트가 준 실측 트리 그대로다 — 성한 레드-블랙 트리이며,
 * 20(검) 아래 10(검)·40(빨), 10 아래 5(빨), 40 아래 30(검)·50(검). 뿌리
 * 20 자신은 세지 않고 그 아래 네 길(20→10→5→nil, 20→10→nil, 20→40→30→nil,
 * 20→40→50→nil)을 실제로 따라 내려가며 센다 — 길이는 2 또는 3으로 다르지만
 * 검은 수는 넷 다 2다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const blackHeightEqualFacet: FacetJson = {
  id: 'facet:blackHeightEqual',
  title: {
    en: 'Black Height, Equal Every Time',
    ko: '검은 높이는 어디서나 같다',
    ja: '黒の高さは、どこでも同じ',
    zh: '黑高处处相等',
    ar: 'الارتفاع الأسود، متساوٍ في كل مرة',
    es: 'Altura negra, igual en todos los caminos',
    fr: 'La hauteur noire, la même partout',
    hi: 'ब्लैक हाइट, हर बार बराबर',
    id: 'Tinggi hitam, selalu sama',
    pt: 'Altura preta, igual em todos',
  },
  description: {
    en: 'Walk root to nil on four different routes — the black count always lands on the same number',
    ko: '뿌리에서 nil 까지 네 갈래 길을 따라가 본다 — 검은 수는 언제나 같은 값에 닿는다',
    ja: '根から nil まで四つの道をたどる — 黒の数はいつも同じ値に落ち着く',
    zh: '从根到 nil 走四条不同的路 — 黑色的个数总落在同一个数上',
    ar: 'امشِ من الجذر إلى nil عبر أربعة مسارات — عدد السود يستقر دائمًا على الرقم نفسه',
    es: 'Recorre de la raíz al nil por cuatro rutas distintas: el conteo de negros siempre acaba en el mismo número',
    fr: 'Parcours de la racine au nil par quatre chemins — le compte des noirs tombe toujours sur le même nombre',
    hi: 'जड़ से nil तक चार अलग रास्ते चलो — काले की गिनती हमेशा उसी संख्या पर आती है',
    id: 'Telusuri dari akar ke nil lewat empat rute — hitungan hitamnya selalu mendarat di angka yang sama',
    pt: 'Percorre da raiz ao nil por quatro rotas — a contagem de pretos cai sempre no mesmo número',
  },
  algorithm: 'module:blackHeightEqual',
  projector: 'module:blackHeightEqualProjector',
  initialData: {
    type: 'black-height-equal',
    root: {
      id: '20',
      value: 20,
      color: 'black',
      left: {
        id: '10',
        value: 10,
        color: 'black',
        left: {
          id: '5',
          value: 5,
          color: 'red',
        },
      },
      right: {
        id: '40',
        value: 40,
        color: 'red',
        left: {
          id: '30',
          value: 30,
          color: 'black',
        },
        right: {
          id: '50',
          value: 50,
          color: 'black',
        },
      },
    },
    stepMs: 700,
  },
  shuffleOnReset: false,
  messages: {
    'caption.visitBlack': {
      en: 'Black — count it. Running total {n}.',
      ko: '검은 자리 — 센다. 지금까지 {n}.',
      ja: '黒 — 数える。ここまで {n}。',
      zh: '黑 — 计入。到此为 {n}。',
      ar: 'أسود — يُحسب. المجموع حتى الآن {n}.',
      es: 'Negro: se cuenta. Total hasta ahora {n}.',
      fr: 'Noir — on compte. Total {n}.',
      hi: 'काला — गिनो। अब तक {n}।',
      id: 'Hitam — dihitung. Sejauh ini {n}.',
      pt: 'Preto — conta-se. Total até agora {n}.',
    },
    'caption.visitRed': {
      en: 'Red — skip it. Running total stays {n}.',
      ko: '빨간 자리 — 건너뛴다. 지금까지 {n}.',
      ja: '赤 — 飛ばす。ここまで {n} のまま。',
      zh: '红 — 跳过。到此仍是 {n}。',
      ar: 'أحمر — يُتخطّى. يبقى المجموع {n}.',
      es: 'Rojo: se salta. El total sigue en {n}.',
      fr: 'Rouge — on saute. Le total reste {n}.',
      hi: 'लाल — छोड़ो। अब तक {n} ही।',
      id: 'Merah — dilewati. Tetap {n}.',
      pt: 'Vermelho — salta-se. O total fica em {n}.',
    },
    'caption.visitNil': {
      en: 'Nil — always counts as black. Running total {n}.',
      ko: '빈 자리(nil) — 검정으로 센다. 지금까지 {n}.',
      ja: 'nil — つねに黒として数える。ここまで {n}。',
      zh: 'nil — 一律算作黑。到此为 {n}。',
      ar: 'nil — يُحسب أسود دائمًا. المجموع {n}.',
      es: 'Nil: siempre cuenta como negro. Total {n}.',
      fr: 'Nil — compte toujours comme noir. Total {n}.',
      hi: 'nil — हमेशा काला गिना जाता है। अब तक {n}।',
      id: 'nil — selalu dihitung hitam. Sejauh ini {n}.',
      pt: 'Nil — conta sempre como preto. Total {n}.',
    },
    'caption.settled': {
      en: 'This path settles at {n} black.',
      ko: '이 길은 검은 수 {n}로 끝난다.',
      ja: 'この道は黒 {n} で終わる。',
      zh: '这条路停在黑 {n}。',
      ar: 'ينتهي هذا المسار عند {n} أسود.',
      es: 'Este camino acaba en {n} negros.',
      fr: "Ce chemin s'arrête à {n} noirs.",
      hi: 'यह रास्ता {n} काले पर ठहरता है।',
      id: 'Jalur ini berhenti di {n} hitam.',
      pt: 'Este caminho fica em {n} pretos.',
    },
    'caption.allSettled': {
      en: 'Every path settles at the same number — {n} black.',
      ko: '어느 길로 가도 검은 수는 같다 — {n}.',
      ja: 'どの道も同じ値で終わる — 黒 {n}。',
      zh: '每条路都停在同一个数 — 黑 {n}。',
      ar: 'كل المسارات تنتهي عند الرقم نفسه — {n} أسود.',
      es: 'Todos los caminos acaban en el mismo número: {n} negros.',
      fr: 'Tous les chemins finissent au même nombre — {n} noirs.',
      hi: 'हर रास्ता उसी संख्या पर ठहरता है — {n} काले।',
      id: 'Semua jalur berhenti di angka yang sama — {n} hitam.',
      pt: 'Todos os caminhos acabam no mesmo número — {n} pretos.',
    },
    'caption.rewind': {
      en: 'Back to the root — watching it again, one step at a time.',
      ko: '뿌리로 되감는다 — 한 걸음씩 다시 짚어 본다.',
      ja: '根に戻る — もう一度、一歩ずつ見る。',
      zh: '回到根 — 再一步一步看一遍。',
      ar: 'عودة إلى الجذر — نشاهدها ثانية خطوة خطوة.',
      es: 'De vuelta a la raíz: se mira otra vez, paso a paso.',
      fr: 'Retour à la racine — on regarde encore, pas à pas.',
      hi: 'जड़ पर वापस — एक-एक कदम फिर से देखते हैं।',
      id: 'Kembali ke akar — dilihat lagi, selangkah demi selangkah.',
      pt: 'De volta à raiz — vê-se outra vez, passo a passo.',
    },
  },
  blocks: {
    stage: { type: 'black-height-equal-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
