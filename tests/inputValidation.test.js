// Invalid counts and impossible dates must not crash or roll over silently.
const assert = require('assert');
const { loadApp, reset, settle, setInput, snap } = require('./domHarness');

let total = 0;
let passed = 0;
async function test(name, fn) {
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

(async () => {
    const w = await loadApp();

    await test('expandSlots rejects negative and non-finite counts', () => {
        assert.strictEqual(w.eval('expandSlots({Default: -1}).length'), 0);
        assert.strictEqual(w.eval('expandSlots({Default: NaN}).length'), 0);
        assert.strictEqual(w.eval('expandSlots({Default: Infinity}).length'), 0);
        assert.deepStrictEqual(snap(w, 'expandSlots({R1:2})'), ['R1', 'R1']);
    });

    await test('default slots -1, NaN and 0 do not throw and clamp', async () => {
        for (const value of ['-1', 'NaN', '0']) {
            reset(w, ['A', 'B', 'C', 'D']);
            setInput(w, 'inputDefaultSlots', value);
            w.toasts.length = 0;
            await w.generateSchedule();
            await settle(w);
            assert.ok(snap(w, 'globalResult'), `no schedule for ${value}`);
            assert.ok(!w.toasts.some((t) => /RangeError/.test(t.msg)), `RangeError for ${value}`);
        }
    });

    await test('negative shift slots do not throw', async () => {
        reset(w, ['A', 'B', 'C', 'D']);
        setInput(w, 'chkShiftBased', true);
        setInput(w, 'inputMorningSlots', '-2');
        setInput(w, 'inputAfternoonSlots', '0');
        setInput(w, 'inputNightSlots', '1');
        w.toasts.length = 0;
        await w.generateSchedule();
        await settle(w);
        assert.ok(snap(w, 'globalResult'), 'no schedule');
    });

    await test('impossible 31/02 and 31/04 off-request dates are rejected', async () => {
        for (const bad of ['31/02/2026', '31/04/2026']) {
            reset(w, ['A', 'B']);
            w.eval(`isCustomDateRange = true; offData = [{id: 1, date: '${bad}', names: 'A'}];`);
            setInput(w, 'inputStartDate', '2026-01-01');
            setInput(w, 'inputEndDate', '2026-01-31');
            w.toasts.length = 0;
            await w.generateSchedule();
            await settle(w);
            assert.ok(
                w.toasts.some((t) => /ไม่ถูกต้อง|Invalid date format/.test(t.msg)),
                `no rejection toast for ${bad}: ${JSON.stringify(w.toasts)}`
            );
        }
    });

    await test('custom start after end is rejected', async () => {
        reset(w, ['A', 'B']);
        w.eval(`isCustomDateRange = true;`);
        setInput(w, 'inputStartDate', '2026-02-10');
        setInput(w, 'inputEndDate', '2026-02-01');
        w.toasts.length = 0;
        await w.generateSchedule();
        await settle(w);
        assert.ok(
            w.toasts.some((t) => t.isError),
            JSON.stringify(w.toasts)
        );
    });

    await test('duplicate doctor names are ignored', async () => {
        reset(w, ['A', 'B']);
        w.addDoctor('A');
        assert.strictEqual(w.eval('doctors.length'), 2);
        assert.ok(w.toasts.some((t) => t.isError));
    });

    console.log(`\ninputValidation: PASSED: ${passed}/${total}, FAILED: ${total - passed}`);
    process.exit(passed === total ? 0 : 1);
})();
