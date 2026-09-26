import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

/**
 * resolveSymbols — 심볼 해석.
 *
 * @piece
 * 질문: 다른 파일에 있는 함수를 부르는 자리는 무엇으로 메워지는가.
 *
 * @notation native
 * 까닭: 오브젝트 파일 항목(`D 이름` · `U 이름`)은 컴파일러 · 링커 내부 표기다 — 원시 프로그램의 가상 표기 규약이 거는 자리가 아니다.
 */
export const resolveSymbolsFacet: FacetJson = {
  id: 'facet:resolveSymbols',
  title: {
    en: 'A hole waits for a definition',
    ko: '빈 자리는 정의를 기다린다',
    ja: '空きは定義を待つ',
    zh: '空位等待定义',
    ar: 'الفراغ ينتظر تعريفًا',
    es: 'El hueco espera una definición',
    fr: 'Le trou attend une définition',
    hi: 'खाली जगह परिभाषा की प्रतीक्षा करती है',
    id: 'Lubang menunggu definisi',
    pt: 'O buraco espera uma definição',
  },
  description: {
    en: 'The linker reads object files in order. A used name with no definition yet waits as a hole, and is joined to the definition with the same name the moment it appears.',
    ko: '링커는 오브젝트 파일을 차례로 읽는다. 정의가 아직 없는 이름은 빈 자리로 기다리다가, 같은 이름의 정의가 나오는 순간 그 정의에 이어진다.',
    ja: 'リンカはオブジェクトファイルを順に読む。まだ定義のない名前は空きとして待ち、同じ名前の定義が現れた瞬間にそこへつながる。',
    zh: '链接器按顺序读取目标文件。尚无定义的名字作为空位等待，同名定义一出现就连接上去。',
    ar: 'يقرأ الرابط ملفات الكائنات بالترتيب. الاسم المستخدم بلا تعريف بعد ينتظر كفراغ، ثم يتصل بالتعريف الذي يحمل الاسم نفسه لحظة ظهوره.',
    es: 'El enlazador lee los archivos objeto en orden. Un nombre usado sin definición todavía espera como hueco y se une a la definición del mismo nombre en cuanto aparece.',
    fr: "L'éditeur de liens lit les fichiers objets dans l'ordre. Un nom utilisé sans définition attend comme un trou, puis se relie à la définition du même nom dès qu'elle apparaît.",
    hi: 'लिंकर ऑब्जेक्ट फ़ाइलें क्रम से पढ़ता है। जिस नाम की परिभाषा अभी नहीं है वह खाली जगह बनकर प्रतीक्षा करता है, और उसी नाम की परिभाषा आते ही उससे जुड़ जाता है।',
    id: 'Linker membaca berkas objek secara berurutan. Nama yang dipakai tanpa definisi menunggu sebagai lubang, lalu tersambung ke definisi bernama sama begitu definisi itu muncul.',
    pt: 'O ligador lê os arquivos objeto em ordem. Um nome usado ainda sem definição espera como buraco e se liga à definição de mesmo nome assim que ela aparece.',
  },
  algorithm: 'module:resolveSymbols',
  scene: 'module:resolveSymbolsScene',
  initialData: {
    type: 'resolve-symbols',
    stepMs: 1400,
    files: [
      {
        name: 'main.o',
        entries: [
          { kind: 'D', name: 'main' },
          { kind: 'U', name: 'area' },
          { kind: 'U', name: 'width' },
        ],
      },
      {
        name: 'shape.o',
        entries: [
          { kind: 'D', name: 'area' },
          { kind: 'U', name: 'square' },
        ],
      },
      {
        name: 'calc.o',
        entries: [
          { kind: 'D', name: 'square' },
          { kind: 'D', name: 'width' },
          { kind: 'U', name: 'area' },
        ],
      },
    ],
  },
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'The linker reads the files in order. Each U entry is a hole to fill.',
      ko: '링커가 파일을 차례로 읽는다. U 항목마다 메워야 할 빈 자리다.',
      ja: 'リンカはファイルを順に読む。U 項目はどれも埋めるべき空きだ。',
      zh: '链接器按顺序读取文件。每个 U 项都是要填的空位。',
      ar: 'يقرأ الرابط الملفات بالترتيب. كل مدخل U فراغ ينبغي ملؤه.',
      es: 'El enlazador lee los archivos en orden. Cada entrada U es un hueco que llenar.',
      fr: "L'éditeur de liens lit les fichiers dans l'ordre. Chaque entrée U est un trou à combler.",
      hi: 'लिंकर फ़ाइलें क्रम से पढ़ता है। हर U प्रविष्टि भरने के लिए एक खाली जगह है।',
      id: 'Linker membaca berkas secara berurutan. Setiap entri U adalah lubang yang harus diisi.',
      pt: 'O ligador lê os arquivos em ordem. Cada entrada U é um buraco a preencher.',
    },
    'caption.define': {
      en: '{file} defines {name}. No hole was waiting for it.',
      ko: '{file} 에 {name} 정의가 있다. 기다리던 자리는 없다.',
      ja: '{file} が {name} を定義する。待っていた空きはない。',
      zh: '{file} 定义了 {name}。没有空位在等它。',
      ar: '{file} يعرّف {name}. لم يكن هناك فراغ ينتظره.',
      es: '{file} define {name}. Ningún hueco lo esperaba.',
      fr: '{file} définit {name}. Aucun trou ne l’attendait.',
      hi: '{file} में {name} की परिभाषा है। कोई खाली जगह इसकी प्रतीक्षा नहीं कर रही थी।',
      id: '{file} mendefinisikan {name}. Tidak ada lubang yang menunggunya.',
      pt: '{file} define {name}. Nenhum buraco o esperava.',
    },
    'caption.defineFill': {
      en: '{file} defines {name}. Holes filled by this definition: {n}',
      ko: '{file} 에 {name} 정의가 나왔다. 기다리던 자리를 메운다 — 이 정의로 메운 자리: {n}',
      ja: '{file} が {name} を定義する。待っていた空きを埋める — この定義で埋めた空き: {n}',
      zh: '{file} 定义了 {name}。填上等待中的空位 — 由此定义填上的空位: {n}',
      ar: '{file} يعرّف {name}. الفراغات التي ملأها هذا التعريف: {n}',
      es: '{file} define {name}. Huecos llenados por esta definición: {n}',
      fr: '{file} définit {name}. Trous comblés par cette définition : {n}',
      hi: '{file} में {name} की परिभाषा आई। इस परिभाषा से भरी गई जगहें: {n}',
      id: '{file} mendefinisikan {name}. Lubang yang diisi definisi ini: {n}',
      pt: '{file} define {name}. Buracos preenchidos por esta definição: {n}',
    },
    'caption.wait': {
      en: '{file} uses {name}, not defined yet. The hole waits.',
      ko: '{file} 에서 쓰는 이름 {name} — 아직 정의가 없어 빈 자리로 기다린다.',
      ja: '{file} が使う名前 {name} — まだ定義がないので空きのまま待つ。',
      zh: '{file} 使用的名字 {name} — 还没有定义，空位等待。',
      ar: '{file} يستخدم {name} ولم يُعرَّف بعد. الفراغ ينتظر.',
      es: '{file} usa {name}, aún sin definir. El hueco espera.',
      fr: '{file} utilise {name}, pas encore défini. Le trou attend.',
      hi: '{file} {name} का उपयोग करता है, जो अभी परिभाषित नहीं है। खाली जगह प्रतीक्षा करती है।',
      id: '{file} memakai {name}, belum didefinisikan. Lubang menunggu.',
      pt: '{file} usa {name}, ainda não definido. O buraco espera.',
    },
    'caption.now': {
      en: '{file} uses {name}, already defined in {def}. Filled at once.',
      ko: '{file} 에서 쓰는 이름 {name} — 정의가 이미 {def} 에 있어 곧바로 메운다.',
      ja: '{file} が使う名前 {name} — 定義はすでに {def} にあるので、すぐに埋まる。',
      zh: '{file} 使用的名字 {name} — 定义已在 {def} 中，立即填上。',
      ar: '{file} يستخدم {name} المعرَّف مسبقًا في {def}. يُملأ فورًا.',
      es: '{file} usa {name}, ya definido en {def}. Se llena al instante.',
      fr: '{file} utilise {name}, déjà défini dans {def}. Comblé aussitôt.',
      hi: '{file} {name} का उपयोग करता है, जो पहले से {def} में परिभाषित है। तुरंत भर जाता है।',
      id: '{file} memakai {name}, sudah didefinisikan di {def}. Langsung terisi.',
      pt: '{file} usa {name}, já definido em {def}. Preenchido na hora.',
    },
    'label.waiting': {
      en: 'Waiting: {n}',
      ko: '기다림: {n}',
      ja: '待ち: {n}',
      zh: '等待: {n}',
      ar: 'في الانتظار: {n}',
      es: 'En espera: {n}',
      fr: 'En attente : {n}',
      hi: 'प्रतीक्षा में: {n}',
      id: 'Menunggu: {n}',
      pt: 'Em espera: {n}',
    },
    'label.filled': {
      en: 'Holes filled: {filled} / {total}',
      ko: '메운 빈 자리: {filled} / {total}',
      ja: '埋めた空き: {filled} / {total}',
      zh: '已填空位: {filled} / {total}',
      ar: 'الفراغات المملوءة: {filled} / {total}',
      es: 'Huecos llenados: {filled} / {total}',
      fr: 'Trous comblés : {filled} / {total}',
      hi: 'भरी गई खाली जगहें: {filled} / {total}',
      id: 'Lubang terisi: {filled} / {total}',
      pt: 'Buracos preenchidos: {filled} / {total}',
    },
  },
  blocks: {
    stage: { type: 'resolve-symbols-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
