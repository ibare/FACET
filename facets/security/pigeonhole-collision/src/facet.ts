/**
 * PigeonholeCollision facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "해시 충돌은 왜 반드시 존재하는가?"
 *
 * 답은 확률이 아니라 셈이다. 자리가 16개면 17번째 입력은 갈 곳이 없다.
 * 그래서 화면은 자리를 실제로 다 채운 뒤에야 하나를 더 넣는다 — 채우기를
 * 건너뛰고 충돌만 보이면 "겹칠 수도 있다" 가 되지 "겹칠 수밖에 없다" 가 되지 않는다.
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범:
 *   - 필수 조작 없음. 다시 보기 하나만 둔다 (자리가 차는 운동이 논증의 일부다).
 *   - 제목 없음 — 제목은 글의 문단이 준다.
 *   - 짧음 — 네 걸음 재생하고 정지한다.
 *   - 한 주장 — 진행 캡션들은 한 논증의 단계이지 서로 다른 주장이 아니다.
 *   - 메트릭 없음.
 *
 * 데이터는 실측이다. 자리 번호는 SHA-256 의 마지막 니블이고, 16개 입력이 0~15 를
 * 하나씩 차지한다. 17번째 'ag' 는 'aa' 가 앉은 6번 자리로 떨어진다.
 *
 * 다만 그 16개는 자리를 하나씩 채우도록 고른 것이다. 무작위로 넣으면 이렇게 되지
 * 않는다 — 16개가 16칸을 하나씩 차지할 확률은 백만분의 1 남짓이고, 실제로는
 * 여섯 번째쯤에서 이미 겹친다 (사전순 'aa'부터라면 일곱 번째 'ag'). 이 인위성은
 * 감출 것이 아니라 밝힐 전제다 — 비둘기집 원리의 정확한 서술이 "아무리 고르게
 * 나눠도" 이기 때문이다. 가장 잘 나눠 담은 경우에조차 실패한다는 것이 논증이고,
 * 그 전제는 글이 밝힌다.
 *
 * 16칸은 축척이다. 실제 SHA-256 은 2^256 칸이며 수가 클수록 겹치기까지 오래
 * 걸릴 뿐 셈은 같다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const pigeonholeCollisionFacet: FacetJson = {
  id: 'facet:pigeonholeCollision',
  title: {
    en: 'Pigeonhole Principle',
    ko: '비둘기집 원리',
    ja: '鳩の巣原理',
    zh: '鸽巢原理',
    ar: 'مبدأ حظائر الحمام',
    es: 'Principio del palomar',
    fr: 'Principe des tiroirs',
    hi: 'पिजनहोल सिद्धांत',
    id: 'Prinsip lubang merpati',
    pt: 'Princípio da casa dos pombos',
  },
  description: {
    en: 'Sixteen places, seventeen inputs — one of them has nowhere of its own',
    ko: '자리는 열여섯, 입력은 열일곱 — 하나는 제 자리를 가질 수 없다',
    ja: '席は十六、入力は十七 — ひとつは自分の席を持てない',
    zh: '十六个位置，十七个输入 — 总有一个没有自己的位置',
    ar: 'ستة عشر موضعًا وسبعة عشر مدخلًا — واحد منها لا يجد موضعًا خاصًا به',
    es: 'Dieciséis sitios, diecisiete entradas: uno de ellos no tiene sitio propio',
    fr: "Seize places, dix-sept entrées — l'une d'elles n'a pas de place à elle",
    hi: 'सोलह जगहें, सत्रह इनपुट — इनमें से एक के पास अपनी जगह नहीं',
    id: 'Enam belas tempat, tujuh belas masukan — satu di antaranya tak punya tempat sendiri',
    pt: 'Dezesseis lugares, dezessete entradas — um deles não tem lugar próprio',
  },
  algorithm: 'module:pigeonholeCollision',
  projector: 'module:pigeonholeCollisionProjector',
  initialData: {
    type: 'pigeonhole',
    slotCount: 16,
    // SHA-256 마지막 니블을 자리 번호로 삼은 실측값. 16개가 0~15 를 하나씩 채운다.
    fillers: [
      { input: 'ba', slot: 0 },
      { input: 'ac', slot: 1 },
      { input: 'bg', slot: 2 },
      { input: 'ab', slot: 3 },
      { input: 'ao', slot: 4 },
      { input: 'az', slot: 5 },
      { input: 'aa', slot: 6 },
      { input: 'ad', slot: 7 },
      { input: 'ae', slot: 8 },
      { input: 'bf', slot: 9 },
      { input: 'bx', slot: 10 },
      { input: 'au', slot: 11 },
      { input: 'aw', slot: 12 },
      { input: 'af', slot: 13 },
      { input: 'al', slot: 14 },
      { input: 'ap', slot: 15 },
    ],
    overflow: { input: 'ag', slot: 6 },
    // 16칸이 순차로 내려가는 fill-slots 가 가장 긴 걸음이라 그것에 맞춘다.
    stepMs: 1400,
  },
  shuffleOnReset: false,
  messages: {
    'caption.filled': {
      en: 'Spread as evenly as possible — one per place — all {count} are taken.',
      ko: '가장 고르게 나눠도 — 자리마다 하나씩 — {count} 자리가 모두 찬다.',
      ja: 'できるだけ均等に配っても — 席ごとにひとつずつ — {count} 席すべてが埋まる。',
      zh: '哪怕分得再均匀 — 一个位置放一个 — {count} 个位置全被占满。',
      ar: 'مهما وزّعنا بالتساوي — واحد لكل موضع — تمتلئ المواضع الـ{count} كلها.',
      es: 'Repartidos lo más uniformemente posible, uno por sitio: los {count} sitios quedan ocupados.',
      fr: 'Réparti aussi uniformément que possible — un par place — les {count} places sont prises.',
      hi: 'जितना भी बराबर बाँटें — हर जगह पर एक — सभी {count} जगहें भर जाती हैं।',
      id: 'Dibagi serata mungkin — satu per tempat — seluruh {count} tempat terisi.',
      pt: 'Distribuídos o mais uniformemente possível — um por lugar — os {count} lugares ficam ocupados.',
    },
    'caption.oneMore': {
      en: 'One more input arrives — input {n} for {count} places.',
      ko: '입력이 하나 더 온다 — 자리는 {count} 개인데 {n} 번째다.',
      ja: '入力がもうひとつ来る — 席は {count} なのに {n} 番目だ。',
      zh: '又来了一个输入 — 位置只有 {count} 个，而这是第 {n} 个。',
      ar: 'يصل مدخل آخر — المواضع {count} وهذا المدخل رقم {n}.',
      es: 'Llega una entrada más: hay {count} sitios y esta es la número {n}.',
      fr: "Une entrée de plus arrive — {count} places, et c'est la {n}e.",
      hi: 'एक और इनपुट आता है — जगहें {count} हैं और यह {n} वाँ है।',
      id: 'Satu masukan lagi datang — tempatnya {count}, sedangkan ini yang ke-{n}.',
      pt: 'Chega mais uma entrada — há {count} lugares e esta é a {n}.',
    },
    'caption.collide': {
      en: 'It has nowhere of its own — {overflow} sits where {occupant} already is.',
      ko: '제 자리가 없다 — {overflow} 가 {occupant} 가 앉은 자리에 함께 앉는다.',
      ja: '自分の席がない — {overflow} は {occupant} のいる席に一緒に座る。',
      zh: '它没有自己的位置 — {overflow} 只能坐到 {occupant} 已经占着的位置上。',
      ar: 'لا موضع خاصًا به — يجلس {overflow} حيث يجلس {occupant} أصلًا.',
      es: 'No tiene sitio propio: {overflow} se sienta donde ya está {occupant}.',
      fr: "Il n'a pas de place à lui — {overflow} s'assoit là où {occupant} est déjà.",
      hi: 'इसकी अपनी कोई जगह नहीं — {overflow} वहीं बैठता है जहाँ {occupant} पहले से है।',
      id: 'Ia tak punya tempat sendiri — {overflow} duduk di tempat yang sudah ditempati {occupant}.',
      pt: 'Não tem lugar próprio — {overflow} senta-se onde {occupant} já está.',
    },
    'label.places': {
      en: '{count} places',
      ko: '자리 {count} 개',
      ja: '席 {count}',
      zh: '{count} 个位置',
      ar: '{count} موضعًا',
      es: '{count} sitios',
      fr: '{count} places',
      hi: '{count} जगहें',
      id: '{count} tempat',
      pt: '{count} lugares',
    },
  },
  blocks: {
    stage: { type: 'pigeonhole-stage' },
    controls: {
      type: 'control-bar',
      // ReactiveMechanism 의 reset() 은 끝에 ensureStarted() 를 부른다 — 즉
      // reset 이 곧 다시 재생이다. 그래서 action 은 reset 이고 라벨만 다르다.
      controls: CONTROL_SET.piece,
    },
  },
};
