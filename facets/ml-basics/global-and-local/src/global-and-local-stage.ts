/**
 * global-and-local-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * 무대는 산점도가 아니다. **가로로 놓인 자(직선) 둘**과 그 위에 앉은 열두 자리가
 * 전부다. 위 자는 큰 거리를 지키는 방식, 아래 자는 이웃만 지키는 방식이고, 같은
 * 자리끼리 세로로 이으면 어긋남이 실을 기울여 드러낸다.
 *
 * 두 자의 단위는 서로 다르므로 픽셀로 견주려면 기준이 있어야 한다. 그래서
 * **첫 무리와 마지막 무리의 가운데를 두 자에서 같은 x 에 못박고**(앵커), 나머지가
 * 어디 앉는지만 본다. 양 끝이 고정이라 남는 이야기는 가운데 무리 하나뿐이다. 이
 * 전제를 밝히는 것은 `description.ts` 의 몫이다 (S-piece).
 *
 * ── 이행이 고친 화면 — 세 답 가운데 둘이 캡션에만 살았다
 *
 * 이 조각의 주장은 *견줌*이다. 원래 자료는 "뒤 사이가 앞 사이의 세 배" 라 답하고,
 * 위 자는 그 답을 그대로 옮기고, 아래 자는 "둘이 같다" 고 답한다. **세 답이 한
 * 화면에 함께 서야 주장이 선다.**
 *
 * 옛 화면에서 괄호 곁의 백분율은 **그 자의 몫 하나**뿐이었고, 원래 몫은
 * `caption.gap` 에만 있다가 다음 사이의 캡션에 덮였다. 완주 화면에는 "두 자가 서로
 * 다르다" 만 남고 **어느 쪽이 옳은가**가 없었다 — 위 자를 믿을 까닭이 화면에서
 * 사라진 것이다 (함정 7).
 *
 * 지금은 괄호의 글자가 `원래 → 이 자` 두 몫을 나란히 이고 끝까지 남는다. 위 자는
 * 두 수가 같고 아래 자는 벌어지므로, 캡션을 하나도 읽지 않아도 주장이 선다.
 *
 * 어휘도 갈라 둔다.
 *
 * - **채움 = 형편** — 점과 띠의 색이 "어느 무리인가" 를 말한다. 그 축에 다른 뜻을
 *   싣지 않는다.
 * - **굵기·짙기 = 표식** — 실이 굵고 짙은 것은 "가장 크게 밀린 무리" 다. 자취에서
 *   셈하므로 끝까지 남는다.
 * - **가위표 = 판정의 표식** — 아래 자의 괄호에만 선다. 괄호의 색(위는 본문색,
 *   아래는 위험색)은 그것을 거들 뿐이라, 색을 못 읽어도 가위표가 같은 말을 한다.
 *
 * ── 척도는 적어 두지 않는다
 *
 * 옛 stage 는 `unitLo`·`unitHi` 를 첫 걸음에 적어 두고 그 뒤로 계속 썼다 — 화면의
 * 모든 가로 자리가 그 둘을 지났다. 지금은 `unitRangeOf` 가 담긴 자리들에서 매번
 * 셈한다. 장면이 담는 것은 픽셀이 아니라 **값의 범위**다 (S-piece).
 *
 * 색판도 **바탕의 무리 수**에서 한 번에 센다. `categorical` 은 인자가 바뀌면 hue
 * 간격이 통째로 갈리므로 *지금까지 드러난 수*로 정하면 안 된다 (함정 12).
 *
 * ── CSS transition 도 상시 rAF 루프도 쓰지 않는다
 *
 * 되짚기는 `animate:false` 로 오는데 그 둘은 그 뒤에도 화면을 저 혼자 흘러가게
 * 한다 (S-scene MUST NOT). 보간은 `tween` 한 자리에 모으고 벽시계는 `setTimeout`
 * 으로 잰다 — 걸음이 프레임 없는 자리에서도 돌아야 하기 때문이다.
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도
 * 함께 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안
 * 돌아온다 (S-piece).
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * `PIECE_CANVAS_W` 로 준다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  shiftLightness,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  Palette,
  SceneRenderer,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  GLOBAL_AND_LOCAL_ROWS,
  centroidUnitOf,
  flatteningOf,
  gapsOf,
  groupUnitSpanOf,
  insideSharesOf,
  loudestGroupOf,
  loudestShiftOf,
  ratiosOf,
  smallestGroupSize,
  unitOf,
  unitRangeOf,
  type GlobalAndLocalRow,
  type GlobalAndLocalScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 그림이 정한다 — 캡션 두 줄 + 자 둘 + 그 사이의 실. 마운트 뒤 바뀌지 않는다 (S-view). */
const H = 320;
/** 좌우로 남기는 여백. 자는 이 안을 가득 채운다. */
const SIDE = 40;
/** 자 안쪽으로 한 번 더 들이는 폭. 끝 자리의 동그라미가 자 밖으로 나가지 않게 한다. */
const INSET = 12;

const CAPTION_Y1 = 17;
const CAPTION_Y2 = 33;
const G_LABEL_Y = 62;
const G_GAP_Y = 88;
const G_NAME_Y = 108;
const G_AXIS_Y = 122;
const L_AXIS_Y = 226;
const L_NAME_Y = 246;
const L_GAP_Y = 262;
const L_LABEL_Y = 302;

const DOT_R = 4.5;
const CENTROID_HALF = 9;
const BAND_HALF = 8;
const GAP_TICK = 5;
const CROSS_ARM = 6;

/** 앵커 점선이 걸치는 위아래. 두 자의 무리 표식을 딱 감싼다. */
const GUIDE_TOP = G_AXIS_Y - CENTROID_HALF;
const GUIDE_BOTTOM = L_AXIS_Y + CENTROID_HALF;

/** 실이 두 자 사이를 잇는 자리. 점에 닿지 않게 반지름만큼 물린다. */
const TIE_TOP = G_AXIS_Y + DOT_R + 2;
const TIE_BOTTOM = L_AXIS_Y - DOT_R - 2;

const MS_ANCHOR = 260;
const MS_SPREAD = 520;
const MS_TIE = 460;
const MS_BAND = 380;
const MS_GAP = 340;
const MS_RATIO = 260;
const MS_CROSS = 380;
/** 보간 한 틱. 프레임이 없는 자리에서도 돌도록 벽시계로 잰다. */
const FRAME_MS = 16;

/** 도형에 새겨지는 표식 — 번역 대상이 아니다 (C10 판정 1·3). */
const ARROW = '→';

type Attrs = Record<string, string | number>;

function svgNode<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 토큰에서 받은 hex 에 알파만 얹는 순수 변환. 색 리터럴이 아니다 (S-view 예외). */
function withAlpha(hex: string, alpha: number): string {
  const body = hex.replace('#', '');
  const r = Number.parseInt(body.slice(0, 2), 16);
  const g = Number.parseInt(body.slice(2, 4), 16);
  const b = Number.parseInt(body.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

function easeOut(p: number): number {
  const rest = 1 - p;
  return 1 - rest * rest * rest;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function percent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/**
 * 캡션 줄바꿈. SVG 안에서 글자 폭을 재기 어려워 어림한다 — 한글·CJK 는 글자
 * 크기만큼, 나머지는 그 절반 남짓으로 본다. 두 줄을 넘으면 넘친 것을 둘째 줄에
 * 이어 붙인다 (잘라 버리면 문장이 조용히 사라진다).
 */
function wrapCaption(source: string, maxWidth: number, size: number): [string, string] {
  const widthOf = (chunk: string): number => {
    let total = 0;
    for (const ch of chunk) total += (ch.codePointAt(0) ?? 0) > 0x1100 ? size : size * 0.55;
    return total;
  };
  const lines: string[] = [];
  let line = '';
  for (const word of source.split(' ')) {
    const merged = line === '' ? word : `${line} ${word}`;
    if (line !== '' && widthOf(merged) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = merged;
    }
  }
  if (line !== '') lines.push(line);
  return [lines[0] ?? '', lines.slice(1).join(' ')];
}

/** 자마다의 세로 자리. 좌표가 아니라 어느 자냐가 정한다. */
const axisY = (row: GlobalAndLocalRow): number => (row === 'global' ? G_AXIS_Y : L_AXIS_Y);
const nameY = (row: GlobalAndLocalRow): number => (row === 'global' ? G_NAME_Y : L_NAME_Y);

/** 한 자가 편 자리들의 손잡이. */
type SpreadHandles = {
  dots: { node: SVGCircleElement; x: number }[];
  marks: { tick: SVGLineElement; name: SVGTextElement; x: number }[];
};

/** 사이 하나를 재는 괄호. `dir` 은 눈금이 뻗는 쪽(위 자는 아래로, 아래 자는 위로). */
type Bracket = {
  line: SVGLineElement;
  ticks: SVGLineElement[];
  label: SVGTextElement;
  x1: number;
  x2: number;
  y: number;
  dir: number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  /** 펴기 전에 자리들이 모여 있는 가운데. 운동의 출발이다. */
  origin: number;
  /** 앵커 점선 둘. */
  guides: SVGLineElement[];
  /** 자마다의 자리 손잡이. 아직 안 펴진 자는 들어 있지 않다. */
  spreads: Map<GlobalAndLocalRow, SpreadHandles>;
  /** 같은 자리를 잇는 실. */
  threads: { node: SVGLineElement; from: number; to: number }[];
  /** 무리가 차지하는 몫의 띠. */
  bands: { node: SVGRectElement; mid: number; half: number }[];
  /** 사이마다 [위 자, 아래 자] 두 괄호. */
  brackets: Bracket[][];
  /** 자마다의 비. */
  readouts: SVGTextElement[];
  /** 아래 자의 괄호에 서는 가위표. */
  arms: { node: SVGLineElement; mid: number; slope: number }[];
};

export const globalAndLocalStageView: CanvasView = {
  // 가로는 러너가 `PIECE_CANVAS_W` 로 정한다 — 여기 적으면 단일 출처가 둘이 된다.
  // `W` 상수는 좌표를 역산하는 데만 쓴다 (S-piece).
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<GlobalAndLocalScene> {
    const canvas = params.canvas;
    canvas.textContent = '';

    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const captionSize = Number.parseFloat(fontSizes.sm);

    // ── 층. 뒤에서 앞으로. 정적 그리기가 매번 비우고 다시 채운다.
    const layerBand = svgNode('g', {});
    const layerRuler = svgNode('g', {});
    const layerAnchor = svgNode('g', {});
    const layerTie = svgNode('g', {});
    const layerPoint = svgNode('g', {});
    const layerGap = svgNode('g', {});
    const layerLabel = svgNode('g', {});
    const layerReadout = svgNode('g', {});
    const layers = [
      layerBand,
      layerRuler,
      layerAnchor,
      layerTie,
      layerPoint,
      layerGap,
      layerLabel,
      layerReadout,
    ];
    for (const layer of layers) canvas.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 틱을 지난다. `destroy` 가 그 가운데 오면 남은 틱이 이미
     * 떨어져 나간 화면에 쓰므로, 틱마다 자기 번호가 아직 유효한지 보고 물러난다.
     * `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * `resolve` 를 `waiters` 에 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던
     * 약속이 함께 풀린다 — 콜백 안에만 두면 취소된 틱이 아예 안 불려 약속이 영영
     * 안 풀린다 (S-piece).
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

    function rewind(): void {
      for (const layer of layers) {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
      }
    }

    // ── 캡션 ─────────────────────────────────────────────────────────────
    //
    // 무엇을 말할지는 자취가 정한다. **`step` 을 읽지 않는다** — 흘려 세우는 길과
    // 곧바로 세우는 길이 같은 `step` 을 보므로 거기 기대면 검사가 이빨을 잃는다.

    function captionFor(scene: GlobalAndLocalScene): string {
      if (scene.closed) {
        return t('caption.done', 'Looking close and being close are not the same thing.');
      }
      const ratios = ratiosOf(scene);
      if (scene.verdict && ratios !== null) {
        return t(
          'caption.verdict',
          'What was {g} times apart is now {l} times. Do not read cluster-to-cluster distance off the bottom ruler.',
          { g: ratios.global.toFixed(2), l: ratios.local.toFixed(2) },
        );
      }
      if (scene.ratioShown && ratios !== null) {
        return t('caption.ratio', 'Second gap over first — originally 1 : {o}, top 1 : {g}, bottom 1 : {l}.', {
          o: ratios.origin.toFixed(2),
          g: ratios.global.toFixed(2),
          l: ratios.local.toFixed(2),
        });
      }
      if (scene.gapsShown > 0) {
        const gap = gapsOf(scene)[scene.gapsShown - 1];
        if (gap !== undefined) {
          return t(
            'caption.gap',
            'Now the gap between clusters — {from}–{to}. Originally {o} of the whole, top {g}, bottom {l}.',
            {
              from: gap.from,
              to: gap.to,
              o: percent(gap.originShare),
              g: percent(gap.globalShare),
              l: percent(gap.localShare),
            },
          );
        }
      }
      if (scene.inside) {
        const shares = insideSharesOf(scene);
        return t(
          'caption.inside',
          'Look inside a cluster — the room one cluster gets is {g} on top and {l} below. Below, all {n} are readable.',
          {
            g: percent(shares.global),
            l: percent(shares.local),
            n: String(smallestGroupSize(scene)),
          },
        );
      }
      if (scene.tied) {
        return t(
          'caption.tie',
          'Tie the same items together. Both ends are pinned, so what is left is the middle — it slid by {shift}.',
          { shift: percent(loudestShiftOf(scene)) },
        );
      }
      if (scene.spreadRows.includes('local')) {
        return t(
          'caption.spreadLocal',
          'Bottom ruler — only the order inside each cluster is kept, and the clusters are laid out at equal steps.',
        );
      }
      if (scene.spreadRows.includes('global')) {
        return t(
          'caption.spreadGlobal',
          'Top ruler — every point drops onto the widest direction. The long distances survive.',
        );
      }
      if (scene.plan !== null) {
        return t(
          'caption.rulers',
          'The same data, flattened two ways. Two rulers side by side, with the end clusters pinned to the same spots on both.',
        );
      }
      return '';
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: GlobalAndLocalScene): Drawn {
      rewind();

      // ── 색판. 바탕의 무리 수에서 한 번에 센다 — 드러난 수로 정하지 않는다 (함정 12).
      const palette = categorical(Math.max(1, scene.groups.length), 'vivid');
      const colorOf = (group: string): string => {
        const idx = scene.groups.findIndex((g) => g.name === group);
        return idx >= 0 ? palette[idx % palette.length] : colors.text;
      };
      const inkOf = (group: string): string => shiftLightness(colorOf(group), -0.22);

      // ── 척도. 담긴 자리들이 정하므로 걸음마다 같은 값이 나온다. 자리를 먼저 한
      //    번에 셈하고 그 다음에 그린다 (함정 13).
      const range = unitRangeOf(scene);
      const left = SIDE + INSET;
      const denom = range.hi - range.lo || 1;
      const xOfUnit = (u: number): number => left + ((u - range.lo) / denom) * (W - left * 2);
      const xOf = (row: GlobalAndLocalRow, value: number): number =>
        xOfUnit(unitOf(scene, row, value));
      const origin = (xOfUnit(0) + xOfUnit(1)) / 2;

      // ── 마운트가 아니라 여기가 세운다. 자와 그 이름은 늘 서 있다 (함정 16·18).
      for (const y of [G_AXIS_Y, L_AXIS_Y]) {
        layerRuler.appendChild(
          svgNode('line', {
            x1: SIDE,
            y1: y,
            x2: W - SIDE,
            y2: y,
            stroke: colors.border,
            'stroke-width': 1.5,
            'stroke-linecap': 'round',
          }),
        );
      }

      const putMethodLabel = (y: number, content: string): void => {
        const node = svgNode('text', {
          x: SIDE,
          y,
          fill: colors.textMuted,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        });
        node.textContent = content;
        layerLabel.appendChild(node);
      };
      putMethodLabel(
        G_LABEL_Y,
        t('label.global', 'Keeps the long distances — projected onto the widest direction'),
      );
      putMethodLabel(
        L_LABEL_Y,
        t(
          'label.local',
          'Keeps only the neighbours — order inside a cluster, clusters evenly spaced',
        ),
      );

      // ── 캡션 두 줄.
      const [firstLine, secondLine] = wrapCaption(captionFor(scene), W - SIDE * 2, captionSize);
      for (const [y, content] of [
        [CAPTION_Y1, firstLine],
        [CAPTION_Y2, secondLine],
      ] as const) {
        const node = svgNode('text', {
          x: SIDE,
          y,
          fill: colors.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
        });
        node.textContent = content;
        layerLabel.appendChild(node);
      }

      // ── 앵커 점선. 자리가 오면 곧바로 선다.
      const guides: SVGLineElement[] = [];
      if (scene.plan !== null) {
        for (const u of [0, 1]) {
          const node = svgNode('line', {
            x1: xOfUnit(u),
            y1: GUIDE_TOP,
            x2: xOfUnit(u),
            y2: GUIDE_BOTTOM,
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '3 4',
          });
          layerAnchor.appendChild(node);
          guides.push(node);
        }
      }

      // ── 무리가 차지하는 몫의 띠. 자리 뒤에 깔리므로 먼저 짓는다.
      const bands: { node: SVGRectElement; mid: number; half: number }[] = [];
      if (scene.inside) {
        for (const row of GLOBAL_AND_LOCAL_ROWS) {
          if (!scene.spreadRows.includes(row)) continue;
          for (const group of scene.groups) {
            const span = groupUnitSpanOf(scene, row, group.name);
            if (span === null) continue;
            const min = xOfUnit(span.min);
            const max = xOfUnit(span.max);
            const mid = (min + max) / 2;
            const half = (max - min) / 2 + DOT_R + 3;
            const node = svgNode('rect', {
              x: mid - half,
              y: axisY(row) - BAND_HALF,
              width: half * 2,
              height: BAND_HALF * 2,
              rx: BAND_HALF,
              fill: withAlpha(colorOf(group.name), 0.18),
            });
            layerBand.appendChild(node);
            bands.push({ node, mid, half });
          }
        }
      }

      // ── 같은 자리를 잇는 실. 두 자가 다 펴진 뒤에만 뜻이 있다.
      const threads: { node: SVGLineElement; from: number; to: number }[] = [];
      const loudest = loudestGroupOf(scene);
      if (scene.tied) {
        const top = flatteningOf(scene, 'global');
        const bottom = flatteningOf(scene, 'local');
        if (top !== null && bottom !== null) {
          for (const point of top.points) {
            const twin = bottom.points.find((p) => p.id === point.id);
            if (twin === undefined) continue;
            const strong = point.group === loudest;
            const from = xOf('global', point.value);
            const to = xOf('local', twin.value);
            const node = svgNode('line', {
              x1: from,
              y1: TIE_TOP,
              x2: to,
              y2: TIE_BOTTOM,
              stroke: colorOf(point.group),
              'stroke-width': strong ? 2 : 1,
              'stroke-opacity': strong ? 0.85 : 0.3,
              'stroke-linecap': 'round',
            });
            layerTie.appendChild(node);
            threads.push({ node, from, to });
          }
        }
      }

      // ── 자마다의 자리와 무리 가운데.
      const spreads = new Map<GlobalAndLocalRow, SpreadHandles>();
      for (const row of scene.spreadRows) {
        const flat = flatteningOf(scene, row);
        if (flat === null) continue;
        const y = axisY(row);
        const handles: SpreadHandles = { dots: [], marks: [] };
        for (const point of flat.points) {
          const x = xOf(row, point.value);
          const node = svgNode('circle', {
            cx: x,
            cy: y,
            r: DOT_R,
            fill: colorOf(point.group),
            stroke: colors.bg,
            'stroke-width': 1,
          });
          layerPoint.appendChild(node);
          handles.dots.push({ node, x });
        }
        for (const centroid of flat.centroids) {
          const x = xOf(row, centroid.value);
          const tick = svgNode('line', {
            x1: x,
            y1: y - CENTROID_HALF,
            x2: x,
            y2: y + CENTROID_HALF,
            stroke: inkOf(centroid.group),
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
          });
          const name = svgNode('text', {
            x,
            y: nameY(row),
            fill: inkOf(centroid.group),
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'font-weight': 600,
            'text-anchor': 'middle',
          });
          name.textContent = centroid.group;
          layerPoint.appendChild(tick);
          layerPoint.appendChild(name);
          handles.marks.push({ tick, name, x });
        }
        spreads.set(row, handles);
      }

      // ── 사이를 재는 괄호. 잰 것은 걷지 않고 쌓인다 — 둘을 견주는 것이 이 조각이
      //    하는 일이다. 글자는 `원래 → 이 자` 두 몫을 나란히 인다 (함정 7).
      const gaps = gapsOf(scene);
      const brackets: Bracket[][] = [];
      const arms: { node: SVGLineElement; mid: number; slope: number }[] = [];
      for (let i = 0; i < scene.gapsShown; i += 1) {
        const gap = gaps[i];
        if (gap === undefined) continue;
        const pair: Bracket[] = [];
        for (const spec of [
          {
            row: 'global' as GlobalAndLocalRow,
            y: G_GAP_Y,
            labelY: G_GAP_Y - 7,
            dir: 1,
            share: gap.globalShare,
            stroke: scene.verdict ? colors.text : colors.textMuted,
          },
          {
            row: 'local' as GlobalAndLocalRow,
            y: L_GAP_Y,
            labelY: L_GAP_Y + 15,
            dir: -1,
            share: gap.localShare,
            stroke: scene.verdict ? colors.danger : colors.textMuted,
          },
        ]) {
          const u1 = centroidUnitOf(scene, spec.row, gap.from);
          const u2 = centroidUnitOf(scene, spec.row, gap.to);
          if (u1 === null || u2 === null) continue;
          const x1 = xOfUnit(u1);
          const x2 = xOfUnit(u2);
          const line = svgNode('line', {
            x1,
            y1: spec.y,
            x2,
            y2: spec.y,
            stroke: spec.stroke,
            'stroke-width': 1.2,
          });
          const ticks = [x1, x2].map((x) =>
            svgNode('line', {
              x1: x,
              y1: spec.y,
              x2: x,
              y2: spec.y + spec.dir * GAP_TICK,
              stroke: spec.stroke,
              'stroke-width': 1.2,
            }),
          );
          const label = svgNode('text', {
            x: (x1 + x2) / 2,
            y: spec.labelY,
            fill: spec.stroke,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
          });
          label.textContent = `${percent(gap.originShare)} ${ARROW} ${percent(spec.share)}`;
          layerGap.appendChild(line);
          for (const tick of ticks) layerGap.appendChild(tick);
          layerGap.appendChild(label);
          pair.push({ line, ticks, label, x1, x2, y: spec.y, dir: spec.dir });

          // 가위표는 아래 자에만. 판정이 색이 아니라 모양으로도 서게 한다.
          if (scene.verdict && spec.row === 'local') {
            const mid = (x1 + x2) / 2;
            for (const slope of [1, -1]) {
              const node = svgNode('line', {
                x1: mid - CROSS_ARM,
                y1: L_GAP_Y - CROSS_ARM * slope,
                x2: mid + CROSS_ARM,
                y2: L_GAP_Y + CROSS_ARM * slope,
                stroke: colors.danger,
                'stroke-width': 2,
                'stroke-linecap': 'round',
              });
              layerGap.appendChild(node);
              arms.push({ node, mid, slope });
            }
          }
        }
        brackets.push(pair);
      }

      // ── 자마다의 비.
      const readouts: SVGTextElement[] = [];
      const ratios = ratiosOf(scene);
      if (scene.ratioShown && ratios !== null) {
        for (const entry of [
          { y: G_LABEL_Y, value: ratios.global },
          { y: L_LABEL_Y, value: ratios.local },
        ]) {
          const node = svgNode('text', {
            x: W - SIDE,
            y: entry.y,
            fill: colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'text-anchor': 'end',
          });
          node.textContent = t('label.ratio', 'gap ratio 1 : {r}', { r: entry.value.toFixed(2) });
          layerReadout.appendChild(node);
          readouts.push(node);
        }
      }

      return { origin, guides, spreads, threads, bands, brackets, readouts, arms };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴이고, 끝나면 마지막 정적 그리기가 통째로 걷어 간다.

    /** 앵커 점선이 위에서 아래로 내려온다. */
    function flowRule(drawn: Drawn, mine: number): Promise<void> {
      return tween(MS_ANCHOR, mine, (p) => {
        const y2 = lerp(GUIDE_TOP, GUIDE_BOTTOM, easeOut(p));
        for (const node of drawn.guides) node.setAttribute('y2', String(y2));
      });
    }

    /** 방금 펴진 자의 자리들이 가운데에서 제자리로 미끄러진다. */
    function flowSpread(
      scene: GlobalAndLocalScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const row = scene.spreadRows[scene.spreadRows.length - 1];
      const handles = row === undefined ? undefined : drawn.spreads.get(row);
      if (handles === undefined) return Promise.resolve();
      return tween(MS_SPREAD, mine, (p) => {
        const e = easeOut(p);
        for (const dot of handles.dots) {
          dot.node.setAttribute('cx', String(lerp(drawn.origin, dot.x, e)));
        }
        for (const mark of handles.marks) {
          const x = lerp(drawn.origin, mark.x, e);
          mark.tick.setAttribute('x1', String(x));
          mark.tick.setAttribute('x2', String(x));
          mark.name.setAttribute('x', String(x));
        }
      });
    }

    /** 실이 위 자에서 아래 자로 자란다. 한 뜻이라 한 시계로 흘린다. */
    function flowTie(drawn: Drawn, mine: number): Promise<void> {
      return tween(MS_TIE, mine, (p) => {
        const e = easeOut(p);
        const y2 = String(lerp(TIE_TOP, TIE_BOTTOM, e));
        for (const thread of drawn.threads) {
          thread.node.setAttribute('x2', String(lerp(thread.from, thread.to, e)));
          thread.node.setAttribute('y2', y2);
        }
      });
    }

    /** 띠가 가운데에서 좌우로 벌어진다. */
    function flowInside(drawn: Drawn, mine: number): Promise<void> {
      return tween(MS_BAND, mine, (p) => {
        const e = easeOut(p);
        for (const band of drawn.bands) {
          const half = band.half * e;
          band.node.setAttribute('x', String(band.mid - half));
          band.node.setAttribute('width', String(half * 2));
        }
      });
    }

    /** 방금 잰 사이의 괄호가 왼쪽 끝에서 오른쪽으로 뻗는다. */
    function flowGap(scene: GlobalAndLocalScene, drawn: Drawn, mine: number): Promise<void> {
      const pair = drawn.brackets[scene.gapsShown - 1];
      if (pair === undefined) return Promise.resolve();
      return tween(MS_GAP, mine, (p) => {
        const e = easeOut(p);
        for (const bracket of pair) {
          bracket.line.setAttribute('x2', String(lerp(bracket.x1, bracket.x2, e)));
          for (const tick of bracket.ticks) {
            tick.setAttribute('y2', String(bracket.y + bracket.dir * GAP_TICK * e));
          }
          bracket.label.setAttribute('opacity', String(e));
        }
      });
    }

    /** 비가 오른쪽에서 밀려 들어온다. */
    function flowRatio(drawn: Drawn, mine: number): Promise<void> {
      return tween(MS_RATIO, mine, (p) => {
        const e = easeOut(p);
        for (const node of drawn.readouts) {
          node.setAttribute('x', String(lerp(W - SIDE + 22, W - SIDE, e)));
          node.setAttribute('opacity', String(e));
        }
      });
    }

    /** 가위표가 가운데에서 네 갈래로 자란다. */
    function flowVerdict(drawn: Drawn, mine: number): Promise<void> {
      return tween(MS_CROSS, mine, (p) => {
        const e = easeOut(p);
        for (const arm of drawn.arms) {
          const reach = CROSS_ARM * e;
          arm.node.setAttribute('x1', String(arm.mid - reach));
          arm.node.setAttribute('y1', String(L_GAP_Y - reach * arm.slope));
          arm.node.setAttribute('x2', String(arm.mid + reach));
          arm.node.setAttribute('y2', String(L_GAP_Y + reach * arm.slope));
        }
      });
    }

    function flowFor(scene: GlobalAndLocalScene, drawn: Drawn, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'rule':
          return flowRule(drawn, mine);
        case 'spread':
          return flowSpread(scene, drawn, mine);
        case 'tie':
          return flowTie(drawn, mine);
        case 'inside':
          return flowInside(drawn, mine);
        case 'gap':
          return flowGap(scene, drawn, mine);
        case 'ratio':
          return flowRatio(drawn, mine);
        case 'verdict':
          return flowVerdict(drawn, mine);
        case 'close':
          // 닫는 말은 캡션만 바뀐다. 흐를 것이 없다.
          return Promise.resolve();
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: GlobalAndLocalScene,
      _prev: GlobalAndLocalScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flowFor(next, drawn, mine);
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
        canvas.textContent = '';
      },
    };
  },
};
