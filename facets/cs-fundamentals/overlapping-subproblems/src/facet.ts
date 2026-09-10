/**
 * overlappingSubproblems facet JSON 선언.
 *
 * @piece 조각 — "재귀 정의를 곧이곧대로 따르면 같은 항을 몇 번이나 다시
 * 푸는가" 하나에만 답한다. 캔버스와 컨트롤바뿐이라 `layout` 은 러너에 맡기고,
 * 제목(title-block)과 metrics 는 두지 않는다 (S-piece).
 *
 * 진행 모델은 reactive — mount 하면 스스로 펼치기 시작하고, 걸음 간격은
 * `initialData.stepMs` 가 정한다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const overlappingSubproblemsFacet: FacetJson = {
  id: 'facet:overlappingSubproblems',
  title: {
    en: 'Overlapping Subproblems',
    ko: '중복 부분 문제',
    ja: '重なり合う部分問題',
    zh: '重叠子问题',
    ar: 'مسائل جزئية متداخلة',
    es: 'Subproblemas superpuestos',
    fr: 'Sous-problèmes chevauchants',
    hi: 'अतिव्यापी उपसमस्याएँ',
    id: 'Submasalah yang tumpang tindih',
    pt: 'Subproblemas sobrepostos',
  },
  description: {
    en: 'Follow the recursive definition literally and the same term sprouts again and again on different branches',
    ko: '재귀 정의를 곧이곧대로 따르면 같은 항이 다른 가지에서 자꾸 다시 돋는다',
    ja: '再帰定義をそのままたどると、同じ項が別の枝で何度も芽を出す',
    zh: '照搬递归定义，同一项就会在不同分支上一再冒出来',
    ar: 'اتبع التعريف التعاودي حرفيًا فينبت الحد نفسه مرارًا على فروع مختلفة',
    es: 'Sigue la definición recursiva al pie de la letra y el mismo término brota una y otra vez en ramas distintas',
    fr: 'Suivez la définition récursive à la lettre et le même terme repousse encore et encore sur des branches différentes',
    hi: 'पुनरावर्ती परिभाषा को अक्षरशः निभाएँ तो वही पद अलग-अलग शाखाओं पर बार-बार उग आता है',
    id: 'Ikuti definisi rekursif apa adanya, dan suku yang sama tumbuh lagi dan lagi di cabang berbeda',
    pt: 'Siga a definição recursiva à risca e o mesmo termo brota vezes sem conta em ramos diferentes',
  },
  algorithm: 'module:overlappingSubproblems',
  projector: 'module:overlappingSubproblemsProjector',
  initialData: {
    type: 'overlapping-subproblems',
    n: 5,
    stepMs: 600,
  },
  messages: {
    'caption.newTerm': {
      en: 'f({n}) — solving this term for the first time',
      ko: 'f({n}) — 처음 푸는 항이다',
      ja: 'f({n}) — この項を解くのは初めてだ',
      zh: 'f({n}) — 这一项是头一次求解',
      ar: 'f({n}) — نحلّ هذا الحد لأول مرة',
      es: 'f({n}) — es la primera vez que se resuelve este término',
      fr: 'f({n}) — ce terme est résolu pour la première fois',
      hi: 'f({n}) — यह पद पहली बार हल हो रहा है',
      id: 'f({n}) — suku ini baru pertama kali diselesaikan',
      pt: 'f({n}) — este termo é resolvido pela primeira vez',
    },
    'caption.repeatTerm': {
      en: 'f({n}) turns up again — that is {count} times now',
      ko: 'f({n}) 이 또 나왔다 — 이걸로 {count} 번째다',
      ja: 'f({n}) がまた出た — これで {count} 回目だ',
      zh: 'f({n}) 又冒出来了 — 这已是第 {count} 次',
      ar: 'f({n}) يظهر مرة أخرى — وهذه المرة {count}',
      es: 'f({n}) vuelve a aparecer: ya van {count} veces',
      fr: 'f({n}) revient — cela fait {count} fois',
      hi: 'f({n}) फिर आ गया — यह {count}वीं बार है',
      id: 'f({n}) muncul lagi — ini yang ke-{count}',
      pt: 'f({n}) aparece de novo — já são {count} vezes',
    },
    'caption.summary': {
      en: '{calls} calls to reach {value}, yet only {distinct} different terms — f({worst}) alone was solved {count} times',
      ko: '{value} 하나를 얻는 데 {calls} 번 — 서로 다른 항은 {distinct} 개뿐인데 f({worst}) 만 {count} 번 풀렸다',
      ja: '{value} ひとつに {calls} 回 — 異なる項は {distinct} 個だけなのに、f({worst}) だけで {count} 回解かれた',
      zh: '为得到 {value} 调用了 {calls} 次 — 不同的项只有 {distinct} 个，光 f({worst}) 就解了 {count} 次',
      ar: '{calls} استدعاء للوصول إلى {value}، مع أن الحدود المختلفة {distinct} فقط — وحده f({worst}) حُلّ {count} مرات',
      es: '{calls} llamadas para llegar a {value}, y solo {distinct} términos distintos: f({worst}) por sí solo se resolvió {count} veces',
      fr: "{calls} appels pour atteindre {value}, alors qu'il n'y a que {distinct} termes différents — f({worst}) à lui seul a été résolu {count} fois",
      hi: '{value} तक पहुँचने में {calls} कॉल, जबकि अलग-अलग पद केवल {distinct} — अकेला f({worst}) ही {count} बार हल हुआ',
      id: '{calls} panggilan untuk mencapai {value}, padahal sukunya hanya {distinct} — f({worst}) saja diselesaikan {count} kali',
      pt: '{calls} chamadas para chegar a {value}, e apenas {distinct} termos diferentes — só f({worst}) foi resolvido {count} vezes',
    },
  },
  blocks: {
    stage: { type: 'overlapping-subproblems-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
};
