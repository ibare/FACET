/**
 * auth 의 stage — 두 줄(앱 · 훔친 쪽)의 시간 축 위 토큰 유효 막대와 그 아래로 드는 요청 점.
 *
 * - 발급 서버 줄: 토큰이 발급된 자리의 눈금(아래로 향한 세모)
 * - 앱 줄: 토큰마다의 유효 막대 [발급, 만료). 요청 점 서른은 200 이면 막대 안으로 오르고, 401 이면 아래로 떨어진다
 * - 훔친 쪽 줄: 샌 토큰의 사본 막대(앱 줄에서 내려온다)와 요청 점 쉰넷
 * - API 서버 칸: 판정이 보는 요청 줄 · 머리줄(자료)
 *
 * 손잡이를 돌리면 앞 판의 막대와 점은 흐린 채 남아 있다가, 자기 창이 오면 새 판의 자리로 옮겨 간다.
 * 앞 판의 막대는 같은 창에서 새로 발급된 토큰 막대로 늘거나 줄고, 짝이 없으면 그 시각을 덮는 새 막대로
 * 늘어나 합쳐진다. 판정은 색 하나로 가르지 않는다 — 통과는 막대 안의 속 찬 점, 거절은 아래로 떨어진 속 빈 점.
 *
 * 운동 길이는 projector 가 재생 속도로 셈해 넘긴다 (`durMs`). 창 안의 사건은 그 길이 안에서 시각 차례로 지나간다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';

// ── 그림에 넘기는 모양 (projector 가 payload 를 좁혀 만든다)

export type RoundScene = {
  round: number;
  lifetime: number;
  prevLifetime: number | null;
  horizonSec: number;
  windowSec: number;
  leakAtSec: number;
  appSecs: number[];
  attackerSecs: number[];
  appCount: number;
  attackerCount: number;
};

export type WindowCounts = { appPass: number; stolenPass: number; stolenReject: number; issued: number };

export type WindowScene = {
  index: number;
  lo: number;
  hi: number;
  issued: { token: number; issuedSec: number; expiresSec: number }[];
  app: { sec: number; token: number; status: number }[];
  attacker: { sec: number; status: number }[];
  leak: { sec: number; token: number; issuedSec: number; expiresSec: number; usableSec: number } | null;
  counts: WindowCounts;
  totals: WindowCounts;
};

export type AuthStage = {
  startRound(scene: RoundScene, durMs: number): Promise<void>;
  showWindow(scene: WindowScene, durMs: number): Promise<void>;
  reset(): void;
};

const STATUS_OK = 200;
const STATUS_UNAUTHORIZED = 401;

// ── 자리

const W = 800;
const H = 372;
const X0 = 176;
const X1 = 776;
const LEFT = 16;

const HEAD_Y = 22;
const ISSUER_Y = 60;
const APP_BAR_Y = 92;
const THIEF_BAR_Y = 172;
const BAR_H = 14;
/** 막대 가운데에서 점이 기다리는 자리 · 거절로 떨어지는 자리까지의 거리. */
const WAIT_DY = 22;
const REJECT_DY = 38;
const AXIS_Y = 236;
const API_Y = 266;
const API_H = 48;
const CAPTION_Y = 336;
const CAPTION2_Y = 356;
const DOT_R = 3.5;

const SVG_NS = 'http://www.w3.org/2000/svg';

type Verdict = 'wait' | 'pass' | 'reject';

type Bar = {
  rect: SVGRectElement;
  mark: SVGPathElement;
  from: number;
  to: number;
  current: boolean;
};

type Dot = { el: SVGCircleElement; sec: number; cy: number; verdict: Verdict; current: boolean };

type Anim = { delay: number; dur: number; apply(p: number): void; begin?(): void };

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

type Material = { appAddr: string; thiefAddr: string; requestLine: string; authHeader: string };

/** initialData 에서 화면에 올리는 자료 글자를 읽는다. 문자열이 아니면 던진다. */
function readMaterial(initial: Record<string, unknown>): Material {
  const str = (v: unknown, name: string): string => {
    if (typeof v !== 'string') throw new Error(`auth-stage: initialData.${name} 가 문자열이 아니다`);
    return v;
  };
  const addrOf = (v: unknown, name: string): string => {
    if (typeof v !== 'object' || v === null) throw new Error(`auth-stage: initialData.${name} 가 객체가 아니다`);
    return str((v as { addr?: unknown }).addr, `${name}.addr`);
  };
  return {
    appAddr: addrOf(initial.app, 'app'),
    thiefAddr: addrOf(initial.attacker, 'attacker'),
    requestLine: str(initial.requestLine, 'requestLine'),
    authHeader: str(initial.authHeader, 'authHeader'),
  };
}

export const authStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    // 자료 글자 — initialData 가 아예 없으면(전수 검사의 `config: {}` 마운트) 그리지 않는다.
    // 있는데 모양이 어긋나면 지어내지 않고 던진다 (C6).
    const material = params.initialData === undefined ? null : readMaterial(params.initialData);

    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let pending: Anim[] = [];
    let destroyed = false;

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: SVGElement = svg,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (x: number, y: number, s: string, opts: { size?: string; mono?: boolean; fill?: string; anchor?: string; weight?: string } = {}): SVGTextElement => {
      const node = el('text', {
        x,
        y,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? colors.text,
        'text-anchor': opts.anchor ?? 'start',
        'font-weight': opts.weight ?? 'normal',
      });
      node.textContent = s;
      return node;
    };

    // ── 판마다 바뀌는 상태
    let horizon = 600;
    const sx = (sec: number): number => X0 + ((X1 - X0) * Math.min(Math.max(sec, 0), horizon)) / horizon;

    let bars: Bar[] = [];
    let appDots: Dot[] = [];
    let thiefDots: Dot[] = [];
    let leakBar: SVGRectElement | null = null;
    let leakGeom: { from: number; to: number } | null = null;
    let leakKept: { sec: number; expiresSec: number } | null = null;
    let windowGeom = { lo: 0, hi: 0 };

    // ── 층 (뒤에서 앞으로)
    const gWindow = el('g', {});
    const gFrame = el('g', {});
    const gBars = el('g', {});
    const gLeak = el('g', {});
    const gDots = el('g', {});
    const gText = el('g', {});

    const windowRect = el('rect', { x: X0, y: APP_BAR_Y - 12, width: 0, height: AXIS_Y - APP_BAR_Y + 4, fill: colors.bgSubtle }, gWindow);

    // 틀: 줄 이름 · 기준선 · 시간 축 · API 서버 칸 · 범례
    const drawFrame = (): void => {
      while (gFrame.firstChild) gFrame.removeChild(gFrame.firstChild);
      const rowLine = (y: number): void => {
        el('line', { x1: X0, y1: y, x2: X1, y2: y, stroke: colors.border, 'stroke-width': 1 }, gFrame);
      };
      rowLine(ISSUER_Y);
      rowLine(APP_BAR_Y + BAR_H / 2);
      rowLine(THIEF_BAR_Y + BAR_H / 2);
      const label = (y: number, s: string): void => {
        const n = text(LEFT, y, s, { weight: '600' });
        gFrame.appendChild(n);
      };
      label(ISSUER_Y + 4, t('label.issuer', 'Issuer'));
      label(APP_BAR_Y + 11, t('label.app', 'App'));
      label(THIEF_BAR_Y + 11, t('label.thief', 'Thief'));
      if (material) {
        gFrame.appendChild(text(LEFT, APP_BAR_Y + 26, material.appAddr, { mono: true, size: fontSizes.xs, fill: colors.textMuted }));
        gFrame.appendChild(text(LEFT, THIEF_BAR_Y + 26, material.thiefAddr, { mono: true, size: fontSizes.xs, fill: colors.textMuted }));
      }

      // 시간 축
      el('line', { x1: X0, y1: AXIS_Y, x2: X1, y2: AXIS_Y, stroke: colors.textMuted, 'stroke-width': 1 }, gFrame);
      const stepSec = horizon / 6;
      for (let i = 0; i <= 6; i++) {
        const sec = Math.round(stepSec * i);
        const x = sx(sec);
        el('line', { x1: x, y1: AXIS_Y, x2: x, y2: AXIS_Y + 5, stroke: colors.textMuted, 'stroke-width': 1 }, gFrame);
        const s = i === 6 ? t('label.axisEnd', '{n} s', { n: sec }) : String(sec);
        gFrame.appendChild(text(x, AXIS_Y + 18, s, { size: fontSizes.xs, fill: colors.textMuted, anchor: i === 6 ? 'end' : 'middle' }));
      }

      // API 서버 칸
      el('rect', { x: LEFT - 6, y: API_Y, width: W - 2 * (LEFT - 6), height: API_H, rx: 6, fill: 'none', stroke: colors.border }, gFrame);
      gFrame.appendChild(text(LEFT, API_Y + 20, t('label.api', 'API server'), { weight: '600' }));
      if (material) {
        gFrame.appendChild(text(X0, API_Y + 20, material.requestLine, { mono: true, size: fontSizes.xs }));
        gFrame.appendChild(text(X0, API_Y + 37, material.authHeader, { mono: true, size: fontSizes.xs }));
      }
      gFrame.appendChild(text(W - LEFT, API_Y + 20, t('label.rule', 'Looks at the token only'), { anchor: 'end', size: fontSizes.xs }));
      gFrame.appendChild(
        text(W - LEFT, API_Y + 37, t('label.ruleDetail', 'known and now < expiry → 200 · otherwise → 401'), {
          anchor: 'end',
          size: fontSizes.xs,
          fill: colors.textMuted,
        }),
      );

      // 범례
      const lx = 330;
      el('circle', { cx: lx, cy: HEAD_Y - 4, r: DOT_R, fill: colors.success, stroke: colors.text, 'stroke-width': 1 }, gFrame);
      gFrame.appendChild(text(lx + 8, HEAD_Y, t('label.pass', '200 pass'), { size: fontSizes.xs }));
      el('circle', { cx: lx + 110, cy: HEAD_Y - 4, r: DOT_R, fill: 'none', stroke: colors.danger, 'stroke-width': 1.5 }, gFrame);
      gFrame.appendChild(text(lx + 118, HEAD_Y, t('label.reject', '401 reject'), { size: fontSizes.xs }));
      el('rect', { x: lx + 220, y: HEAD_Y - 9, width: 16, height: 9, fill: colors.danger, 'fill-opacity': 0.35, stroke: colors.danger }, gFrame);
      gFrame.appendChild(text(lx + 242, HEAD_Y, t('label.leaked', 'stolen copy'), { size: fontSizes.xs }));
      el('rect', { x: lx + 340, y: HEAD_Y - 9, width: 16, height: 9, fill: 'none', stroke: colors.textMuted, 'stroke-dasharray': '3 2' }, gFrame);
      gFrame.appendChild(text(lx + 362, HEAD_Y, t('label.previous', 'previous run'), { size: fontSizes.xs }));
    };

    const lifetimeText = text(LEFT, HEAD_Y, '', { weight: '600' });
    gText.appendChild(lifetimeText);
    const appTally = text(LEFT, APP_BAR_Y + 42, '', { mono: true, size: fontSizes.xs });
    const thiefTally = text(LEFT, THIEF_BAR_Y + 42, '', { mono: true, size: fontSizes.xs });
    const caption = text(LEFT, CAPTION_Y, '', { size: fontSizes.md });
    const caption2 = text(LEFT, CAPTION2_Y, '', { size: fontSizes.sm, fill: colors.textMuted });
    for (const n of [appTally, thiefTally, caption, caption2]) gText.appendChild(n);
    const leakLine = el('line', { x1: 0, y1: APP_BAR_Y + BAR_H / 2, x2: 0, y2: THIEF_BAR_Y + BAR_H / 2, stroke: colors.danger, 'stroke-dasharray': '4 3', visibility: 'hidden' }, gLeak);
    const leakLabel = text(0, (APP_BAR_Y + THIEF_BAR_Y) / 2 + 22, '', { size: fontSizes.xs, fill: colors.danger });
    gLeak.appendChild(leakLabel);

    drawFrame();

    // ── 막대 · 점 모양

    const styleBar = (b: Bar): void => {
      if (b.current) {
        b.rect.setAttribute('fill', colors.primary);
        b.rect.setAttribute('fill-opacity', '0.28');
        b.rect.setAttribute('stroke', colors.primary);
        b.rect.removeAttribute('stroke-dasharray');
        b.mark.setAttribute('fill', colors.primary);
      } else {
        b.rect.setAttribute('fill', 'none');
        b.rect.setAttribute('stroke', colors.textMuted);
        b.rect.setAttribute('stroke-dasharray', '3 2');
        b.mark.setAttribute('fill', colors.border);
      }
    };
    const placeBar = (b: Bar, from: number, to: number): void => {
      const x = sx(from);
      const w = Math.max(sx(to) - x, 0);
      b.rect.setAttribute('x', String(x));
      b.rect.setAttribute('width', String(w));
      b.mark.setAttribute('d', `M ${x - 4} ${ISSUER_Y - 7} L ${x + 4} ${ISSUER_Y - 7} L ${x} ${ISSUER_Y} Z`);
    };
    const newBar = (from: number, to: number): Bar => {
      const rect = el('rect', { y: APP_BAR_Y, height: BAR_H, rx: 2, 'stroke-width': 1 }, gBars);
      const mark = el('path', {}, gBars);
      const b: Bar = { rect, mark, from, to, current: true };
      placeBar(b, from, to);
      styleBar(b);
      return b;
    };
    const removeBar = (b: Bar): void => {
      b.rect.remove();
      b.mark.remove();
    };

    const styleDot = (d: Dot): void => {
      if (!d.current) {
        d.el.setAttribute('fill', 'none');
        d.el.setAttribute('stroke', colors.border);
        d.el.setAttribute('stroke-width', '1');
        return;
      }
      if (d.verdict === 'pass') {
        d.el.setAttribute('fill', colors.success);
        d.el.setAttribute('stroke', colors.text);
        d.el.setAttribute('stroke-width', '1');
      } else if (d.verdict === 'reject') {
        d.el.setAttribute('fill', 'none');
        d.el.setAttribute('stroke', colors.danger);
        d.el.setAttribute('stroke-width', '1.5');
      } else {
        d.el.setAttribute('fill', colors.bg);
        d.el.setAttribute('stroke', colors.textMuted);
        d.el.setAttribute('stroke-width', '1');
      }
    };
    const dotY = (barY: number, v: Verdict): number => {
      const mid = barY + BAR_H / 2;
      return v === 'pass' ? mid : v === 'reject' ? mid + REJECT_DY : mid + WAIT_DY;
    };
    const makeDots = (secs: number[], barY: number): Dot[] =>
      secs.map((sec) => {
        const cy = dotY(barY, 'wait');
        const d: Dot = { el: el('circle', { cx: sx(sec), cy, r: DOT_R }, gDots), sec, cy, verdict: 'wait', current: true };
        styleDot(d);
        return d;
      });
    const sameSecs = (dots: Dot[], secs: number[]): boolean => dots.length === secs.length && dots.every((d, i) => d.sec === secs[i]);

    // ── 운동

    const finish = (): void => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const a of pending) {
        a.begin?.();
        a.apply(1);
      }
      pending = [];
      for (const wake of [...waiters]) wake();
      waiters.clear();
    };
    const play = (anims: Anim[], durMs: number): Promise<void> => {
      finish();
      if (destroyed || isInstant() || durMs <= 0 || typeof requestAnimationFrame !== 'function') {
        for (const a of anims) {
          a.begin?.();
          a.apply(1);
        }
        return Promise.resolve();
      }
      pending = anims;
      const started = new Set<Anim>();
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const t0 = performance.now();
        const tick = (now: number): void => {
          const elapsed = now - t0;
          for (const a of anims) {
            if (elapsed < a.delay) continue;
            if (!started.has(a)) {
              started.add(a);
              a.begin?.();
            }
            a.apply(ease(Math.min(1, (elapsed - a.delay) / Math.max(1, a.dur))));
          }
          if (elapsed >= durMs) {
            for (const a of anims) {
              if (!started.has(a)) a.begin?.();
              a.apply(1);
            }
            pending = [];
            wake();
            return;
          }
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tick(n);
        });
        frames.add(id);
      });
    };
    params.onScrubStart?.(finish);

    const moveWindow = (lo: number, hi: number): Anim => {
      const from = { ...windowGeom };
      windowGeom = { lo, hi };
      return {
        delay: 0,
        dur: 0,
        apply: (p) => {
          const a = lerp(sx(from.lo), sx(lo), p);
          const b = lerp(sx(from.hi), sx(hi), p);
          windowRect.setAttribute('x', String(a));
          windowRect.setAttribute('width', String(Math.max(b - a, 0)));
        },
      };
    };

    const clearAll = (): void => {
      finish();
      for (const b of bars) removeBar(b);
      bars = [];
      for (const d of [...appDots, ...thiefDots]) d.el.remove();
      appDots = [];
      thiefDots = [];
      leakBar?.remove();
      leakBar = null;
      leakGeom = null;
      leakKept = null;
      windowGeom = { lo: 0, hi: 0 };
      windowRect.setAttribute('width', '0');
      leakLine.setAttribute('visibility', 'hidden');
      leakLabel.textContent = '';
      lifetimeText.textContent = '';
      appTally.textContent = '';
      thiefTally.textContent = '';
      caption.textContent = '';
      caption2.textContent = '';
    };

    const stage: AuthStage & ViewInstance = {
      startRound(scene, durMs) {
        if (scene.horizonSec !== horizon) {
          horizon = scene.horizonSec;
          clearAll();
          drawFrame();
        }
        const anims: Anim[] = [];
        // 앞 판의 것은 흐린 채 남긴다 — 자기 창이 오면 새 자리로 옮겨 간다
        for (const b of bars) {
          b.current = false;
          styleBar(b);
        }
        if (sameSecs(appDots, scene.appSecs) && sameSecs(thiefDots, scene.attackerSecs)) {
          for (const d of [...appDots, ...thiefDots]) {
            d.current = false;
            styleDot(d);
          }
        } else {
          for (const d of [...appDots, ...thiefDots]) d.el.remove();
          appDots = makeDots(scene.appSecs, APP_BAR_Y);
          thiefDots = makeDots(scene.attackerSecs, THIEF_BAR_Y);
        }
        if (leakBar) {
          leakBar.setAttribute('fill', 'none');
          leakBar.setAttribute('stroke', colors.textMuted);
          leakBar.setAttribute('stroke-dasharray', '3 2');
        }
        leakKept = null;
        leakLine.setAttribute('x1', String(sx(scene.leakAtSec)));
        leakLine.setAttribute('x2', String(sx(scene.leakAtSec)));
        leakLabel.setAttribute('x', String(sx(scene.leakAtSec) + 4));
        anims.push({ ...moveWindow(0, 0), dur: durMs });

        lifetimeText.textContent = t('label.lifetime', 'Token lifetime: {n} s', { n: scene.lifetime });
        appTally.textContent = '';
        thiefTally.textContent = '';
        caption.textContent =
          scene.prevLifetime === null
            ? t('caption.start', 'Lifetime {life} s. The app asks {appCount} times, the thief {atkCount} times.', {
                life: scene.lifetime,
                appCount: scene.appCount,
                atkCount: scene.attackerCount,
              })
            : t('caption.restart', 'Lifetime {prev} s → {life} s. Dashed marks are the previous run; each moves when its window comes.', {
                prev: scene.prevLifetime,
                life: scene.lifetime,
              });
        caption2.textContent = '';
        return play(anims, scene.prevLifetime === null ? 0 : durMs);
      },

      showWindow(scene, durMs) {
        const span = Math.max(1, scene.hi - scene.lo);
        const moveShare = 0.45;
        const at = (sec: number): number => ((sec - scene.lo) / span) * durMs * (1 - moveShare);
        const moveDur = durMs * moveShare;
        const anims: Anim[] = [{ ...moveWindow(scene.lo, scene.hi), dur: durMs * 0.3 }];

        // 막대 — 이 창에서 발급된 토큰마다 앞 판의 막대 하나를 짝지어 늘이거나 줄인다. 짝이 없으면 0 에서 자란다
        const ghosts = bars.filter((b) => !b.current && b.from > scene.lo && b.from <= scene.hi).sort((a, b) => a.from - b.from);
        const claimed = new Set<Bar>();
        for (const k of scene.issued) {
          const ghost = ghosts.find((g) => !claimed.has(g));
          if (ghost) {
            claimed.add(ghost);
            const from = { a: ghost.from, b: ghost.to };
            ghost.from = k.issuedSec;
            ghost.to = k.expiresSec;
            anims.push({
              delay: at(k.issuedSec),
              dur: moveDur,
              begin: () => {
                ghost.current = true;
                styleBar(ghost);
              },
              apply: (p) => placeBar(ghost, lerp(from.a, k.issuedSec, p), lerp(from.b, k.expiresSec, p)),
            });
          } else {
            const b = newBar(k.issuedSec, k.issuedSec);
            b.rect.setAttribute('visibility', 'hidden');
            b.mark.setAttribute('visibility', 'hidden');
            b.to = k.expiresSec;
            bars.push(b);
            anims.push({
              delay: at(k.issuedSec),
              dur: moveDur,
              begin: () => {
                b.rect.removeAttribute('visibility');
                b.mark.removeAttribute('visibility');
              },
              apply: (p) => placeBar(b, k.issuedSec, lerp(k.issuedSec, k.expiresSec, p)),
            });
          }
        }
        // 짝이 없는 앞 판의 막대는 그 시각을 덮는 새 막대로 늘어나 합쳐진다
        const currentAfter = bars.filter((b) => b.current || claimed.has(b));
        for (const g of ghosts) {
          if (claimed.has(g)) continue;
          const cover = currentAfter.filter((b) => b.from <= g.from).sort((a, b) => b.from - a.from)[0];
          if (!cover) throw new Error(`앞 판의 막대(${g.from} 초)를 덮는 새 막대가 없다`);
          const from = { a: g.from, b: g.to };
          anims.push({
            delay: at(g.from),
            dur: moveDur,
            apply: (p) => {
              placeBar(g, lerp(from.a, cover.from, p), lerp(from.b, cover.to, p));
              if (p >= 1) removeBar(g);
            },
          });
          bars = bars.filter((b) => b !== g);
        }

        // 유출 — 앱 줄의 막대 사본이 훔친 쪽 줄로 내려온다. 앞 판의 사본은 새 길이로 늘거나 줄다 겹쳐 사라진다
        if (scene.leak) {
          const lk = scene.leak;
          const oldBar = leakBar;
          const old = leakGeom;
          const copy = el('rect', {
            x: sx(lk.issuedSec),
            y: APP_BAR_Y,
            width: Math.max(sx(lk.expiresSec) - sx(lk.issuedSec), 0),
            height: BAR_H,
            rx: 2,
            fill: colors.danger,
            'fill-opacity': 0.35,
            stroke: colors.danger,
            visibility: 'hidden',
          }, gLeak);
          leakBar = copy;
          leakGeom = { from: lk.issuedSec, to: lk.expiresSec };
          leakKept = { sec: lk.sec, expiresSec: lk.expiresSec };
          anims.push({
            delay: at(lk.sec),
            dur: moveDur,
            begin: () => {
              copy.removeAttribute('visibility');
              leakLine.setAttribute('visibility', 'visible');
              leakLabel.textContent = t('label.leakAt', 'leak {sec} s', { sec: lk.sec });
            },
            apply: (p) => copy.setAttribute('y', String(lerp(APP_BAR_Y, THIEF_BAR_Y, p))),
          });
          if (oldBar && old) {
            anims.push({
              delay: at(lk.sec),
              dur: moveDur,
              apply: (p) => {
                const a = sx(lerp(old.from, lk.issuedSec, p));
                const b = sx(lerp(old.to, lk.expiresSec, p));
                oldBar.setAttribute('x', String(a));
                oldBar.setAttribute('width', String(Math.max(b - a, 0)));
                if (p >= 1) oldBar.remove();
              },
            });
          }
        }

        // 요청 점 — 판정이 나면 막대 안으로 오르거나 아래로 떨어진다
        const judge = (dots: Dot[], reqs: { sec: number; status: number }[], barY: number): void => {
          for (const r of reqs) {
            const d = dots.find((x) => x.sec === r.sec);
            if (!d) throw new Error(`${r.sec} 초의 요청 점이 없다`);
            if (r.status !== STATUS_OK && r.status !== STATUS_UNAUTHORIZED) throw new Error(`모르는 판정: ${r.status}`);
            const verdict: Verdict = r.status === STATUS_OK ? 'pass' : 'reject';
            const fromY = d.cy;
            const toY = dotY(barY, verdict);
            d.cy = toY;
            anims.push({
              delay: at(r.sec),
              dur: moveDur,
              begin: () => {
                d.current = true;
                d.verdict = verdict;
                styleDot(d);
              },
              apply: (p) => d.el.setAttribute('cy', String(lerp(fromY, toY, p))),
            });
          }
        };
        judge(appDots, scene.app, APP_BAR_Y);
        judge(thiefDots, scene.attacker, THIEF_BAR_Y);

        // 글자 — 걸음 끝 화면에 남는 것만 센다
        const c = scene.counts;
        caption.textContent = t('caption.window', '{lo}–{hi} s · issued +{issued} · app 200: {appOk} · thief 200: {stolenOk} · thief 401: {stolenNo}', {
          lo: scene.lo,
          hi: scene.hi,
          issued: c.issued,
          appOk: c.appPass,
          stolenOk: c.stolenPass,
          stolenNo: c.stolenReject,
        });
        if (scene.leak) {
          caption2.textContent = t('caption.leak', 'At {sec} s a copy of the app token leaks. It is valid until {exp} s: usable {usable} s after the leak.', {
            sec: scene.leak.sec,
            exp: scene.leak.expiresSec,
            usable: scene.leak.usableSec,
          });
        } else if (leakKept) {
          caption2.textContent = t('caption.leakKept', 'The stolen copy expires at {exp} s.', { exp: leakKept.expiresSec });
        } else {
          caption2.textContent = '';
        }
        appTally.textContent = t('label.tallyApp', '200: {pass}', { pass: scene.totals.appPass });
        thiefTally.textContent = t('label.tallyThief', '200: {pass} · 401: {reject}', {
          pass: scene.totals.stolenPass,
          reject: scene.totals.stolenReject,
        });
        return play(anims, durMs);
      },

      reset() {
        clearAll();
      },

      destroy() {
        destroyed = true;
        finish();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
    return stage;
  },
};
