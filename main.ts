import fs from "node:fs";
import path from "node:path";

const IN_DIR = process.env.MAKEFUN_INPUT_DIR || "/input";
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || "/output";
function run(prog, inp) {
  const stack = [], calls = [], out = [];
  const mem = new Int32Array(256);
  let pc = 0, steps = 0, inPos = 0, code = 0, done = false;
  const fail = (c) => { code = c; done = true; };

  while (!done) {
    if (steps >= 1000000) { fail(10); break; }
    steps++;
    if (pc < 0 || pc >= prog.length) { fail(9); break; }
    const op = prog[pc];
    let imm = 0;
    if (op === 0x01) imm = 1;
    else if (op === 0x02) imm = 4;
    else if (op >= 0x30 && op <= 0x33) imm = 2;
    else if (!(op === 0x00 || (op >= 0x03 && op <= 0x07) ||
      (op >= 0x10 && op <= 0x1e) || (op >= 0x20 && op <= 0x22) ||
      op === 0x34 || op === 0x40 || op === 0x41 ||
      (op >= 0x50 && op <= 0x53))) { fail(5); break; }
    if (pc + 1 + imm > prog.length) { fail(9); break; }

    let need = 0, grows = false;
    if (op === 0x01 || op === 0x02 || op === 0x52) grows = true;
    else if (op === 0x03 || op === 0x50 || op === 0x51 || op === 0x53) need = 1;
    else if (op === 0x04) { need = 1; grows = true; }
    else if (op === 0x05 || op === 0x41) need = 2;
    else if (op === 0x06) { need = 2; grows = true; }
    else if (op === 0x07) need = 3;
    else if ((op >= 0x10 && op <= 0x1e) || (op >= 0x20 && op <= 0x22))
      need = (op === 0x17 || op === 0x1b) ? 1 : 2;
    else if (op === 0x31 || op === 0x32 || op === 0x40) need = 1;
    if (stack.length < need) { fail(2); break; }
    if (grows && stack.length >= 256) { fail(3); break; }

    const next = pc + 1 + imm;
    const immU = imm === 2 ? prog[pc + 1] | (prog[pc + 2] << 8) : 0;
    const immS = immU >= 32768 ? immU - 65536 : immU;

    if (op === 0x00) { code = 0; done = true; }
    else if (op === 0x01) {
      const v = prog[pc + 1];
      stack.push(v >= 128 ? v - 256 : v); pc = next;
    } else if (op === 0x02) {
      stack.push(prog[pc + 1] | (prog[pc + 2] << 8) |
        (prog[pc + 3] << 16) | (prog[pc + 4] << 24)); pc = next;
    } else if (op === 0x03) { stack.pop(); pc = next; }
    else if (op === 0x04) { stack.push(stack[stack.length - 1]); pc = next; }
    else if (op === 0x05) {
      const b = stack.pop(), a = stack.pop(); stack.push(b, a); pc = next;
    } else if (op === 0x06) { stack.push(stack[stack.length - 2]); pc = next; }
    else if (op === 0x07) {
      const c = stack.pop(), b = stack.pop(), a = stack.pop();
      stack.push(b, c, a); pc = next;
    } else if (op >= 0x10 && op <= 0x1e) {
      if (op === 0x17) { stack.push((-stack.pop()) | 0); pc = next; }
      else if (op === 0x1b) { stack.push(~stack.pop()); pc = next; }
      else {
        const b = stack.pop(), a = stack.pop();
        if (op >= 0x13 && op <= 0x16 && b === 0) { fail(4); break; }
        let r = 0;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) r = (a === -2147483648 && b === -1) ? a : Math.trunc(a / b) | 0;
        else if (op === 0x14) r = b === -1 ? 0 : (a % b) | 0;
        else if (op === 0x15) r = Number(BigInt(a >>> 0) / BigInt(b >>> 0)) | 0;
        else if (op === 0x16) r = Number(BigInt(a >>> 0) % BigInt(b >>> 0)) | 0;
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else r = (a >>> (b & 31)) | 0;
        stack.push(r); pc = next;
      }
    } else if (op >= 0x20 && op <= 0x22) {
      const b = stack.pop(), a = stack.pop();
      stack.push(op === 0x20 ? (a === b ? 1 : 0)
        : op === 0x21 ? (a < b ? 1 : 0) : ((a >>> 0) < (b >>> 0) ? 1 : 0));
      pc = next;
    } else if (op === 0x30) pc = next + immS;
    else if (op === 0x31) pc = stack.pop() === 0 ? next + immS : next;
    else if (op === 0x32) pc = stack.pop() !== 0 ? next + immS : next;
    else if (op === 0x33) {
      if (calls.length >= 64) { fail(7); break; }
      calls.push(next); pc = immU;
    } else if (op === 0x34) {
      if (!calls.length) { fail(8); break; }
      pc = calls.pop();
    } else if (op === 0x40) {
      const a = stack.pop();
      if (a < 0 || a > 255) { fail(6); break; }
      stack.push(mem[a]); pc = next;
    } else if (op === 0x41) {
      const a = stack.pop(), v = stack.pop();
      if (a < 0 || a > 255) { fail(6); break; }
      mem[a] = v; pc = next;
    } else if (op === 0x50 || op === 0x51) {
      const v = stack.pop();
      const bytes = op === 0x50 ? [...String(v)].map((ch) => ch.charCodeAt(0)) : [v & 255];
      if (out.length + bytes.length > 65536) { fail(11); break; }
      out.push(...bytes); pc = next;
    } else if (op === 0x52) {
      stack.push(inPos < inp.length ? inp[inPos++] : -1); pc = next;
    } else if (op === 0x53) { code = stack.pop() & 255; done = true; }
  }
  return [Buffer.from(out), code];
}

for (const id of fs.readdirSync(IN_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
  const [out, code] = run(
    fs.readFileSync(path.join(IN_DIR, id, "program.bin")),
    fs.readFileSync(path.join(IN_DIR, id, "input.bin")));
  const dir = path.join(OUT_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "stdout.bin"), out);
  fs.writeFileSync(path.join(dir, "exit.txt"), code + "\n");
}
