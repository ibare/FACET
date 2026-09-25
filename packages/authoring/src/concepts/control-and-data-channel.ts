/**
 * controlAndDataChannel 개념 선언.
 *
 * canonical facet 은 `facet:controlAndDataChannel` — FTP 클라이언트와 `ftp.example.com` 사이에 명령 길(포트 21)이
 * 처음부터 `QUIT` 까지 열려 있고, `PASV` 마다 짐 길이 새로 열려(포트 = p1 × 256 + p2) 목록이나 파일이 흐른 뒤 닫힌다.
 * 로그인 뒤 일곱 걸음, 명령 길 12 줄 · 짐 길 둘. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * ftp 토픽은 카탈로그 정리에서 버렸고, 이 조각은 연결 하나마다 치르는 값을 말하는 `tcpHandshake` 묶음에 들었다.
 * 완제품은 전송 방식의 값을 견주고, 이쪽은 **FTP 가 연결을 둘로 나누는 까닭과 짐 길 포트를 읽는 법** 만 쥔다. 그래서
 * definition 은 FTP · control connection · data connection · PASV · 포트 셈을 독점하고, 잃음 · 차례 · UDP 는 쓰지 않는다.
 *
 * 전제 (설명 글 `controlAndDataChannel.md`): 서버 이름 · 주소 · 파일 이름과 크기 · 짐 길 포트는 예로 정한 값.
 * 로그인(`USER` · `PASS`)은 끝난 뒤부터, `TYPE` 은 뺐다. 수동 모드만(능동 모드 없음). 짐 길 하나에 짐 명령 하나.
 * 메시지는 보낸 순간 닿고 지연 · 잃음 없음. 목록의 바이트 수는 세지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const controlAndDataChannelConcept: FacetConceptSource = {
  id: 'controlAndDataChannel',
  label: 'FTP Control and Data Connections',
  canonicalFacet: 'facet:controlAndDataChannel',

  surface: {
    definition:
      'FTP keeps one control connection on port 21 open for commands and replies all session, and opens a separate data connection, at a port computed from the PASV reply, for each listing or file.',
    exemplarKeywords: [
      'FTP',
      'File Transfer Protocol',
      'control connection',
      'data connection',
      'port 21',
      'passive mode',
      'PASV',
      '227 Entering Passive Mode',
      'p1 * 256 + p2',
      'why does FTP use two connections',
      'out-of-band control channel',
      'LIST and RETR',
    ],
  },

  briefing: {
    observable: [
      'The Client and the Server (`ftp.example.com`, `203.0.113.21`) stand at either end. The top path is the "Command path", open from the first caption "Logged in. Command port: 21" and counting "Lines" as commands and replies cross it.',
      'The client sends `PASV`; the reply `227 Entering Passive Mode (203,0,113,21,195,80)` comes back and the caption works the port: "a new data path opens. Port: 195 × 256 + 80 = 50000". A "Data path" grows out from the server side below the command path.',
      '`LIST` gets `150`, and the three names — report.pdf, notes.txt, logo.png — flow from server to client on the data path ("Names: 3"). That path closes, leaving only a trace, and `226 Transfer complete` arrives on the command path.',
      'A second `PASV` opens another data path at port 50001. `RETR report.pdf` sends 184320 bytes along it ("Bytes: 184320"), and it closes in turn. Each data path is marked open or closed.',
      '`QUIT` gets `221` and the command path finally closes: "Lines it carried: 12". Over seven steps there was one command path and two data paths, each used once, and none of the file\'s bytes travelled on the command path.',
      'The server name, address, file names and sizes and the data ports are fixed example values. The run starts after login, leaves out the `TYPE` command, uses passive mode only, and gives each data path exactly one transfer. Messages arrive instantly with no loss, and the bytes of the listing are not counted. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays the seven steps by itself and stops when the command path closes.',
        'A Replay button and a playback strip sit below it. The moment worth dragging back to is the first `PASV` reply, where the six numbers in the brackets turn into port 50000 on the caption.',
        'Every command, reply and number is fixed, so the exchange can be quoted line by line.',
      ],
    },

    useWhen: [
      'The article explains why FTP uses two kinds of connection: a long-lived one for commands and a short-lived one per transfer.',
      'The reader needs to decode a `227` passive-mode reply and see how the last two numbers become a port.',
    ],

    avoidWhen: [
      'The subject is active-mode FTP with the `PORT` command, where the server connects back to the client. Only passive mode appears.',
      'The article is about SFTP, FTPS or encrypting file transfers. Everything here travels in the clear.',
      'The subject is how FTP data ports interact with firewalls or NAT. No middlebox is on the path.',
    ],

    contrastWith: [
      {
        concept: 'tcpHandshake',
        note: 'Every new data connection is a new transport connection with its own setup. Keeping control apart buys a persistent command channel at the price of paying that setup once per file.',
      },
      {
        concept: 'upgradeThenKeepOpen',
        note: 'Both keep a long-lived connection, for different jobs. A WebSocket turns one connection into a two-way message channel; FTP keeps a command channel and moves every payload over a separate short-lived one.',
      },
      {
        concept: 'portDemultiplex',
        note: 'Demultiplexing picks an application from a port it already listens on. Here the server announces a fresh port inside a reply so the client can open a second connection to the same service.',
      },
    ],
  },
};
