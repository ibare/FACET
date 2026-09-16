/**
 * constant-fades stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * ── 그림이 곡선이 아닌 까닭
 *
 * 두 식을 그래프로 그리면 "언젠가 갈린다" 가 주장이 되는데, 이 조각의 주장은 "상수는
 * 만나는 자리를 미룰 뿐이다" 라서 재야 하는 것이 높이가 아니라 **자리**다. 그래서 값은
 * 숫자 칩으로 읽고, 화면에서 움직이는 것은 경계 기둥의 가로 위치 하나다.
 *
 * 가로축은 n 이 배율만큼씩 자라는 눈금이다 (선언의 factor 가 10 이면 눈금 하나가 열
 * 배). 그 덕에 "상수를 열 배로 키우면 만나는 자리가 한 눈금 오른쪽" 이 자로 잰 거리로
 * 보인다. 이 전제를 화면에 각주로 달지 않는다 — 밝히는 것은 글의 일이다 (S-piece).
 *
 * ── 이행이 고친 화면
 *
 * 옛 화면은 칩 한 쌍이 자리를 옮겨 다니며 값을 갈아 끼웠다. **n = 10 에서 100·n 이 열
 * 배 컸다는 사실이 다음 걸음에 지워졌고**, 마지막 걸음에서 칩이 통째로 날아가면 그
 * 문제 제기가 화면에서 사라졌다. 지금은 짚은 자리마다 자국이 남아 상수를 지운 뒤에도
 * "여기선 상수 쪽이 열 배 · 여기서 만나고 · 여기선 n² 가 열 배" 가 함께 선다.
 *
 * 간격의 `×10` 도 선언의 배율을 옮겨 적지 않고 **실제로 선 두 기둥의 거리**를 잰다
 * (`scene.ts` 의 `spansOf`). 결론이 그림과 같은 자료를 쓴다.
 *
 * ── 화면에 뜨는 수는 모두 한 함수를 지난다
 *
 * 칩의 두 값도 캡션의 배수도 자국의 `×10` 도 `readingAt` 하나에서 나오고, 그 안은
 * `algorithm.ts` 가 내준 `linearValueAt` · `quadValueAt` 이다. 가로 자리는 전부 장면의
 * `ticks` 를 자로 삼아 역산한다 — 척도를 정하는 자리가 하나뿐이다.
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * `PIECE_CANVAS_W` 로 주므로 여기 적지 않고, 그 폭을 좌우 여백 없이 채운다.
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `await ctx.emit` 이 영영 돌아오지 않는다
 * (S-piece).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  Palette,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  coefficientStepOf,
  cursorBefore,
  cursorOf,
  ghostPosts,
  marksOf,
  readingAt,
  spansOf,
  standingPost,
  topOf,
  type ConstantFadesScene,
  type ConstantFadesStep,
  type Cursor,
  type Lead,
  type Reading,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 내용이 정하는 값이라 그림 곁에 둔다. */
const H = 238;

const W = PIECE_CANVAS_W;
const PAD_L = 36;
const PAD_R = 52;
const AXIS_X1 = W - PAD_R;

const CHIP_TOP = 16;
const CHIP_H = 44;
const CHIP_W = 98;
const CHIP_GAP = 12;
const STEM_TOP = CHIP_TOP + CHIP_H;

/** 짚은 자국이 앉는 줄. 칩 아래, 땅 위. */
const TRACE_CY = 82;
const TRACE_H = 18;
const TRACE_PAD_X = 7;

const BAND_TOP = 104;
const BAND_H = 28;
const BAND_BOTTOM = BAND_TOP + BAND_H;
const ARROW_W = 16;

const AXIS_Y = 152;
const TICK_LABEL_Y = 170;
const MARK_LABEL_Y = 190;
const SPACING_Y = 212;
const SPACING_LABEL_Y = 206;
const CAPTION_Y = 230;

/** 걸음마다 붙는 운동의 길이. 걸음 벽시계 = 이 값 + stepMs. */
const AXIS_MS = 520;
const PROBE_MS = 520;
const CHIP_MS = 200;
const BAND_MS = 420;
const MOVE_MS = 560;
const MARK_MS = 280;
const SPACING_MS = 360;
const ERASE_MS = 460;
const FRAME_MS = 16;

/** 자모 폭 어림 — 등폭 글꼴이라 글자 수에 비례한다. 라벨을 가운데 맞출 때만 쓴다. */
const MONO_RATIO = 0.6;
/** 땅 이름과 기둥 이름의 글자 크기. `fontSizes.sm` 과 같은 수다. */
const LABEL_SIZE = 12;
/** 자국 배지의 글자 크기. `fontSizes.xs` 와 같은 수다. */
const TRACE_SIZE = 11;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** 다섯 자리부터 세 자리씩 끊어 읽는다. 1000 은 그대로, 10000 은 끊는다. */
function groupDigits(value: number): string {
  const s = String(value);
  if (s.length <= 4) return s;
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** 배수는 정수면 정수로, 아니면 소수 한 자리로 읽는다. */
function formatRatio(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? groupDigits(rounded) : rounded.toFixed(1);
}

function textWidth(content: string, size: number): number {
  return content.length * size * MONO_RATIO;
}

/** 위 첨자 열. 차수를 글자로 옮길 때만 쓴다. */
const SUPERSCRIPTS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

/**
 * 차수 하나를 식의 이름으로. 1 이면 `n`, 2 면 `n²`.
 *
 * `n²` 를 글자로 박아 두면 선언이 차수를 데이터로 주는데도 화면이 그것을 안 따른다 —
 * 등식의 한 항이 상수로 박히는 자리다. 수식 표기라 번역하지 않는다 (C10 판정 3).
 */
function powerLabel(degree: number): string {
  const d = Math.trunc(degree);
  if (d === 1) return 'n';
  const mark = SUPERSCRIPTS[d];
  return mark === undefined ? `n^${d}` : `n${mark}`;
}

/** 축 위의 가로 자리. 눈금이 곧 자이고, 자르는 잣대가 여기 하나뿐이다. */
function xOfN(top: number, n: number): number {
  if (top <= 1 || n <= 1) return PAD_L;
  const t = Math.log(n) / Math.log(top);
  return PAD_L + clamp01(t) * (AXIS_X1 - PAD_L);
}

/** 값을 읽는 칩 한 장. 손잡이만 지닌다 — 수치는 장면에서 매번 다시 셈한다. */
type Chip = {
  group: SVGGElement;
  rect: SVGRectElement;
  formula: SVGTextElement;
  value: SVGTextElement;
};

/** 지금 짚고 있는 자리 — 줄기 하나와 칩 두 장. */
type ProbeDrawn = { group: SVGGElement; left: Chip; right: Chip };

/**
 * 두 땅과 그 이름.
 *
 * 이름의 폭을 미리 재어 지닌다 — 옛 stage 는 `coef.textContent` 를 **도로 읽어**
 * 폭을 셈했다 (④).
 */
type BandDrawn = {
  left: SVGRectElement;
  right: SVGRectElement;
  arrow: SVGPolygonElement;
  /** 상수를 지운 화면에는 아예 짓지 않는다. */
  coef: SVGTextElement | null;
  tail: SVGTextElement;
  quad: SVGTextElement;
  coefW: number;
  tailW: number;
};

type PostDrawn = { line: SVGLineElement; head: SVGPolygonElement };

/** 기둥 하나의 이름표. 자리는 장면의 `meeting` 에서 셈한다. */
type MarkDrawn = {
  coef: SVGTextElement | null;
  tail: SVGTextElement;
  x: number;
  coefX: number;
  tailX: number;
  tailErasedX: number;
};

type SpanDrawn = {
  line: SVGLineElement;
  head: SVGPolygonElement;
  label: SVGTextElement;
  from: number;
  to: number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  axis: SVGLineElement | null;
  ticks: SVGGElement[];
  traces: SVGGElement[];
  probe: ProbeDrawn | null;
  band: BandDrawn | null;
  post: PostDrawn | null;
  marks: MarkDrawn[];
  spans: SpanDrawn[];
};

export const constantFadesStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ConstantFadesScene> {
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gBand = el('g', {});
    const gGhost = el('g', {});
    const gAxis = el('g', {});
    const gMark = el('g', {});
    const gPost = el('g', {});
    const gProbe = el('g', {});
    const gTrace = el('g', {});
    const gCaption = el('g', {});
    const layers = [gBand, gGhost, gAxis, gMark, gPost, gProbe, gTrace, gCaption];
    for (const layer of layers) svg.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 마디를 지난다. `destroy` 가 그 가운데 오면 남은 마디가 이미
     * 떨어져 나간 화면에 쓰므로, 마디마다 자기 번호가 아직 유효한지 보고 물러난다.
     * `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS transition 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition 은
     * 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다.
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 칩 ───────────────────────────────────────────────────────────────

    function makeChip(offsetX: number): Chip {
      const group = el('g', { transform: `translate(${offsetX} 0)` });
      const rect = el('rect', {
        x: 0,
        y: CHIP_TOP,
        width: CHIP_W,
        height: CHIP_H,
        rx: 6,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': 1,
      });
      const formula = el('text', {
        x: CHIP_W / 2,
        y: CHIP_TOP + 17,
        'text-anchor': 'middle',
        fill: c.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
      });
      const value = el('text', {
        x: CHIP_W / 2,
        y: CHIP_TOP + 35,
        'text-anchor': 'middle',
        fill: c.text,
        'font-size': fontSizes.md,
        'font-family': fonts.mono,
      });
      group.appendChild(rect);
      group.appendChild(formula);
      group.appendChild(value);
      return { group, rect, formula, value };
    }

    /**
     * 칩 한 장을 칠한다.
     *
     * **채움이 값의 형편**(앞섰다 / 뒤졌다 / 정확히 만났다)이고 그 밖의 축을 여기
     * 얹지 않는다. 짚어 보았다는 표식은 아래 자국이 따로 진다.
     */
    function paintChip(
      chip: Chip,
      formula: string,
      value: string,
      state: 'lead' | 'plain' | 'tie',
    ): void {
      chip.formula.textContent = formula;
      chip.value.textContent = value;
      const fill = state === 'lead' ? c.itemActive : state === 'tie' ? c.itemPivot : c.itemDefault;
      chip.rect.setAttribute('fill', fill);
      chip.rect.setAttribute('stroke', state === 'plain' ? c.border : fill);
      chip.value.setAttribute('fill', state === 'plain' ? c.text : c.stateInk);
      chip.formula.setAttribute('fill', state === 'plain' ? c.textMuted : c.stateInk);
    }

    function leftState(lead: Lead): 'lead' | 'plain' | 'tie' {
      return lead === 'tie' ? 'tie' : lead === 'linear' ? 'lead' : 'plain';
    }

    function rightState(lead: Lead): 'lead' | 'plain' | 'tie' {
      return lead === 'tie' ? 'tie' : lead === 'quad' ? 'lead' : 'plain';
    }

    /** 두 칩에 그 자리의 값을 싣는다. `blank` 면 식만 남기고 수를 비운다. */
    function paintChips(
      probe: ProbeDrawn,
      scene: ConstantFadesScene,
      reading: Reading,
      blank: boolean,
    ): void {
      const linearName = `${groupDigits(reading.coefficient)}·${powerLabel(scene.linearDegree)}`;
      const quadName = powerLabel(scene.quadraticDegree);
      if (blank) {
        // 옮겨 가는 중의 칩에 옛 자리의 값을 남기면 거짓이 된다.
        paintChip(probe.left, linearName, '', 'plain');
        paintChip(probe.right, quadName, '', 'plain');
        return;
      }
      paintChip(probe.left, linearName, groupDigits(reading.linear), leftState(reading.lead));
      paintChip(probe.right, quadName, groupDigits(reading.quad), rightState(reading.lead));
    }

    function setProbeX(probe: ProbeDrawn, x: number): void {
      probe.group.setAttribute('transform', `translate(${x.toFixed(2)} 0)`);
    }

    // ── 두 땅 ────────────────────────────────────────────────────────────

    /** 땅 이름을 자리에 앉힌다. 폭은 우리가 만든 글자에서 재고 화면에서 읽지 않는다. */
    function placeBand(band: BandDrawn, x: number, erased: boolean): void {
      band.left.setAttribute('x', String(PAD_L));
      band.left.setAttribute('width', Math.max(0, x - PAD_L).toFixed(2));
      band.right.setAttribute('x', x.toFixed(2));
      band.right.setAttribute('width', Math.max(0, W - ARROW_W - x).toFixed(2));
      const center = (PAD_L + x) / 2;
      const start = center - (band.coefW + band.tailW) / 2;
      band.coef?.setAttribute('x', start.toFixed(2));
      band.tail.setAttribute(
        'x',
        (erased ? center - band.tailW / 2 : start + band.coefW).toFixed(2),
      );
      band.quad.setAttribute('x', ((x + (W - ARROW_W)) / 2).toFixed(2));
    }

    function setPostX(post: PostDrawn, x: number): void {
      post.line.setAttribute('x1', x.toFixed(2));
      post.line.setAttribute('x2', x.toFixed(2));
      post.head.setAttribute(
        'points',
        `${(x - 6).toFixed(2)},${BAND_TOP - 8} ${(x + 6).toFixed(2)},${BAND_TOP - 8} ${x.toFixed(2)},${BAND_TOP}`,
      );
    }

    // ── 캡션 ─────────────────────────────────────────────────────────────

    /**
     * 캡션이 말할 것.
     *
     * 수는 하나도 장면에 실려 오지 않는다 — 칩과 자국이 쓰는 그 함수에서 여기서도
     * 낸다. 그러니 캡션의 수와 화면의 값이 갈릴 자리가 없다.
     */
    function captionFor(scene: ConstantFadesScene): string {
      const step = scene.step;
      if (step === null) return '';

      switch (step.kind) {
        case 'axis':
          return t('caption.axis', 'Lay out the line where n grows.');

        case 'probe': {
          const at = cursorOf(scene);
          if (at === null) return '';
          const r = readingAt(scene, at);
          if (r.lead === 'tie') {
            return t('caption.tie', 'At n = {n} the two meet exactly: both are {value}.', {
              n: groupDigits(r.n),
              value: groupDigits(r.linear),
            });
          }
          if (r.lead === 'linear') {
            return t(
              'caption.leadLinear',
              'At n = {n}, {coefficient}·n is {ratio} times as large as n².',
              {
                n: groupDigits(r.n),
                coefficient: groupDigits(r.coefficient),
                ratio: formatRatio(r.ratio),
              },
            );
          }
          return t(
            'caption.leadQuad',
            'At n = {n}, n² is {ratio} times as large as {coefficient}·n — and it never gives the lead back.',
            {
              n: groupDigits(r.n),
              coefficient: groupDigits(r.coefficient),
              ratio: formatRatio(r.ratio),
            },
          );
        }

        case 'boundary': {
          const post = standingPost(scene);
          if (post === null) return '';
          return t(
            'caption.boundary',
            'Left of the post {coefficient}·n leads; everything to the right belongs to n². The post stands at n = {meeting}.',
            {
              coefficient: groupDigits(post.coefficient),
              meeting: groupDigits(post.meeting),
            },
          );
        }

        case 'move': {
          const post = standingPost(scene);
          const before = cursorBefore(scene);
          if (post === null) return '';
          // 기둥이 어느 쪽으로 갔는지가 곧 상수를 줄였는지 키웠는지다. 그 판정을
          // 걸음이 실어 오지 않는다 — 앞 기둥이 어디였나는 자취가 안다.
          const wentLeft = before !== null && post.meeting < before.n;
          if (wentLeft) {
            return t(
              'caption.shrink',
              'Constant {coefficient} — the meeting point slides one tick to the left, to n = {meeting}.',
              {
                coefficient: groupDigits(post.coefficient),
                meeting: groupDigits(post.meeting),
              },
            );
          }
          return t(
            'caption.grow',
            'Constant {coefficient} — raising it only pushes the meeting point right, to n = {meeting}.',
            {
              coefficient: groupDigits(post.coefficient),
              meeting: groupDigits(post.meeting),
            },
          );
        }

        case 'spacing': {
          const factor = coefficientStepOf(scene);
          if (factor === null) return '';
          return t(
            'caption.spacing',
            'A {factor}-fold constant buys exactly one tick. The right end stays with n² either way.',
            { factor: formatRatio(factor) },
          );
        }

        case 'erase':
          return t(
            'caption.erase',
            'Erase the constants and the three say one thing: n against n². The constant only chose where they meet.',
          );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: ConstantFadesScene): Drawn {
      rewind();
      const top = topOf(scene);
      const drawn: Drawn = {
        axis: null,
        ticks: [],
        traces: [],
        probe: null,
        band: null,
        post: null,
        marks: [],
        spans: [],
      };

      // ── 캡션. 지금 화면에서 무슨 일이 일어나는지만 말한다 (S-piece).
      const caption = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        fill: c.text,
        'font-size': fontSizes.sm,
        'font-family': fonts.body,
      });
      caption.textContent = captionFor(scene);
      gCaption.appendChild(caption);

      // ── 눈금. 이것이 이 그림의 자다.
      if (scene.ticks.length > 0) {
        const line = el('line', {
          x1: PAD_L,
          y1: AXIS_Y,
          x2: AXIS_X1,
          y2: AXIS_Y,
          stroke: c.border,
          'stroke-width': 2,
        });
        gAxis.appendChild(line);
        drawn.axis = line;

        for (const n of scene.ticks) {
          const g = el('g', {});
          const x = xOfN(top, n);
          g.appendChild(
            el('line', {
              x1: x,
              y1: AXIS_Y - 5,
              x2: x,
              y2: AXIS_Y + 5,
              stroke: c.border,
              'stroke-width': 2,
            }),
          );
          const label = el('text', {
            x,
            y: TICK_LABEL_Y,
            'text-anchor': 'middle',
            fill: c.textMuted,
            'font-size': fontSizes.xs,
            'font-family': fonts.mono,
          });
          label.textContent = groupDigits(n);
          g.appendChild(label);
          gAxis.appendChild(g);
          drawn.ticks.push(g);
        }
      }

      // ── 두 땅과 기둥.
      const post = standingPost(scene);
      if (post !== null) {
        const postX = xOfN(top, post.meeting);
        const coefText = `${groupDigits(post.coefficient)}·`;
        const tailText = powerLabel(scene.linearDegree);

        const left = el('rect', {
          x: PAD_L,
          y: BAND_TOP,
          width: 0,
          height: BAND_H,
          fill: c.subtreeShadeLeft,
          stroke: c.border,
          'stroke-width': 1,
        });
        const right = el('rect', {
          x: PAD_L,
          y: BAND_TOP,
          width: 0,
          height: BAND_H,
          fill: c.subtreeShadeRight,
          stroke: c.border,
          'stroke-width': 1,
        });
        const arrow = el('polygon', {
          points: `${W - ARROW_W},${BAND_TOP} ${W - 2},${BAND_TOP + BAND_H / 2} ${W - ARROW_W},${BAND_BOTTOM}`,
          fill: c.subtreeShadeRight,
        });
        // 상수를 지운 화면에는 계수를 아예 짓지 않는다. 숨기기만 하면 앞 걸음의
        // 속성이 남는다 (S-scene).
        const coef = scene.erased
          ? null
          : el('text', {
              x: PAD_L,
              y: BAND_TOP + 19,
              fill: c.text,
              'font-size': fontSizes.sm,
              'font-family': fonts.mono,
            });
        if (coef) coef.textContent = coefText;
        const tail = el('text', {
          x: PAD_L,
          y: BAND_TOP + 19,
          fill: c.text,
          'font-size': fontSizes.sm,
          'font-family': fonts.mono,
        });
        tail.textContent = tailText;
        const quad = el('text', {
          x: W - ARROW_W,
          y: BAND_TOP + 19,
          'text-anchor': 'middle',
          fill: c.text,
          'font-size': fontSizes.sm,
          'font-family': fonts.mono,
        });
        quad.textContent = powerLabel(scene.quadraticDegree);

        gBand.appendChild(left);
        gBand.appendChild(right);
        gBand.appendChild(arrow);
        if (coef) gBand.appendChild(coef);
        gBand.appendChild(tail);
        gBand.appendChild(quad);

        const band: BandDrawn = {
          left,
          right,
          arrow,
          coef,
          tail,
          quad,
          coefW: textWidth(coefText, LABEL_SIZE),
          tailW: textWidth(tailText, LABEL_SIZE),
        };
        placeBand(band, postX, scene.erased);
        drawn.band = band;

        // 지나온 기둥은 유령으로 남는다 — 어디서 여기까지 왔나가 자취다.
        for (const ghost of ghostPosts(scene)) {
          const gx = xOfN(top, ghost.meeting);
          gGhost.appendChild(
            el('line', {
              x1: gx,
              y1: BAND_TOP,
              x2: gx,
              y2: AXIS_Y,
              stroke: c.ghostOutline,
              'stroke-width': 1.5,
              'stroke-dasharray': '4 4',
            }),
          );
        }

        const line = el('line', {
          x1: postX,
          y1: BAND_TOP,
          x2: postX,
          y2: AXIS_Y,
          stroke: c.accent,
          'stroke-width': 3,
        });
        const head = el('polygon', {
          points: `${postX - 6},${BAND_TOP - 8} ${postX + 6},${BAND_TOP - 8} ${postX},${BAND_TOP}`,
          fill: c.accent,
        });
        gPost.appendChild(line);
        gPost.appendChild(head);
        drawn.post = { line, head };
        setPostX(drawn.post, postX);
      }

      // ── 기둥 이름표와 간격. 어느 기둥들인지는 자취가 말한다.
      if (scene.spaced) {
        for (const mark of marksOf(scene)) {
          const x = xOfN(top, mark.meeting);
          const coefText = `${groupDigits(mark.coefficient)}·`;
          const tailText = powerLabel(scene.linearDegree);
          const coefW = textWidth(coefText, LABEL_SIZE);
          const tailW = textWidth(tailText, LABEL_SIZE);
          const start = x - (coefW + tailW) / 2;

          const coef = scene.erased
            ? null
            : el('text', {
                x: start,
                y: MARK_LABEL_Y,
                fill: c.text,
                'font-size': fontSizes.sm,
                'font-family': fonts.mono,
              });
          if (coef) {
            coef.textContent = coefText;
            gMark.appendChild(coef);
          }
          const tailX = scene.erased ? x - tailW / 2 : start + coefW;
          const tail = el('text', {
            x: tailX,
            y: MARK_LABEL_Y,
            fill: c.text,
            'font-size': fontSizes.sm,
            'font-family': fonts.mono,
          });
          tail.textContent = tailText;
          gMark.appendChild(tail);

          drawn.marks.push({
            coef,
            tail,
            x,
            coefX: start,
            tailX: start + coefW,
            tailErasedX: x - tailW / 2,
          });
        }

        for (const span of spansOf(scene)) {
          const from = xOfN(top, span.from.meeting);
          const to = xOfN(top, span.to.meeting);
          const line = el('line', {
            x1: from,
            y1: SPACING_Y,
            x2: to,
            y2: SPACING_Y,
            stroke: c.textMuted,
            'stroke-width': 1.5,
          });
          const head = el('polygon', {
            points: `${to - 7},${SPACING_Y - 4} ${to},${SPACING_Y} ${to - 7},${SPACING_Y + 4}`,
            fill: c.textMuted,
          });
          const label = el('text', {
            x: (from + to) / 2,
            y: SPACING_LABEL_Y,
            'text-anchor': 'middle',
            fill: c.textMuted,
            'font-size': fontSizes.xs,
            'font-family': fonts.mono,
          });
          // 배율을 선언에서 옮겨 적지 않는다 — 실제로 선 두 기둥의 거리다.
          label.textContent = `×${formatRatio(span.ratio)}`;
          gMark.appendChild(line);
          gMark.appendChild(head);
          gMark.appendChild(label);
          drawn.spans.push({ line, head, label, from, to });
        }
      }

      // ── 지금 짚고 있는 자리.
      const cursor = cursorOf(scene);
      if (cursor !== null && !scene.erased) {
        drawn.probe = buildProbe(scene, cursor, top);
      }

      // ── 짚은 자국. **남는 자취라 정적 그리기가 세운다** — 빠뜨리면 되짚었을 때
      // "작을 때는 상수가 컸다" 가 화면에서 사라진다 (S-scene).
      for (const mark of scene.probes) {
        drawn.traces.push(buildTrace(scene, mark, top));
      }

      return drawn;
    }

    function buildProbe(scene: ConstantFadesScene, cursor: Cursor, top: number): ProbeDrawn {
      const group = el('g', {});
      group.appendChild(
        el('line', {
          x1: 0,
          y1: STEM_TOP,
          x2: 0,
          y2: AXIS_Y,
          stroke: c.auxCursor,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 3',
        }),
      );
      group.appendChild(
        el('polygon', {
          points: `-5,${AXIS_Y - 9} 5,${AXIS_Y - 9} 0,${AXIS_Y}`,
          fill: c.auxCursor,
        }),
      );
      const left = makeChip(-(CHIP_W + CHIP_GAP / 2));
      const right = makeChip(CHIP_GAP / 2);
      group.appendChild(left.group);
      group.appendChild(right.group);
      gProbe.appendChild(group);

      const probe: ProbeDrawn = { group, left, right };
      setProbeX(probe, xOfN(top, cursor.n));
      paintChips(probe, scene, readingAt(scene, cursor), false);
      return probe;
    }

    /**
     * 짚어 본 자리에 남는 자국.
     *
     * **채움이 어느 쪽이 앞섰나**이고 글자는 몇 배였나다. 테두리는 "여기를 짚어
     * 보았다" 는 표식 하나만 진다 — 한 축에 두 뜻을 싣지 않는다.
     */
    function buildTrace(
      scene: ConstantFadesScene,
      mark: { n: number; coefficient: number },
      top: number,
    ): SVGGElement {
      const r = readingAt(scene, mark);
      const text = r.lead === 'tie' ? '=' : `×${formatRatio(r.ratio)}`;
      const width = Math.max(22, textWidth(text, TRACE_SIZE) + TRACE_PAD_X * 2);
      const x = xOfN(top, mark.n);
      const fill =
        r.lead === 'tie'
          ? c.itemPivot
          : r.lead === 'linear'
            ? c.subtreeShadeLeft
            : c.subtreeShadeRight;

      const g = el('g', {});
      g.appendChild(
        el('rect', {
          x: x - width / 2,
          y: TRACE_CY - TRACE_H / 2,
          width,
          height: TRACE_H,
          rx: 4,
          fill,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      const label = el('text', {
        x,
        y: TRACE_CY + 4,
        'text-anchor': 'middle',
        fill: r.lead === 'tie' ? c.stateInk : c.text,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
      });
      label.textContent = text;
      g.appendChild(label);
      gTrace.appendChild(g);
      return g;
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 **아직 못 온 만큼을
    // 뒤로 물려** 두었다가 놓아 준다. 출발 자리는 장면의 자취가 말한다.

    /** 눈금이 펴지고 자리가 차례로 내려앉는다. */
    function flowAxis(drawn: Drawn, mine: number): Promise<void> {
      const line = drawn.axis;
      if (line === null) return Promise.resolve();
      return tween(AXIS_MS, mine, (p) => {
        const e = ease(p);
        line.setAttribute('x2', String(PAD_L + (AXIS_X1 - PAD_L) * e));
        drawn.ticks.forEach((g, i) => {
          const local = clamp01((e - i * 0.1) / 0.5);
          g.setAttribute('opacity', String(local));
          g.setAttribute('transform', `translate(0 ${(-14 * (1 - local)).toFixed(2)})`);
        });
      });
    }

    /** 칩이 옮겨 가고, 자리를 잡은 뒤에야 값이 내려앉는다. 자국도 그때 남는다. */
    function flowProbe(
      scene: ConstantFadesScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const probe = drawn.probe;
      const cursor = cursorOf(scene);
      if (probe === null || cursor === null) return Promise.resolve();

      const top = topOf(scene);
      const before = cursorBefore(scene);
      const fromX = before === null ? PAD_L : xOfN(top, before.n);
      const toX = xOfN(top, cursor.n);
      const reading = readingAt(scene, cursor);
      const trace = drawn.traces[drawn.traces.length - 1];
      const total = PROBE_MS + CHIP_MS;

      return tween(total, mine, (p) => {
        const ms = p * total;
        if (ms < PROBE_MS) {
          const e = ease(clamp01(ms / PROBE_MS));
          setProbeX(probe, lerp(fromX, toX, e));
          paintChips(probe, scene, reading, true);
          trace?.setAttribute('opacity', '0');
          return;
        }
        const e = ease(clamp01((ms - PROBE_MS) / CHIP_MS));
        setProbeX(probe, toX);
        paintChips(probe, scene, reading, false);
        for (const chip of [probe.left, probe.right]) {
          chip.value.setAttribute('opacity', String(e));
          chip.value.setAttribute('transform', `translate(0 ${(-8 * (1 - e)).toFixed(2)})`);
        }
        trace?.setAttribute('opacity', String(e));
      });
    }

    /** 기둥이 서고 두 땅이 기둥에서 좌우로 번져 나간다. */
    function flowBoundary(
      scene: ConstantFadesScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const probe = drawn.probe;
      const band = drawn.band;
      const post = drawn.post;
      const cursor = cursorOf(scene);
      if (probe === null || band === null || post === null || cursor === null) {
        return Promise.resolve();
      }

      const top = topOf(scene);
      const before = cursorBefore(scene);
      const fromX = before === null ? PAD_L : xOfN(top, before.n);
      const toX = xOfN(top, cursor.n);
      const reading = readingAt(scene, cursor);
      const trace = drawn.traces[drawn.traces.length - 1];
      const walkMs = PROBE_MS + CHIP_MS;
      const total = walkMs + BAND_MS;

      const hideGround = (): void => {
        band.left.setAttribute('x', toX.toFixed(2));
        band.left.setAttribute('width', '0');
        band.right.setAttribute('x', toX.toFixed(2));
        band.right.setAttribute('width', '0');
        band.arrow.setAttribute('opacity', '0');
        band.coef?.setAttribute('opacity', '0');
        band.tail.setAttribute('opacity', '0');
        band.quad.setAttribute('opacity', '0');
        post.line.setAttribute('y2', String(BAND_TOP));
        post.head.setAttribute('opacity', '0');
      };

      return tween(total, mine, (p) => {
        const ms = p * total;
        if (ms < walkMs) {
          hideGround();
          if (ms < PROBE_MS) {
            const e = ease(clamp01(ms / PROBE_MS));
            setProbeX(probe, lerp(fromX, toX, e));
            paintChips(probe, scene, reading, true);
            trace?.setAttribute('opacity', '0');
            return;
          }
          const e = ease(clamp01((ms - PROBE_MS) / CHIP_MS));
          setProbeX(probe, toX);
          paintChips(probe, scene, reading, false);
          for (const chip of [probe.left, probe.right]) {
            chip.value.setAttribute('opacity', String(e));
            chip.value.setAttribute('transform', `translate(0 ${(-8 * (1 - e)).toFixed(2)})`);
          }
          trace?.setAttribute('opacity', '0');
          return;
        }

        setProbeX(probe, toX);
        paintChips(probe, scene, reading, false);
        trace?.setAttribute('opacity', '1');
        const e = ease(clamp01((ms - walkMs) / BAND_MS));
        post.line.setAttribute(
          'y2',
          String(BAND_TOP + (AXIS_Y - BAND_TOP) * Math.min(1, e * 2)),
        );
        post.head.setAttribute('opacity', String(Math.min(1, e * 2)));
        band.left.setAttribute('x', (toX - (toX - PAD_L) * e).toFixed(2));
        band.left.setAttribute('width', ((toX - PAD_L) * e).toFixed(2));
        band.right.setAttribute('width', ((W - ARROW_W - toX) * e).toFixed(2));
        band.arrow.setAttribute('opacity', String(clamp01((e - 0.6) / 0.4)));
        band.coef?.setAttribute('opacity', String(e));
        band.tail.setAttribute('opacity', String(e));
        band.quad.setAttribute('opacity', String(e));
      });
    }

    /** 상수를 갈면 기둥과 땅과 칩이 한 몸으로 옮겨 앉는다. */
    function flowMove(scene: ConstantFadesScene, drawn: Drawn, mine: number): Promise<void> {
      const probe = drawn.probe;
      const band = drawn.band;
      const post = drawn.post;
      const cursor = cursorOf(scene);
      if (probe === null || band === null || post === null || cursor === null) {
        return Promise.resolve();
      }

      const top = topOf(scene);
      const before = cursorBefore(scene);
      const fromX = before === null ? PAD_L : xOfN(top, before.n);
      const toX = xOfN(top, cursor.n);
      const reading = readingAt(scene, cursor);
      const total = MOVE_MS + CHIP_MS;

      // 옮기는 것이 한 뜻이라 시계를 나누지 않는다 (S-scene).
      return tween(total, mine, (p) => {
        const ms = p * total;
        if (ms < MOVE_MS) {
          const e = ease(clamp01(ms / MOVE_MS));
          const x = lerp(fromX, toX, e);
          setProbeX(probe, x);
          setPostX(post, x);
          placeBand(band, x, scene.erased);
          paintChips(probe, scene, reading, true);
          return;
        }
        const e = ease(clamp01((ms - MOVE_MS) / CHIP_MS));
        setProbeX(probe, toX);
        setPostX(post, toX);
        placeBand(band, toX, scene.erased);
        paintChips(probe, scene, reading, false);
        for (const chip of [probe.left, probe.right]) {
          chip.value.setAttribute('opacity', String(e));
          chip.value.setAttribute('transform', `translate(0 ${(-8 * (1 - e)).toFixed(2)})`);
        }
      });
    }

    /** 이름표가 내려앉고, 화살이 밀려나는 방향 그대로 그어진다. */
    function flowSpacing(drawn: Drawn, mine: number): Promise<void> {
      if (drawn.marks.length === 0) return Promise.resolve();
      const total = MARK_MS + SPACING_MS;

      return tween(total, mine, (p) => {
        const ms = p * total;
        const markE = ease(clamp01(ms / MARK_MS));
        drawn.marks.forEach((m, i) => {
          const local = clamp01((markE - i * 0.14) / 0.5);
          for (const node of [m.coef, m.tail]) {
            node?.setAttribute('opacity', String(local));
            node?.setAttribute('transform', `translate(0 ${(-10 * (1 - local)).toFixed(2)})`);
          }
        });

        const spanE = ms < MARK_MS ? 0 : ease(clamp01((ms - MARK_MS) / SPACING_MS));
        for (const s of drawn.spans) {
          s.line.setAttribute('x2', lerp(s.from, s.to, spanE).toFixed(2));
          s.head.setAttribute('opacity', String(clamp01((spanE - 0.7) / 0.3)));
          s.label.setAttribute('opacity', String(clamp01((spanE - 0.5) / 0.5)));
        }
      });
    }

    /**
     * 상수가 떨어져 나가고 셋이 같은 말이 된다.
     *
     * 지우기 **전**의 그림은 같은 장면에서 다시 세운다 (`erased: false`) — 옛 화면을
     * 들추거나 `prev` 에서 꺼내지 않는다 (S-scene). 마지막 정적 그리기가 그 임시
     * 요소들을 통째로 걷어 간다.
     */
    function flowErase(scene: ConstantFadesScene, mine: number): Promise<void> {
      const pre = drawStatic({ ...scene, erased: false });
      const cursor = cursorOf(scene);
      const top = topOf(scene);
      const cursorX = cursor === null ? PAD_L : xOfN(top, cursor.n);
      const band = pre.band;

      return tween(ERASE_MS, mine, (p) => {
        const e = ease(p);

        // 값을 읽던 칩은 위로 빠진다 — 상수를 지운 뒤의 수를 남기면 거짓이 된다.
        if (pre.probe !== null) {
          pre.probe.group.setAttribute(
            'transform',
            `translate(${cursorX.toFixed(2)} ${(-(STEM_TOP + 24) * e).toFixed(2)})`,
          );
          pre.probe.group.setAttribute('opacity', String(1 - e));
        }

        if (band !== null) {
          band.coef?.setAttribute('transform', `translate(0 ${(26 * e).toFixed(2)})`);
          band.coef?.setAttribute('opacity', String(1 - e));
          const center = (PAD_L + cursorX) / 2;
          const start = center - (band.coefW + band.tailW) / 2;
          band.tail.setAttribute(
            'x',
            lerp(start + band.coefW, center - band.tailW / 2, e).toFixed(2),
          );
        }

        pre.marks.forEach((m, i) => {
          const local = clamp01((e - i * 0.1) / 0.7);
          m.coef?.setAttribute('transform', `translate(0 ${(26 * local).toFixed(2)})`);
          m.coef?.setAttribute('opacity', String(1 - local));
          m.tail.setAttribute('x', lerp(m.tailX, m.tailErasedX, local).toFixed(2));
        });
      });
    }

    function flowFor(
      step: ConstantFadesStep,
      scene: ConstantFadesScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'axis':
          return flowAxis(drawn, mine);
        case 'probe':
          return flowProbe(scene, drawn, mine);
        case 'boundary':
          return flowBoundary(scene, drawn, mine);
        case 'move':
          return flowMove(scene, drawn, mine);
        case 'spacing':
          return flowSpacing(drawn, mine);
        case 'erase':
          return flowErase(scene, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: ConstantFadesScene,
      _prev: ConstantFadesScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, next, drawn, mine);
      if (!alive(mine)) return;

      // 운동이 남긴 속성과 보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
