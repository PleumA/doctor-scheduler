const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

let total = 0;
let passed = 0;
async function runTest(name, fn) {
    total++;
    try {
        await fn();
        console.log(`✅ [PASSED] ${name}`);
        passed++;
    } catch (err) {
        console.error(`❌ [FAILED] ${name}`);
        console.error(err.message);
    }
}

const ORIGIN = 'https://app.test';
const CURRENT_CACHE = fs.readFileSync('sw.js', 'utf8').match(/CACHE_NAME = '([^']+)'/)[1];
const abs = (u) => new URL(u, `${ORIGIN}/`).href;

function loadSW({ online = true, oldCaches = [], failAdd = [], seed = {}, failPut = false } = {}) {
    const listeners = {};
    const store = new Map(Object.entries(seed).map(([u, r]) => [abs(u), r]));
    const cache = {
        add: async (u) => {
            if (failAdd.some((f) => u.includes(f))) throw new Error('net');
            store.set(abs(u), { from: 'precache' });
        },
        put: async (req, res) => {
            if (failPut) throw new Error('206');
            store.set(req.url, res);
        },
    };
    const ctx = {
        skipped: false,
        claimed: false,
        deleted: [],
        fetched: [],
        fetchOpts: [],
        self: {
            addEventListener: (type, fn) => (listeners[type] = fn),
            skipWaiting: () => (ctx.skipped = true),
            clients: { claim: async () => (ctx.claimed = true) },
            location: { origin: ORIGIN },
        },
        caches: {
            open: async () => cache,
            keys: async () => [CURRENT_CACHE, ...oldCaches],
            delete: async (k) => ctx.deleted.push(k),
            match: async (r) => store.get(typeof r === 'string' ? abs(r) : r.url),
        },
        fetch: async (req, opts) => {
            ctx.fetched.push(req.url);
            ctx.fetchOpts.push(opts);
            if (!online) throw new Error('offline');
            return {
                ok: true,
                from: 'network',
                clone() {
                    return this;
                },
            };
        },
        Response: { error: () => ({ from: 'error' }) },
        URL,
        Promise,
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('sw.js', 'utf8'), ctx);
    const fire = async (type, extra = {}) => {
        let pending;
        const event = {
            ...extra,
            waits: [],
            waitUntil: (p) => {
                event.waits.push(p);
                if (type !== 'fetch') pending = p;
            },
            respondWith: (p) => (pending = p),
        };
        listeners[type](event);
        const out = pending && (await pending);
        await Promise.all(event.waits); // background work from waitUntil
        return out;
    };
    return { ctx, store, fire };
}

const get = (url, mode = 'no-cors') => ({ request: { url, method: 'GET', mode } });

(async () => {
    await runTest('install takes over at once and survives one failed CDN download', async () => {
        const { ctx, store, fire } = loadSW({ failAdd: ['xlsx'] });
        await fire('install');
        assert.strictEqual(ctx.skipped, true, 'skipWaiting not called');
        const listed = vm.runInContext('ASSETS_TO_CACHE.length', ctx);
        assert.strictEqual(store.size, listed - 1, 'the other assets should still be cached');
    });

    await runTest('activate deletes old caches and claims clients', async () => {
        const { ctx, fire } = loadSW({ oldCaches: ['doctor-scheduler-v3'] });
        await fire('activate');
        assert.deepStrictEqual(ctx.deleted, ['doctor-scheduler-v3']);
        assert.strictEqual(ctx.claimed, true, 'clients.claim not called');
    });

    await runTest('activate keeps caches that belong to other apps', async () => {
        const { ctx, fire } = loadSW({ oldCaches: ['doctor-scheduler-v3', 'other-app-v1'] });
        await fire('activate');
        assert.deepStrictEqual(ctx.deleted, ['doctor-scheduler-v3']);
    });

    await runTest('non-http(s) schemes are not intercepted', async () => {
        const { ctx, fire } = loadSW();
        const res = await fire('fetch', get('chrome-extension://abc/x.js'));
        assert.strictEqual(res, undefined);
        assert.strictEqual(ctx.fetched.length, 0);
    });

    await runTest('own files bypass the HTTP cache', async () => {
        const { ctx, fire } = loadSW();
        await fire('fetch', get(`${ORIGIN}/app.js`));
        assert.strictEqual(ctx.fetchOpts[0].cache, 'no-cache'); // plain compare: the object comes from the vm realm
    });

    await runTest('a failing background cache.put is waited on and swallowed', async () => {
        const { fire } = loadSW({ failPut: true });
        const res = await fire('fetch', get(`${ORIGIN}/app.js`));
        assert.strictEqual(res.from, 'network'); // fire() awaits waitUntil; a rejection would throw
    });

    await runTest('own files are network-first and refresh the cache', async () => {
        const { store, fire } = loadSW({ seed: { '/app.js': { from: 'stale' } } });
        const res = await fire('fetch', get(`${ORIGIN}/app.js`));
        assert.strictEqual(res.from, 'network');
        assert.strictEqual(store.get(`${ORIGIN}/app.js`).from, 'network');
    });

    await runTest('own files fall back to the cache offline', async () => {
        const { fire } = loadSW({ online: false, seed: { '/app.js': { from: 'cache' } } });
        assert.strictEqual((await fire('fetch', get(`${ORIGIN}/app.js`))).from, 'cache');
    });

    await runTest('CDN files are cache-first', async () => {
        const url = 'https://cdnjs.cloudflare.com/x.js';
        const { ctx, fire } = loadSW({ seed: { [url]: { from: 'cache' } } });
        assert.strictEqual((await fire('fetch', get(url))).from, 'cache');
        assert.strictEqual(ctx.fetched.length, 0);
    });

    await runTest('an offline navigation to an uncached page serves index.html', async () => {
        const { fire } = loadSW({ online: false, seed: { './index.html': { from: 'shell' } } });
        const res = await fire('fetch', get(`${ORIGIN}/anything`, 'navigate'));
        assert.strictEqual(res.from, 'shell');
    });

    await runTest('non-GET requests are left alone', async () => {
        const { fire } = loadSW();
        const res = await fire('fetch', {
            request: { url: `${ORIGIN}/x`, method: 'POST', mode: 'cors' },
        });
        assert.strictEqual(res, undefined);
    });

    await runTest('lucide is pinned to the same exact version in index.html and sw.js', () => {
        const pick = (f) => fs.readFileSync(f, 'utf8').match(/lucide@([^"'\s]+)/)[1];
        const html = pick('index.html');
        assert.ok(/^\d+\.\d+\.\d+$/.test(html), `index.html loads lucide@${html}`);
        assert.strictEqual(pick('sw.js'), html);
    });

    console.log(`\nserviceWorker: PASSED: ${passed}/${total}, FAILED: ${total - passed}`);
    process.exit(passed === total ? 0 : 1);
})();
