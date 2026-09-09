/**
 * 강한 연결 요소 (타잔) 완결형 선언.
 *
 * 블록은 셋뿐이다 — `stage` · `controls` · `codePanel`. 제목 블록을 두지 않는다
 * (이름은 카탈로그 카드와 글의 문단이 준다). 그래프 · 스택 · 무리 칸은 빌트인
 * view 를 빌리지 않고 stage 가 직접 그린다 (원칙 6).
 *
 * 이 facet 의 산출물은 그림이 아니라 **코드** 다. `ir:scc-tarjan` 하나가 여섯
 * 언어로 펼쳐지고, 재생 중인 phase 가 그 줄을 짚는다. 이 열에서 가장 긴 IR 이라
 * 코드 패널이 감당해야 할 몫도 가장 크다.
 *
 * 식별자 (C1): `node:<정점>` · `edge:<출발>-<도착>`.
 *
 * `shuffleOnReset` 을 켜지 않는다 — `adjacency` 는 최상위 배열이라 켜면 셔플
 * 대상이 되는데, 이웃을 보는 차례가 방문 번호를 정하므로 차례가 흐트러지면
 * 코드 패널이 말하는 순회와 화면이 어긋난다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const sccFacet: FacetJson = {
  id: 'facet:scc',
  title: {
    en: 'Strongly Connected Components',
    ko: '강한 연결 요소',
    ar: 'المكوّنات المترابطة بقوة',
    es: 'Componentes fuertemente conexas',
    fr: 'Composantes fortement connexes',
    hi: 'दृढ़ता से संबद्ध घटक',
    id: 'Komponen terhubung kuat',
    pt: 'Componentes fortemente conexos',
  },
  description: {
    en: 'One depth-first walk finds every set of vertices that can all reach each other.',
    ko: '깊이 우선 순회 한 번으로 서로 오갈 수 있는 무리를 모두 찾아낸다',
    ar: 'جولة واحدة بالعمق تكشف كل مجموعة من الرؤوس يصل بعضها إلى بعض.',
    es: 'Un solo recorrido en profundidad halla todo conjunto de vértices que se alcanzan entre sí.',
    fr: "Un seul parcours en profondeur trouve chaque ensemble de sommets qui s'atteignent mutuellement.",
    hi: 'एक ही गहराई-प्रथम भ्रमण उन सभी शीर्षों के समूह खोज लेता है जो एक-दूसरे तक पहुँच सकते हैं।',
    id: 'Satu penelusuran mendalam menemukan setiap kumpulan simpul yang saling mencapai.',
    pt: 'Um único percurso em profundidade encontra todo conjunto de vértices que se alcançam mutuamente.',
  },
  algorithm: 'module:scc',
  projector: 'module:sccProjector',
  // 사양이 정한 자료. 정점 여덟, 방향 간선 열넷. 이웃을 보는 차례가 곧 이 배열의
  // 차례이고, 그 차례가 방문 번호를 정한다.
  initialData: {
    type: 'scc',
    adjacency: [[1], [2, 4, 5], [3, 6], [2, 7], [0, 5], [6], [5], [3, 6]],
  },
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage' }, { ref: 'controls' }, { ref: 'codePanel' }],
  },
  blocks: {
    stage: { type: 'scc-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.playback,
      metrics: [
        {
          name: 'visit-count',
          label: {
            en: 'Visited',
            ko: '방문',
            ar: 'زيارات',
            es: 'Visitados',
            fr: 'Visités',
            hi: 'देखे गए',
            id: 'Dikunjungi',
            pt: 'Visitados',
          },
          initial: 0,
        },
        {
          name: 'back-edge-count',
          label: {
            en: 'Back edges',
            ko: '되짚은 간선',
            ar: 'أضلاع راجعة',
            es: 'Aristas de retorno',
            fr: 'Arcs arrière',
            hi: 'पश्च किनारे',
            id: 'Sisi mundur',
            pt: 'Arestas de retorno',
          },
          initial: 0,
        },
        {
          name: 'group-count',
          label: {
            en: 'Groups',
            ko: '무리',
            ar: 'مجموعات',
            es: 'Grupos',
            fr: 'Groupes',
            hi: 'समूह',
            id: 'Kelompok',
            pt: 'Grupos',
          },
          initial: 0,
        },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: {
        en: 'Code',
        ko: '코드',
        ar: 'الشيفرة',
        es: 'Código',
        fr: 'Code',
        hi: 'कोड',
        id: 'Kode',
        pt: 'Código',
      },
      ir: 'ir:scc-tarjan',
    },
  },
  messages: {
    'label.groups': {
      en: 'groups',
      ko: '무리',
      ar: 'مجموعات',
      es: 'grupos',
      fr: 'groupes',
      hi: 'समूह',
      id: 'kelompok',
      pt: 'grupos',
    },
    'caption.start': {
      en: 'Vertices: {n}. None of them has a number yet.',
      ko: '정점은 {n}. 아직 아무 자리에도 번호가 없다',
      ar: 'الرؤوس: {n}. لا يحمل أي منها رقمًا بعد.',
      es: 'Vértices: {n}. Ninguno tiene número todavía.',
      fr: 'Sommets : {n}. Aucun ne porte encore de numéro.',
      hi: 'शीर्ष: {n}। अभी किसी को क्रमांक नहीं मिला है।',
      id: 'Simpul: {n}. Belum ada yang bernomor.',
      pt: 'Vértices: {n}. Nenhum tem número ainda.',
    },
    'caption.probeNew': {
      en: 'Vertex {v} has no number. Start a walk there.',
      ko: '{v} 번 자리에는 번호가 없다. 거기서 순회를 시작한다',
      ar: 'الرأس {v} بلا رقم. ابدأ الجولة منه.',
      es: 'El vértice {v} no tiene número. Empieza el recorrido ahí.',
      fr: "Le sommet {v} n'a pas de numéro. Le parcours démarre là.",
      hi: 'शीर्ष {v} पर क्रमांक नहीं है। भ्रमण वहीं से शुरू करें।',
      id: 'Simpul {v} belum bernomor. Mulai penelusuran dari sana.',
      pt: 'O vértice {v} não tem número. Comece o percurso ali.',
    },
    'caption.probeDone': {
      en: 'Vertex {v} already has a number — skip it.',
      ko: '{v} 번 자리에는 이미 번호가 있다 — 건너뛴다',
      ar: 'الرأس {v} يحمل رقمًا بالفعل — تخطَّه.',
      es: 'El vértice {v} ya tiene número: sáltalo.',
      fr: 'Le sommet {v} porte déjà un numéro — on passe.',
      hi: 'शीर्ष {v} को क्रमांक मिल चुका है — इसे छोड़ दें।',
      id: 'Simpul {v} sudah bernomor — lewati.',
      pt: 'O vértice {v} já tem número — siga adiante.',
    },
    'caption.visit': {
      en: 'Vertex {v} takes number {n}. Its low starts at the same place.',
      ko: '{v} 번 자리의 번호는 {n}. low 도 같은 자리에서 시작한다',
      ar: 'الرأس {v} يأخذ الرقم {n}. وتبدأ قيمة low من الموضع نفسه.',
      es: 'El vértice {v} recibe el número {n}. Su low arranca en el mismo sitio.',
      fr: 'Le sommet {v} reçoit le numéro {n}. Son low démarre au même endroit.',
      hi: 'शीर्ष {v} को क्रमांक {n} मिला। इसका low भी वहीं से शुरू होता है।',
      id: 'Simpul {v} mendapat nomor {n}. Nilai low-nya mulai dari titik yang sama.',
      pt: 'O vértice {v} recebe o número {n}. Seu low começa no mesmo ponto.',
    },
    'caption.push': {
      en: 'Vertex {v} goes on the stack and stays until its group is settled.',
      ko: '{v} 번 자리를 스택에 올린다. 무리가 정해질 때까지 남는다',
      ar: 'يُوضَع الرأس {v} على المكدس ويبقى حتى تُحسم مجموعته.',
      es: 'El vértice {v} entra en la pila y se queda hasta que su grupo quede fijado.',
      fr: 'Le sommet {v} entre dans la pile et y reste jusqu’à ce que son groupe soit fixé.',
      hi: 'शीर्ष {v} स्टैक पर चढ़ता है और समूह तय होने तक वहीं रहता है।',
      id: 'Simpul {v} masuk ke tumpukan dan bertahan sampai kelompoknya pasti.',
      pt: 'O vértice {v} entra na pilha e fica até seu grupo ficar definido.',
    },
    'caption.scan': {
      en: 'Vertex {v} looks at the edge to {w}.',
      ko: '{v} 번 자리에서 {w} 로 가는 간선을 본다',
      ar: 'الرأس {v} ينظر إلى الضلع المتجه نحو {w}.',
      es: 'El vértice {v} mira la arista hacia {w}.',
      fr: "Le sommet {v} regarde l'arc vers {w}.",
      hi: 'शीर्ष {v} से {w} की ओर जाने वाले किनारे को देखा जाता है।',
      id: 'Simpul {v} menengok sisi menuju {w}.',
      pt: 'O vértice {v} olha a aresta que vai até {w}.',
    },
    'caption.descend': {
      en: 'Vertex {w} is new ground. Go down into it.',
      ko: '{w} 번 자리는 처음 가 보는 곳. 그리로 내려간다',
      ar: 'الرأس {w} أرض جديدة. انزل إليه.',
      es: 'El vértice {w} es terreno nuevo. Baja hasta él.',
      fr: 'Le sommet {w} est un terrain neuf. On y descend.',
      hi: 'शीर्ष {w} अनदेखी ज़मीन है। वहीं नीचे उतरें।',
      id: 'Simpul {w} adalah tanah baru. Turun ke sana.',
      pt: 'O vértice {w} é terreno novo. Desça até ele.',
    },
    'caption.liftTake': {
      en: 'The walk under {w} reached {l}. Vertex {v} takes that low.',
      ko: '{w} 아래로 내려간 순회가 {l} 까지 닿았다. {v} 번 자리가 그 값을 물려받는다',
      ar: 'الجولة تحت {w} وصلت إلى {l}. الرأس {v} يرث تلك القيمة.',
      es: 'El recorrido bajo {w} llegó a {l}. El vértice {v} hereda ese low.',
      fr: 'Le parcours sous {w} a atteint {l}. Le sommet {v} hérite de ce low.',
      hi: '{w} के नीचे का भ्रमण {l} तक पहुँचा। शीर्ष {v} वही low अपना लेता है।',
      id: 'Penelusuran di bawah {w} mencapai {l}. Simpul {v} mewarisi nilai itu.',
      pt: 'O percurso sob {w} alcançou {l}. O vértice {v} herda esse low.',
    },
    'caption.liftKeep': {
      en: 'The walk under {w} reached no higher. Vertex {v} keeps low {l}.',
      ko: '{w} 아래에서는 더 위로 못 갔다. {v} 번 자리의 low 는 그대로 {l}',
      ar: 'الجولة تحت {w} لم تصعد أعلى. الرأس {v} يبقي low عند {l}.',
      es: 'El recorrido bajo {w} no llegó más arriba. El vértice {v} conserva low {l}.',
      fr: 'Le parcours sous {w} n’est pas remonté plus haut. Le sommet {v} garde low {l}.',
      hi: '{w} के नीचे का भ्रमण और ऊपर नहीं पहुँचा। शीर्ष {v} का low वही {l} रहता है।',
      id: 'Penelusuran di bawah {w} tidak naik lebih tinggi. Simpul {v} tetap dengan low {l}.',
      pt: 'O percurso sob {w} não subiu mais. O vértice {v} mantém low {l}.',
    },
    'caption.backEdge': {
      en: 'The edge {v} → {w} runs back to a vertex still on the stack.',
      ko: '{v} → {w} 간선은 아직 스택에 있는 자리로 되짚어 닿는다',
      ar: 'الضلع {v} → {w} يعود إلى رأس ما زال على المكدس.',
      es: 'La arista {v} → {w} vuelve a un vértice que sigue en la pila.',
      fr: "L'arc {v} → {w} revient vers un sommet encore dans la pile.",
      hi: 'किनारा {v} → {w} स्टैक पर बचे हुए शीर्ष तक लौट जाता है।',
      id: 'Sisi {v} → {w} berbalik ke simpul yang masih di tumpukan.',
      pt: 'A aresta {v} → {w} volta a um vértice que ainda está na pilha.',
    },
    'caption.backTake': {
      en: 'Vertex {w} is on the stack, so {v} lowers its low to num[{w}], which is {l}.',
      ko: '{w} 번 자리가 스택에 있으니 {v} 번 자리의 low 를 num[{w}] 만큼 낮춘다. 새 low 는 {l}',
      ar: 'الرأس {w} على المكدس، فيخفض {v} قيمة low إلى num[{w}]، أي {l}.',
      es: 'El vértice {w} está en la pila, así que {v} baja su low a num[{w}], que vale {l}.',
      fr: 'Le sommet {w} est dans la pile, donc {v} abaisse son low à num[{w}], soit {l}.',
      hi: 'शीर्ष {w} स्टैक पर है, इसलिए {v} अपना low घटाकर num[{w}] कर लेता है, यानी {l}।',
      id: 'Simpul {w} ada di tumpukan, maka {v} menurunkan low-nya ke num[{w}], yaitu {l}.',
      pt: 'O vértice {w} está na pilha, então {v} baixa seu low para num[{w}], que é {l}.',
    },
    'caption.backKeep': {
      en: 'Vertex {v} already reaches {l} — nothing lower to take from {w}.',
      ko: '{v} 번 자리는 이미 {l} 까지 닿는다 — {w} 에서 더 낮출 것이 없다',
      ar: 'الرأس {v} يصل أصلًا إلى {l} — لا شيء أدنى ليأخذه من {w}.',
      es: 'El vértice {v} ya alcanza {l}: no hay nada más bajo que tomar de {w}.',
      fr: 'Le sommet {v} atteint déjà {l} — rien de plus bas à prendre à {w}.',
      hi: 'शीर्ष {v} पहले ही {l} तक पहुँचता है — {w} से और नीचे कुछ नहीं मिलता।',
      id: 'Simpul {v} sudah mencapai {l} — tidak ada yang lebih rendah dari {w}.',
      pt: 'O vértice {v} já alcança {l} — nada mais baixo a tomar de {w}.',
    },
    'caption.skipEdge': {
      en: 'Vertex {w} left the stack with a settled group. This edge gives nothing.',
      ko: '{w} 번 자리는 무리가 정해져 스택에서 나갔다. 이 간선은 아무것도 주지 않는다',
      ar: 'الرأس {w} غادر المكدس بمجموعة محسومة. هذا الضلع لا يعطي شيئًا.',
      es: 'El vértice {w} salió de la pila con su grupo cerrado. Esta arista no aporta nada.',
      fr: 'Le sommet {w} a quitté la pile avec son groupe fermé. Cet arc n’apporte rien.',
      hi: 'शीर्ष {w} अपना समूह तय करके स्टैक से निकल चुका है। यह किनारा कुछ नहीं देता।',
      id: 'Simpul {w} sudah keluar dari tumpukan dengan kelompok pasti. Sisi ini tak memberi apa pun.',
      pt: 'O vértice {w} saiu da pilha com o grupo fechado. Esta aresta não dá nada.',
    },
    'caption.closeGroup': {
      en: 'low equals num at {v}. The stack from {v} up is one whole group — size {k}.',
      ko: 'low 와 num 이 {v} 번 자리에서 같다. 스택에서 여기부터 위까지가 통째로 한 무리 — 크기는 {k}',
      ar: 'تتساوى low مع num عند {v}. ما فوق {v} في المكدس مجموعة واحدة كاملة — حجمها {k}.',
      es: 'low es igual a num en {v}. La pila desde {v} hacia arriba es un grupo entero: tamaño {k}.',
      fr: 'low égale num en {v}. La pile à partir de {v} forme un groupe entier — taille {k}.',
      hi: '{v} पर low और num बराबर हैं। स्टैक में {v} से ऊपर तक का पूरा हिस्सा एक ही समूह है — आकार {k}।',
      id: 'low sama dengan num di {v}. Tumpukan dari {v} ke atas satu kelompok utuh — ukuran {k}.',
      pt: 'low é igual a num em {v}. A pilha de {v} para cima é um grupo inteiro — tamanho {k}.',
    },
    'caption.pop': {
      en: 'Vertex {v} leaves the stack and joins the group.',
      ko: '{v} 번 자리가 스택에서 빠져나와 무리에 들어간다',
      ar: 'الرأس {v} يغادر المكدس وينضم إلى المجموعة.',
      es: 'El vértice {v} sale de la pila y entra en el grupo.',
      fr: 'Le sommet {v} quitte la pile et rejoint le groupe.',
      hi: 'शीर्ष {v} स्टैक से निकलकर समूह में शामिल हो जाता है।',
      id: 'Simpul {v} keluar dari tumpukan dan bergabung ke kelompok.',
      pt: 'O vértice {v} sai da pilha e entra no grupo.',
    },
    'caption.done': {
      en: 'One walk, {n} groups. Every vertex belongs to exactly one.',
      ko: '순회 한 번에 무리 {n}. 모든 자리가 정확히 한 무리에 든다',
      ar: 'جولة واحدة، {n} مجموعات. كل رأس ينتمي إلى واحدة فقط.',
      es: 'Un recorrido, {n} grupos. Cada vértice pertenece a uno solo.',
      fr: 'Un seul parcours, {n} groupes. Chaque sommet appartient à un seul.',
      hi: 'एक भ्रमण, {n} समूह। हर शीर्ष ठीक एक ही समूह में आता है।',
      id: 'Satu penelusuran, {n} kelompok. Tiap simpul masuk tepat satu kelompok.',
      pt: 'Um percurso, {n} grupos. Cada vértice pertence a exatamente um.',
    },
  },
};
