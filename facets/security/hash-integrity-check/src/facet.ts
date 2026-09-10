/**
 * HashIntegrityCheck facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "받은 파일이 원본 그대로인지 어떻게 아는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 화면의 골격은 대조표가 아니라 갈라진 두 경로다. 이 조각이 답하는 것은 대조를
 * 어떻게 하느냐가 아니라 **무엇에 기대어 그 대조를 믿느냐** 이고, 그 답이
 * "경로가 둘이다" 이기 때문이다. 경로가 하나면 파일을 고친 쪽이 해시도 고친다.
 *
 * 그래서 손대는 일도 도중에 일어난다 — 도착한 뒤 값이 바뀌면 "오는 길에 당했다"
 * 가 아니라 "받고 나서 달라졌다" 로 읽힌다. 아래 해시 경로는 그동안 아무 일도
 * 일어나지 않으며, 그 정지가 논증이다.
 *
 * 데이터는 실측 SHA-256 이다. 'Pay 100 to Alice' 와 'Pay 900 to Alice' 는
 * 숫자 한 글자만 다른데 해시는 알아볼 수 없을 만큼 갈린다.
 *
 * title / description / messages 는 열 언어를 채웠다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const hashIntegrityCheckFacet: FacetJson = {
  id: 'facet:hashIntegrityCheck',
  title: {
    en: 'Integrity Verification',
    ko: '무결성 검증',
    ja: '完全性の検証',
    zh: '完整性校验',
    ar: 'التحقق من السلامة',
    es: 'Verificación de integridad',
    fr: "Vérification d'intégrité",
    hi: 'अखंडता सत्यापन',
    id: 'Verifikasi integritas',
    pt: 'Verificação de integridade',
  },
  description: {
    en: 'One published hash tells you whether the copy you got was touched',
    ko: '내걸린 해시 한 줄이 받은 사본이 손댔는지를 알려 준다',
    ja: '公開されたハッシュ一つが、受け取った複製に手が加わったかを教える',
    zh: '公开的一行哈希，就能告诉你收到的副本是否被动过',
    ar: 'سطر واحد من التجزئة المعلنة يخبرك إن كانت النسخة التي وصلتك قد مُسّت',
    es: 'Un hash publicado te dice si la copia que recibiste fue tocada',
    fr: 'Une empreinte publiée dit si la copie reçue a été touchée',
    hi: 'सार्वजनिक की गई एक हैश बता देती है कि मिली प्रति से छेड़छाड़ हुई या नहीं',
    id: 'Satu hash yang diumumkan memberi tahu apakah salinan yang kamu terima pernah diutak-atik',
    pt: 'Um hash publicado diz se a cópia que recebeste foi mexida',
  },
  algorithm: 'module:hashIntegrityCheck',
  projector: 'module:hashIntegrityCheckProjector',
  initialData: {
    type: 'hash-integrity',
    algorithmLabel: 'SHA-256',
    referenceHash: '5b2dbcdd960156e27215c41cef91e1c7d967ea828b7cc2fdefa546987cbde91f',
    intact: {
      content: 'Pay 100 to Alice',
      hash: '5b2dbcdd960156e27215c41cef91e1c7d967ea828b7cc2fdefa546987cbde91f',
    },
    tampered: {
      content: 'Pay 900 to Alice',
      hash: '988bcb940b89811fb258dcc53b6ea8d8f848baa8c29049ed73975e0e57d1c99c',
    },
    // 토큰이 경로를 건너는 travel 이 한 걸음 안에서 끝나야 한다.
    stepMs: 1500,
  },
  shuffleOnReset: false,
  messages: {
    'caption.split': {
      en: 'Two routes leave the origin — the file, and its hash.',
      ko: '원본에서 두 경로가 갈라진다 — 파일과 그 해시.',
      ja: '出どころから二つの経路が分かれる — ファイルと、そのハッシュ。',
      zh: '从源头分出两条路 — 文件，和它的哈希。',
      ar: 'مساران يخرجان من المصدر — الملف، وتجزئته.',
      es: 'Del origen salen dos rutas: el archivo y su hash.',
      fr: "Deux routes partent de l'origine — le fichier, et son empreinte.",
      hi: 'स्रोत से दो रास्ते निकलते हैं — फ़ाइल, और उसकी हैश।',
      id: 'Dua jalur berangkat dari sumbernya — berkas, dan hash-nya.',
      pt: 'Duas rotas saem da origem — o ficheiro e o seu hash.',
    },
    'caption.match': {
      en: 'Both arrive and the two agree.',
      ko: '둘 다 도착했고 서로 맞는다.',
      ja: '両方が届き、二つは一致する。',
      zh: '两者都到了，彼此吻合。',
      ar: 'كلاهما يصل، والاثنان متطابقان.',
      es: 'Ambos llegan y coinciden.',
      fr: 'Les deux arrivent et concordent.',
      hi: 'दोनों पहुँचते हैं और आपस में मेल खाते हैं।',
      id: 'Keduanya tiba dan cocok.',
      pt: 'Ambos chegam e coincidem.',
    },
    'caption.tampered': {
      en: 'Someone edits the file on the way — one digit.',
      ko: '오는 길에 누군가 파일을 고친다 — 숫자 하나.',
      ja: '途中で誰かがファイルを書き換える — 数字ひとつ。',
      zh: '有人在半路改了文件 — 只改一个数字。',
      ar: 'يعدّل أحدهم الملف في الطريق — رقم واحد.',
      es: 'Alguien edita el archivo por el camino: un dígito.',
      fr: "Quelqu'un modifie le fichier en chemin — un chiffre.",
      hi: 'रास्ते में कोई फ़ाइल बदल देता है — एक अंक।',
      id: 'Seseorang mengubah berkas di jalan — satu angka.',
      pt: 'Alguém edita o ficheiro pelo caminho — um dígito.',
    },
    'caption.detected': {
      en: 'They never touched the lower route, so the hash still tells on them.',
      ko: '아래 경로는 건드리지 못했으니, 해시가 그것을 일러바친다.',
      ja: '下の経路には手が届かなかったので、ハッシュがそれを告げる。',
      zh: '下面那条路没被碰过，所以哈希还是把它揭穿了。',
      ar: 'لم يمسّوا المسار السفلي، فالتجزئة تفضحهم.',
      es: 'No tocaron la ruta de abajo, así que el hash los delata.',
      fr: "La route du bas est restée intacte : l'empreinte les trahit.",
      hi: 'नीचे वाले रास्ते को वे छू नहीं सके, इसलिए हैश उनकी पोल खोल देती है।',
      id: 'Jalur bawah tak tersentuh, jadi hash-nya membongkar mereka.',
      pt: 'A rota de baixo ficou intacta, por isso o hash denuncia-os.',
    },
    'label.origin': {
      en: 'origin',
      ko: '원본',
      ja: '出どころ',
      zh: '源头',
      ar: 'المصدر',
      es: 'origen',
      fr: 'origine',
      hi: 'स्रोत',
      id: 'sumber',
      pt: 'origem',
    },
    'label.target': {
      en: 'you',
      ko: '받는 쪽',
      ja: '受け取る側',
      zh: '接收方',
      ar: 'أنت',
      es: 'tú',
      fr: 'vous',
      hi: 'आप',
      id: 'kamu',
      pt: 'tu',
    },
    'label.filePath': {
      en: 'any route',
      ko: '아무 경로',
      ja: 'どんな経路でも',
      zh: '任意路径',
      ar: 'أي مسار',
      es: 'cualquier ruta',
      fr: "n'importe quelle route",
      hi: 'कोई भी रास्ता',
      id: 'jalur mana pun',
      pt: 'qualquer rota',
    },
    'label.hashPath': {
      en: 'a route you trust',
      ko: '믿는 경로',
      ja: '信頼できる経路',
      zh: '你信任的路径',
      ar: 'مسار تثق به',
      es: 'una ruta de confianza',
      fr: 'une route de confiance',
      hi: 'भरोसेमंद रास्ता',
      id: 'jalur yang kamu percaya',
      pt: 'uma rota de confiança',
    },
    'label.file': {
      en: 'file',
      ko: '파일',
      ja: 'ファイル',
      zh: '文件',
      ar: 'ملف',
      es: 'archivo',
      fr: 'fichier',
      hi: 'फ़ाइल',
      id: 'berkas',
      pt: 'ficheiro',
    },
    'label.hash': {
      en: 'hash',
      ko: '해시',
      ja: 'ハッシュ',
      zh: '哈希',
      ar: 'تجزئة',
      es: 'hash',
      fr: 'empreinte',
      hi: 'हैश',
      id: 'hash',
      pt: 'hash',
    },
    'label.match': {
      en: '✓',
      ko: '✓',
      ja: '✓',
      zh: '✓',
      ar: '✓',
      es: '✓',
      fr: '✓',
      hi: '✓',
      id: '✓',
      pt: '✓',
    },
    'label.mismatch': {
      en: '✗',
      ko: '✗',
      ja: '✗',
      zh: '✗',
      ar: '✗',
      es: '✗',
      fr: '✗',
      hi: '✗',
      id: '✗',
      pt: '✗',
    },
    'label.scissors': {
      en: '✂',
      ko: '✂',
      ja: '✂',
      zh: '✂',
      ar: '✂',
      es: '✂',
      fr: '✂',
      hi: '✂',
      id: '✂',
      pt: '✂',
    },
  },
  blocks: {
    stage: { type: 'integrity-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
