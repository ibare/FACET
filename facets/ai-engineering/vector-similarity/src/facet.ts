/**
 * vectorSimilarity — 완제품.
 *
 * 손잡이 하나가 논증을 진다. 재는 법을 갈아 끼우면 같은 다섯이 서로 지나치며
 * 순위 자리를 맞바꾼다. 그래서 알고리즘은 `mechanismKind: 'reactive'` 로
 * 등록한다 — 선언 자리는 이 파일이 아니라 `index.ts` 다.
 *
 * 코드 패널은 두지 않는다. 까닭은 `irs.ts` 의 머리말에 적었다.
 *
 * 1차 데이터는 점 여섯의 정수 좌표뿐이다. 길이 · 코사인 · 거리 · 내적 · 순위는
 * 전부 algorithm 이 셈한다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const vectorSimilarityFacet: FacetJson = {
  id: 'facet:vectorSimilarity',
  title: {
    en: 'Vector similarity',
    ko: '벡터 유사도',
    ja: 'ベクトル類似度',
    zh: '向量相似度',
    ar: 'تشابه المتجهات',
    es: 'Similitud de vectores',
    fr: 'Similarité vectorielle',
    hi: 'सदिश समानता',
    id: 'Kemiripan vektor',
    pt: 'Similaridade de vetores',
  },
  description: {
    en: 'What you measure with decides who counts as close.',
    ko: '무엇으로 재느냐가 누가 닮았는지를 바꾼다.',
    ja: '何で測るかが、誰が似ているかを変える。',
    zh: '用什么来量，决定了谁算相近。',
    ar: 'أداة القياس هي التي تحدد من يُعدّ قريبًا.',
    es: 'Con qué mides decide quién resulta cercano.',
    fr: "L'outil de mesure décide qui compte comme proche.",
    hi: 'आप किससे मापते हैं, यही तय करता है कि कौन निकट है।',
    id: 'Alat ukur yang dipakai menentukan siapa yang dianggap dekat.',
    pt: 'Aquilo com que você mede decide quem conta como próximo.',
  },
  algorithm: 'module:vectorSimilarity',
  projector: 'module:vectorSimilarityProjector',
  initialData: {
    type: 'vector-similarity',
    query: { id: 'q', x: 4, y: 3 },
    candidates: [
      { id: 'P', x: 2, y: 6 },
      { id: 'Q', x: 8, y: 6 },
      { id: 'R', x: 5, y: 1 },
      { id: 'S', x: 1, y: 2 },
      { id: 'T', x: 1, y: 6 },
    ],
    stepMs: 460,
  },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'vector-similarity-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          // 손잡이 이름은 `measure` 다 — 저장소의 다른 손잡이가 전부 재는 대상을
          // 그대로 부르고(`depth` · `nprobe` · `parts` · `dims`), `metric` 은 같은
          // 파일의 `metrics[]` · `ctx.metric` 과 낱말이 겹쳐 읽는 사람이 계기와
          // 헷갈린다. 코어 예약어(play·pause·step·reset·speed)와는 어느 쪽도
          // 충돌하지 않는다.
          action: 'measure',
          name: 'measure',
          label: {
            en: 'Measure',
            ko: '재는 법',
            ja: '測り方',
            zh: '度量方式',
            ar: 'طريقة القياس',
            es: 'Medida',
            fr: 'Mesure',
            hi: 'माप',
            id: 'Ukuran',
            pt: 'Medida',
          },
          // 구간 라벨은 그 분야에서 원어 그대로 통용되는 표식이라 단일 문자열이다.
          // LocaleStr 표로 적으면 열 언어를 요구받는데, 번역하면 오히려 화면의
          // 수식 표기와 어긋난다 (C10 표식 판정 2).
          segments: [
            { value: 0, label: 'cosine', default: true },
            { value: 1, label: 'euclidean' },
            { value: 2, label: 'dot' },
          ],
        },
      ],
      metrics: [
        {
          name: 'measure-count',
          label: {
            en: 'Measured',
            ko: '잰 후보',
            ja: '測った候補',
            zh: '已量候选',
            ar: 'المقاسة',
            es: 'Medidos',
            fr: 'Mesurés',
            hi: 'मापे गए',
            id: 'Terukur',
            pt: 'Medidos',
          },
          initial: 0,
        },
        {
          name: 'rank-change-count',
          label: {
            en: 'Moved',
            ko: '자리 바뀜',
            ja: '入れ替わり',
            zh: '位置变动',
            ar: 'تبدّلوا',
            es: 'Movidos',
            fr: 'Déplacés',
            hi: 'स्थान बदले',
            id: 'Berpindah',
            pt: 'Movidos',
          },
          initial: 0,
        },
      ],
    },
  },
  messages: {
    'label.query': {
      en: 'query',
      ko: '질의',
      ja: 'クエリ',
      zh: '查询',
      ar: 'الاستعلام',
      es: 'consulta',
      fr: 'requête',
      hi: 'प्रश्न',
      id: 'kueri',
      pt: 'consulta',
    },
    'label.rank': {
      en: 'rank',
      ko: '순위',
      ja: '順位',
      zh: '排名',
      ar: 'الترتيب',
      es: 'puesto',
      fr: 'rang',
      hi: 'क्रम',
      id: 'peringkat',
      pt: 'posição',
    },
    'caption.ruler': {
      en: 'Ruler in hand: {measure}.',
      ko: '지금 잡은 자 — {measure}.',
      ja: '今手にしている物差し — {measure}.',
      zh: '此刻手中的尺 — {measure}.',
      ar: 'المقياس المستخدم الآن — {measure}.',
      es: 'Regla en uso: {measure}.',
      fr: 'Mesure employée : {measure}.',
      hi: 'अभी चुना गया मापदंड — {measure}.',
      id: 'Alat ukur yang dipakai: {measure}.',
      pt: 'Régua em uso: {measure}.',
    },
    'caption.top': {
      en: 'Closest by this ruler: {name}.',
      ko: '이 자로 가장 가까운 것: {name}.',
      ja: 'この物差しで最も近いもの: {name}.',
      zh: '按这把尺最近的是: {name}.',
      ar: 'الأقرب بهذا المقياس: {name}.',
      es: 'El más cercano con esta regla: {name}.',
      fr: 'Le plus proche avec cette mesure : {name}.',
      hi: 'इस मापदंड से सबसे निकट: {name}.',
      id: 'Yang terdekat dengan alat ukur ini: {name}.',
      pt: 'O mais próximo por esta régua: {name}.',
    },
    'caption.moved': {
      en: 'Candidates that changed places: {n}.',
      ko: '자리를 옮긴 후보: {n}.',
      ja: '順位が入れ替わった候補: {n}.',
      zh: '换了位置的候选: {n}.',
      ar: 'المرشحون الذين تبدلت مواضعهم: {n}.',
      es: 'Candidatos que cambiaron de lugar: {n}.',
      fr: 'Candidats qui ont changé de place : {n}.',
      hi: 'स्थान बदलने वाले उम्मीदवार: {n}.',
      id: 'Kandidat yang berpindah tempat: {n}.',
      pt: 'Candidatos que trocaram de lugar: {n}.',
    },
    'caption.same': {
      en: 'Back to the reference order. This is the one the others are measured against.',
      ko: '기준 차례로 돌아왔다. 나머지는 이것과 견준다.',
      ja: '基準の並びに戻った。ほかはこれと見比べる。',
      zh: '回到了对照次序。其余的都与这一次序相比。',
      ar: 'عُدنا إلى الترتيب المرجعي. وبه تُقاس البقية.',
      es: 'De vuelta al orden de referencia. Con él se comparan los demás.',
      fr: "Retour à l'ordre de référence. C'est à lui que les autres se comparent.",
      hi: 'आधार क्रम पर वापस। बाकी की तुलना इसी से होती है।',
      id: 'Kembali ke urutan pembanding. Yang lain diukur terhadap ini.',
      pt: 'De volta à ordem de referência. É com ela que as outras se comparam.',
    },
  },
};
