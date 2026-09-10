/**
 * 전역과 지역 구조 조각의 stage view.
 *
 * 무대는 산점도가 아니다. **가로로 놓인 자(직선) 둘**과 그 위에 앉은 열두
 * 자리가 전부다. 위 자는 큰 거리를 지키는 방식, 아래 자는 이웃만 지키는
 * 방식이고, 같은 자리끼리 세로로 이으면 어긋남이 실을 기울여 드러낸다.
 *
 * 두 자의 단위는 서로 다르므로 픽셀로 견주려면 기준이 있어야 한다. 그래서
 * **첫 무리와 마지막 무리의 가운데를 두 자에서 같은 x 에 못박고**(앵커),
 * 나머지가 어디 앉는지만 본다. 양 끝이 고정이라 남는 이야기는 가운데 무리
 * 하나뿐이다. 이 전제를 밝히는 것은 `description.ts` 의 몫이다 (S-piece).
 *
 * 좌표는 전부 여기서 캔버스에서 역산한다. 선언에는 없다.
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
import type { CanvasView, Palette, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

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

const MS_ANCHOR = 260;
const MS_SPREAD = 520;
const MS_TIE = 460;
const MS_BAND = 380;
const MS_GAP = 340;
const MS_RATIO = 260;
const MS_CROSS = 380;

export type GlobalAndLocalRow = 'global' | 'local';

export type GlobalAndLocalRulerRow = {
  row: GlobalAndLocalRow;
  lo: number;
  hi: number;
  anchorLo: number;
  anchorHi: number;
};

export type GlobalAndLocalPlacedPoint = { id: string; group: string; value: number };
export type GlobalAndLocalPlacedCentroid = { group: string; value: number };
export type GlobalAndLocalGroupShift = { group: string; shift: number };

/** projector 가 부르는 표면. */
export type GlobalAndLocalStage = {
  showRulers(rows: GlobalAndLocalRulerRow[]): Promise<void>;
  showSpread(
    row: GlobalAndLocalRow,
    points: GlobalAndLocalPlacedPoint[],
    centroids: GlobalAndLocalPlacedCentroid[],
  ): Promise<void>;
  showTies(shifts: GlobalAndLocalGroupShift[]): Promise<void>;
  showInside(): Promise<void>;
  showGap(from: string, to: string, globalShare: number, localShare: number): Promise<void>;
  showRatio(globalRatio: number, localRatio: number): Promise<void>;
  showVerdict(): Promise<void>;
  setCaption(text: string): void;
  resetScene(): void;
};

/** `initialData` 에서 그림이 쓸 것만 남긴 모양. */
export type GlobalAndLocalScene = {
  /** 무리 이름. 선언에 적힌 차례가 곧 색의 차례다. */
  groups: string[];
};

/**
 * `initialData` 를 좁힌다. 좁히는 규칙의 단일 출처가 여기다 — projector 가
 * 같은 것을 다시 좁혀 밀어 넣지 않는다 (S-piece).
 */
export function readGlobalAndLocalScene(initialData: unknown): GlobalAndLocalScene {
  if (typeof initialData !== 'object' || initialData === null) return { groups: [] };
  const raw = (initialData as Record<string, unknown>)['groups'];
  if (!Array.isArray(raw)) return { groups: [] };
  const groups: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const name = (entry as Record<string, unknown>)['name'];
    if (typeof name === 'string') groups.push(name);
  }
  return { groups };
}

function svgNode<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
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

export const globalAndLocalStageView: CanvasView = {
  // 가로는 러너가 `PIECE_CANVAS_W` 로 정한다 — 여기 적으면 단일 출처가 둘이 된다.
  // `W` 상수는 좌표를 역산하는 데만 쓴다 (S-piece).
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    canvas.textContent = '';

    const tr = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const scene = readGlobalAndLocalScene(params.initialData);
    const seed = categorical(Math.max(1, scene.groups.length), 'vivid');
    const captionSize = Number.parseFloat(fontSizes.sm);

    const colorOf = (group: string): string => {
      const idx = scene.groups.indexOf(group);
      return idx >= 0 ? seed[idx % seed.length] : colors.text;
    };
    const inkOf = (group: string): string => shiftLightness(colorOf(group), -0.22);

    // ── 애니메이션 살림. 걸어 둔 프레임과 기다리는 promise 를 집합에 모아
    //    destroy 에서 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    function animate(duration: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const step = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / duration);
          draw(easeOut(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          schedule();
        };
        const schedule = (): void => {
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            step();
          });
          frames.add(id);
        };
        schedule();
      });
    }

    // ── 층. 뒤에서 앞으로. 고정층과 걸음층을 갈라 두어 되감기가 지울 것을
    //    셈으로 세지 않게 한다.
    const layerBand = svgNode('g', {});
    const layerRuler = svgNode('g', {});
    const layerAnchor = svgNode('g', {});
    const layerTie = svgNode('g', {});
    const layerPoint = svgNode('g', {});
    const layerGap = svgNode('g', {});
    const layerLabel = svgNode('g', {});
    const layerReadout = svgNode('g', {});
    for (const layer of [
      layerBand,
      layerRuler,
      layerAnchor,
      layerTie,
      layerPoint,
      layerGap,
      layerLabel,
      layerReadout,
    ]) {
      canvas.appendChild(layer);
    }

    // ── 마운트에 서는 것: 자 둘과 그 이름. 자리는 걸음이 놓는다.
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
      tr('label.global', 'Keeps the long distances — projected onto the widest direction'),
    );
    putMethodLabel(
      L_LABEL_Y,
      tr('label.local', 'Keeps only the neighbours — order inside a cluster, clusters evenly spaced'),
    );

    const makeCaptionLine = (y: number): SVGTextElement => {
      const node = svgNode('text', {
        x: SIDE,
        y,
        fill: colors.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
      });
      layerLabel.appendChild(node);
      return node;
    };
    const captionTop = makeCaptionLine(CAPTION_Y1);
    const captionBottom = makeCaptionLine(CAPTION_Y2);

    // ── 걸음이 채우는 상태.
    const anchors = new Map<GlobalAndLocalRow, { lo: number; hi: number }>();
    let unitLo = 0;
    let unitHi = 1;

    const pointX = new Map<string, number>(); //   `${row}:${id}`
    const pointGroup = new Map<string, string>(); // id → 무리
    const centroidX = new Map<string, number>(); // `${row}:${group}`
    const extents = new Map<string, { min: number; max: number }>(); // `${row}:${group}`

    type Bracket = {
      line: SVGLineElement;
      ticks: SVGLineElement[];
      label: SVGTextElement;
      x1: number;
      x2: number;
    };
    const topBrackets: Bracket[] = [];
    const bottomBrackets: Bracket[] = [];

    const axisY = (row: GlobalAndLocalRow): number => (row === 'global' ? G_AXIS_Y : L_AXIS_Y);
    const nameY = (row: GlobalAndLocalRow): number => (row === 'global' ? G_NAME_Y : L_NAME_Y);

    const xOfUnit = (u: number): number => {
      const denom = unitHi - unitLo || 1;
      const left = SIDE + INSET;
      return left + ((u - unitLo) / denom) * (W - left * 2);
    };

    const xOf = (row: GlobalAndLocalRow, value: number): number => {
      const anchor = anchors.get(row);
      if (!anchor) return W / 2;
      const range = anchor.hi - anchor.lo || 1;
      return xOfUnit((value - anchor.lo) / range);
    };

    const emptyLayer = (layer: SVGGElement): void => {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    };

    const stage: GlobalAndLocalStage = {
      async showRulers(rows) {
        anchors.clear();
        for (const row of rows) anchors.set(row.row, { lo: row.anchorLo, hi: row.anchorHi });

        // 두 자의 자리가 다 들어오도록 눈금 범위를 넓힌다. 앵커 0·1 은 늘 들어간다.
        let lo = 0;
        let hi = 1;
        for (const row of rows) {
          const anchor = anchors.get(row.row);
          if (!anchor) continue;
          const range = anchor.hi - anchor.lo || 1;
          lo = Math.min(lo, (row.lo - anchor.lo) / range);
          hi = Math.max(hi, (row.hi - anchor.lo) / range);
        }
        unitLo = lo;
        unitHi = hi;

        const top = G_AXIS_Y - CENTROID_HALF;
        const bottom = L_AXIS_Y + CENTROID_HALF;
        const guides = [0, 1].map((u) => {
          const node = svgNode('line', {
            x1: xOfUnit(u),
            y1: top,
            x2: xOfUnit(u),
            y2: top,
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '3 4',
          });
          layerAnchor.appendChild(node);
          return node;
        });

        await animate(MS_ANCHOR, (p) => {
          for (const node of guides) node.setAttribute('y2', String(lerp(top, bottom, p)));
        });
      },

      async showSpread(row, points, centroids) {
        const y = axisY(row);
        const origin = (xOfUnit(0) + xOfUnit(1)) / 2;

        const dots = points.map((point) => {
          const node = svgNode('circle', {
            cx: origin,
            cy: y,
            r: DOT_R,
            fill: colorOf(point.group),
            stroke: colors.bg,
            'stroke-width': 1,
          });
          layerPoint.appendChild(node);
          const target = xOf(row, point.value);
          pointX.set(`${row}:${point.id}`, target);
          pointGroup.set(point.id, point.group);
          return { node, target };
        });

        for (const centroid of centroids) {
          const xs = points
            .filter((point) => point.group === centroid.group)
            .map((point) => xOf(row, point.value));
          extents.set(`${row}:${centroid.group}`, { min: Math.min(...xs), max: Math.max(...xs) });
          centroidX.set(`${row}:${centroid.group}`, xOf(row, centroid.value));
        }

        const marks = centroids.map((centroid) => {
          const target = centroidX.get(`${row}:${centroid.group}`) ?? origin;
          const tick = svgNode('line', {
            x1: origin,
            y1: y - CENTROID_HALF,
            x2: origin,
            y2: y + CENTROID_HALF,
            stroke: inkOf(centroid.group),
            'stroke-width': 2.5,
            'stroke-linecap': 'round',
          });
          const name = svgNode('text', {
            x: origin,
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
          return { tick, name, target };
        });

        await animate(MS_SPREAD, (p) => {
          for (const dot of dots) dot.node.setAttribute('cx', String(lerp(origin, dot.target, p)));
          for (const mark of marks) {
            const x = lerp(origin, mark.target, p);
            mark.tick.setAttribute('x1', String(x));
            mark.tick.setAttribute('x2', String(x));
            mark.name.setAttribute('x', String(x));
          }
        });
      },

      async showTies(shifts) {
        let loudest = '';
        let loudestAmount = -1;
        for (const entry of shifts) {
          if (Math.abs(entry.shift) > loudestAmount) {
            loudestAmount = Math.abs(entry.shift);
            loudest = entry.group;
          }
        }

        const yTop = G_AXIS_Y + DOT_R + 2;
        const yBottom = L_AXIS_Y - DOT_R - 2;
        const threads: Array<{ node: SVGLineElement; from: number; to: number }> = [];
        for (const [key, from] of pointX) {
          if (!key.startsWith('global:')) continue;
          const id = key.slice('global:'.length);
          const to = pointX.get(`local:${id}`);
          if (to === undefined) continue;
          const group = pointGroup.get(id) ?? '';
          const strong = group === loudest;
          const node = svgNode('line', {
            x1: from,
            y1: yTop,
            x2: from,
            y2: yTop,
            stroke: colorOf(group),
            'stroke-width': strong ? 2 : 1,
            'stroke-opacity': strong ? 0.85 : 0.3,
            'stroke-linecap': 'round',
          });
          layerTie.appendChild(node);
          threads.push({ node, from, to });
        }

        await animate(MS_TIE, (p) => {
          for (const thread of threads) {
            thread.node.setAttribute('x2', String(lerp(thread.from, thread.to, p)));
            thread.node.setAttribute('y2', String(lerp(yTop, yBottom, p)));
          }
        });
      },

      async showInside() {
        const bands: Array<{ node: SVGRectElement; mid: number; half: number }> = [];
        for (const [key, extent] of extents) {
          const cut = key.indexOf(':');
          const row = key.slice(0, cut) as GlobalAndLocalRow;
          const group = key.slice(cut + 1);
          const mid = (extent.min + extent.max) / 2;
          const half = (extent.max - extent.min) / 2 + DOT_R + 3;
          const node = svgNode('rect', {
            x: mid,
            y: axisY(row) - BAND_HALF,
            width: 0,
            height: BAND_HALF * 2,
            rx: BAND_HALF,
            fill: withAlpha(colorOf(group), 0.18),
          });
          layerBand.appendChild(node);
          bands.push({ node, mid, half });
        }

        await animate(MS_BAND, (p) => {
          for (const band of bands) {
            const half = band.half * p;
            band.node.setAttribute('x', String(band.mid - half));
            band.node.setAttribute('width', String(half * 2));
          }
        });
      },

      async showGap(from, to, globalShare, localShare) {
        const build = (
          row: GlobalAndLocalRow,
          y: number,
          labelY: number,
          share: number,
        ): Bracket | null => {
          const x1 = centroidX.get(`${row}:${from}`);
          const x2 = centroidX.get(`${row}:${to}`);
          if (x1 === undefined || x2 === undefined) return null;
          const line = svgNode('line', {
            x1,
            y1: y,
            x2: x1,
            y2: y,
            stroke: colors.textMuted,
            'stroke-width': 1.2,
          });
          const ticks = [x1, x2].map((x) =>
            svgNode('line', {
              x1: x,
              y1: y,
              x2: x,
              y2: y,
              stroke: colors.textMuted,
              'stroke-width': 1.2,
            }),
          );
          const label = svgNode('text', {
            x: (x1 + x2) / 2,
            y: labelY,
            fill: colors.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            opacity: 0,
          });
          label.textContent = percent(share);
          layerGap.appendChild(line);
          for (const tick of ticks) layerGap.appendChild(tick);
          layerGap.appendChild(label);
          return { line, ticks, label, x1, x2 };
        };

        const drawn: Array<{ bracket: Bracket; y: number; dir: number }> = [];
        const top = build('global', G_GAP_Y, G_GAP_Y - 7, globalShare);
        if (top) {
          topBrackets.push(top);
          drawn.push({ bracket: top, y: G_GAP_Y, dir: 1 });
        }
        const bottom = build('local', L_GAP_Y, L_GAP_Y + 15, localShare);
        if (bottom) {
          bottomBrackets.push(bottom);
          drawn.push({ bracket: bottom, y: L_GAP_Y, dir: -1 });
        }

        await animate(MS_GAP, (p) => {
          for (const item of drawn) {
            const { bracket } = item;
            bracket.line.setAttribute('x2', String(lerp(bracket.x1, bracket.x2, p)));
            for (const tick of bracket.ticks) {
              tick.setAttribute('y2', String(item.y + item.dir * GAP_TICK * p));
            }
            bracket.label.setAttribute('opacity', String(p));
          }
        });
      },

      async showRatio(globalRatio, localRatio) {
        const readouts = [
          { y: G_LABEL_Y, value: globalRatio },
          { y: L_LABEL_Y, value: localRatio },
        ].map((entry) => {
          const node = svgNode('text', {
            x: W - SIDE,
            y: entry.y,
            fill: colors.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'text-anchor': 'end',
            opacity: 0,
          });
          node.textContent = tr('label.ratio', 'gap ratio 1 : {r}', { r: entry.value.toFixed(2) });
          layerReadout.appendChild(node);
          return node;
        });

        await animate(MS_RATIO, (p) => {
          for (const node of readouts) {
            node.setAttribute('x', String(lerp(W - SIDE + 22, W - SIDE, p)));
            node.setAttribute('opacity', String(p));
          }
        });
      },

      async showVerdict() {
        for (const bracket of topBrackets) {
          bracket.line.setAttribute('stroke', colors.text);
          for (const tick of bracket.ticks) tick.setAttribute('stroke', colors.text);
          bracket.label.setAttribute('fill', colors.text);
        }

        const arms: Array<{ node: SVGLineElement; mid: number; slope: number }> = [];
        for (const bracket of bottomBrackets) {
          bracket.line.setAttribute('stroke', colors.danger);
          for (const tick of bracket.ticks) tick.setAttribute('stroke', colors.danger);
          bracket.label.setAttribute('fill', colors.danger);
          const mid = (bracket.x1 + bracket.x2) / 2;
          for (const slope of [1, -1]) {
            const node = svgNode('line', {
              x1: mid,
              y1: L_GAP_Y,
              x2: mid,
              y2: L_GAP_Y,
              stroke: colors.danger,
              'stroke-width': 2,
              'stroke-linecap': 'round',
            });
            layerGap.appendChild(node);
            arms.push({ node, mid, slope });
          }
        }

        await animate(MS_CROSS, (p) => {
          for (const arm of arms) {
            const reach = CROSS_ARM * p;
            arm.node.setAttribute('x1', String(arm.mid - reach));
            arm.node.setAttribute('y1', String(L_GAP_Y - reach * arm.slope));
            arm.node.setAttribute('x2', String(arm.mid + reach));
            arm.node.setAttribute('y2', String(L_GAP_Y + reach * arm.slope));
          }
        });
      },

      setCaption(content) {
        const [first, second] = wrapCaption(content, W - SIDE * 2, captionSize);
        captionTop.textContent = first;
        captionBottom.textContent = second;
      },

      resetScene() {
        for (const layer of [layerBand, layerAnchor, layerTie, layerPoint, layerGap, layerReadout]) {
          emptyLayer(layer);
        }
        anchors.clear();
        pointX.clear();
        pointGroup.clear();
        centroidX.clear();
        extents.clear();
        topBrackets.length = 0;
        bottomBrackets.length = 0;
        captionTop.textContent = '';
        captionBottom.textContent = '';
      },
    };

    return {
      ...stage,
      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
