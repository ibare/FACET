/**
 * HashSalt facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "같은 비밀번호를 쓴 두 사람이 왜 다르게 저장되는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 걸음 순서가 논증이다. 소금 없이 저장하면 두 값이 같아진다는 문제를 먼저 보이고
 * (2걸음), 소금이 붙는 순간을 주인공으로 세운 뒤 (3걸음), 값이 갈리는 것으로
 * 끝낸다 (4걸음). 소금부터 보이면 무엇을 푸는 장치인지 알 수 없다.
 *
 * 해시는 전부 실측 SHA-256 이다. 소금은 앞에 붙였다 — sha256(salt + password).
 *
 * 각주가 밝히는 전제: 소금은 비밀이 아니라 해시 옆에 그대로 저장된다. 감추는
 * 장치가 아니라 저장값을 저마다 다르게 만드는 장치다.
 *
 * title / description / messages 는 열 locale 을 모두 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const hashSaltFacet: FacetJson = {
  id: 'facet:hashSalt',
  title: {
    en: 'Salt',
    ko: '솔트',
    ja: 'ソルト',
    zh: '盐',
    ar: 'الملح',
    es: 'Sal',
    fr: 'Sel',
    hi: 'सॉल्ट',
    id: 'Salt',
    pt: 'Sal',
  },
  description: {
    en: 'A per-account salt keeps two identical passwords from being stored identically',
    ko: '계정마다 다른 소금이 같은 비밀번호를 같게 저장되지 않도록 막는다',
    ja: 'アカウントごとに違うソルトが、同じパスワードを同じ形で保存させない',
    zh: '每个账号一份不同的盐，让相同的密码不会被存成相同的值',
    ar: 'ملح خاص بكل حساب يمنع كلمتَي مرور متطابقتين من أن تُخزَّنا متطابقتين',
    es: 'Una sal distinta por cuenta evita que dos contraseñas iguales se guarden igual',
    fr: "Un sel propre à chaque compte empêche deux mots de passe identiques d'être stockés à l'identique",
    hi: 'हर खाते के लिए अलग सॉल्ट दो एक जैसे पासवर्ड को एक जैसा संग्रहीत होने से रोकता है',
    id: 'Salt yang berbeda untuk tiap akun mencegah dua kata sandi yang sama tersimpan sama',
    pt: 'Um sal por conta impede que duas senhas iguais sejam guardadas iguais',
  },
  algorithm: 'module:hashSalt',
  projector: 'module:hashSaltProjector',
  initialData: {
    type: 'hash-salt',
    algorithmLabel: 'SHA-256',
    password: 'hunter2',
    // 전부 실측 SHA-256. unsaltedHash 는 sha256(password), 각 행은 sha256(salt + password).
    unsaltedHash: 'f52fbd32b2b3b86ff88ef6c490628285f482af15ddcb29541f94bcf526a3f6c7',
    users: [
      {
        name: 'alice',
        salt: 'x7Kq2m',
        hash: 'c7d1f6a6c63dabd2d2419fd0a65fbd4e44fe5e41959ef681de2f814084533ef4',
      },
      {
        name: 'bob',
        salt: '9pLw4z',
        hash: '8d20da998cc6f4bb2d6e1b63bd534a576410854f2d7ce9ce262a91327fc74454',
      },
    ],
    stepMs: 1000,
  },
  shuffleOnReset: false,
  messages: {
    'caption.samePassword': {
      en: 'Both chose the same password.',
      ko: '둘이 같은 비밀번호를 골랐다.',
      ja: '二人とも同じパスワードを選んだ。',
      zh: '两人选了同一个密码。',
      ar: 'اختار كلاهما كلمة المرور نفسها.',
      es: 'Los dos eligieron la misma contraseña.',
      fr: 'Tous deux ont choisi le même mot de passe.',
      hi: 'दोनों ने एक ही पासवर्ड चुना।',
      id: 'Keduanya memilih kata sandi yang sama.',
      pt: 'Os dois escolheram a mesma senha.',
    },
    'caption.unsalted': {
      en: 'Hashed as they are, both rows store the same value — cracking one cracks the other.',
      ko: '그대로 해싱하면 두 행이 같은 값을 저장한다 — 하나가 뚫리면 다른 하나도 뚫린다.',
      ja: 'そのままハッシュすると二つの行が同じ値を持つ — 片方が破られれば、もう片方も破られる。',
      zh: '直接哈希，两行存的是同一个值 — 破了一个，另一个也破了。',
      ar: 'إذا جرت التجزئة كما هي، خزّن الصفّان القيمة نفسها — وكسر أحدهما يكسر الآخر.',
      es: 'Si se aplican tal cual, las dos filas guardan el mismo valor: romper una es romper la otra.',
      fr: "Hachés tels quels, les deux enregistrements stockent la même valeur — casser l'un, c'est casser l'autre.",
      hi: 'ऐसे ही हैश करें तो दोनों पंक्तियाँ एक ही मान रखती हैं — एक टूटा तो दूसरा भी टूटा।',
      id: 'Di-hash apa adanya, kedua baris menyimpan nilai yang sama — satu jebol, yang lain ikut jebol.',
      pt: 'Com hash direto, as duas linhas guardam o mesmo valor — quebrar uma é quebrar a outra.',
    },
    'caption.salting': {
      en: 'Each account gets its own salt, put in front of the password.',
      ko: '계정마다 자기 소금을 받아 비밀번호 앞에 붙인다.',
      ja: 'アカウントごとに自分のソルトを受け取り、パスワードの前に付ける。',
      zh: '每个账号拿到自己的盐，接在密码前面。',
      ar: 'كل حساب يأخذ ملحه الخاص، ويوضع أمام كلمة المرور.',
      es: 'Cada cuenta recibe su propia sal y se coloca delante de la contraseña.',
      fr: 'Chaque compte reçoit son propre sel, placé devant le mot de passe.',
      hi: 'हर खाते को अपना सॉल्ट मिलता है, जो पासवर्ड के आगे लगता है।',
      id: 'Tiap akun mendapat salt sendiri, ditaruh di depan kata sandi.',
      pt: 'Cada conta recebe o seu próprio sal, posto à frente da senha.',
    },
    'caption.salted': {
      en: 'The same password now stores two unrelated values.',
      ko: '같은 비밀번호가 이제 아무 관계 없는 두 값으로 저장된다.',
      ja: '同じパスワードが、いまや無関係な二つの値として保存される。',
      zh: '同一个密码，如今存成了两个毫不相干的值。',
      ar: 'كلمة المرور نفسها تُخزَّن الآن بقيمتين لا صلة بينهما.',
      es: 'La misma contraseña guarda ahora dos valores sin relación.',
      fr: 'Le même mot de passe stocke désormais deux valeurs sans rapport.',
      hi: 'वही पासवर्ड अब दो असंबंधित मानों के रूप में संग्रहीत होता है।',
      id: 'Kata sandi yang sama kini tersimpan sebagai dua nilai yang tak berkaitan.',
      pt: 'A mesma senha guarda agora dois valores sem relação.',
    },
    'label.password': {
      en: 'password',
      ko: '비밀번호',
      ja: 'パスワード',
      zh: '密码',
      ar: 'كلمة المرور',
      es: 'contraseña',
      fr: 'mot de passe',
      hi: 'पासवर्ड',
      id: 'kata sandi',
      pt: 'senha',
    },
    'label.salt': {
      en: 'salt',
      ko: '소금',
      ja: 'ソルト',
      zh: '盐',
      ar: 'الملح',
      es: 'sal',
      fr: 'sel',
      hi: 'सॉल्ट',
      id: 'salt',
      pt: 'sal',
    },
    'label.stored': {
      en: 'what gets stored',
      ko: '저장되는 값',
      ja: '保存される値',
      zh: '存下来的值',
      ar: 'ما يُخزَّن',
      es: 'lo que se guarda',
      fr: 'ce qui est stocké',
      hi: 'जो संग्रहीत होता है',
      id: 'yang tersimpan',
      pt: 'o que fica guardado',
    },
    'label.identical': {
      en: 'identical',
      ko: '똑같다',
      ja: '同じ',
      zh: '相同',
      ar: 'متطابق',
      es: 'idénticos',
      fr: 'identiques',
      hi: 'एक जैसे',
      id: 'sama persis',
      pt: 'idênticos',
    },
    'label.different': {
      en: 'different',
      ko: '갈렸다',
      ja: '別々',
      zh: '不同',
      ar: 'مختلف',
      es: 'distintos',
      fr: 'différents',
      hi: 'अलग',
      id: 'berbeda',
      pt: 'diferentes',
    },
  },
  blocks: {
    stage: { type: 'salt-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
