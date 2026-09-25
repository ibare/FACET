import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';
import type { DynamicDispatchFacetData, Expr, ProgramLine, Stmt } from './algorithm.js';

/**
 * @piece
 * 같은 부르는 줄이 어느 몸을 부를지는 언제, 무엇이 정하는가?
 *
 * 부르는 글자 `item.play()` 는 세 번 다 같다. 부를 때마다 그 순간 `item` 이 가리키는 객체의 클래스에서
 * 몸을 찾아 곧장 간다 — 한 줄에서 흐름이 세 몸으로 갈라지고, 부모 `Instrument` 의 몸에는 한 번도 가지 않는다.
 */

function line(indent: number, text: string, stmt: Stmt): ProgramLine {
  return { indent, text, stmt };
}
const s = (str: string): Expr => ({ str });
const newOf = (cls: string): Expr => ({ new: cls, args: [] });

const lines: ProgramLine[] = [
  line(0, 'class Instrument', { k: 'class', name: 'Instrument' }),
  line(1, 'function play()', { k: 'function', name: 'play', params: [] }),
  line(2, 'return "..."', { k: 'return', value: s('...') }),
  line(0, 'class Drum extends Instrument', { k: 'class', name: 'Drum', extends: 'Instrument' }),
  line(1, 'function play()', { k: 'function', name: 'play', params: [] }),
  line(2, 'return "boom"', { k: 'return', value: s('boom') }),
  line(0, 'class Bell extends Instrument', { k: 'class', name: 'Bell', extends: 'Instrument' }),
  line(1, 'function play()', { k: 'function', name: 'play', params: [] }),
  line(2, 'return "ding"', { k: 'return', value: s('ding') }),
  line(0, 'class Flute extends Instrument', { k: 'class', name: 'Flute', extends: 'Instrument' }),
  line(1, 'function play()', { k: 'function', name: 'play', params: [] }),
  line(2, 'return "toot"', { k: 'return', value: s('toot') }),
  line(0, 'let band = [new Drum(), new Bell(), new Flute()]', {
    k: 'assign',
    declare: true,
    to: 'band',
    value: { list: [newOf('Drum'), newOf('Bell'), newOf('Flute')] },
  }),
  line(0, 'for each item in band', { k: 'for-each', var: 'item', in: { var: 'band' } }),
  line(1, 'show item.play()', { k: 'show', value: { mcall: { var: 'item' }, name: 'play', args: [] } }),
];

const initialData: DynamicDispatchFacetData = {
  type: 'dynamic-dispatch',
  stepMs: 1400,
  lines,
};

export const dynamicDispatchFacet: FacetJson = {
  id: 'facet:dynamicDispatch',
  title: {
    en: 'Dynamic dispatch',
    ko: '동적 디스패치',
    ja: '動的ディスパッチ',
    zh: '动态分派',
    ar: 'الإرسال الديناميكي',
    es: 'Despacho dinámico',
    fr: 'Répartition dynamique',
    hi: 'डायनेमिक डिस्पैच',
    id: 'Dispatch dinamis',
    pt: 'Despacho dinâmico',
  },
  description: {
    en: 'One call line, three different bodies — the class of the object it receives at that moment decides where the call goes.',
    ko: '부르는 줄은 하나인데 간 몸은 셋 — 그 순간 받은 객체의 클래스가 부름이 갈 곳을 정한다.',
    ja: '呼び出し行は一つなのに行き先の本体は三つ — その瞬間に受け取ったオブジェクトのクラスが行き先を決める。',
    zh: '调用行只有一行，到达的方法体却有三个 — 那一刻接收到的对象的类决定调用去哪里。',
    ar: 'سطر استدعاء واحد وثلاثة أجسام مختلفة — صنف الكائن المستقبَل في تلك اللحظة يحدد إلى أين يذهب الاستدعاء.',
    es: 'Una línea de llamada, tres cuerpos distintos: la clase del objeto que recibe en ese momento decide adónde va la llamada.',
    fr: 'Une seule ligne d’appel, trois corps différents : la classe de l’objet reçu à cet instant décide où va l’appel.',
    hi: 'कॉल लाइन एक, पर बॉडी तीन — उस पल मिले ऑब्जेक्ट की क्लास तय करती है कि कॉल कहाँ जाएगी।',
    id: 'Satu baris panggilan, tiga badan berbeda — kelas objek yang diterima saat itu menentukan ke mana panggilan pergi.',
    pt: 'Uma linha de chamada, três corpos diferentes — a classe do objeto recebido naquele momento decide para onde a chamada vai.',
  },
  algorithm: 'module:dynamicDispatch',
  scene: 'module:dynamicDispatchScene',
  initialData,
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'The program is ready. Nothing has run yet.',
      ko: '프로그램이 섰다. 아직 아무것도 돌지 않았다.',
      ja: 'プログラムの準備ができた。まだ何も実行されていない。',
      zh: '程序已就绪，还没有执行任何内容。',
      ar: 'البرنامج جاهز. لم يُنفَّذ شيء بعد.',
      es: 'El programa está listo. Aún no se ha ejecutado nada.',
      fr: 'Le programme est prêt. Rien ne s’est encore exécuté.',
      hi: 'प्रोग्राम तैयार है। अभी कुछ भी नहीं चला।',
      id: 'Program siap. Belum ada yang dijalankan.',
      pt: 'O programa está pronto. Nada foi executado ainda.',
    },
    'caption.build': {
      en: 'The list is built — objects in {name}: {n}',
      ko: '목록이 섰다 — {name} 안의 객체: {n}',
      ja: 'リストができた — {name} の中のオブジェクト: {n}',
      zh: '列表已建好 — {name} 中的对象：{n}',
      ar: 'بُنيت القائمة — الكائنات في {name}: {n}',
      es: 'La lista está creada — objetos en {name}: {n}',
      fr: 'La liste est construite — objets dans {name} : {n}',
      hi: 'सूची बन गई — {name} में ऑब्जेक्ट: {n}',
      id: 'Daftar sudah dibuat — objek di {name}: {n}',
      pt: 'A lista foi criada — objetos em {name}: {n}',
    },
    'caption.call': {
      en: 'Class of {recv} now: {cls} → it runs the body of {owner}.{method}',
      ko: '지금 {recv} 의 클래스: {cls} → 들어간 몸: {owner}.{method}',
      ja: '今の {recv} のクラス: {cls} → 入る本体: {owner}.{method}',
      zh: '此刻 {recv} 的类：{cls} → 进入的方法体：{owner}.{method}',
      ar: 'صنف {recv} الآن: {cls} ← يُنفَّذ جسم {owner}.{method}',
      es: 'Clase de {recv} ahora: {cls} → ejecuta el cuerpo de {owner}.{method}',
      fr: 'Classe de {recv} ici : {cls} → corps exécuté : {owner}.{method}',
      hi: 'अभी {recv} की क्लास: {cls} → चलने वाली बॉडी: {owner}.{method}',
      id: 'Kini kelas {recv}: {cls} → badan yang dijalankan: {owner}.{method}',
      pt: 'Classe de {recv} agora: {cls} → executa o corpo de {owner}.{method}',
    },
    'caption.return': {
      en: 'Value the body returns: {value}',
      ko: '몸이 돌려준 값: {value}',
      ja: '本体が返した値: {value}',
      zh: '方法体返回的值：{value}',
      ar: 'القيمة التي يعيدها الجسم: {value}',
      es: 'Valor que devuelve el cuerpo: {value}',
      fr: 'Valeur renvoyée par le corps : {value}',
      hi: 'बॉडी का लौटाया मान: {value}',
      id: 'Nilai yang dikembalikan badan: {value}',
      pt: 'Valor que o corpo devolve: {value}',
    },
    'caption.show': {
      en: 'Back at the same call line — shown: {value}',
      ko: '같은 부르는 줄로 돌아와 보인 값: {value}',
      ja: '同じ呼び出し行に戻って表示: {value}',
      zh: '回到同一调用行，显示：{value}',
      ar: 'العودة إلى سطر الاستدعاء نفسه — المعروض: {value}',
      es: 'De vuelta en la misma línea de llamada — se muestra: {value}',
      fr: 'Retour à la même ligne d’appel — affiché : {value}',
      hi: 'उसी कॉल लाइन पर लौटकर दिखाया: {value}',
      id: 'Kembali ke baris panggilan yang sama — ditampilkan: {value}',
      pt: 'De volta à mesma linha de chamada — exibido: {value}',
    },
    'caption.showOther': {
      en: 'Shown: {value}',
      ko: '보인 값: {value}',
      ja: '表示した値: {value}',
      zh: '显示的值：{value}',
      ar: 'القيمة المعروضة: {value}',
      es: 'Valor mostrado: {value}',
      fr: 'Valeur affichée : {value}',
      hi: 'दिखाया गया मान: {value}',
      id: 'Nilai yang ditampilkan: {value}',
      pt: 'Valor exibido: {value}',
    },
    'caption.done': {
      en: 'Call lines: {calls} · Bodies reached: {bodies} · Never reached: {never}',
      ko: '부르는 줄: {calls} · 간 몸: {bodies} · 한 번도 안 간 몸: {never}',
      ja: '呼び出し行: {calls} · 到達した本体: {bodies} · 一度も行かない本体: {never}',
      zh: '调用行：{calls} · 到达的方法体：{bodies} · 从未到达：{never}',
      ar: 'أسطر الاستدعاء: {calls} · الأجسام المبلوغة: {bodies} · لم يُبلغ قط: {never}',
      es: 'Líneas de llamada: {calls} · Cuerpos alcanzados: {bodies} · Nunca alcanzado: {never}',
      fr: 'Lignes d’appel : {calls} · Corps atteints : {bodies} · Jamais atteint : {never}',
      hi: 'कॉल लाइनें: {calls} · पहुँची बॉडी: {bodies} · कभी नहीं पहुँची: {never}',
      id: 'Baris panggilan: {calls} · Badan dicapai: {bodies} · Tak pernah dicapai: {never}',
      pt: 'Linhas de chamada: {calls} · Corpos alcançados: {bodies} · Nunca alcançado: {never}',
    },
    'label.output': {
      en: 'Output',
      ko: '출력',
      ja: '出力',
      zh: '输出',
      ar: 'المخرجات',
      es: 'Salida',
      fr: 'Sortie',
      hi: 'आउटपुट',
      id: 'Keluaran',
      pt: 'Saída',
    },
  },
  blocks: {
    stage: { type: 'dynamic-dispatch-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.pieceScrub },
  },
};
