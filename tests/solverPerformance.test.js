// Solver performance: 90-day range, 10 doctors, 3 slots.
// Guards the sort comparator's availability lookup: it must not rescan every remaining day
// for every comparison. The quota case is the one that exercises the density branch.
const assert = require('assert');
const { loadApp, reset, settle, setInput, runner } = require('./domHarness');

const DOCS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const SLOTS = 3;

async function generate90Days(w, quotaInput) {
    reset(w, DOCS);
    setInput(w, 'chkCustomDateRange', true);
    setInput(w, 'inputStartDate', '2026-01-01');
    setInput(w, 'inputEndDate', '2026-03-31'); // 90 days
    setInput(w, 'inputDefaultSlots', String(SLOTS));
    setInput(w, 'inputOffDutyPeriod', '0');
    if (quotaInput) setInput(w, 'inputSinglePoolQuota', quotaInput);
    w.eval('isCustomDateRange = true');
    w.toasts.length = 0;

    const started = Date.now();
    await w.generateSchedule();
    await settle(w);
    return { elapsed: Date.now() - started, result: w.eval('globalResult') };
}

function assertValidSchedule(result) {
    assert.ok(result, 'no schedule generated');
    assert.strictEqual(result.schedule.length, 90, 'schedule must cover 90 days');
    result.schedule.forEach((row) => {
        assert.strictEqual(row.selectedDocs.length, SLOTS, `day ${row.day} has wrong slot count`);
        row.selectedDocs.forEach((slot) => {
            assert.ok(
                DOCS.includes(slot.name),
                `day ${row.day} has an invalid doctor "${slot.name}"`
            );
        });
    });
    const totals = result.summary.map((s) => s.total);
    assert.ok(
        Math.max(...totals) - Math.min(...totals) <= 2,
        `totals not balanced: ${JSON.stringify(totals)}`
    );
}

(async () => {
    const w = await loadApp();
    const r = runner('solverPerformance');
    let noQuotaElapsed = null;

    await r.test('90 days, 10 doctors, 3 slots, no quotas produces a valid schedule', async () => {
        const { elapsed, result } = await generate90Days(w, '');
        assertValidSchedule(result);
        noQuotaElapsed = elapsed;
        console.log(`    no-quota run (advisory): ${elapsed} ms`);
    });

    // The availability density branch only runs under quotas; this is the case the
    // precomputation actually speeds up. Timing is checked against the no-quota baseline
    // instead of an absolute wall-clock budget, so the guard does not depend on machine speed.
    await r.test(
        '90 days, 10 doctors, 3 slots, even quotas stays near the baseline cost',
        async () => {
            const quota = DOCS.map((d) => `${d}:27`).join(', '); // 270 slots / 10 doctors
            const { elapsed, result } = await generate90Days(w, quota);
            assertValidSchedule(result);
            // JSON round trip: summary comes from the jsdom realm, whose Array prototype differs here
            assert.strictEqual(
                JSON.stringify(result.summary.map((s) => s.total)),
                JSON.stringify(DOCS.map(() => 27)),
                'hard quota must be met exactly'
            );
            console.log(
                `    no-quota run: ${noQuotaElapsed} ms, quota run: ${elapsed} ms ` +
                    `(${(elapsed / noQuotaElapsed).toFixed(2)}x, budget ${(
                        noQuotaElapsed * 1.8 +
                        2000
                    ).toFixed(0)} ms)`
            );
            assert.ok(
                elapsed <= noQuotaElapsed * 1.8 + 2000,
                `quota run ${elapsed} ms exceeded 1.8x + 2000 ms over the ${noQuotaElapsed} ms baseline`
            );
        }
    );

    r.done();
})();
