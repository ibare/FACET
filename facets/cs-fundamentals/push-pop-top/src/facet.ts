/**
 * push-pop-top — LIFO 조각 (piece) 의 선언.
 *
 * @piece 질문 하나에만 답한다 — "드나드는 문이 하나뿐이면 무슨 일이 벌어지는가".
 *
 * 완결형 자료구조 facet 이 아니다. 제목도 메트릭도 두지 않는다. 제목은 글의
 * 문단이 주고, 조각은 셀 것이 없다 (S-piece). 컨트롤은 다시 보기와 한 걸음
 * 둘뿐이며 둘 다 눌러야 완성되는 조작이 아니다 — 자동 재생만 보고 지나가도
 * 화면은 할 말을 마친다.
 *
 * 화면에 뜨는 문안은 전부 여기 `messages` 에 있다. projector 와 stage 에는 키만
 * 남는다 (C10).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const pushPopTopFacet: FacetJson = {
  id: 'facet:pushPopTop',
  title: {
    en: 'Push, pop, top',
    ko: '넣기 · 빼기 · 꼭대기',
    ja: 'プッシュ・ポップ・トップ',
    zh: '入栈 · 出栈 · 栈顶',
    ar: 'دفع · سحب · القمة',
    es: 'Apilar, desapilar, cima',
    fr: 'Empiler, dépiler, sommet',
    hi: 'पुश, पॉप, टॉप',
    id: 'Push, pop, top',
    pt: 'Empilhar, desempilhar, topo',
  },
  description: {
    en: 'One opening: the value that went in last is the one that comes out first.',
    ko: '문이 하나뿐이면 마지막에 들어온 것이 먼저 나온다.',
    ja: '出入口がひとつ — 最後に入ったものが先に出る。',
    zh: '只有一个口 — 最后进去的最先出来。',
    ar: 'فتحة واحدة: آخر ما دخل هو أول ما يخرج.',
    es: 'Una sola boca: el último valor que entró es el primero en salir.',
    fr: 'Une seule ouverture : la dernière valeur entrée est la première à sortir.',
    hi: 'सिर्फ़ एक मुँह: जो आख़िर में गया, वही पहले बाहर आता है।',
    id: 'Satu mulut saja: nilai yang masuk terakhir keluar pertama.',
    pt: 'Uma única abertura: o último valor a entrar é o primeiro a sair.',
  },
  algorithm: 'module:pushPopTop',
  projector: 'module:pushPopTopProjector',
  initialData: {
    type: 'push-pop-top',
    /** 넣는 차례. 마지막 값이 꼭대기가 된다. */
    pushes: [3, 7, 1],
    /** 가운데 값 7 의 자리. 위가 걷히기 전에는 꺼낼 수 없음을 여기서 보인다. */
    buriedSlot: 1,
    /** 걸음 간격 — 읽을 시간을 주는 것도 저작 결정이다. */
    stepMs: 460,
    /** 곱씹어야 하는 걸음 (막힘 · 길이 열림) 뒤에 더 머무는 시간. */
    holdMs: 900,
  },
  blocks: {
    stage: { type: 'push-pop-top-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.oneOpening': {
      en: 'One opening. Everything enters and leaves through this end.',
      ko: '열린 곳은 한쪽 끝뿐이다. 넣는 것도 빼는 것도 이 문으로만 다닌다.',
      ja: '開いているのは片端だけ。出るのも入るのもこの口を通る。',
      zh: '只有一端是开的。进出都从这个口。',
      ar: 'فتحة واحدة. كل شيء يدخل ويخرج من هذا الطرف.',
      es: 'Una sola boca. Todo entra y sale por este extremo.',
      fr: 'Une seule ouverture. Tout entre et sort par ce bout.',
      hi: 'खुला हुआ सिर्फ़ एक सिरा है। आना-जाना इसी मुँह से होता है।',
      id: 'Hanya satu mulut. Semua masuk dan keluar lewat ujung ini.',
      pt: 'Uma única abertura. Tudo entra e sai por esta ponta.',
    },
    'caption.push': {
      en: 'Push {value} — it lands on top, and top rises to {top}.',
      ko: '{value} 넣기. 꼭대기에 얹히고 top 이 {top} 까지 오른다.',
      ja: '{value} をプッシュ。てっぺんに乗り、top が {top} まで上がる。',
      zh: '压入 {value} — 落在栈顶，top 升到 {top}。',
      ar: 'ادفع {value} — يستقر في القمة، وترتفع القمة إلى {top}.',
      es: 'Apila {value}: cae en la cima y la cima sube a {top}.',
      fr: 'On empile {value} — il se pose au sommet, et le sommet monte à {top}.',
      hi: '{value} पुश करें — वह ऊपर आ बैठता है, और टॉप {top} तक चढ़ जाता है।',
      id: 'Push {value} — ia mendarat di puncak, dan top naik ke {top}.',
      pt: 'Empilha {value} — ele pousa no topo, e o topo sobe para {top}.',
    },
    'caption.blocked': {
      en: '{value} is buried under {blocker}. No hand reaches past the top.',
      ko: '{blocker} 밑에 깔린 {value}. 꼭대기를 건너뛰고 들어가는 손은 없다.',
      ja: '{value} は {blocker} の下敷きだ。てっぺんを越えて届く手はない。',
      zh: '{value} 被压在 {blocker} 下面。没有手能越过栈顶伸进去。',
      ar: '{value} مدفون تحت {blocker}. ولا يد تتجاوز القمة.',
      es: '{value} está enterrado bajo {blocker}. Ninguna mano pasa por encima de la cima.',
      fr: '{value} est enfoui sous {blocker}. Aucune main ne passe par-dessus le sommet.',
      hi: '{value} {blocker} के नीचे दबा है। कोई हाथ टॉप को लाँघकर नहीं पहुँचता।',
      id: '{value} tertimbun di bawah {blocker}. Tak ada tangan yang bisa melewati puncak.',
      pt: '{value} está soterrado sob {blocker}. Nenhuma mão passa por cima do topo.',
    },
    'caption.pop': {
      en: 'Pop {value} — only the top may leave, so top falls to {top}.',
      ko: '{value} 빼기. 나갈 수 있는 것은 꼭대기뿐이라 top 이 {top} 까지 내린다.',
      ja: '{value} をポップ。出られるのはてっぺんだけなので、top が {top} まで下がる。',
      zh: '弹出 {value} — 只有栈顶能走，于是 top 降到 {top}。',
      ar: 'اسحب {value} — لا يخرج إلا ما في القمة، فتهبط القمة إلى {top}.',
      es: 'Desapila {value}: solo la cima puede salir, así que baja a {top}.',
      fr: 'On dépile {value} — seul le sommet peut partir, donc il descend à {top}.',
      hi: '{value} पॉप करें — सिर्फ़ टॉप ही जा सकता है, इसलिए टॉप {top} तक उतर जाता है।',
      id: 'Pop {value} — hanya puncak yang boleh pergi, jadi top turun ke {top}.',
      pt: 'Desempilha {value} — só o topo pode sair, então o topo cai para {top}.',
    },
    'caption.popUnblocked': {
      en: 'Now {value} is the top. It became reachable only after {blocker} left.',
      ko: '이제 꼭대기는 {value}. 위에 얹혀 있던 {blocker} 부터 걷어 내야 손이 닿는다.',
      ja: 'いまのてっぺんは {value}。上に乗っていた {blocker} をどけて初めて手が届く。',
      zh: '现在栈顶是 {value}。要等压在上面的 {blocker} 走了才够得着。',
      ar: 'القمة الآن {value}. ولم يصر في المتناول إلا بعد أن غادر {blocker}.',
      es: 'Ahora la cima es {value}. Solo quedó al alcance cuando salió {blocker}.',
      fr: "Le sommet est maintenant {value}. Il n'est devenu accessible qu'après le départ de {blocker}.",
      hi: 'अब टॉप {value} है। {blocker} के हटने के बाद ही उस तक हाथ पहुँचा।',
      id: 'Sekarang puncaknya {value}. Ia baru terjangkau setelah {blocker} pergi.',
      pt: 'Agora o topo é {value}. Só ficou ao alcance depois que {blocker} saiu.',
    },
    'caption.lifo': {
      en: 'Last in, first out — the order out is the order in, reversed.',
      ko: '마지막에 들어온 것이 먼저 나온다. 나간 차례는 들어온 차례를 뒤집은 것이다.',
      ja: '後入れ先出し — 出る順は、入った順を逆さにしたものだ。',
      zh: '后进先出 — 出去的顺序，就是进来的顺序倒过来。',
      ar: 'آخر الداخلين أول الخارجين — ترتيب الخروج هو ترتيب الدخول معكوسًا.',
      es: 'El último en entrar es el primero en salir: el orden de salida es el de entrada, al revés.',
      fr: "Dernier entré, premier sorti — l'ordre de sortie est l'ordre d'entrée, inversé.",
      hi: 'जो आख़िर में आया, वही पहले गया — निकलने का क्रम आने के क्रम का उल्टा है।',
      id: 'Masuk terakhir, keluar pertama — urutan keluar adalah urutan masuk yang dibalik.',
      pt: 'Último a entrar, primeiro a sair — a ordem de saída é a de entrada, invertida.',
    },
  },
};
