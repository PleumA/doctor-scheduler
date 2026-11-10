// The displayed result is a self-contained snapshot: a failed or still-running regenerate must not
// pair the displayed rows with the new period, config or doctor list.
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
    const { test, done } = runner('resultSnapshot');
    const fire = (id) => d.getElementById(id).dispatchEvent(new w.Event('change'));
    const names = (day) => snap(w, `globalResult.schedule[${day - 1}].selectedDocs.map(s=>s.name)`);
    const errors = [];
    w.console.error = (...a) => errors.push(a.map(String).join(' '));
    const toCustom = async () => {
        setInput(w, 'inputStartDate', '2026-12-28');
        setInput(w, 'inputEndDate', '2027-01-05');
        setInput(w, 'chkCustomDateRange', true);
        fire('chkCustomDateRange');
        await sleep(100);
        await settle(w);
    };
    const failQuota = async () => {
        setInput(w, 'inputSinglePoolQuota', 'A:1');
        await w.generateSchedule();
        assert.ok(w.toasts.slice(-1)[0].isError, 'the run must fail');
    };

    await test('result carries a full snapshot and resultCtx exposes it', async () => {
        reset(w);
        await w.generateSchedule();
        const c = snap(
            w,
            `(()=>{const c=resultCtx();return {k:Object.keys(c).sort(),docs:c.doctors,m:c.month,custom:c.isCustomDateRange,n:c.dates.length,pk:globalResult.periodKey,cfg:!!c.config}})()`
        );
        for (const k of ['config', 'dates', 'isCustomDateRange', 'doctors', 'month', 'year'])
            assert.ok(c.k.includes(k), `missing ${k}`);
        assert.deepStrictEqual(c.docs, ['A', 'B', 'C', 'D']);
        assert.strictEqual(c.n, 31);
        assert.strictEqual(c.pk, '1-2026');
        assert.ok(w.eval('resultCtx().doctors !== doctors'), 'doctors is a copy');
    });

    await test('t8 failed run after a month change keeps Jan overrides, undo and period', async () => {
        reset(w);
        await w.generateSchedule();
        const di = validIdx(w, 5, 0, 3);
        const picked = snap(w, 'globalResult.doctors')[di];
        w.updateDoctorAssignment(5, 0, di);
        setInput(w, 'inputMonth', '2');
        await failQuota();
        assert.strictEqual(w.eval('overridesPeriod'), '1-2026');
        assert.ok(snap(w, 'manualOverrides')[5], 'Jan override kept');
        assert.ok(w.eval('undoStack.length') > 0, 'undo kept');
        assert.strictEqual(names(5)[0], picked);
        // a later Feb success must not inherit the Jan edits
        w.updateDoctorAssignment(6, 0, validIdx(w, 6, 0, 3));
        setInput(w, 'inputSinglePoolQuota', '');
        await w.generateSchedule();
        assert.strictEqual(snap(w, 'globalResult.month'), 2);
        assert.deepStrictEqual(snap(w, 'manualOverrides'), {});
        assert.strictEqual(w.eval('undoStack.length'), 0);
        assert.strictEqual(w.eval('overridesPeriod'), '2-2026');
    });

    await test('t1/t3 language toggle after a failed run keeps weekdays, never throws', async () => {
        reset(w);
        await w.generateSchedule();
        const days = () => snap(w, '[0,1,2,3].map(i=>globalResult.schedule[i].dayName)');
        const before = days();
        setInput(w, 'inputMonth', '13');
        await w.generateSchedule();
        w.toggleLanguage(); // en -> th
        const after = days();
        assert.ok(
            after.every((n) => !/Invalid/.test(n)),
            after.join()
        );
        assert.notDeepStrictEqual(after, before, 'weekday names are retranslated');
        assert.ok(!/Invalid|NaN/.test(d.querySelector('#scheduleTableBody tr').textContent));
        // throwing variant: quota makes parseUIConfig throw
        reset(w);
        await w.generateSchedule();
        await failQuota();
        w.toggleLanguage();
        assert.strictEqual(w.eval('currentLang'), 'th');
        assert.strictEqual(d.getElementById('btnLanguage').textContent, 'EN');
        w.toggleLanguage();
        assert.strictEqual(w.eval('currentLang'), 'en');
    });

    await test('t1 custom result keeps its dates when language toggles after failed switch', async () => {
        reset(w);
        await toCustom();
        setInput(w, 'inputYear', 'abc');
        setInput(w, 'chkCustomDateRange', false);
        fire('chkCustomDateRange');
        await sleep(100);
        await settle(w);
        w.eval('updateDayNamesLanguage()');
        const row = snap(
            w,
            '[globalResult.schedule[0].dayName,globalResult.schedule[0].dayDisplay]'
        );
        assert.ok(!/Invalid/.test(row.join()), row.join());
        assert.strictEqual(row[1], '28/12/2026');
    });

    await test('t4 person and calendar headers after failed custom->standard use result dates', async () => {
        reset(w);
        await toCustom();
        w.setViewMode('person');
        const hdr = () =>
            [...d.querySelectorAll('#personViewContainer thead th')]
                .slice(1, 6)
                .map((t) => t.textContent.trim().replace(/\s+/g, ' '));
        const before = hdr();
        setInput(w, 'inputYear', '');
        setInput(w, 'chkCustomDateRange', false);
        fire('chkCustomDateRange');
        await sleep(100);
        await settle(w);
        assert.ok(w.toasts.slice(-1)[0].isError);
        w.setViewMode('person');
        assert.deepStrictEqual(hdr(), before);
        w.setViewMode('calendar');
        const grid = d.getElementById('calendarGrid');
        assert.ok(!/NaN/.test(grid.textContent));
        // result starts on 28/12/2026 (Monday): one empty placeholder before it
        assert.strictEqual(grid.querySelectorAll('.min-h-\\[105px\\]').length, 1);
        assert.ok(/Dec/.test(grid.textContent), grid.textContent.slice(0, 60));
    });

    await test('t5 note computed mid-run uses the result dates', async () => {
        reset(w);
        w.eval(`offData=[{id:1,date:'29/12/2026',names:'A'}]`);
        await toCustom();
        const idle = () => {
            w.toasts.length = 0;
            // The off-day assignment is illegal by design (this tests the explanation): bypass validation
            w.isDragAndDropOperation = true;
            w.updateDoctorAssignment(2, 0, 0);
            w.isDragAndDropOperation = false;
            return [
                w.toasts.some((t) => /requested off today/.test(t.msg)),
                snap(w, 'globalResult.schedule[1].note'),
            ];
        };
        const [idleToast, idleNote] = idle();
        assert.ok(idleToast && /A/.test(idleNote), 'sanity: idle flags the off day');
        setInput(w, 'inputStartDate', '2026-12-27');
        const p = w.generateSchedule();
        await sleep(5);
        const [toast, note] = idle();
        await p;
        assert.ok(toast, 'explainSlotFailure used the new dates mid-run');
        assert.ok(/requested Off/.test(note), note);
    });

    await test('t7 Excel header after failed role toggle keeps the role', async () => {
        reset(w);
        let clip = '';
        Object.defineProperty(w.navigator, 'clipboard', {
            value: { writeText: async (t) => (clip = t) },
            configurable: true,
        });
        setInput(w, 'inputDoctorRoles', 'A:R1, B:R1, C:R2, D:R2');
        setInput(w, 'inputDefaultRoleSlots', 'R1:1, R2:1');
        setInput(w, 'chkRoleBased', true);
        await w.generateSchedule();
        w.copyScheduleForExcel();
        await sleep(20);
        assert.ok(/\(R1\)/.test(clip.split('\n')[0]), clip.split('\n')[0]);
        setInput(w, 'chkRoleBased', false);
        await failQuota();
        clip = '';
        w.copyScheduleForExcel();
        await sleep(20);
        assert.ok(/\(R1\)/.test(clip.split('\n')[0]), clip.split('\n')[0]);
    });

    await test('t6 drag and drop after a failed run applies, re-renders and toasts', async () => {
        reset(w);
        await w.generateSchedule();
        await failQuota();
        errors.length = 0;
        const src = names(3)[0];
        const tgt = names(4)[0];
        const ev = {
            preventDefault() {},
            stopPropagation() {},
            dataTransfer: { getData: () => JSON.stringify({ day: 3, slotIndex: 0, docName: src }) },
        };
        w.toasts.length = 0;
        w.handleDrop(ev, 4, 0, w.eval('resultCtx().doctors').indexOf(tgt));
        assert.strictEqual(names(4)[0], src);
        assert.strictEqual(names(3)[0], tgt);
        assert.strictEqual(d.querySelector('#btn-day-4-slot-0 span.truncate').textContent, src);
        assert.ok(
            w.toasts.some((t) => /Drag & Drop swap successful/.test(t.msg)),
            'success toast'
        );
        assert.deepStrictEqual(errors, []);
    });

    await test('t1 summary after failed run plus removeDoctor matches the displayed grid', async () => {
        reset(w);
        await w.generateSchedule();
        await failQuota();
        w.removeDoctor(3); // D leaves the live list; the displayed grid still has D
        await settle(w);
        const inGrid = snap(
            w,
            'globalResult.schedule.flatMap(r=>r.isNoDuty?[]:r.selectedDocs.map(s=>s.name)).filter(n=>n!=="-"&&n!==""&&n!==SHORTAGE_MARKER)'
        );
        w.updateDoctorAssignment(1, 0, validIdx(w, 1, 0, 0)); // recalculates counts
        const grid = snap(
            w,
            'globalResult.schedule.flatMap(r=>r.isNoDuty?[]:r.selectedDocs.map(s=>s.name)).filter(n=>n!=="-"&&n!==""&&n!==SHORTAGE_MARKER)'
        );
        const sum = snap(w, 'globalResult.summary');
        assert.strictEqual(
            sum.reduce((a, s) => a + s.total, 0),
            grid.length
        );
        for (const n of new Set(grid))
            assert.strictEqual(
                (sum.find((s) => s.name === n) || {}).total,
                grid.filter((g) => g === n).length,
                `summary for ${n}`
            );
        assert.ok(inGrid.includes('D'), 'sanity: D is displayed');
    });

    await test('t10 BE and 2-digit year chips map to the range day index', async () => {
        reset(w);
        await toCustom();
        setInput(w, 'inputNoDuty', '01/01/2570, 02/01/2027');
        setInput(w, 'inputSpecialHols', '31/12/26');
        await w.generateSchedule();
        const nd = snap(w, 'globalResult.schedule.filter(r=>r.isNoDuty).map(r=>r.day)');
        assert.deepStrictEqual(nd, [5, 6]);
        assert.ok(snap(w, 'globalResult.schedule[3].isHoliday'), '31/12/26 is day 4');
    });

    await test('t10 a dropped chip is named once in a toast (th and en)', async () => {
        reset(w);
        await toCustom();
        setInput(w, 'inputNoDuty', '25/06/2030, xyz');
        w.toasts.length = 0;
        await w.generateSchedule();
        await w.generateSchedule();
        const hits = w.toasts.filter((t) => t.msg.includes('25/06/2030'));
        assert.strictEqual(hits.length, 1, JSON.stringify(w.toasts.map((t) => t.msg)));
        assert.ok(w.toasts.some((t) => t.msg.includes('xyz')));
        assert.ok(
            w.eval('translations.th.dayChipDropped') && w.eval('translations.en.dayChipDropped')
        );
    });

    done();
})();
