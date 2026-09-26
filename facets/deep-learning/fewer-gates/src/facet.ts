import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * @piece
 * 질문: GRU 는 LSTM 보다 문이 하나 적고 셀도 없다 — 그러고도 앞에서 들인 값을 지니는가, 무엇을 합쳐서 줄였는가.
 */
export const fewerGatesFacet: FacetJson = {
  id: 'facet:fewerGates',
  title: {
    en: 'Fewer gates, same job',
    ko: '문을 줄여 같은 일을',
    ja: 'ゲートを減らして同じ仕事を',
    zh: '更少的门，做同样的事',
    ar: 'بوابات أقل للمهمة نفسها',
    es: 'Menos puertas, la misma tarea',
    fr: 'Moins de portes, même travail',
    hi: 'कम गेट, वही काम',
    id: 'Gerbang lebih sedikit, tugas yang sama',
    pt: 'Menos portas, o mesmo trabalho',
  },
  description: {
    en: 'An LSTM sets how much to keep and how much to take in with two separate gates and carries both c and h. A GRU binds the two into one gate z — keep z, take in 1 − z — and carries h alone.',
    ko: 'LSTM 은 남길 몫과 들일 몫을 두 문으로 따로 정하고 c 와 h 를 함께 넘긴다. GRU 는 둘을 문 z 하나로 묶어 z 만큼 지키고 1 − z 만큼 들이며, h 하나만 넘긴다.',
    ja: 'LSTM は残す分と取り込む分を二つのゲートで別々に決め、c と h の両方を渡す。GRU は二つを一つのゲート z にまとめ、z だけ保ち 1 − z だけ取り込み、h だけを渡す。',
    zh: 'LSTM 用两个门分别决定保留多少、吸收多少，并同时传递 c 和 h。GRU 把两者合成一个门 z——保留 z，吸收 1 − z——只传递 h。',
    ar: 'تحدد LSTM ما تُبقيه وما تأخذه ببوابتين منفصلتين وتنقل c و h معًا. أما GRU فتربطهما في بوابة واحدة z — تُبقي z وتأخذ 1 − z — وتنقل h وحدها.',
    es: 'Una LSTM fija cuánto conservar y cuánto incorporar con dos puertas separadas y transporta c y h. Una GRU une ambas en una sola puerta z —conserva z, incorpora 1 − z— y transporta solo h.',
    fr: 'Une LSTM fixe la part à garder et la part à intégrer avec deux portes distinctes et transmet c et h. Une GRU lie les deux en une seule porte z — garder z, intégrer 1 − z — et ne transmet que h.',
    hi: 'LSTM दो अलग गेटों से तय करता है कि कितना रखना है और कितना लेना है, और c तथा h दोनों आगे भेजता है। GRU दोनों को एक गेट z में बाँध देता है — z रखता है, 1 − z लेता है — और केवल h भेजता है।',
    id: 'LSTM menentukan bagian yang disimpan dan bagian yang diambil dengan dua gerbang terpisah serta membawa c dan h. GRU mengikat keduanya menjadi satu gerbang z — simpan z, ambil 1 − z — dan hanya membawa h.',
    pt: 'Uma LSTM define quanto manter e quanto absorver com duas portas separadas e transporta c e h. Uma GRU une as duas numa única porta z — mantém z, absorve 1 − z — e transporta apenas h.',
  },
  algorithm: 'module:fewerGates',
  scene: 'module:fewerGatesScene',
  initialData: {
    type: 'fewer-gates',
    stepMs: 2600,
    inputs: [-1, 0, 0, 0],
    lstm: {
      name: 'LSTM',
      c0: 0,
      h0: 0,
      f: { wx: 0, wh: 0, b: 3 },
      i: { wx: -3, wh: 0, b: -2 },
      g: { wx: 3, wh: 1, b: 0 },
      o: { wx: 0, wh: 0, b: 1.5 },
    },
    gru: {
      name: 'GRU',
      h0: 0,
      z: { wx: 4, wh: 0, b: 2.5 },
      r: { wx: 0, wh: 0, b: -1 },
      cand: { wx: 3, wh: 1, b: 0 },
    },
    symbols: {
      x: 'x',
      c: 'c',
      h: 'h',
      f: 'f',
      i: 'i',
      g: 'g',
      o: 'o',
      z: 'z',
      rest: '1−z',
      r: 'r',
      cand: 'h̃',
    },
  },
  shuffleOnReset: false,
  messages: {
    'label.input': {
      en: 'Input', ko: '입력', ja: '入力', zh: '输入', ar: 'المدخل', es: 'Entrada', fr: 'Entrée', hi: 'इनपुट', id: 'Masukan', pt: 'Entrada',
    },
    'label.gates': {
      en: 'Gates: {n}', ko: '문: {n}', ja: 'ゲート: {n}', zh: '门: {n}', ar: 'البوابات: {n}', es: 'Puertas: {n}', fr: 'Portes : {n}', hi: 'गेट: {n}', id: 'Gerbang: {n}', pt: 'Portas: {n}',
    },
    'label.states': {
      en: 'States carried: {n}', ko: '넘기는 상태: {n}', ja: '渡す状態: {n}', zh: '传递的状态: {n}', ar: 'الحالات المنقولة: {n}', es: 'Estados transportados: {n}', fr: 'États transmis : {n}', hi: 'आगे भेजी अवस्थाएँ: {n}', id: 'Keadaan yang dibawa: {n}', pt: 'Estados transportados: {n}',
    },
    'label.weights': {
      en: 'Weights: {n}', ko: '무게: {n}', ja: '重み: {n}', zh: '权重: {n}', ar: 'الأوزان: {n}', es: 'Pesos: {n}', fr: 'Poids : {n}', hi: 'भार: {n}', id: 'Bobot: {n}', pt: 'Pesos: {n}',
    },
    'label.evals': {
      en: 'Gate evaluations: {n}', ko: '문을 셈한 횟수: {n}', ja: 'ゲート計算回数: {n}', zh: '门的计算次数: {n}', ar: 'مرات حساب البوابات: {n}', es: 'Cálculos de puertas: {n}', fr: 'Calculs de portes : {n}', hi: 'गेट गणनाएँ: {n}', id: 'Hitungan gerbang: {n}', pt: 'Cálculos de portas: {n}',
    },
    'label.seg': {
      en: '{name} {sym} = {v}', ko: '{name} {sym} = {v}', ja: '{name} {sym} = {v}', zh: '{name} {sym} = {v}', ar: '{name} {sym} = {v}', es: '{name} {sym} = {v}', fr: '{name} {sym} = {v}', hi: '{name} {sym} = {v}', id: '{name} {sym} = {v}', pt: '{name} {sym} = {v}',
    },
    'name.forget': {
      en: 'forget gate', ko: '잊는 문', ja: '忘却ゲート', zh: '遗忘门', ar: 'بوابة النسيان', es: 'puerta de olvido', fr: "porte d'oubli", hi: 'भूल गेट', id: 'gerbang lupa', pt: 'porta de esquecimento',
    },
    'name.inputGate': {
      en: 'input gate', ko: '들이는 문', ja: '入力ゲート', zh: '输入门', ar: 'بوابة الإدخال', es: 'puerta de entrada', fr: "porte d'entrée", hi: 'इनपुट गेट', id: 'gerbang masukan', pt: 'porta de entrada',
    },
    'name.update': {
      en: 'update gate', ko: '갱신 문', ja: '更新ゲート', zh: '更新门', ar: 'بوابة التحديث', es: 'puerta de actualización', fr: 'porte de mise à jour', hi: 'अपडेट गेट', id: 'gerbang pembaruan', pt: 'porta de atualização',
    },
    'name.takeIn': {
      en: 'take-in share', ko: '들일 몫', ja: '取り込む分', zh: '吸收份额', ar: 'حصة الإدخال', es: 'parte incorporada', fr: 'part intégrée', hi: 'लेने का हिस्सा', id: 'bagian yang diambil', pt: 'parte absorvida',
    },
    'name.candidate': {
      en: 'candidate', ko: '후보', ja: '候補', zh: '候选', ar: 'المرشّح', es: 'candidato', fr: 'candidat', hi: 'उम्मीदवार', id: 'kandidat', pt: 'candidato',
    },
    'name.output': {
      en: 'output gate', ko: '내보내는 문', ja: '出力ゲート', zh: '输出门', ar: 'بوابة الإخراج', es: 'puerta de salida', fr: 'porte de sortie', hi: 'आउटपुट गेट', id: 'gerbang keluaran', pt: 'porta de saída',
    },
    'name.reset': {
      en: 'reset gate', ko: '리셋 문', ja: 'リセットゲート', zh: '重置门', ar: 'بوابة إعادة الضبط', es: 'puerta de reinicio', fr: 'porte de réinitialisation', hi: 'रीसेट गेट', id: 'gerbang reset', pt: 'porta de reinício',
    },
    'label.sum': {
      en: 'Sum: {v}', ko: '합: {v}', ja: '和: {v}', zh: '和: {v}', ar: 'المجموع: {v}', es: 'Suma: {v}', fr: 'Somme : {v}', hi: 'योग: {v}', id: 'Jumlah: {v}', pt: 'Soma: {v}',
    },
    'label.cSplit': {
      en: 'kept {a} + taken {b}', ko: '남긴 {a} + 들인 {b}', ja: '残した {a} + 取り込んだ {b}', zh: '保留 {a} + 吸收 {b}', ar: 'المُبقى {a} + المأخوذ {b}', es: 'conservado {a} + incorporado {b}', fr: 'gardé {a} + intégré {b}', hi: 'रखा {a} + लिया {b}', id: 'disimpan {a} + diambil {b}', pt: 'mantido {a} + absorvido {b}',
    },
    'label.hSplit': {
      en: 'kept {a} + taken {b}', ko: '지킨 {a} + 들인 {b}', ja: '保った {a} + 取り込んだ {b}', zh: '保留 {a} + 吸收 {b}', ar: 'المُبقى {a} + المأخوذ {b}', es: 'conservado {a} + incorporado {b}', fr: 'gardé {a} + intégré {b}', hi: 'रखा {a} + लिया {b}', id: 'disimpan {a} + diambil {b}', pt: 'mantido {a} + absorvido {b}',
    },
    'label.lstmH': {
      en: '{o} × tanh({c})', ko: '{o} × tanh({c})', ja: '{o} × tanh({c})', zh: '{o} × tanh({c})', ar: '{o} × tanh({c})', es: '{o} × tanh({c})', fr: '{o} × tanh({c})', hi: '{o} × tanh({c})', id: '{o} × tanh({c})', pt: '{o} × tanh({c})',
    },
    'caption.start': {
      en: 'Same inputs for both models. States carried — {ln}: {l} · {gn}: {g}.',
      ko: '두 모형이 같은 입력을 받는다. 넘기는 상태 — {ln}: {l} · {gn}: {g}.',
      ja: '二つのモデルは同じ入力を受け取る。渡す状態 — {ln}: {l} · {gn}: {g}。',
      zh: '两个模型接收相同的输入。传递的状态 — {ln}: {l} · {gn}: {g}。',
      ar: 'يتلقى النموذجان المدخلات نفسها. الحالات المنقولة — {ln}: {l} · {gn}: {g}.',
      es: 'Ambos modelos reciben las mismas entradas. Estados transportados — {ln}: {l} · {gn}: {g}.',
      fr: 'Les deux modèles reçoivent les mêmes entrées. États transmis — {ln} : {l} · {gn} : {g}.',
      hi: 'दोनों मॉडल एक ही इनपुट पाते हैं। आगे भेजी अवस्थाएँ — {ln}: {l} · {gn}: {g}।',
      id: 'Kedua model menerima masukan yang sama. Keadaan yang dibawa — {ln}: {l} · {gn}: {g}.',
      pt: 'Os dois modelos recebem as mesmas entradas. Estados transportados — {ln}: {l} · {gn}: {g}.',
    },
    'caption.step': {
      en: 'Input: {x}. Gates computed this step — {ln}: {nl} · {gn}: {ng}.',
      ko: '입력: {x}. 이번 걸음에 셈한 문 — {ln}: {nl} · {gn}: {ng}.',
      ja: '入力: {x}。このステップで計算したゲート — {ln}: {nl} · {gn}: {ng}。',
      zh: '输入: {x}。本步计算的门 — {ln}: {nl} · {gn}: {ng}。',
      ar: 'المدخل: {x}. البوابات المحسوبة في هذه الخطوة — {ln}: {nl} · {gn}: {ng}.',
      es: 'Entrada: {x}. Puertas calculadas en este paso — {ln}: {nl} · {gn}: {ng}.',
      fr: 'Entrée : {x}. Portes calculées à cette étape — {ln} : {nl} · {gn} : {ng}.',
      hi: 'इनपुट: {x}। इस चरण में गणना किए गेट — {ln}: {nl} · {gn}: {ng}।',
      id: 'Masukan: {x}. Gerbang yang dihitung di langkah ini — {ln}: {nl} · {gn}: {ng}.',
      pt: 'Entrada: {x}. Portas calculadas neste passo — {ln}: {nl} · {gn}: {ng}.',
    },
    'caption.end': {
      en: 'First input: {x}. Final {hs} — {ln}: {lh} · {gn}: {gh}.',
      ko: '첫 입력: {x}. 마지막 {hs} — {ln}: {lh} · {gn}: {gh}.',
      ja: '最初の入力: {x}。最後の {hs} — {ln}: {lh} · {gn}: {gh}。',
      zh: '第一个输入: {x}。最后的 {hs} — {ln}: {lh} · {gn}: {gh}。',
      ar: 'المدخل الأول: {x}. قيمة {hs} الأخيرة — {ln}: {lh} · {gn}: {gh}.',
      es: 'Primera entrada: {x}. {hs} final — {ln}: {lh} · {gn}: {gh}.',
      fr: 'Première entrée : {x}. {hs} final — {ln} : {lh} · {gn} : {gh}.',
      hi: 'पहला इनपुट: {x}। अंतिम {hs} — {ln}: {lh} · {gn}: {gh}।',
      id: 'Masukan pertama: {x}. {hs} akhir — {ln}: {lh} · {gn}: {gh}.',
      pt: 'Primeira entrada: {x}. {hs} final — {ln}: {lh} · {gn}: {gh}.',
    },
  },
  blocks: {
    stage: { type: 'fewer-gates-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
