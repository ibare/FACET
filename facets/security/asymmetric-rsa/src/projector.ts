/**
 * RSA facet projector — algorithm 이벤트를 rsa-stage view 메서드로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 두 소수에서의 출생 시퀀스 — p, q → n → 자물쇠/열쇠 한 짝.
 *   2. 공개 마당 / 비밀 방 — Bob 영역의 두 층 색·배경 분리.
 *   3. 두 키의 형태 비대칭 — 자물쇠는 ㄷ 자 빗장, 열쇠는 톱니 막대.
 *   4. 잠금/풀림 한 프레임 사건성 — 채널 양 끝의 두 키 스냅샷.
 *   5. 인수분해 어려움 — n→(p,q) 막힌 점선 화살표 + 빨간 격벽.
 *   6. 거꾸로 시도 거부 — 같은 자물쇠로 풀려는 시도에 대한 빨간 흔들림.
 *
 * projector 는 init / 시퀀스 사건들 / 상태 변경 사건만 stage 메서드로 번역한다.
 */

import type { ProjectorFactory } from '@facet/core/runtime';

type RsaStage = {
  reset(): void;
  init(payload: {
    p: number;
    q: number;
    n: number;
    e: number;
    d: number;
    m: number;
    c: number;
    primes: number[];
    reverseAttempt: boolean;
  }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  signalPrimeSeat(id: 'p' | 'q', value: number): Promise<void>;
  signalProductForm(p: number, q: number, n: number): Promise<void>;
  signalKeypairBirth(n: number, e: number, d: number): Promise<void>;
  signalKeypairDistribute(): Promise<void>;
  signalFactoringBlock(): Promise<void>;
  signalEnvelopeFill(m: number): Promise<void>;
  signalLockEngage(): Promise<void>;
  signalChannelCross(c: number): Promise<void>;
  signalReverseAttempt(): Promise<void>;
  signalUnlock(): Promise<void>;
  signalDecrypted(m: number): Promise<void>;
  signalDone(): void;
  applyPrimeSet(payload: {
    which: 'p' | 'q';
    p: number;
    q: number;
    n: number;
    e: number;
    d: number;
    m: number;
    c: number;
  }): void;
  applyPlaintextSet(payload: { m: number; c: number }): void;
  applyReverseToggled(on: boolean): void;
  signalInvalid(op: string, raw: string): void;
};

const BASE_CAPTION =
  'RSA 는 두 큰 소수에서 태어난 한 짝의 키로 메시지를 잠그고 푼다. 누구나 가진 공개 자물쇠로는 잠그기만 할 수 있고, 주인만 가진 비밀 열쇠로만 풀 수 있다.';

export const asymmetricRsaProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as RsaStage | undefined;

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },

    async onEvent(event) {
      if (!stage) return;

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as Partial<{
            p: number;
            q: number;
            n: number;
            e: number;
            d: number;
            m: number;
            c: number;
            primes: number[];
            reverseAttempt: boolean;
          }>;
          stage.init({
            p: typeof p.p === 'number' ? p.p : 0,
            q: typeof p.q === 'number' ? p.q : 0,
            n: typeof p.n === 'number' ? p.n : 0,
            e: typeof p.e === 'number' ? p.e : 0,
            d: typeof p.d === 'number' ? p.d : 0,
            m: typeof p.m === 'number' ? p.m : 0,
            c: typeof p.c === 'number' ? p.c : 0,
            primes: Array.isArray(p.primes) ? p.primes : [],
            reverseAttempt: p.reverseAttempt === true,
          });
          break;
        }

        case 'prime-seat': {
          const p = (event.payload ?? {}) as Partial<{ id: 'p' | 'q'; value: number }>;
          await stage.signalPrimeSeat(p.id === 'q' ? 'q' : 'p', typeof p.value === 'number' ? p.value : 0);
          break;
        }

        case 'product-form': {
          const p = (event.payload ?? {}) as Partial<{ p: number; q: number; n: number }>;
          await stage.signalProductForm(
            typeof p.p === 'number' ? p.p : 0,
            typeof p.q === 'number' ? p.q : 0,
            typeof p.n === 'number' ? p.n : 0,
          );
          break;
        }

        case 'keypair-birth': {
          const p = (event.payload ?? {}) as Partial<{ n: number; e: number; d: number }>;
          await stage.signalKeypairBirth(
            typeof p.n === 'number' ? p.n : 0,
            typeof p.e === 'number' ? p.e : 0,
            typeof p.d === 'number' ? p.d : 0,
          );
          break;
        }

        case 'keypair-distribute': {
          await stage.signalKeypairDistribute();
          break;
        }

        case 'factoring-block': {
          await stage.signalFactoringBlock();
          break;
        }

        case 'envelope-fill': {
          const p = (event.payload ?? {}) as Partial<{ m: number }>;
          await stage.signalEnvelopeFill(typeof p.m === 'number' ? p.m : 0);
          break;
        }

        case 'lock-engage': {
          await stage.signalLockEngage();
          break;
        }

        case 'channel-cross': {
          const p = (event.payload ?? {}) as Partial<{ c: number }>;
          await stage.signalChannelCross(typeof p.c === 'number' ? p.c : 0);
          break;
        }

        case 'reverse-attempt': {
          await stage.signalReverseAttempt();
          break;
        }

        case 'unlock': {
          await stage.signalUnlock();
          break;
        }

        case 'decrypted': {
          const p = (event.payload ?? {}) as Partial<{ m: number }>;
          await stage.signalDecrypted(typeof p.m === 'number' ? p.m : 0);
          break;
        }

        case 'done': {
          stage.signalDone();
          break;
        }

        case 'prime-set': {
          const p = (event.payload ?? {}) as Partial<{
            which: 'p' | 'q';
            p: number;
            q: number;
            n: number;
            e: number;
            d: number;
            m: number;
            c: number;
          }>;
          stage.applyPrimeSet({
            which: p.which === 'q' ? 'q' : 'p',
            p: typeof p.p === 'number' ? p.p : 0,
            q: typeof p.q === 'number' ? p.q : 0,
            n: typeof p.n === 'number' ? p.n : 0,
            e: typeof p.e === 'number' ? p.e : 0,
            d: typeof p.d === 'number' ? p.d : 0,
            m: typeof p.m === 'number' ? p.m : 0,
            c: typeof p.c === 'number' ? p.c : 0,
          });
          break;
        }

        case 'plaintext-set': {
          const p = (event.payload ?? {}) as Partial<{ m: number; c: number }>;
          stage.applyPlaintextSet({
            m: typeof p.m === 'number' ? p.m : 0,
            c: typeof p.c === 'number' ? p.c : 0,
          });
          break;
        }

        case 'reverse-toggled': {
          const p = (event.payload ?? {}) as Partial<{ on: boolean }>;
          stage.applyReverseToggled(p.on === true);
          break;
        }

        case 'invalid-input': {
          const p = (event.payload ?? {}) as { op?: string; raw?: string };
          stage.signalInvalid(String(p.op ?? ''), String(p.raw ?? ''));
          break;
        }

        default:
          // phase 등 silent 메타 — 의도적 drop.
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },
  };
};
