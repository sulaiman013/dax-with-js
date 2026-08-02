'use strict';
/* Minimal WebSocket client so this file needs no npm install. */
function makeSock() {
  const crypto = require('crypto');
  const net = require('net');
  const { EventEmitter } = require('events');
  class Sock extends EventEmitter {
    constructor(url) {
      super();
      const u = new URL(url);
      this.buf = Buffer.alloc(0);
      this.sock = net.connect(Number(u.port), u.hostname, () => {
        const key = crypto.randomBytes(16).toString('base64');
        this.sock.write(
          `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
          `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      });
      this.handshook = false;
      this.sock.on('data', d => this.onData(d));
      this.sock.on('error', e => this.emit('error', e));
    }
    onData(d) {
      this.buf = Buffer.concat([this.buf, d]);
      if (!this.handshook) {
        const i = this.buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        this.buf = this.buf.slice(i + 4);
        this.handshook = true;
        this.emit('open');
      }
      for (;;) {
        if (this.buf.length < 2) return;
        const b1 = this.buf[1], masked = (b1 & 0x80) !== 0;
        let len = b1 & 0x7f, off = 2;
        if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
        if (masked) off += 4;
        if (this.buf.length < off + len) return;
        const payload = this.buf.slice(off, off + len);
        this.buf = this.buf.slice(off + len);
        this.emit('message', payload);
      }
    }
    send(str) {
      const p = Buffer.from(str), mask = crypto.randomBytes(4);
      let head;
      if (p.length < 126) head = Buffer.from([0x81, 0x80 | p.length]);
      else if (p.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xfe; head.writeUInt16BE(p.length, 2); }
      else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xff; head.writeBigUInt64BE(BigInt(p.length), 2); }
      const masked = Buffer.alloc(p.length);
      for (let i = 0; i < p.length; i++) masked[i] = p[i] ^ mask[i & 3];
      this.sock.write(Buffer.concat([head, mask, masked]));
    }
    close() { try { this.sock.destroy(); } catch (e) {} }
  }
  return Sock;
}
module.exports = makeSock();

