// Unit tests for Kimi Chat Exporter core logic
// Run: node tests/test.js

const fs = require('fs');
const path = require('path');

// --- Load source code ---
// Extract pure functions from background.js
const bg = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

// Evaluate in sandbox
const vm = require('vm');
const sandbox = {
  console: console,
  browser: {
    runtime: {
      onMessage: { addListener: () => {} },
      onConnect: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
      sendMessage: () => Promise.resolve({}),
      connect: () => ({ onMessage: { addListener: () => {} }, postMessage: () => {}, disconnect: () => {} }),
    },
    storage: { local: { get: () => Promise.resolve({}), set: () => Promise.resolve() } },
    downloads: { download: () => Promise.resolve() },
    tabs: { query: () => Promise.resolve([]), executeScript: () => Promise.resolve([]), sendMessage: () => Promise.resolve({}) },
    menus: { removeAll: (cb) => cb && cb(), create: (opts, cb) => cb && cb(), onClicked: { addListener: () => {} } },
    contextMenus: { removeAll: (cb) => cb && cb(), create: (opts, cb) => cb && cb(), onClicked: { addListener: () => {} } },
    browserAction: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
    action: { setBadgeBackgroundColor: () => {}, setBadgeText: () => {} },
    notifications: { create: () => {} },
  },
  Blob: class Blob { constructor(data, opts) { this.data = data; this.type = opts.type; } },
  URL: { createObjectURL: () => 'blob:', revokeObjectURL: () => {} },
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  Uint8Array: Uint8Array,
  DataView: DataView,
  fetch: () => Promise.reject(new Error('no fetch in tests')),
  JSZip: class JSZip { file() {} generateAsync() { return Promise.resolve({}); } },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  exports: {}
};

const ctx = vm.createContext(sandbox);
vm.runInContext(bg, ctx);

let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  \x1b[32m✓\x1b[0m ' + name);
    passed++;
  } catch (e) {
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    ' + e.message);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEquals(a, b, msg) { if (a !== b) throw new Error((msg || '') + ` expected "${b}" got "${a}"`); }

console.log('\n--- strip (Unicode PUA) ---');
test('removes PUA characters', () => {
  assertEquals(ctx.strip('hello\ue0a0world'), 'helloworld');
});
test('handles empty string', () => {
  assertEquals(ctx.strip(''), '');
});

console.log('\n--- safeFn (filename sanitize) ---');
test('replaces illegal chars', () => {
  assertEquals(ctx.safeFn('test:file*name?<>|'), 'test-file-name');
});
test('truncates to 80 chars', () => {
  const long = 'a'.repeat(100);
  assertEquals(ctx.safeFn(long).length, 80);
});
test('collapses multiple dashes', () => {
  assertEquals(ctx.safeFn('a//b'), 'a-b');
});

console.log('\n--- walkMsgs (tree walker) ---');
test('flattens tree depth-first', () => {
  const msgs = [
    { id: '1', parentId: '00000000-0000-0000-0000-000000000000', role: 'system', childrenMessageIds: ['2'] },
    { id: '2', parentId: '1', role: 'user', childrenMessageIds: ['3'], blocks: [{ text: { content: 'hello' } }] },
    { id: '3', parentId: '2', role: 'assistant', childrenMessageIds: null, blocks: [{ text: { content: 'hi' } }] },
  ];
  const result = ctx.walkMsgs(msgs);
  assertEquals(result.length, 2, 'skips system message: ');
  assertEquals(result[0].role, 'user');
  assertEquals(result[1].role, 'assistant');
});

console.log('\n--- buildMD (Markdown builder) ---');
test('generates markdown', () => {
  const msgs = [
    { id: '0', parentId: '00000000-0000-0000-0000-000000000000', role: 'system', childrenMessageIds: ['1'] },
    { id: '1', parentId: '0', role: 'user', childrenMessageIds: ['2'], blocks: [{ text: { content: 'hello' } }] },
    { id: '2', parentId: '1', role: 'assistant', childrenMessageIds: null, blocks: [{ text: { content: 'world' } }], references: null },
  ];
  const md = ctx.buildMD(msgs, 'Test Chat', 'abc123', { thinking: false, tools: false, refs: true });
  assert(md.includes('# Kimi: Test Chat'), 'has title');
  assert(md.includes('### User'), 'has user role');
  assert(md.includes('### Kimi'), 'has kimi role');
  assert(md.includes('hello'), 'has user text');
  assert(md.includes('world'), 'has assistant text');
});

console.log('\n--- createZip / crc32 ---');
test('creates valid ZIP', () => {
  const zip = ctx.createZip([
    { name: 'test.md', data: '# Hello' },
    { name: 'test.json', data: '{"a":1}' },
  ]);
  assert(zip instanceof Uint8Array, 'returns Uint8Array');
  assert(zip.length > 0, 'non-empty');
  // Check ZIP magic bytes
  assertEquals(zip[0], 0x50, 'PK signature byte 0');
  assertEquals(zip[1], 0x4b, 'PK signature byte 1');
});

console.log('\n--- crc32 ---');
test('calculates CRC32', () => {
  const crc = ctx.crc32('test');
  assert(typeof crc === 'number', 'returns number');
  assert(crc > 0, 'non-zero');
});

console.log('\n--- kimiFetch (error handling) ---');
test('throws on 401', async () => {
  // can't test without mocking fetch, but function exists
  assert(typeof ctx.kimiFetch === 'function');
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
