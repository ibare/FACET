/**
 * neighborsLinkedAhead stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * 소재가 좌표라 **거리가 곧 뜻이다.** 가로세로 배율을 같게 두지 않으면 가까워 보이는
 * 점이 실제로는 먼 점이 되어 그림이 거짓을 말한다. 그래서 배율 하나를 세로에서 뽑아
 * 가로에도 그대로 쓰고, 남는 좌우 폭은 그 제약의 결과로 둔다 — 요소 크기를 상수로
 * 못박아 버린 폭이 아니다 (S-piece).
 *
 * 운동은 발이 실제로 옮겨 가는 것이다. 걸음은 곧은 선이 아니라 살짝 휜 활로 그린다 —
 * 발을 떼어 옮기는 몸짓이라야 "걸어간다" 로 읽힌다.
 *
 * ── 이행이 고친 화면 둘
 *
 * **하나. 멎었다는 결론에 근거가 없었다.** 옛 `settle()` 의 첫 줄이 `clear(gProbe)`
 * 라, 바로 앞 걸음이 뻗어 둔 **이웃마다의 줄이 통째로 지워진 채** 고리만 남았다.
 * 캡션은 "더 가까운 이웃이 없다" 라는데 완주 화면에는 그것을 받쳐 줄 짝이 하나도
 * 없었던 것이다. 지금은 살이 **선 자리의 것**이라 `probes.length === path.length` 인
 * 동안 정적 그리기가 매번 세운다 — 멎은 화면에 선 자리의 줄 하나와 이웃들의 줄
 * 다섯이 함께 서서, 내 줄이 가장 짧다는 것이 그 자리에서 보인다.
 *
 * **둘. 재 보고 안 간 이웃이 걸음마다 사라졌다.** `stepTo()` 도 첫 줄이
 * `clear(gProbe)` 였다. 완주 화면이 "다 봤다" 와 구별되지 않던 자리다. 지금은
 * 짚였으나 끝내 밟지 않은 점이 `strayMarks` 로 남는다. 다만 **어휘를 가른다** —
 * 헛걸음을 살아 있는 자국과 같은 모양으로 그리지 않는다 (아래).
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**이다 — 아직 아무 일 없음(`itemDefault`) · 걸어서 밟은
 * 자리(`itemActive`) · 걸음이 멎은 자리(`accent`). 옛 화면은 밟은 자리를 **테두리**로
 * 칠하고 있어서, 짚어만 본 자리를 표시할 축이 남아 있지 않았다.
 * **테두리는 짚음의 표식**이다 — 재 보았으나 안 간 자리만 점선을 두른다.
 *
 * 두 축을 갈라 두면 "걸어서 지났나" 와 "재 보기만 했나" 가 서로를 지우지 않는다.
 * 질의까지 뻗는 줄도 같은 식으로 셋을 가른다 — 선 자리의 줄(실선 `text`) ·
 * 고른 이웃의 줄(실선 `itemActive`) · 못 고른 이웃의 줄(점선 `textMuted`).
 *
 * ── 척도는 적어 두지 않는다
 *
 * 값에서 화면 자리를 역산하는 배율을 `mount` 의 변수에 적어 두면 그리는 자리와
 * 장면이 갈라진다. 여기서는 바탕의 점과 질의에서 **매번** 셈한다 — 장면이 담는 것은
 * 픽셀이 아니라 값의 자리다 (S-piece).
 *
 * 세로(CANVAS_H)는 이 파일이 갖는다. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-view).
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
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
  graphOf,
  phaseOf,
  probeNow,
  standing,
  strayMarks,
  type NeighborsLinkedAheadScene,
  type NeighborsStep,
  type ScenePt,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 그림이 정한다. 가로는 러너가 PIECE_CANVAS_W 로 준다 (S-piece). */
const CANVAS_H = 540;
const CAPTION_H = 52;
const PAD_TOP = 22;
const PAD_BOTTOM = 14;
const SIDE_MIN = 56;

const DOT_R = 8;
const FOOT_R = 11;
/** 멎었다는 고리가 발보다 얼마나 넓게 앉나. */
const SETTLE_GROW = 14;
/** 걸음의 활이 곧은 선에서 벗어나는 정도. 거리에 비례한다. */
const ARC = 0.16;
/** 걸음 하나를 그릴 때 활을 몇 조각으로 나눌지. */
const ARC_SAMPLES = 24;

/** 보간 한 마디의 벽시계. rAF 가 아니라 타이머로 재어 doc 없는 자리에서도 돌게 한다. */
const FRAME_MS = 16;
const GRAPH_MS = 520;
const PROBE_MS = 320;
const STEP_MS = 560;
const SETTLE_MS = 460;

/** 캡션 한 줄에 들어가는 폭. 글자 너비를 셈해 잰다. */
const CAPTION_BUDGET = 80;

function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, name) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
}

/**
 * 사이값. **끝에서는 보간하지 않고 목표값을 그대로 쓴다** — 보간의 부동소수 끝자리가
 * 남으면 흘려 세운 화면과 곧바로 세운 화면이 글자 하나 어긋난다 (S-scene).
 */
const lerp = (a: number, b: number, p: number): number => (p >= 1 ? b : a + (b - a) * p);

/** 한 글자가 차지하는 폭. 한글·아랍 문자와 전각은 라틴 글자의 두 배로 친다. */
function glyphWidth(ch: string): number {
  return /[؀-ۿᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 2 : 1;
}

function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += glyphWidth(ch);
  return w;
}

/** 캡션을 두 줄까지 접는다. 넘치는 말은 둘째 줄에 그대로 남긴다. */
function wrapCaption(text: string, budget: number): [string, string] {
  if (textWidth(text) <= budget) return [text, ''];
  const words = text.split(' ');
  let head = '';
  let rest = '';
  for (const word of words) {
    if (rest === '' && textWidth(head === '' ? word : `${head} ${word}`) <= budget) {
      head = head === '' ? word : `${head} ${word}`;
      continue;
    }
    rest = rest === '' ? word : `${rest} ${word}`;
  }
  return head === '' ? [text, ''] : [head, rest];
}

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  /** 점 하나의 화면 자리. 걸음 함수가 자취에서 자리를 셈할 때 쓴다 — 화면을 되읽지 않는다. */
  px(i: number): number;
  py(i: number): number;
  qx: number;
  qy: number;
  /** 미리 이어 둔 길. 자랄 때 끝점이 옮겨 간다. */
  links: { line: SVGElement; ax: number; ay: number; bx: number; by: number }[];
  /** 선 자리에서 이웃으로 뻗는 살. 이웃을 본 참이 아니면 빈 배열이다. */
  spokes: { line: SVGElement; hx: number; hy: number; tx: number; ty: number }[];
  /** 이웃에서 질의로 뻗는 줄. 위와 짝이다. */
  reaches: { line: SVGElement; cx: number; cy: number }[];
  /** 걸어온 자취. 도막이 하나도 없으면 짓지 않는다. */
  trail: SVGElement | null;
  /** 선 자리에서 질의까지. 발이 아직 안 올랐으면 null. */
  band: SVGElement | null;
  foot: SVGElement | null;
  /** 멎었다는 고리. 안 멎었으면 null. */
  ring: SVGElement | null;
};

export const neighborsLinkedAheadStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<NeighborsLinkedAheadScene> {
    // 컨테이너를 건드리지 않는다 — 러너가 캔버스를 먼저 붙여 두었고, 비우면 그것이
    // 떨어져 나가 화면이 통째로 빈다 (S-view). 그릴 자리는 params.canvas 뿐이다.
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // `initialData` 를 읽지 않는다 — 바탕은 장면이 좁혀 쥔다. 좁히는 규칙이 두 벌이
    // 되면 점의 수와 이웃 수가 갈린다 (S-piece).
    const root = el('g', {});
    const gLinks = el('g', {});
    const gProbe = el('g', {});
    const gTrail = el('g', {});
    const gDots = el('g', {});
    const gFoot = el('g', {});
    const gCaption = el('g', {});
    const layers = [gLinks, gProbe, gTrail, gDots, gFoot, gCaption];
    for (const layer of layers) root.appendChild(layer);
    svg.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지난다. `destroy` 가 그 가운데 오면 남은 프레임이
     * 이미 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고
     * 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지
     * 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition
     * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT). rAF 도 쓰지
     * 않는다 — 타이머로 재야 문서가 없는 자리에서도 실제로 돈다.
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

    // ── 캡션 ──────────────────────────────────────────────────────────────

    /**
     * 지금 화면이 할 말.
     *
     * `step` 이 아니라 **국면**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 말이
     * 나와야 한다. 이웃 수도 선언에 적힌 바탕에서 나온다.
     */
    function captionFor(scene: NeighborsLinkedAheadScene): string {
      const phase = phaseOf(scene);
      switch (phase.kind) {
        case 'idle':
          return '';
        case 'stood':
          return phase.first
            ? t('caption.begin', 'Every dot is already linked to its {k} nearest. Stand on one.', {
                k: scene.k,
              })
            : t('caption.move', 'One of them sits closer to the query. Step onto it.');
        case 'probed':
          return t('caption.probe', 'Look only at the neighbours of where you stand.');
        case 'done':
          return t('caption.settle', 'No neighbour is closer. The walk stops here.');
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * **`scene.step` 을 한 번도 읽지 않는다.** 읽으면 흘려 세우는 경로와 곧바로
     * 세우는 경로가 같은 걸음을 보므로 어긋남을 검사가 못 잡는다 — 규율로만 지킨다.
     */
    function drawStatic(scene: NeighborsLinkedAheadScene): Drawn {
      rewind();

      const graph = graphOf(scene);
      const points = scene.points;

      // ── 자리 셈. 배율 하나를 가로세로에 함께 쓴다 — 거리가 곧 뜻이라서다.
      const xs = points.map((p) => p.x).concat(scene.query.x);
      const ys = points.map((p) => p.y).concat(scene.query.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const plotH = CANVAS_H - CAPTION_H - PAD_TOP - PAD_BOTTOM;
      const scale = Math.min((W - SIDE_MIN * 2) / spanX, plotH / spanY);
      const originX = (W - spanX * scale) / 2;
      const originY = PAD_TOP + (plotH - spanY * scale) / 2;
      const sx = (p: ScenePt): number => originX + (p.x - minX) * scale;
      const sy = (p: ScenePt): number => originY + (maxY - p.y) * scale;
      const px = (i: number): number => {
        const p = points[i];
        return p === undefined ? originX : sx(p);
      };
      const py = (i: number): number => {
        const p = points[i];
        return p === undefined ? originY : sy(p);
      };

      const qx = sx(scene.query);
      const qy = sy(scene.query);
      const at = standing(scene);
      const walked = new Set(scene.path);
      const strayed = new Set(strayMarks(scene, graph));

      // ── 미리 이어 둔 길. 아직 안 놓였으면 짓지 않는다 (숨기지 않는다).
      const links: Drawn['links'] = [];
      if (at !== null) {
        for (const [a, b] of graph.links) {
          if (points[a] === undefined || points[b] === undefined) continue;
          const ax = px(a);
          const ay = py(a);
          const bx = px(b);
          const by = py(b);
          const line = el('line', {
            x1: ax, y1: ay, x2: bx, y2: by,
            stroke: c.border, 'stroke-width': 1.2,
          });
          gLinks.appendChild(line);
          links.push({ line, ax, ay, bx, by });
        }
      }

      // ── 선 자리에서 본 이웃들. 이웃마다 질의까지 줄을 뻗어 둔다 — 어느 것이 더
      //    가까운지를 숫자로 말하지 않고 그 자리에서 보이게 하려는 것이다.
      const spokes: Drawn['spokes'] = [];
      const reaches: Drawn['reaches'] = [];
      const look = probeNow(scene, graph);
      if (look !== null) {
        const hx = px(look.from);
        const hy = py(look.from);
        for (const n of look.candidates) {
          if (points[n] === undefined) continue;
          const nx = px(n);
          const ny = py(n);
          const chosen = n === look.best;

          const spoke = el('line', {
            x1: hx, y1: hy, x2: nx, y2: ny,
            stroke: c.itemComparing,
            'stroke-width': chosen ? 4 : 2,
            'stroke-linecap': 'round',
          });
          gProbe.appendChild(spoke);
          spokes.push({ line: spoke, hx, hy, tx: nx, ty: ny });

          const reach = el('line', {
            x1: nx, y1: ny, x2: qx, y2: qy,
            stroke: chosen ? c.itemActive : c.textMuted,
            'stroke-width': chosen ? 2 : 0.9,
            ...(chosen ? {} : { 'stroke-dasharray': '3 4' }),
          });
          gProbe.appendChild(reach);
          reaches.push({ line: reach, cx: nx, cy: ny });

          gProbe.appendChild(
            el('circle', {
              cx: nx, cy: ny, r: DOT_R + 4, fill: 'none',
              stroke: c.itemComparing, 'stroke-width': chosen ? 3 : 1.4,
            }),
          );
        }
      }

      // ── 걸어온 자취. 도막이 하나도 없으면 짓지 않는다 — 길이 0 짜리 선에
      //    둥근 마개를 물리면 점이 되어 없는 것이 있는 것처럼 보인다.
      let trail: SVGElement | null = null;
      if (scene.path.length >= 2) {
        trail = el('path', {
          d: trailOf(scene.path, 1, px, py),
          fill: 'none', stroke: c.itemActive,
          'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        });
        gTrail.appendChild(trail);
      }

      // ── 선 자리에서 질의까지. **이것이 이웃들의 줄과 견주어지는 기준선**이라
      //    실선으로 긋는다 — 멎었다는 결론이 여기서 읽힌다.
      let band: SVGElement | null = null;
      if (at !== null) {
        band = el('line', {
          x1: px(at), y1: py(at), x2: qx, y2: qy,
          stroke: c.text, 'stroke-width': 1.8,
        });
        gTrail.appendChild(band);
      }

      // ── 질의. 찾아갈 자리는 십자와 고리로 새긴다.
      gDots.appendChild(
        el('circle', {
          cx: qx, cy: qy, r: 14, fill: 'none',
          stroke: c.text, 'stroke-width': 1.4, 'stroke-dasharray': '3 3',
        }),
      );
      gDots.appendChild(
        el('path', {
          d: `M ${qx - 9} ${qy} H ${qx + 9} M ${qx} ${qy - 9} V ${qy + 9}`,
          stroke: c.text, 'stroke-width': 1.8, fill: 'none',
        }),
      );
      const queryLabel = el('text', {
        x: qx, y: qy - 21, 'text-anchor': 'middle',
        fill: c.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs,
      });
      queryLabel.textContent = t('label.query', 'query');
      gDots.appendChild(queryLabel);

      // ── 점들. 채움은 걸음의 형편, 테두리는 짚음의 표식이다.
      points.forEach((p, i) => {
        const here = walked.has(i);
        const stopped = scene.settled && i === at;
        const marked = strayed.has(i);
        gDots.appendChild(
          el('circle', {
            cx: sx(p), cy: sy(p), r: DOT_R,
            fill: stopped ? c.accent : here ? c.itemActive : c.itemDefault,
            stroke: marked ? c.itemComparing : c.border,
            'stroke-width': marked ? 1.6 : 1.5,
            ...(marked ? { 'stroke-dasharray': '2 3' } : {}),
          }),
        );
        const label = el('text', {
          x: sx(p) + DOT_R + 5, y: sy(p) + 4,
          fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
        });
        label.textContent = `p${i}`;
        gDots.appendChild(label);
      });

      // ── 멎었다는 고리와 발. 고리가 발 아래에 깔린다.
      let ring: SVGElement | null = null;
      let foot: SVGElement | null = null;
      if (at !== null) {
        if (scene.settled) {
          ring = el('circle', {
            cx: px(at), cy: py(at), r: FOOT_R + SETTLE_GROW, fill: 'none',
            stroke: c.text, 'stroke-width': 2.4,
          });
          gFoot.appendChild(ring);
        }
        foot = el('circle', {
          cx: px(at), cy: py(at), r: FOOT_R,
          fill: scene.settled ? c.accent : c.itemActive,
          stroke: c.stateInk, 'stroke-width': 1.5,
        });
        gFoot.appendChild(foot);
      }

      // ── 캡션 두 줄.
      const [headLine, restLine] = wrapCaption(captionFor(scene), CAPTION_BUDGET);
      const capA = el('text', {
        x: W / 2, y: CANVAS_H - 30, 'text-anchor': 'middle',
        fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md,
      });
      capA.textContent = headLine;
      const capB = el('text', {
        x: W / 2, y: CANVAS_H - 11, 'text-anchor': 'middle',
        fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md,
      });
      capB.textContent = restLine;
      gCaption.appendChild(capA);
      gCaption.appendChild(capB);

      return { px, py, qx, qy, links, spokes, reaches, trail, band, foot, ring };
    }

    // ── 몸짓 하나: 길이 놓인다 ────────────────────────────────────────────

    /** 미리 이어 둔 길. 선이 자라나야 "이어 둔다" 로 읽힌다. */
    function flowLay(drawn: Drawn, mine: number): Promise<void> {
      return tween(GRAPH_MS, mine, (p) => {
        const e = ease(clamp01(p));
        for (const l of drawn.links) {
          l.line.setAttribute('x2', String(lerp(l.ax, l.bx, p >= 1 ? 1 : e)));
          l.line.setAttribute('y2', String(lerp(l.ay, l.by, p >= 1 ? 1 : e)));
        }
      });
    }

    // ── 몸짓 둘: 이웃을 본다 ──────────────────────────────────────────────

    /** 살이 선 자리에서 이웃으로 뻗고, 이웃에서 질의로 줄이 뻗는다. */
    function flowProbe(drawn: Drawn, mine: number): Promise<void> {
      return tween(PROBE_MS, mine, (p) => {
        const e = p >= 1 ? 1 : ease(clamp01(p));
        for (const s of drawn.spokes) {
          s.line.setAttribute('x2', String(lerp(s.hx, s.tx, e)));
          s.line.setAttribute('y2', String(lerp(s.hy, s.ty, e)));
        }
        for (const r of drawn.reaches) {
          r.line.setAttribute('x2', String(lerp(r.cx, drawn.qx, e)));
          r.line.setAttribute('y2', String(lerp(r.cy, drawn.qy, e)));
        }
      });
    }

    // ── 몸짓 셋: 발을 옮긴다 ──────────────────────────────────────────────

    /**
     * 발이 활을 그리며 실제로 이동하고, 자취가 그만큼 늘어난다.
     *
     * 출발 자리는 자취 한 칸을 물린 `path[n - 2]` 다 — 화면에서도 `prev` 에서도
     * 꺼내지 않는다 (S-scene).
     */
    function flowWalk(
      scene: NeighborsLinkedAheadScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const n = scene.path.length;
      const from = scene.path[n - 2];
      const to = scene.path[n - 1];
      const foot = drawn.foot;
      if (n < 2 || from === undefined || to === undefined || foot === null) {
        return Promise.resolve();
      }
      // 자리는 정적 그리기가 쓴 것과 **같은 함수**를 지난다 — 두 벌이면 흘려 세운
      // 자취와 곧바로 세운 자취가 끝자리에서 갈린다.
      const { px, py } = drawn;
      const ride = arcOf(px(from), py(from), px(to), py(to));
      const band = drawn.band;
      const trail = drawn.trail;

      return tween(STEP_MS, mine, (p) => {
        const e = p >= 1 ? 1 : ease(clamp01(p));
        const now = e >= 1 ? { x: px(to), y: py(to) } : ride(e);
        foot.setAttribute('cx', String(now.x));
        foot.setAttribute('cy', String(now.y));
        if (band !== null) {
          band.setAttribute('x1', String(now.x));
          band.setAttribute('y1', String(now.y));
        }
        if (trail !== null) trail.setAttribute('d', trailOf(scene.path, e, px, py));
      });
    }

    // ── 몸짓 넷: 멎는다 ──────────────────────────────────────────────────

    /** 고리가 발에서 번져 나와 넓게 앉는다. 발이 한 번 부풀었다 가라앉는다. */
    function flowSettle(drawn: Drawn, mine: number): Promise<void> {
      const ring = drawn.ring;
      const foot = drawn.foot;
      if (ring === null || foot === null) return Promise.resolve();
      return tween(SETTLE_MS, mine, (p) => {
        if (p >= 1) {
          // 끝에서는 보간값이 아니라 정적 그리기와 **같은 값**을 그대로 쓴다.
          ring.setAttribute('r', String(FOOT_R + SETTLE_GROW));
          ring.setAttribute('stroke', c.text);
          ring.setAttribute('stroke-width', '2.4');
          ring.removeAttribute('opacity');
          foot.setAttribute('r', String(FOOT_R));
          return;
        }
        const e = ease(clamp01(p));
        ring.setAttribute('r', String(FOOT_R + SETTLE_GROW * e));
        ring.setAttribute('stroke', c.accent);
        ring.setAttribute('stroke-width', '3');
        ring.setAttribute('opacity', String(1 - 0.35 * e));
        foot.setAttribute('r', String(FOOT_R + 3 * Math.sin(Math.PI * e)));
      });
    }

    function flowFor(
      step: NeighborsStep,
      scene: NeighborsLinkedAheadScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'lay':
          return flowLay(drawn, mine);
        case 'probe':
          return flowProbe(drawn, mine);
        case 'walk':
          return flowWalk(scene, drawn, mine);
        case 'settle':
          return flowSettle(drawn, mine);
      }
    }

    async function render(
      next: NeighborsLinkedAheadScene,
      _prev: NeighborsLinkedAheadScene | null,
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
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  },
};

/** 두 자리를 잇는 활. 발을 떼어 옮기는 몸짓이라야 "걸어간다" 로 읽힌다. */
function arcOf(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): (t: number) => { x: number; y: number } {
  const cx = (ax + bx) / 2 - (by - ay) * ARC;
  const cy = (ay + by) / 2 + (bx - ax) * ARC;
  return (t: number) => {
    const u = 1 - t;
    return {
      x: u * u * ax + 2 * u * t * cx + t * t * bx,
      y: u * u * ay + 2 * u * t * cy + t * t * by,
    };
  };
}

/**
 * 밟은 자리들을 잇는 경로 문자열. **자취에서 파생되는 값이지 쌓아 두는 값이 아니다.**
 *
 * 옛 화면은 이 글자를 `let trailD` 에 쌓아 두고 걸음마다 자기 글자를 되읽어 뒤에
 * 이어 붙였다. 지금은 `path` 하나에서 매번 다시 만들어지므로 같은 걸음을 몇 번
 * 그려도 같은 글자가 나온다. `lastUpto` 는 마지막 도막을 어디까지 그렸나다.
 */
function trailOf(
  path: readonly number[],
  lastUpto: number,
  px: (i: number) => number,
  py: (i: number) => number,
): string {
  const head = path[0];
  if (head === undefined) return '';
  let d = `M ${px(head).toFixed(1)} ${py(head).toFixed(1)}`;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (a === undefined || b === undefined) continue;
    const ride = arcOf(px(a), py(a), px(b), py(b));
    const upto = i === path.length - 1 ? lastUpto : 1;
    for (let s = 1; s <= ARC_SAMPLES; s += 1) {
      const q = ride((upto * s) / ARC_SAMPLES);
      d += ` L ${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
    }
  }
  return d;
}
