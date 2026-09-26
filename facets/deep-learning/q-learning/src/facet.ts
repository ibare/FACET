/**
 * Q-러닝과 탐험 — 선언.
 *
 * 구조(복도 · 상 · α · γ · 판 수 · 씨앗 · 사다리)가 1차 데이터다. 끝 칸 · Q · 탐욕 · 센 수는 알고리즘이 셈한다.
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export type QLearningInitialData = {
  type: 'q-learning';
  stepMs: number;
  edgeMs: number;
  rewards: number[];
  terminal: boolean[];
  start: number;
  alpha: number;
  gamma: number;
  episodes: number;
  moveLimit: number;
  seeds: number[];
  epsilonLadder: number[];
  epsilon: number;
};

const initialData: QLearningInitialData = {
  type: 'q-learning',
  stepMs: 250,
  edgeMs: 1200,
  rewards: [3, 0, 0, 10],
  terminal: [true, false, false, true],
  start: 1,
  alpha: 0.6,
  gamma: 0.9,
  episodes: 60,
  moveLimit: 40,
  seeds: [529569037, 1833385716, 484686502, 276192789, 1479166605],
  epsilonLadder: [0, 0.1, 0.2, 0.3, 0.5],
  epsilon: 0.2,
};

export const qLearningFacet: FacetJson = {
  id: 'facet:qLearning',
  title: {
    en: 'Q-learning and exploration',
    ko: 'Q-러닝과 탐험',
    ja: 'Q学習と探索',
    zh: 'Q 学习与探索',
    ar: 'تعلّم Q والاستكشاف',
    es: 'Q-learning y exploración',
    fr: 'Q-learning et exploration',
    hi: 'Q-लर्निंग और अन्वेषण',
    id: 'Q-learning dan eksplorasi',
    pt: 'Q-learning e exploração',
  },
  description: {
    en: 'Five agents learn the same four-cell corridor with Q-learning. Turn ε and watch whether the value of the far, bigger reward flows back to the start.',
    ko: '행위자 다섯이 같은 네 칸 복도를 Q-러닝으로 배운다. ε 을 돌리며 멀리 있는 큰 상의 값이 출발까지 거슬러 번지는지 본다.',
    ja: '5 体のエージェントが同じ 4 マスの廊下を Q 学習で学ぶ。ε を回し、遠くの大きな報酬の価値がスタートまでさかのぼって広がるかを見る。',
    zh: '五个智能体用 Q 学习学习同一条四格走廊。转动 ε，看远处较大奖励的价值是否回传到起点。',
    ar: 'خمسة وكلاء يتعلّمون الممر نفسه ذا الخلايا الأربع بتعلّم Q. غيّر ε وراقب هل تنتقل قيمة المكافأة الكبرى البعيدة عائدةً إلى البداية.',
    es: 'Cinco agentes aprenden el mismo pasillo de cuatro celdas con Q-learning. Gira ε y observa si el valor de la recompensa grande y lejana se propaga hasta el inicio.',
    fr: 'Cinq agents apprennent le même couloir de quatre cases par Q-learning. Tournez ε et regardez si la valeur de la grande récompense lointaine remonte jusqu’au départ.',
    hi: 'पाँच एजेंट एक ही चार खानों वाले गलियारे को Q-लर्निंग से सीखते हैं। ε बदलें और देखें कि दूर के बड़े इनाम का मान शुरुआत तक वापस फैलता है या नहीं।',
    id: 'Lima agen mempelajari lorong empat sel yang sama dengan Q-learning. Putar ε dan lihat apakah nilai hadiah besar yang jauh merambat balik ke awal.',
    pt: 'Cinco agentes aprendem o mesmo corredor de quatro células com Q-learning. Gire ε e veja se o valor da recompensa grande e distante se propaga de volta até o início.',
  },
  algorithm: 'module:qLearning',
  projector: 'module:qLearningProjector',
  initialData,
  layout: {
    type: 'column',
    gap: 12,
    children: [{ ref: 'header' }, { ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'q-learning-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        ...CONTROL_SET.playback,
        {
          widget: 'segmented-slider',
          action: 'epsilon',
          name: 'epsilon',
          label: {
            en: 'Exploration ε',
            ko: '탐험 ε',
            ja: '探索 ε',
            zh: '探索 ε',
            ar: 'الاستكشاف ε',
            es: 'Exploración ε',
            fr: 'Exploration ε',
            hi: 'अन्वेषण ε',
            id: 'Eksplorasi ε',
            pt: 'Exploração ε',
          },
          segments: [
            { value: 0, label: '0' },
            { value: 0.1, label: '0.1' },
            { value: 0.2, label: '0.2', default: true },
            { value: 0.3, label: '0.3' },
            { value: 0.5, label: '0.5' },
          ],
        },
      ],
      metrics: [
        {
          name: 'episode',
          label: { en: 'Episode', ko: '판', ja: 'エピソード', zh: '回合', ar: 'الحلقة', es: 'Episodio', fr: 'Épisode', hi: 'एपिसोड', id: 'Episode', pt: 'Episódio' },
          initial: 0,
        },
        {
          name: 'reached-big',
          label: {
            en: 'Reached big goal',
            ko: '큰 목표 밟아 봄',
            ja: '大ゴール到達',
            zh: '到过大目标',
            ar: 'بلغ الهدف الكبير',
            es: 'Llegó a la meta grande',
            fr: 'Grand but atteint',
            hi: 'बड़ा लक्ष्य छुआ',
            id: 'Pernah ke tujuan besar',
            pt: 'Alcançou meta grande',
          },
          initial: 0,
        },
        {
          name: 'prefer-big',
          label: {
            en: 'Greedy goes right',
            ko: '출발 탐욕 오른쪽',
            ja: '貪欲が右',
            zh: '贪婪向右',
            ar: 'الجشع نحو اليمين',
            es: 'Voraz a la derecha',
            fr: 'Glouton à droite',
            hi: 'लालची दाएँ',
            id: 'Serakah ke kanan',
            pt: 'Guloso à direita',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      ir: 'ir:q-learning-imperative',
      label: {
        en: 'Choose and update',
        ko: '고르기와 갱신',
        ja: '選択と更新',
        zh: '选择与更新',
        ar: 'الاختيار والتحديث',
        es: 'Elegir y actualizar',
        fr: 'Choisir et mettre à jour',
        hi: 'चुनना और अद्यतन',
        id: 'Memilih dan memperbarui',
        pt: 'Escolher e atualizar',
      },
    },
  },
  messages: {
    'label.environment': {
      en: 'Environment', ko: '환경', ja: '環境', zh: '环境', ar: 'البيئة', es: 'Entorno', fr: 'Environnement', hi: 'परिवेश', id: 'Lingkungan', pt: 'Ambiente',
    },
    'label.smallGoal': {
      en: 'Small goal', ko: '작은 목표', ja: '小さなゴール', zh: '小目标', ar: 'الهدف الصغير', es: 'Meta pequeña', fr: 'Petit but', hi: 'छोटा लक्ष्य', id: 'Tujuan kecil', pt: 'Meta pequena',
    },
    'label.bigGoal': {
      en: 'Big goal', ko: '큰 목표', ja: '大きなゴール', zh: '大目标', ar: 'الهدف الكبير', es: 'Meta grande', fr: 'Grand but', hi: 'बड़ा लक्ष्य', id: 'Tujuan besar', pt: 'Meta grande',
    },
    'label.start': {
      en: 'Start', ko: '출발', ja: 'スタート', zh: '起点', ar: 'البداية', es: 'Inicio', fr: 'Départ', hi: 'शुरुआत', id: 'Awal', pt: 'Início',
    },
    'label.reward': {
      en: 'reward {r}', ko: '상 {r}', ja: '報酬 {r}', zh: '奖励 {r}', ar: 'المكافأة {r}', es: 'recompensa {r}', fr: 'récompense {r}', hi: 'इनाम {r}', id: 'hadiah {r}', pt: 'recompensa {r}',
    },
    'label.agentsHold': {
      en: 'What each agent holds',
      ko: '행위자가 가진 것',
      ja: '各エージェントが持つもの',
      zh: '每个智能体所持有的',
      ar: 'ما يملكه كل وكيل',
      es: 'Lo que tiene cada agente',
      fr: 'Ce que chaque agent détient',
      hi: 'हर एजेंट के पास क्या है',
      id: 'Yang dimiliki tiap agen',
      pt: 'O que cada agente tem',
    },
    'label.greedy': {
      en: 'Greedy', ko: '탐욕', ja: '貪欲', zh: '贪婪', ar: 'الجشع', es: 'Voraz', fr: 'Glouton', hi: 'लालची', id: 'Serakah', pt: 'Guloso',
    },
    'label.qLeft': {
      en: 'value of going left',
      ko: '왼쪽으로 가는 값',
      ja: '左へ行く価値',
      zh: '向左走的价值',
      ar: 'قيمة الذهاب يسارًا',
      es: 'valor de ir a la izquierda',
      fr: 'valeur d’aller à gauche',
      hi: 'बाएँ जाने का मान',
      id: 'nilai ke kiri',
      pt: 'valor de ir à esquerda',
    },
    'label.qRight': {
      en: 'value of going right',
      ko: '오른쪽으로 가는 값',
      ja: '右へ行く価値',
      zh: '向右走的价值',
      ar: 'قيمة الذهاب يمينًا',
      es: 'valor de ir a la derecha',
      fr: 'valeur d’aller à droite',
      hi: 'दाएँ जाने का मान',
      id: 'nilai ke kanan',
      pt: 'valor de ir à direita',
    },
    'label.agent': {
      en: 'Agent {n}', ko: '행위자 {n}', ja: 'エージェント {n}', zh: '智能体 {n}', ar: 'الوكيل {n}', es: 'Agente {n}', fr: 'Agent {n}', hi: 'एजेंट {n}', id: 'Agen {n}', pt: 'Agente {n}',
    },
    'caption.roundTitle': {
      en: 'ε {epsilon} · before episode 1',
      ko: 'ε {epsilon} · 판 1 앞',
      ja: 'ε {epsilon} · エピソード 1 の前',
      zh: 'ε {epsilon} · 第 1 回合之前',
      ar: 'ε {epsilon} · قبل الحلقة 1',
      es: 'ε {epsilon} · antes del episodio 1',
      fr: 'ε {epsilon} · avant l’épisode 1',
      hi: 'ε {epsilon} · एपिसोड 1 से पहले',
      id: 'ε {epsilon} · sebelum episode 1',
      pt: 'ε {epsilon} · antes do episódio 1',
    },
    'caption.roundBody': {
      en: 'All {agents} agents stand at the start. Largest Q: {qMax}',
      ko: '행위자 {agents}명 모두 출발 칸에 있다. 가장 큰 Q: {qMax}',
      ja: 'エージェント {agents} 体すべてがスタートにいる。最大の Q: {qMax}',
      zh: '全部 {agents} 个智能体都在起点。最大的 Q: {qMax}',
      ar: 'الوكلاء الـ {agents} كلهم عند البداية. أكبر Q: {qMax}',
      es: 'Los {agents} agentes están en el inicio. Q más grande: {qMax}',
      fr: 'Les {agents} agents sont au départ. Plus grand Q : {qMax}',
      hi: 'सभी {agents} एजेंट शुरुआत पर हैं। सबसे बड़ा Q: {qMax}',
      id: 'Semua {agents} agen ada di awal. Q terbesar: {qMax}',
      pt: 'Os {agents} agentes estão no início. Maior Q: {qMax}',
    },
    'caption.episodeTitle': {
      en: 'ε {epsilon} · episode {episode}/{episodes}',
      ko: 'ε {epsilon} · 판 {episode}/{episodes}',
      ja: 'ε {epsilon} · エピソード {episode}/{episodes}',
      zh: 'ε {epsilon} · 回合 {episode}/{episodes}',
      ar: 'ε {epsilon} · الحلقة {episode}/{episodes}',
      es: 'ε {epsilon} · episodio {episode}/{episodes}',
      fr: 'ε {epsilon} · épisode {episode}/{episodes}',
      hi: 'ε {epsilon} · एपिसोड {episode}/{episodes}',
      id: 'ε {epsilon} · episode {episode}/{episodes}',
      pt: 'ε {epsilon} · episódio {episode}/{episodes}',
    },
    'caption.episodeBody': {
      en: 'Ended at the big goal: {bigNow}/{agents} · Ever reached it: {reached}/{agents} · Greedy at the start points right: {prefer}/{agents}',
      ko: '이번 판 큰 목표에서 끝남: {bigNow}/{agents} · 밟아 본 행위자: {reached}/{agents} · 출발 탐욕 오른쪽: {prefer}/{agents}',
      ja: '今回大きなゴールで終了: {bigNow}/{agents} · 到達経験あり: {reached}/{agents} · スタートの貪欲が右: {prefer}/{agents}',
      zh: '本回合止于大目标: {bigNow}/{agents} · 曾到过: {reached}/{agents} · 起点贪婪向右: {prefer}/{agents}',
      ar: 'انتهى عند الهدف الكبير: {bigNow}/{agents} · بلغه من قبل: {reached}/{agents} · الجشع عند البداية يمينًا: {prefer}/{agents}',
      es: 'Terminó en la meta grande: {bigNow}/{agents} · La alcanzó alguna vez: {reached}/{agents} · Voraz en el inicio a la derecha: {prefer}/{agents}',
      fr: 'Fini au grand but : {bigNow}/{agents} · L’a déjà atteint : {reached}/{agents} · Glouton au départ vers la droite : {prefer}/{agents}',
      hi: 'बड़े लक्ष्य पर खत्म: {bigNow}/{agents} · कभी पहुँचा: {reached}/{agents} · शुरुआत पर लालची दाएँ: {prefer}/{agents}',
      id: 'Berakhir di tujuan besar: {bigNow}/{agents} · Pernah mencapainya: {reached}/{agents} · Serakah di awal ke kanan: {prefer}/{agents}',
      pt: 'Terminou na meta grande: {bigNow}/{agents} · Já a alcançou: {reached}/{agents} · Guloso no início à direita: {prefer}/{agents}',
    },
    'caption.finalTitle': {
      en: 'ε {epsilon} · after {episodes} episodes, read the greedy action at the start',
      ko: 'ε {epsilon} · 판 {episodes} 뒤 출발 칸의 탐욕 읽기',
      ja: 'ε {epsilon} · {episodes} エピソード後、スタートの貪欲な行動を読む',
      zh: 'ε {epsilon} · {episodes} 回合后读取起点的贪婪行动',
      ar: 'ε {epsilon} · بعد {episodes} حلقة، اقرأ الفعل الجشع عند البداية',
      es: 'ε {epsilon} · tras {episodes} episodios, lee la acción voraz en el inicio',
      fr: 'ε {epsilon} · après {episodes} épisodes, lire l’action gloutonne au départ',
      hi: 'ε {epsilon} · {episodes} एपिसोड के बाद शुरुआत पर लालची क्रिया पढ़ें',
      id: 'ε {epsilon} · setelah {episodes} episode, baca aksi serakah di awal',
      pt: 'ε {epsilon} · após {episodes} episódios, leia a ação gulosa no início',
    },
    'caption.finalBody': {
      en: 'Right, toward the big goal: {prefer}/{agents} · Left, toward the small goal: {left}/{agents}',
      ko: '오른쪽(큰 목표 쪽): {prefer}/{agents} · 왼쪽(작은 목표 쪽): {left}/{agents}',
      ja: '右(大きなゴール側): {prefer}/{agents} · 左(小さなゴール側): {left}/{agents}',
      zh: '向右(大目标一侧): {prefer}/{agents} · 向左(小目标一侧): {left}/{agents}',
      ar: 'يمينًا نحو الهدف الكبير: {prefer}/{agents} · يسارًا نحو الهدف الصغير: {left}/{agents}',
      es: 'Derecha, hacia la meta grande: {prefer}/{agents} · Izquierda, hacia la meta pequeña: {left}/{agents}',
      fr: 'Droite, vers le grand but : {prefer}/{agents} · Gauche, vers le petit but : {left}/{agents}',
      hi: 'दाएँ, बड़े लक्ष्य की ओर: {prefer}/{agents} · बाएँ, छोटे लक्ष्य की ओर: {left}/{agents}',
      id: 'Kanan, ke tujuan besar: {prefer}/{agents} · Kiri, ke tujuan kecil: {left}/{agents}',
      pt: 'Direita, rumo à meta grande: {prefer}/{agents} · Esquerda, rumo à meta pequena: {left}/{agents}',
    },
  },
};
