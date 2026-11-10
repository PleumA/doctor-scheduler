const assert = require('assert');
const { loadApp, reset: baseReset, settle, setInput, snap, runner, sleep, validIdx } = require('./domHarness');
// No rest window: these tests make arbitrary edits, which the override validator would reject inside one
const reset = (w, docs) => {
    baseReset(w, docs);
    setInput(w, 'inputOffDutyPeriod', '0');
};

(async () => {
    const w = await loadApp();
    const d = w.document;
    const { test, done } = runner('bugSweepFixes');
    const grab = () => {
        const g = { blob: null };
        w.URL.createObjectURL = (b) => ((g.blob = b), 'blob:x');
        w.URL.revokeObjectURL = () => {};
        w.HTMLAnchorElement.prototype.click = () => {};
        g.read = () =>
            new Promise((r) => {
                const f = new w.FileReader();
                f.onload = () => r(f.result);
                f.readAsText(g.blob);
            });
        return g;
    };
    const names = (day) => snap(w, `globalResult.schedule[${day - 1}].selectedDocs.map(s=>s.name)`);

    await test('L1 custom range: DD/MM/YYYY chips map to range day indexes', async () => {
        reset(w);
        setInput(w, 'chkCustomDateRange', true);
        d.getElementById('chkCustomDateRange').dispatchEvent(new w.Event('change'));
        setInput(w, 'inputStartDate', '2026-12-28');
        setInput(w, 'inputEndDate', '2027-01-05');
        setInput(w, 'inputNoDuty', '01/01/2027, 25/06/2030');
        setInput(w, 'inputSpecialHols', '31/12/2026');
        await w.generateSchedule();
        const rows = snap(w, 'globalResult.schedule.map(r=>({n:r.isNoDuty,h:r.isHoliday}))');
        assert.strictEqual(rows[4].n, true, 'day 5 (01/01/2027) is no-duty');
        assert.ok(!rows[0].n, 'day 1 is not no-duty');
        assert.strictEqual(rows[3].h, true, 'day 4 (31/12/2026) is a special holiday');
        assert.strictEqual(rows.filter((r) => r.n).length, 1, 'out-of-range token dropped');
    });

    await test('L2 undo after removeDoctor leaves no ghost doctor', async () => {
        reset(w);
        await w.generateSchedule();
        w.updateDoctorAssignment(5, 1, validIdx(w, 5, 1, 0));
        w.removeDoctor(0);
        await settle(w);
        w.undoLastAction();
        for (let i = 1; i <= 31; i++) assert.ok(!names(i).includes('A'), `A on day ${i}`);
        const sumTotal = snap(w, 'globalResult.summary.reduce((a,s)=>a+s.total,0)');
        const gridTotal = snap(
            w,
            "globalResult.schedule.reduce((a,r)=>a+r.selectedDocs.filter(s=>s.name&&s.name!=='-'&&s.name!=='__SHORTAGE__').length,0)"
        );
        assert.strictEqual(sumTotal, gridTotal);
    });

    await test('L3 export during a run and after a failed run keeps the displayed dates', async () => {
        reset(w);
        await w.generateSchedule();
        const g = grab();
        setInput(w, 'inputMonth', '2');
        const p = w.generateSchedule();
        await sleep(5);
        w.exportCalendar('apple');
        let st = (await g.read()).split('\r\n').filter((l) => /^DTSTART/.test(l));
        assert.ok(st[0].includes('20260101'), st[0]);
        await p;
        // failed run: bad quota
        setInput(w, 'inputMonth', '1');
        await w.generateSchedule();
        setInput(w, 'inputMonth', '3');
        setInput(w, 'inputSinglePoolQuota', 'A:1');
        await w.generateSchedule();
        assert.strictEqual(w.eval('scheduleDates[0].getMonth()'), 0, 'dates restored');
        w.exportCalendar('apple');
        st = (await g.read()).split('\r\n').filter((l) => /^DTSTART/.test(l));
        assert.ok(st[0].includes('2026'), st[0]);
        assert.ok(st[0].includes('0101'), st[0]);
    });

    await test('L4 edit and copies work after a failed run', async () => {
        reset(w);
        await w.generateSchedule();
        setInput(w, 'inputSinglePoolQuota', 'A:1');
        await w.generateSchedule();
        const di = validIdx(w, 5, 0, 3);
        const picked = snap(w, 'globalResult.doctors')[di];
        w.updateDoctorAssignment(5, 0, di);
        assert.strictEqual(names(5)[0], picked);
        assert.strictEqual(d.querySelector('#btn-day-5-slot-0 span.truncate').textContent, picked);
        assert.deepStrictEqual(snap(w, 'manualOverrides[5]'), { 0: picked });
        const sumTotal = snap(w, 'globalResult.summary.reduce((a,s)=>a+s.total,0)');
        const gridTotal = snap(
            w,
            "globalResult.schedule.reduce((a,r)=>a+r.selectedDocs.filter(s=>s.name&&s.name!=='-'&&s.name!=='__SHORTAGE__').length,0)"
        );
        assert.strictEqual(sumTotal, gridTotal);
        w.copyScheduleForExcel();
        w.copySummary();
        const g = grab();
        w.exportCalendar('apple');
        assert.ok(g.blob, 'calendar exported');
    });

    await test('L5 sanitizeName rejects marker names', () => {
        assert.strictEqual(w.eval("sanitizeName('-')"), '');
        assert.strictEqual(w.eval("sanitizeName('__SHORTAGE__')"), '');
        assert.strictEqual(w.eval("sanitizeName(' Dr-A ')"), 'Dr-A');
    });

    await test('L6 removeDoctor strips the stale quota entry', async () => {
        reset(w);
        setInput(w, 'inputSinglePoolQuota', 'A:3, B:3, C:3, D:3');
        w.removeDoctor(0);
        await settle(w);
        const v = d.getElementById('inputSinglePoolQuota').value;
        assert.ok(!/(^|,\s*)A:/.test(v), v);
        assert.ok(/B:3/.test(v), v);
        assert.ok(
            ![...d.querySelectorAll('#structuredSinglePoolQuotasContainer *')].some(
                (e) => e.value === 'A' || e.textContent.trim() === 'A'
            )
        );
    });

    done();
})();
