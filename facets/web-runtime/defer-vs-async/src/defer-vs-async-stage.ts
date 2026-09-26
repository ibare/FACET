/**
 * defer-vs-async 의 stage.
 *
 * 같은 문서, 같은 두 스크립트를 두 쪽(defer 위 / async 아래)에 나란히 두고
 * 한 축(시각을 sqrt 로 눌러 넓은 ms 폭을 한 폭에 담는다) 위에서 요청 · 도착 ·
 * 붙듦 · 실행 · DOMContentLoaded 가 실제로 다른 자리에 서는 것을 그린다.
 * 코드 표기는 `@notation native` — `defer`/`async`/파일 이름은 자료 그대로, 번역하지 않는다.
 */
import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type {
  DeferVsAsyncMomentEntry,
  DeferVsAsyncScriptId,
  DeferVsAsyncSide,
} from './algorithm.js';
import type { DeferVsAsyncLaneScene, DeferVsAsyncScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD = 16;
const LEFT_LABEL_W = 58;
const AXIS_X0 = PAD + LEFT_LABEL_W;
const AXIS_X1 = PIECE_CANVAS_W - PAD;
const AXIS_W = AXIS_X1 - AXIS_X0;

const TITLE_H = 20;
const ROW_GAP = 6;
const PARSE_ROW_H = 20;
const SCRIPT_ROW_H = 26;
const LANE_H = TITLE_H + ROW_GAP + PARSE_ROW_H + ROW_GAP + SCRIPT_ROW_H + ROW_GAP + SCRIPT_ROW_H;
const LANE_GAP = 16;
const TOP_PAD = 14;
const CAPTION_H = 64;
const BOTTOM_PAD = 12;
const CANVAS_H = TOP_PAD + LANE_H * 2 + LANE_GAP + CAPTION_H + BOTTOM_PAD;

const SIDES: DeferVsAsyncSide[] = ['defer', 'async'];

const ANIM_MS = 420;

type StaticConfig = {
  parseMs: number;
  bodyLineCount: number;
  axisMaxMs: number;
  scripts: Record<DeferVsAsyncScriptId, { src: string }>;
};

function readScript(
  raw: unknown,
  id: DeferVsAsyncScriptId,
): { src: string; dur: number; exec: number } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (s.id !== id) return null;
  if (typeof s.src !== 'string' || typeof s.dur !== 'number' || typeof s.exec !== 'number') {
    return null;
  }
  return { src: s.src, dur: s.dur, exec: s.exec };
}

function parseStaticConfig(initialData: Record<string, unknown> | undefined): StaticConfig | null {
  if (!initialData) return null;
  const { parseMs, bodyLineCount, scripts } = initialData;
  if (typeof parseMs !== 'number' || typeof bodyLineCount !== 'number') return null;
  if (!Array.isArray(scripts) || scripts.length !== 2) return null;
  const big = readScript(scripts[0], 'big') ?? readScript(scripts[1], 'big');
  const small = readScript(scripts[0], 'small') ?? readScript(scripts[1], 'small');
  if (!big || !small) return null;
  const axisMaxMs = parseMs * (2 + bodyLineCount) + big.dur + big.exec + small.dur + small.exec;
  return {
    parseMs,
    bodyLineCount,
    axisMaxMs,
    scripts: { big: { src: big.src }, small: { src: small.src } },
  };
}

function xOf(ms: number, axisMaxMs: number): number {
  const clamped = Math.max(0, Math.min(ms, axisMaxMs));
  return AXIS_X0 + (Math.sqrt(clamped) / Math.sqrt(axisMaxMs)) * AXIS_W;
}

function laneTop(index: number): number {
  return TOP_PAD + index * (LANE_H + LANE_GAP);
}

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  dash?: string,
): SVGLineElement {
  const e = el('line');
  e.setAttribute('x1', String(x1));
  e.setAttribute('y1', String(y1));
  e.setAttribute('x2', String(x2));
  e.setAttribute('y2', String(y2));
  e.setAttribute('stroke', color);
  e.setAttribute('stroke-width', String(width));
  e.setAttribute('stroke-linecap', 'round');
  if (dash) e.setAttribute('stroke-dasharray', dash);
  return e;
}

function circle(cx: number, cy: number, r: number, color: string): SVGCircleElement {
  const e = el('circle');
  e.setAttribute('cx', String(cx));
  e.setAttribute('cy', String(cy));
  e.setAttribute('r', String(r));
  e.setAttribute('fill', color);
  return e;
}

function text(
  x: number,
  y: number,
  str: string,
  color: string,
  size: string,
  opts?: { anchor?: 'start' | 'middle' | 'end'; weight?: string; font?: string },
): SVGTextElement {
  const e = el('text');
  e.setAttribute('x', String(x));
  e.setAttribute('y', String(y));
  e.setAttribute('fill', color);
  e.setAttribute('font-size', size);
  e.setAttribute('font-family', opts?.font ?? fonts.body);
  e.setAttribute('text-anchor', opts?.anchor ?? 'start');
  if (opts?.weight) e.setAttribute('font-weight', opts.weight);
  e.textContent = str;
  return e;
}

function approxTextWidth(str: string, sizePx: number): number {
  return str.length * sizePx * 0.56;
}

function wrapText(str: string, sizePx: number, maxWidth: number): string[] {
  const words = str.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (approxTextWidth(next, sizePx) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * 캡션 조각(문장 하나하나)을 되도록 통째로 줄에 담는다. 낱말 단위로 접으면
 * "async: · big.js 실행 시작." 처럼 문장 한가운데가 잘린다 — 문장 경계에서
 * 먼저 접고, 문장 하나가 그래도 넘치면 그때만 낱말로 마저 접는다.
 */
function packParts(parts: string[], sizePx: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const part of parts) {
    const candidate = cur ? `${cur}  ·  ${part}` : part;
    if (approxTextWidth(candidate, sizePx) > maxWidth && cur) {
      lines.push(cur);
      cur = part;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines.flatMap((ln) =>
    approxTextWidth(ln, sizePx) > maxWidth ? wrapText(ln, sizePx, maxWidth) : [ln],
  );
}

function scriptSrc(config: StaticConfig, id: DeferVsAsyncScriptId): string {
  return config.scripts[id].src;
}

function captionForEntry(
  entry: DeferVsAsyncMomentEntry,
  config: StaticConfig,
  tr: Translate,
): string {
  const side = entry.side;
  if (entry.kind === 'parse-end') {
    return tr('caption.parseEnd', '{side}: parsing finishes.', { side });
  }
  if (entry.kind === 'dcl') {
    return tr('caption.dcl', '{side}: DOMContentLoaded fires.', { side });
  }
  if (!entry.script) {
    throw new Error(`defer-vs-async: ${entry.kind} 사건에 script 가 없다`);
  }
  const script = scriptSrc(config, entry.script);
  if (entry.kind === 'request') {
    return tr('caption.request', '{side}: {script} requested.', { side, script });
  }
  if (entry.kind === 'arrive') {
    return tr('caption.arrive', '{side}: {script} arrives.', { side, script });
  }
  if (entry.kind === 'exec-start') {
    return tr('caption.execStart', '{side}: {script} starts running.', { side, script });
  }
  if (entry.kind === 'exec-end') {
    return tr('caption.execEnd', '{side}: {script} finishes running.', { side, script });
  }
  throw new Error(`defer-vs-async: 모르는 사건 (${entry.kind})`);
}

/**
 * 캡션을 문장 단위로 쪼개 돌려준다 (줄바꿈이 문장 한가운데를 자르지 않도록).
 * `t=` 시각 표기는 사양의 걸음표가 쓰는 그대로다 — 번역하지 않는 자료라 `messages`
 * 를 거치지 않는다.
 */
function captionParts(scene: DeferVsAsyncScene, config: StaticConfig, tr: Translate): string[] {
  if (scene.lastEntries.length === 0) {
    return [
      tr('caption.start', 'Same document, two attributes: {a} and {b}.', {
        a: 'defer',
        b: 'async',
      }),
    ];
  }
  const stamp = `t=${scene.nowMs}`;
  const sentences = scene.lastEntries.map((entry) => captionForEntry(entry, config, tr));
  return [`${stamp} — ${sentences[0]}`, ...sentences.slice(1)];
}

function drawLane(
  root: SVGGElement,
  side: DeferVsAsyncSide,
  laneIndex: number,
  lane: DeferVsAsyncLaneScene,
  atMs: number,
  config: StaticConfig,
  colors: Palette,
  tr: Translate,
): void {
  const top = laneTop(laneIndex);
  const titleBaseline = top + 14;
  root.appendChild(
    text(PAD, titleBaseline, side, colors.text, fontSizes.md, {
      weight: '600',
      font: fonts.mono,
    }),
  );

  const parseTop = top + TITLE_H + ROW_GAP;
  const parseMidY = parseTop + PARSE_ROW_H / 2;
  root.appendChild(
    text(PAD, parseMidY + 4, tr('label.parsing', 'Parsing'), colors.textMuted, fontSizes.xs),
  );
  root.appendChild(line(AXIS_X0, parseMidY, AXIS_X1, parseMidY, colors.border, 2));
  const parseEndBound = lane.parseEnd !== undefined ? lane.parseEnd : atMs;
  const parseFillMs = Math.min(atMs, parseEndBound);
  if (parseFillMs > 0) {
    root.appendChild(
      line(AXIS_X0, parseMidY, xOf(parseFillMs, config.axisMaxMs), parseMidY, colors.text, 2),
    );
  }
  if (lane.parseEnd !== undefined && atMs >= lane.parseEnd) {
    const x = xOf(lane.parseEnd, config.axisMaxMs);
    root.appendChild(line(x, parseMidY - 6, x, parseMidY + 6, colors.text, 2));
    const label = tr('label.parseEnd', 'parse end');
    const w = approxTextWidth(label, parseFloat(fontSizes.xs));
    const anchor = x + w > AXIS_X1 ? 'end' : 'start';
    root.appendChild(
      text(anchor === 'end' ? x - 4 : x + 4, parseMidY - 8, label, colors.textMuted, fontSizes.xs, {
        anchor,
      }),
    );
  }

  const rows: Array<[DeferVsAsyncScriptId, number]> = [
    ['big', top + TITLE_H + ROW_GAP + PARSE_ROW_H + ROW_GAP],
    ['small', top + TITLE_H + ROW_GAP + PARSE_ROW_H + ROW_GAP + SCRIPT_ROW_H + ROW_GAP],
  ];
  for (const [id, rowTop] of rows) {
    const midY = rowTop + SCRIPT_ROW_H / 2;
    const sc = lane.scripts[id];
    root.appendChild(
      text(PAD, midY + 4, scriptSrc(config, id), colors.textMuted, fontSizes.xs, {
        font: fonts.mono,
      }),
    );
    root.appendChild(line(AXIS_X0, midY, AXIS_X1, midY, colors.border, 1));

    if (sc.request === undefined || atMs < sc.request) continue;
    const reqX = xOf(sc.request, config.axisMaxMs);
    root.appendChild(circle(reqX, midY, 3, colors.text));

    if (sc.arrive !== undefined) {
      const arrX = xOf(sc.arrive, config.axisMaxMs);
      root.appendChild(line(reqX, midY, arrX, midY, colors.border, 3, '2,3'));
      const receivedMs = Math.min(atMs, sc.arrive);
      root.appendChild(
        line(reqX, midY, xOf(receivedMs, config.axisMaxMs), midY, colors.textMuted, 3),
      );
      if (atMs >= sc.arrive) {
        root.appendChild(circle(arrX, midY, 3, colors.text));
        const holdBoundMs = sc.execStart !== undefined ? sc.execStart : atMs;
        const heldMs = Math.min(atMs, holdBoundMs);
        if (heldMs > sc.arrive) {
          root.appendChild(
            line(arrX, midY, xOf(heldMs, config.axisMaxMs), midY, colors.itemComparing, 3, '1,3'),
          );
        }
      }
    } else {
      root.appendChild(
        line(reqX, midY, xOf(atMs, config.axisMaxMs), midY, colors.textMuted, 3),
      );
    }

    if (sc.execStart !== undefined && atMs >= sc.execStart) {
      const startX = xOf(sc.execStart, config.axisMaxMs);
      const execBoundMs = sc.execEnd !== undefined ? sc.execEnd : atMs;
      const endMs = Math.min(atMs, execBoundMs);
      const done = sc.execEnd !== undefined && atMs >= sc.execEnd;
      const color = done ? colors.itemSorted : colors.itemActive;
      if (endMs > sc.execStart) {
        root.appendChild(line(startX, midY, xOf(endMs, config.axisMaxMs), midY, color, 8));
      } else {
        root.appendChild(circle(startX, midY, 4, color));
      }
      if (done) {
        root.appendChild(circle(xOf(sc.execEnd!, config.axisMaxMs), midY, 3, colors.text));
      }
    }
  }

  if (lane.dcl !== undefined && atMs >= lane.dcl) {
    const x = xOf(lane.dcl, config.axisMaxMs);
    root.appendChild(line(x, top + TITLE_H, x, top + LANE_H, colors.accent, 2));
    const label = 'DOMContentLoaded';
    const w = approxTextWidth(label, parseFloat(fontSizes.xs));
    const anchor = x + w > AXIS_X1 ? 'end' : 'start';
    root.appendChild(
      text(anchor === 'end' ? x - 4 : x + 4, top + TITLE_H - 4, label, colors.accent, fontSizes.xs, {
        anchor,
        font: fonts.mono,
      }),
    );
  }
}

export const deferVsAsyncStageView: CanvasView = {
  canvas: { height: CANVAS_H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    canvas.setAttribute('viewBox', `0 0 ${PIECE_CANVAS_W} ${CANVAS_H}`);
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const parsedConfig = parseStaticConfig(params.initialData);

    let destroyed = false;
    let gen = 0;
    const waiters = new Set<() => void>();

    function clear(): void {
      canvas.textContent = '';
    }

    if (!parsedConfig) {
      return {
        render(): void {},
        destroy(): void {
          clear();
        },
      };
    }
    const config: StaticConfig = parsedConfig;

    function drawAtMs(scene: DeferVsAsyncScene, atMs: number): void {
      if (destroyed) return;
      clear();
      const root = el('g');
      canvas.appendChild(root);
      SIDES.forEach((side, i) => {
        drawLane(root, side, i, scene.lanes[side], atMs, config, colors, tr);
      });

      const cursorTop = TOP_PAD;
      const cursorBottom = laneTop(SIDES.length - 1) + LANE_H;
      if (atMs > 0) {
        const x = xOf(atMs, config.axisMaxMs);
        root.appendChild(line(x, cursorTop, x, cursorBottom, colors.primary, 1.5, '4,3'));
      }

      const capTop = cursorBottom + LANE_GAP;
      const parts = captionParts(scene, config, tr);
      const lines = packParts(parts, parseFloat(fontSizes.sm), AXIS_X1 - PAD);
      lines.slice(0, 3).forEach((ln, i) => {
        root.appendChild(text(PAD, capTop + 16 + i * 16, ln, colors.text, fontSizes.sm));
      });
    }

    function drawStatic(scene: DeferVsAsyncScene): void {
      drawAtMs(scene, scene.nowMs);
    }

    function animateTo(scene: DeferVsAsyncScene, fromMs: number): Promise<void> {
      const mine = (gen += 1);
      const toMs = scene.nowMs;
      return new Promise<void>((resolve) => {
        if (destroyed || mine !== gen) {
          resolve();
          return;
        }
        if (toMs <= fromMs) {
          drawAtMs(scene, toMs);
          resolve();
          return;
        }
        const start = performance.now();
        let frameId = 0;
        const done = (): void => {
          waiters.delete(done);
          if (frameId) cancelAnimationFrame(frameId);
          resolve();
        };
        waiters.add(done);
        const frame = (now: number): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          const progress = Math.min(1, (now - start) / ANIM_MS);
          drawAtMs(scene, fromMs + (toMs - fromMs) * progress);
          if (progress >= 1) {
            done();
            return;
          }
          frameId = requestAnimationFrame(frame);
        };
        frameId = requestAnimationFrame(frame);
      });
    }

    return {
      render(
        next: DeferVsAsyncScene,
        prev: DeferVsAsyncScene | null,
        opts: { animate: boolean },
      ): void | Promise<void> {
        if (!opts.animate || prev === null) {
          drawStatic(next);
          return;
        }
        return animateTo(next, prev.nowMs).then(() => {
          if (!destroyed) drawStatic(next);
        });
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const wake of [...waiters]) wake();
        waiters.clear();
        clear();
      },
    };
  },
};
