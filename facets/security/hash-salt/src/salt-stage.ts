/**
 * salt-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * 표 한 장이다. 두 행이 사람 하나씩이고, 열은 이름 / 비밀번호 / 소금 / 저장되는 값.
 *
 * ── 이행이 고친 화면 — 뒤엣답이 앞엣답을 지우고 있었다
 *
 * 이 조각의 주장은 *견줌*이다. "같은 비밀번호라도 소금을 치면 해시가 달라진다" 는
 * **소금 치기 전과 후를 나란히 놓아야** 서는 말이다. 그런데 옛 화면은 값 열 하나를
 * 돌려 쓰며 두 답을 겹쳐 실었다.
 *
 * - `stored.textContent` 가 소금 없는 값에서 소금 친 값으로 **갈아 끼워졌다.**
 *   완주 화면에는 갈라진 값 둘만 남고 "소금이 없을 때는 둘이 똑같았다" 가 어디에도
 *   없었다 — 조각이 무엇을 고쳤는지 보이지 않는다.
 * - 판정 글자도 하나뿐이라 "똑같다" 가 "갈렸다" 에 지워졌다.
 *
 * 지금은 어휘를 갈라 둘을 한 화면에 세운다.
 *
 * - **값 열이 둘** — 왼쪽은 그대로 해싱한 값, 오른쪽은 소금을 치고 해싱한 값. 왼쪽은
 *   선 뒤로 끝까지 제자리를 지킨다.
 * - **판정도 제 열 아래 하나씩** — 왼쪽 "똑같다", 오른쪽 "갈렸다". 둘 다 남는다.
 * - **칠은 판정의 결과** — 한 열의 값들이 서로 같으면 위험을 뜻하는 칠(danger),
 *   갈렸으면 본문 칠이다. 글자와 그 아래 결론이 **같은 자료**에서 나오므로 어긋날
 *   자리가 없다 (함정 34). 소금은 사건 강조(accent) 로 따로 선다.
 * - **"같은 자리의 값이 갈린다" 는 동사는 운동으로 남는다** — 소금 친 값은 왼쪽
 *   열의 자리에서 미끄러져 나와 제 열에 앉는다.
 *
 * 해시 함수 이름(`SHA-256`) 도 이제 화면에 선다. 선언이 "화면에 인쇄할 이름" 이라
 * 싣고 있었는데 옛 화면은 그것을 한 번도 읽지 않았다 (함정 26).
 *
 * ── CSS transition 을 쓰지 않는다
 *
 * 옛 stage 는 CSS 전환을 인라인 스타일로 걸어 두고 값을 바꾸는 짜임이었다 (네 곳).
 * 되짚기는 `animate:false` 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게
 * 하므로 흔들림 축을 구조적으로 통과할 수 없다 (S-scene MUST NOT). 전부 `tween`
 * 보간으로 옮겼다 — 색 전환은 두 칠을 직접 섞는다. 벽시계는 `setTimeout` 으로 재고
 * rAF 를 쓰지 않는다. 걸음이 프레임 없는 자리에서도 돌아야 하기 때문이다.
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 한 열의 값들이 서로 같다 (뚫리면 함께 뚫린다) — palette.danger
 *   - 갈라져 안전해졌다 — palette.success
 *   - 소금 — palette.accent (사건 강조)
 *   - 비밀번호 / 이름 / 머리표 — palette.text · palette.textMuted
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  allSame,
  captionOf,
  storedPlain,
  storedSalted,
  type HashSaltCaption,
  type HashSaltScene,
  type HashSaltStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 내용이 정하는 값이라 그림 곁에 둔다 (S-view). */
const H = 214;

/** 좌우 여백. 값 열의 오른쪽 끝이 이 여백에 맞아 폭을 다 쓴다 (S-piece). */
const PAD = 24;

// ── 열 좌표 ─────────────────────────────────────────────────────────────
const NAME_X = PAD;
const PW_X = 110;
const SALT_X = 232;
/** 그대로 해싱한 값. 먼저 서고 끝까지 제자리를 지킨다. */
const PLAIN_X = 348;
/** 소금을 치고 해싱한 값. 왼쪽 열에서 미끄러져 나와 여기 앉는다. */
const SALTED_X = 490;
/** 두 값 열을 아우르는 머리표의 가운데. */
const STORED_MID = (PLAIN_X + (W - PAD)) / 2;

// ── 행 ──────────────────────────────────────────────────────────────────
const HEADER_Y = 72;
const ROW_Y0 = 104;
const ROW_PITCH = 40;

const STAMP_Y = 16;
const CAPTION_Y = 34;
const VERDICT_Y = 190;

/** hex 앞머리만 인쇄한다. 요점은 값의 내용이 아니라 같은지 다른지다. */
const HEX_HEAD = 15;
/** 잘렸다는 표식. 도형에 새겨지는 글자라 번역 대상이 아니다 (C10 판정 1·3). */
const CUT = '…';

// ── 운동 ────────────────────────────────────────────────────────────────
/** 두 사람이 드러난다. */
const REVEAL_MS = 220;
/** 그대로 해싱한 값에 칠이 든다. 옛 `fill` 전환과 같은 길이다. */
const INK_MS = 200;
/** 소금이 붙는다. 이 조각의 주인공이라 가장 길다. */
const SALT_MS = 260;
/** 값이 갈라져 나온다. */
const SPLIT_MS = 320;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;

/**
 * 두 칠을 섞는다. CSS `transition` 의 색 전환을 대신한다.
 *
 * `p` 가 1 이면 **목표 칠을 글자 그대로** 돌려준다 — 보간이 만든 `rgb(…)` 표기가
 * 끝자리에 남으면 흘려 세운 화면과 곧바로 세운 화면이 갈린다 (함정 6).
 */
function mixColor(from: string, to: string, p: number): string {
  if (p >= 1) return to;
  const a = parseHex(from);
  const b = parseHex(to);
  if (a === null || b === null) return to;
  const at = (i: number): number => Math.round(a[i] + (b[i] - a[i]) * p);
  return `rgb(${at(0)}, ${at(1)}, ${at(2)})`;
}

function parseHex(value: string): [number, number, number] | null {
  const raw = value.trim().replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (ch) => ch + ch) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 값 열 하나가 서 있는 화면 조각. 걸음이 흐르게 할 것을 여기서 찾는다. */
type Drawn = {
  rows: SVGGElement[];
  saltParts: SVGElement[];
  plainValues: SVGTextElement[];
  saltedValues: SVGTextElement[];
  verdictPlain: SVGTextElement | null;
  verdictSalted: SVGTextElement | null;
};

export const saltStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<HashSaltScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gHead = el('g');
    const gRow = el('g');
    const gVerdict = el('g');
    const gCaption = el('g');
    const layers = [gHead, gRow, gVerdict, gCaption];
    for (const layer of layers) svg.appendChild(layer);

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
     * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT). `resolve` 를 `waiters` 에
     * 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던 약속이 함께 풀린다 —
     * 콜백 안에만 두면 취소된 tick 이 아예 안 불려 약속이 영영 안 풀린다 (S-piece).
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

    // ── 글자 ─────────────────────────────────────────────────────────────

    function text(x: number, y: number, value: string, attrs: Attrs = {}): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'text-anchor': 'start',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        ...attrs,
      });
      node.textContent = value;
      return node;
    }

    /** 값의 앞머리만 인쇄한다. 뒤는 잘라 표식을 단다. */
    function head(value: string): string {
      return value.length > HEX_HEAD ? `${value.slice(0, HEX_HEAD)}${CUT}` : value;
    }

    /**
     * 한 값 열의 칠.
     *
     * 값들이 서로 같으면 위험이고, 갈렸으면 이 조각이 바라던 바다. **판정이 곧
     * 칠이라** 글자와 결론이 어긋날 자리가 없다.
     */
    function inkOf(values: readonly string[]): string {
      return allSame(values) ? c.danger : c.success;
    }

    /** 한 값 열 아래 서는 판정 글자. 칠과 같은 물음에 같은 자료로 답한다. */
    function verdictOf(values: readonly string[]): string {
      return allSame(values)
        ? t('label.identical', 'identical')
        : t('label.different', 'different');
    }

    function captionText(caption: HashSaltCaption): string {
      switch (caption.kind) {
        case 'same-password':
          return t('caption.samePassword', 'Both chose the same password.');
        case 'unsalted':
          return t(
            'caption.unsalted',
            'Hashed as they are, both rows store the same value — cracking one cracks the other.',
          );
        case 'salting':
          return t('caption.salting', 'Each account gets its own salt, put in front of the password.');
        case 'salted':
          return t('caption.salted', 'The same password now stores two unrelated values.');
      }
    }

    // ── 장면을 통째로 세운다 ───────────────────────────────────────────────
    //
    // `step` 을 읽지 않는다. 자취만 보고 세우므로 되짚어 세운 화면과 흘려 세운
    // 화면이 같다 (공통 지시문 8 절).

    function drawStatic(scene: HashSaltScene): Drawn {
      for (const layer of layers) layer.textContent = '';
      const drawn: Drawn = {
        rows: [],
        saltParts: [],
        plainValues: [],
        saltedValues: [],
        verdictPlain: null,
        verdictSalted: null,
      };

      if (scene.algorithmLabel !== '') {
        gHead.appendChild(
          text(NAME_X, STAMP_Y, scene.algorithmLabel, {
            fill: c.textMuted,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
          }),
        );
      }

      const caption = captionOf(scene);
      if (caption !== null) {
        gCaption.appendChild(
          text(W / 2, CAPTION_Y, captionText(caption), {
            'text-anchor': 'middle',
            fill: c.accent,
            'font-weight': '600',
          }),
        );
      }

      // 바탕이 아직 안 들어섰으면 표 자체가 없다.
      if (scene.users.length === 0) return drawn;

      gHead.appendChild(
        text(PW_X, HEADER_Y, t('label.password', 'password'), {
          fill: c.textMuted,
          'font-size': fontSizes.xs,
        }),
      );
      gHead.appendChild(
        text(STORED_MID, HEADER_Y, t('label.stored', 'what gets stored'), {
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-size': fontSizes.xs,
        }),
      );
      if (scene.salted) {
        const headerSalt = text(SALT_X, HEADER_Y, t('label.salt', 'salt'), {
          fill: c.textMuted,
          'font-size': fontSizes.xs,
        });
        gHead.appendChild(headerSalt);
        drawn.saltParts.push(headerSalt);
      }

      const plain = storedPlain(scene);
      const salted = storedSalted(scene);
      const plainInk = inkOf(plain);
      const saltedInk = inkOf(salted);

      if (scene.revealed) {
        scene.users.forEach((u, i) => {
          const y = ROW_Y0 + i * ROW_PITCH;
          const group = el('g');
          gRow.appendChild(group);
          drawn.rows.push(group);

          group.appendChild(
            text(NAME_X, y, u.name, { fill: c.textMuted }),
          );
          group.appendChild(text(PW_X, y, scene.password, { 'font-family': fonts.mono }));

          if (scene.salted) {
            const saltGroup = el('g');
            saltGroup.appendChild(
              el('rect', {
                x: SALT_X - 6,
                y: y - 14,
                width: 76,
                height: 20,
                rx: 3,
                fill: 'none',
                stroke: c.accent,
                'stroke-width': 1.2,
              }),
            );
            saltGroup.appendChild(
              text(SALT_X, y, u.salt, { 'font-family': fonts.mono, fill: c.accent }),
            );
            group.appendChild(saltGroup);
            drawn.saltParts.push(saltGroup);
          }

          if (scene.plain) {
            const value = text(PLAIN_X, y, head(plain[i] ?? ''), {
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: plainInk,
            });
            group.appendChild(value);
            drawn.plainValues.push(value);
          }

          if (scene.hashed) {
            const value = text(SALTED_X, y, head(salted[i] ?? ''), {
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: saltedInk,
            });
            group.appendChild(value);
            drawn.saltedValues.push(value);
          }
        });
      }

      if (scene.plain) {
        const node = text(PLAIN_X, VERDICT_Y, verdictOf(plain), {
          'font-family': fonts.mono,
          'font-weight': '600',
          fill: plainInk,
        });
        gVerdict.appendChild(node);
        drawn.verdictPlain = node;
      }
      if (scene.hashed) {
        const node = text(SALTED_X, VERDICT_Y, verdictOf(salted), {
          'font-family': fonts.mono,
          'font-weight': '600',
          fill: saltedInk,
        });
        gVerdict.appendChild(node);
        drawn.verdictSalted = node;
      }

      return drawn;
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리를 세워 두었으므로, 운동은 **아직 못 온 만큼을 뒤로
    // 물리는** 꼴이다. 한 걸음이 한 뜻이면 시계도 하나다.

    function fade(nodes: readonly SVGElement[], ms: number, mine: number): Promise<void> {
      if (nodes.length === 0) return Promise.resolve();
      for (const node of nodes) node.style.opacity = '0';
      return tween(ms, mine, (p) => {
        const e = easeOut(p);
        for (const node of nodes) {
          if (p >= 1) node.style.removeProperty('opacity');
          else node.style.opacity = String(e);
        }
      });
    }

    /** 두 사람이 드러난다. */
    function flowReveal(drawn: Drawn, mine: number): Promise<void> {
      return fade(drawn.rows, REVEAL_MS, mine);
    }

    /**
     * 그대로 해싱한 값에 칠이 든다.
     *
     * 옛 stage 의 `transition: fill 200ms` 가 하던 일이다 — 글자가 흐린 칠로 앉았다가
     * 제 칠로 물든다. 판정도 같은 시계에 실린다. 한 뜻이라 시계를 나누지 않는다.
     */
    function flowPlain(scene: HashSaltScene, drawn: Drawn, mine: number): Promise<void> {
      const to = inkOf(storedPlain(scene));
      const verdict = drawn.verdictPlain;
      for (const value of drawn.plainValues) value.setAttribute('fill', c.textMuted);
      if (verdict !== null) verdict.style.opacity = '0';
      if (drawn.plainValues.length === 0 && verdict === null) return Promise.resolve();
      return tween(INK_MS, mine, (p) => {
        const e = easeOut(p);
        const ink = mixColor(c.textMuted, to, p >= 1 ? 1 : e);
        for (const value of drawn.plainValues) value.setAttribute('fill', ink);
        if (verdict !== null) {
          if (p >= 1) verdict.style.removeProperty('opacity');
          else verdict.style.opacity = String(e);
        }
      });
    }

    /** 계정마다 제 소금을 받는다. 머리표와 소금 칸이 한 시계로 함께 든다. */
    function flowSalt(drawn: Drawn, mine: number): Promise<void> {
      return fade(drawn.saltParts, SALT_MS, mine);
    }

    /**
     * 같은 자리의 값이 갈라진다.
     *
     * 소금 친 값은 그대로 해싱한 값의 자리에서 출발해 제 열로 미끄러지며 칠이 바뀐다.
     * 출발 자리를 `prev` 에서 꺼내지 않는다 — 열의 좌표는 이 파일이 아는 상수다
     * (S-scene).
     */
    function flowSplit(scene: HashSaltScene, drawn: Drawn, mine: number): Promise<void> {
      const from = inkOf(storedPlain(scene));
      const to = inkOf(storedSalted(scene));
      const verdict = drawn.verdictSalted;
      for (const value of drawn.saltedValues) {
        value.setAttribute('x', String(PLAIN_X));
        value.setAttribute('fill', from);
        value.style.opacity = '0';
      }
      if (verdict !== null) verdict.style.opacity = '0';
      if (drawn.saltedValues.length === 0 && verdict === null) return Promise.resolve();
      return tween(SPLIT_MS, mine, (p) => {
        const e = easeOut(p);
        const ink = mixColor(from, to, p >= 1 ? 1 : e);
        for (const value of drawn.saltedValues) {
          value.setAttribute('x', p >= 1 ? String(SALTED_X) : String(PLAIN_X + (SALTED_X - PLAIN_X) * e));
          value.setAttribute('fill', ink);
          if (p >= 1) value.style.removeProperty('opacity');
          else value.style.opacity = String(e);
        }
        if (verdict !== null) {
          if (p >= 1) verdict.style.removeProperty('opacity');
          else verdict.style.opacity = String(e);
        }
      });
    }

    function flowFor(
      step: HashSaltStep,
      scene: HashSaltScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'reveal':
          return flowReveal(drawn, mine);
        case 'plain':
          return flowPlain(scene, drawn, mine);
        case 'salt':
          return flowSalt(drawn, mine);
        case 'split':
          return flowSplit(scene, drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: HashSaltScene,
      _prev: HashSaltScene | null,
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
