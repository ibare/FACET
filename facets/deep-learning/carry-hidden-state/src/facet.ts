import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 같은 토큰이 다시 들어와도 RNN 의 출력은 같은가 — 앞에서 본 것은 어디에 담겨 다음 걸음까지 오는가.
 *
 * 걸음마다 방금 만든 은닉 상태 h 가 다음 셀로 건너가 새 토큰과 섞인다. 그래서 같은 토큰 A 가
 * 세 번 들어와도 넘겨받은 h 가 달라 나온 h 가 세 번 다 다르다.
 */
export const carryHiddenStateFacet: FacetJson = {
  id: 'facet:carryHiddenState',
  title: {
    en: 'The hidden state is carried forward',
    ko: '은닉 상태는 다음 걸음으로 넘겨진다',
    ja: '隠れ状態は次のステップへ引き継がれる',
    zh: '隐藏状态被传到下一步',
    ar: 'تنتقل الحالة المخفية إلى الخطوة التالية',
    es: 'El estado oculto pasa al siguiente paso',
    fr: 'L’état caché passe à l’étape suivante',
    hi: 'छिपी अवस्था अगले चरण तक पहुँचाई जाती है',
    id: 'Keadaan tersembunyi dibawa ke langkah berikutnya',
    pt: 'O estado oculto passa para o passo seguinte',
  },
  description: {
    en: 'Token A enters three times, yet h comes out different each time — the h just made crosses into the next step and mixes with the new token.',
    ko: '토큰 A 가 세 번 들어와도 나온 h 는 매번 다르다 — 방금 만든 h 가 다음 걸음으로 건너가 새 토큰과 섞이기 때문이다.',
    ja: 'トークン A が三回入っても出てくる h は毎回違う — 直前に作った h が次のステップへ渡り、新しいトークンと混ざるからだ。',
    zh: '令牌 A 进入三次，输出的 h 每次都不同——刚产生的 h 传到下一步，与新令牌混合。',
    ar: 'يدخل الرمز A ثلاث مرات، ومع ذلك يخرج h مختلفًا كل مرة — فالـ h الذي صُنع للتو يعبر إلى الخطوة التالية ويمتزج بالرمز الجديد.',
    es: 'El token A entra tres veces y aun así h sale distinto cada vez: el h recién creado cruza al paso siguiente y se mezcla con el nuevo token.',
    fr: 'Le jeton A entre trois fois, mais h sort différent à chaque fois : le h qui vient d’être produit passe à l’étape suivante et se mêle au nouveau jeton.',
    hi: 'टोकन A तीन बार आता है, फिर भी हर बार h अलग निकलता है — अभी बना h अगले चरण में जाकर नए टोकन से मिलता है।',
    id: 'Token A masuk tiga kali, namun h yang keluar selalu berbeda — h yang baru dibuat menyeberang ke langkah berikutnya dan bercampur dengan token baru.',
    pt: 'O token A entra três vezes, mas h sai diferente a cada vez: o h recém-criado passa ao passo seguinte e se mistura ao novo token.',
  },
  algorithm: 'module:carryHiddenState',
  scene: 'module:carryHiddenStateScene',
  initialData: {
    type: 'carry-hidden-state',
    stepMs: 2000,
    tokens: ['A', 'A', 'B', 'A'],
    inputs: { A: 1, B: -1 },
    weights: { wx: 1, wh: 0.8, b: 0 },
    h0: 0,
    symbols: { h: 'h', x: 'x', termX: 'wₓ·x', termH: 'wₕ·h', act: 'tanh' },
  },
  shuffleOnReset: false,
  blocks: {
    stage: { type: 'carry-hidden-state-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
  messages: {
    'caption.start': {
      en: 'Nothing seen yet — h: {h}',
      ko: '아직 본 것이 없다 — h: {h}',
      ja: 'まだ何も見ていない — h: {h}',
      zh: '还什么都没看到 — h: {h}',
      ar: 'لم يُرَ شيء بعد — h: {h}',
      es: 'Aún no se ha visto nada — h: {h}',
      fr: 'Rien vu pour l’instant — h : {h}',
      hi: 'अभी कुछ नहीं देखा — h: {h}',
      id: 'Belum ada yang dilihat — h: {h}',
      pt: 'Nada visto ainda — h: {h}',
    },
    'caption.step': {
      en: 'Step {t}: token {token} · carried-in h: {prev} · new h: {h}',
      ko: '걸음 {t}: 토큰 {token} · 넘겨받은 h: {prev} · 새 h: {h}',
      ja: 'ステップ {t}: トークン {token} · 引き継いだ h: {prev} · 新しい h: {h}',
      zh: '第 {t} 步：令牌 {token} · 传入的 h：{prev} · 新的 h：{h}',
      ar: 'الخطوة {t}: الرمز {token} · h المنقول: {prev} · h الجديد: {h}',
      es: 'Paso {t}: token {token} · h recibido: {prev} · h nuevo: {h}',
      fr: 'Étape {t} : jeton {token} · h reçu : {prev} · nouveau h : {h}',
      hi: 'चरण {t}: टोकन {token} · आया हुआ h: {prev} · नया h: {h}',
      id: 'Langkah {t}: token {token} · h yang diterima: {prev} · h baru: {h}',
      pt: 'Passo {t}: token {token} · h recebido: {prev} · h novo: {h}',
    },
    'caption.same': {
      en: 'h after token {token}: {list}',
      ko: '토큰 {token} 뒤의 h: {list}',
      ja: 'トークン {token} の後の h: {list}',
      zh: '令牌 {token} 之后的 h：{list}',
      ar: 'h بعد الرمز {token}: {list}',
      es: 'h tras el token {token}: {list}',
      fr: 'h après le jeton {token} : {list}',
      hi: 'टोकन {token} के बाद h: {list}',
      id: 'h setelah token {token}: {list}',
      pt: 'h após o token {token}: {list}',
    },
  },
};
