const assert = require('assert');
const {
    loadApp,
    reset: baseReset,
    settle,
    setInput,
    snap,
    importJSON,
    runner,
    validIdx,
} = require('./domHarness');
// No rest window: these tests make arbitrary edits, which the override validator would reject inside one
const reset = (w, docs) => {
    baseReset(w, docs);
    setInput(w, 'inputOffDutyPeriod', '0');
};

(async () => {
    const w = await loadApp();
    const d = w.document;
    const { test, done } = runner('editingState');
    const cleared = () => w.eval('translations.en.overridesCleared');

    await test('C1: undo reverts the schedule, summary and fairness row', async () => {
        reset(w);
        await w.generateSchedule();
        const cell = () => w.eval('globalResult.schedule[4].selectedDocs[0].name');
        const strip = () => d.getElementById('fairnessStrip').textContent;
        const total = () => w.eval('globalResult.summary.reduce((a, s) => a + s.total, 0)');
        const before = { cell: cell(), strip: strip(), total: total() };
        w.updateDoctorAssignment(5, 0, validIdx(w, 5, 0, before.cell === 'A' ? 1 : 0));
        assert.notStrictEqual(cell(), before.cell, 'edit did not apply');
        w.undoLastAction();
        assert.strictEqual(cell(), before.cell);
        assert.strictEqual(strip(), before.strip);
        assert.strictEqual(total(), before.total);
        assert.strictEqual(
            d.querySelector('#btn-day-5-slot-0 span.truncate').textContent,
            before.cell
        );
    });

    await test('I1: manual edits are cleared, with a toast, when the month changes', async () => {
        reset(w);
        await w.generateSchedule();
        w.updateDoctorAssignment(5, 1, validIdx(w, 5, 1, 0));
        assert.ok(w.eval('undoStack.length') > 0);
        setInput(w, 'inputMonth', '2');
        w.toasts.length = 0;
        await w.generateSchedule();
        assert.deepStrictEqual(snap(w, 'manualOverrides'), {});
        assert.strictEqual(w.eval('undoStack.length'), 0);
        assert.ok(
            w.toasts.some((t) => t.msg === cleared()),
            'no discard toast'
        );
        // switching back does not resurrect them, and nothing is announced when there is nothing to clear
        setInput(w, 'inputMonth', '1');
        w.toasts.length = 0;
        await w.generateSchedule();
        assert.deepStrictEqual(snap(w, 'manualOverrides'), {});
        assert.ok(!w.toasts.some((t) => t.msg === cleared()));
    });

    await test('I1: a custom range change clears manual edits', async () => {
        reset(w);
        await w.generateSchedule();
        w.updateDoctorAssignment(2, 0, validIdx(w, 2, 0, 1));
        setInput(w, 'chkCustomDateRange', true);
        w.eval('isCustomDateRange = true');
        setInput(w, 'inputStartDate', '2026-03-01');
        setInput(w, 'inputEndDate', '2026-03-10');
        await w.generateSchedule();
        assert.deepStrictEqual(snap(w, 'manualOverrides'), {});
    });

    await test('I1: an imported config brings its own overrides and drops old undo history', async () => {
        reset(w);
        await w.generateSchedule();
        w.updateDoctorAssignment(3, 0, validIdx(w, 3, 0, 1)); // leaves one undo entry
        await importJSON(w, {
            doctors: ['A', 'B', 'C', 'D'],
            manualOverrides: { 5: { 0: 'D' } },
            inputs: { inputMonth: '3', inputYear: '2026', inputOffDutyPeriod: '0' }, // adopted overrides are re-validated, so no rest window
        });
        assert.deepStrictEqual(snap(w, 'manualOverrides'), { 5: { 0: 'D' } });
        assert.strictEqual(w.eval('undoStack.length'), 0);
        assert.strictEqual(w.eval('globalResult.schedule[4].selectedDocs[0].name'), 'D');
    });

    await test('I2: a change made mid-calculation is queued and uses the latest inputs', async () => {
        reset(w);
        const first = w.generateSchedule(); // Jan, parked on its first timer
        setInput(w, 'inputMonth', '2'); // what the change listener would do
        await w.generateSchedule(); // used to return at once and drop the change
        await first;
        await settle(w);
        assert.strictEqual(w.eval('globalResult.month'), 2);
        assert.strictEqual(w.eval('globalResult.schedule.length'), 28);
        assert.strictEqual(w.eval('globalResult.originalSchedule.length'), 28);
    });

    await test('I2: back to back calls with no settle; many queued calls coalesce into the latest inputs', async () => {
        reset(w);
        const a = w.generateSchedule();
        setInput(w, 'inputMonth', '2');
        const b = w.generateSchedule();
        setInput(w, 'inputMonth', '4'); // 30 days
        const c = w.generateSchedule();
        await Promise.all([a, b, c]);
        assert.strictEqual(w.eval('isCalculating'), false);
        assert.strictEqual(w.eval('globalResult.month'), 4);
        assert.strictEqual(w.eval('globalResult.schedule.length'), 30);
        assert.strictEqual(w.eval('regenPending'), false);
    });

    await test('I2: a queued run that fails validation does not wedge the queue', async () => {
        reset(w);
        const first = w.generateSchedule();
        setInput(w, 'inputYear', '26');
        await w.generateSchedule();
        await first;
        await settle(w);
        assert.strictEqual(w.eval('isCalculating'), false);
        setInput(w, 'inputYear', '2026');
        await w.generateSchedule();
        assert.strictEqual(w.eval('globalResult.schedule.length'), 31);
    });

    const names = () =>
        w.eval(
            'globalResult.schedule.map((r) => r.selectedDocs.map((x) => x.name).join()).join("|")'
        );
    const orig = () =>
        w.eval(
            'globalResult.originalSchedule.map((r) => r.selectedDocs.map((x) => x.name).join()).join("|")'
        );
    const other = (day, slot) => {
        const cur = w.eval(`globalResult.schedule[${day - 1}].selectedDocs[${slot}].name`);
        return ['A', 'B', 'C', 'D'].findIndex((n) => n !== cur);
    };

    await test('I2: a custom range change during a running calculation is queued, not dropped', async () => {
        reset(w);
        setInput(w, 'chkCustomDateRange', true);
        w.eval('isCustomDateRange = true');
        setInput(w, 'inputStartDate', '2026-03-01');
        setInput(w, 'inputEndDate', '2026-03-10');
        const first = w.generateSchedule();
        setInput(w, 'inputEndDate', '2026-03-05');
        const second = w.handleCustomDateRangeChange();
        await Promise.all([first, second]);
        assert.strictEqual(w.eval('scheduleDates.length'), 5);
        assert.strictEqual(w.eval('globalResult.schedule.length'), 5);
        assert.strictEqual(w.eval('isCalculating'), false);
    });

    await test('M: a throw inside the error path does not wedge isCalculating', async () => {
        reset(w);
        const realIcons = w.lucide;
        w.eval('window.__cand = generateSingleScheduleCandidate');
        try {
            // the solver fails, then the error handler's own lucide.createIcons call throws too
            w.eval(`generateSingleScheduleCandidate = () => {
                window.lucide = { createIcons() { throw new Error('icons'); } };
                throw new Error('boom');
            }`);
            await w.generateSchedule().catch(() => {});
        } finally {
            w.lucide = realIcons;
            w.eval('generateSingleScheduleCandidate = window.__cand');
        }
        assert.strictEqual(w.eval('isCalculating'), false);
        await w.generateSchedule();
        assert.strictEqual(w.eval('globalResult.schedule.length'), 31);
    });

    await test('I1: a half-entered custom range does not wipe manual edits', async () => {
        reset(w);
        setInput(w, 'chkCustomDateRange', true);
        w.eval('isCustomDateRange = true');
        setInput(w, 'inputStartDate', '2026-03-01');
        setInput(w, 'inputEndDate', '2026-03-10');
        await w.generateSchedule();
        w.updateDoctorAssignment(2, 0, validIdx(w, 2, 0, other(2, 0)));
        setInput(w, 'inputEndDate', '');
        await w.generateSchedule();
        assert.ok(Object.keys(snap(w, 'manualOverrides')).length > 0, 'overrides wiped');
        assert.ok(w.eval('undoStack.length') > 0, 'undo stack wiped');
    });

    await test('undo: two edits, two undos return to the auto schedule', async () => {
        reset(w);
        await w.generateSchedule();
        w.updateDoctorAssignment(5, 0, validIdx(w, 5, 0, other(5, 0)));
        w.updateDoctorAssignment(8, 1, validIdx(w, 8, 1, other(8, 1)));
        assert.notStrictEqual(names(), orig());
        w.undoLastAction();
        assert.notStrictEqual(names(), orig());
        w.undoLastAction();
        assert.strictEqual(names(), orig());
        assert.deepStrictEqual(snap(w, 'manualOverrides'), {});
    });

    await test('undo: one undo reverts both cells of a drag-and-drop swap', async () => {
        reset(w);
        await w.generateSchedule();
        const cellName = (d_, s) =>
            w.eval(`globalResult.schedule[${d_ - 1}].selectedDocs[${s}].name`);
        let day2 = 6;
        while (cellName(5, 0) === cellName(day2, 0)) day2++;
        const before = names();
        const src = cellName(5, 0);
        const tgtIdx = w.eval('doctors').indexOf(cellName(day2, 0));
        const ev = {
            preventDefault() {},
            dataTransfer: { getData: () => JSON.stringify({ day: 5, slotIndex: 0, docName: src }) },
        };
        w.handleDrop(ev, day2, 0, tgtIdx);
        assert.notStrictEqual(names(), before, 'swap did not apply');
        w.undoLastAction();
        assert.strictEqual(names(), before);
    });

    await test('undo: an empty stack toasts and changes nothing', async () => {
        reset(w);
        await w.generateSchedule();
        const before = names();
        w.toasts.length = 0;
        w.undoLastAction();
        assert.ok(w.toasts.some((t) => t.msg === 'Nothing to undo' && t.isError));
        assert.strictEqual(names(), before);
    });

    await test('I1: a language toggle and a same-period regenerate keep manual edits', async () => {
        reset(w);
        await w.generateSchedule();
        w.updateDoctorAssignment(5, 0, validIdx(w, 5, 0, other(5, 0)));
        const ov = snap(w, 'manualOverrides');
        w.toggleLanguage();
        await w.generateSchedule();
        w.toggleLanguage();
        await w.generateSchedule();
        assert.deepStrictEqual(snap(w, 'manualOverrides'), ov);
    });

    await test('F2: a change mid-solve abandons the stale run; only the rerun renders', async () => {
        reset(w, ['A', 'B', 'C', 'D']);
        let renders = 0;
        const real = w.renderResults;
        w.renderResults = (...a) => (renders++, real(...a));
        w.toasts.length = 0;
        try {
            const first = w.generateSchedule();
            // Let the solver run one chunk, then change inputs: deterministic even on a fast CPU
            // (the old fixed 80ms could land after the whole 300-iteration solve had finished).
            await new Promise((r) => w.setTimeout(r, 0));
            w.eval(`doctors.length = 0; doctors.push('X', 'Y', 'Z')`);
            const second = w.generateSchedule();
            await Promise.all([first, second]);
        } finally {
            w.renderResults = real;
        }
        assert.strictEqual(renders, 1, 'stale run rendered');
        assert.ok(!w.toasts.some((t) => t.isError), JSON.stringify(w.toasts));
        assert.deepStrictEqual(snap(w, 'globalResult.summary.map((s) => s.name)'), ['X', 'Y', 'Z']);
        assert.strictEqual(w.document.getElementById('btnCalculate').disabled, false);
    });

    done();
})();
