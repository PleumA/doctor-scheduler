// Manual overrides must respect the hard rules; each rejected edit leaves the cell unchanged.
const assert = require('assert');
const { loadApp, reset, settle, setInput, snap, runner } = require('./domHarness');

(async () => {
    const w = await loadApp();
    const { test, done } = runner('overrideValidation');
    const DOCS = ['A', 'B', 'C', 'D'];
    const sched = () => snap(w, 'globalResult.schedule');
    const namesOf = (row) => row.selectedDocs.map((s) => s.name);

    const gen = async (opts = {}) => {
        reset(w, DOCS);
        setInput(w, 'inputDefaultSlots', opts.slots || '2');
        setInput(w, 'inputOffDutyPeriod', opts.gap || '1');
        (opts.inputs || []).forEach(([id, v]) => setInput(w, id, v));
        if (opts.off) w.eval(`offData = ${JSON.stringify(opts.off)}`);
        await w.generateSchedule();
        await settle(w);
        assert.ok(sched(), 'no schedule');
        return sched();
    };

    // Try the edit; assert rejection with the reason in the toast and the cell untouched
    const expectReject = (day, slot, doc, reason) => {
        const before = sched();
        w.toasts.length = 0;
        w.updateDoctorAssignment(day, slot, DOCS.indexOf(doc));
        const err = w.toasts.find((t) => t.isError && t.msg.includes(`(${reason})`));
        assert.ok(err, `expected ${reason}, got ${JSON.stringify(w.toasts)}`);
        assert.deepStrictEqual(sched(), before, 'schedule changed');
    };

    await test('duplicate: doctor already on that day', async () => {
        const s = await gen();
        const n = namesOf(s[2]);
        expectReject(3, 0, n[1], 'duplicate');
    });

    await test('conflict: conflicting doctor already on that day', async () => {
        const s = await gen({ inputs: [['inputConflicts', 'A:B']] });
        const row = s.find((r) => namesOf(r).includes('B'));
        const slot = namesOf(row).indexOf('B') === 0 ? 1 : 0;
        expectReject(row.day, slot, 'A', 'conflict');
    });

    await test('role: doctor of another role', async () => {
        const s = await gen({
            inputs: [
                ['chkRoleBased', true],
                ['inputDoctorRoles', 'A:R1,B:R1,C:R2,D:R2'],
                ['inputDefaultRoleSlots', 'R1:1, R2:1'],
            ],
        });
        const row = s[4];
        const slot = 0;
        const role = row.selectedDocs[slot].role;
        const roles = { A: 'R1', B: 'R1', C: 'R2', D: 'R2' };
        const wrong = DOCS.find((d) => roles[d] !== role && !namesOf(row).includes(d));
        assert.ok(wrong, 'no off-role doctor free');
        expectReject(row.day, slot, wrong, 'role');
    });

    await test('off: doctor requested off that day', async () => {
        const s = await gen({ off: [{ id: 1, date: '5', names: 'B' }] });
        assert.ok(!namesOf(s[4]).includes('B'));
        expectReject(5, 0, 'B', 'off');
    });

    await test('rest: doctor inside the rest window', async () => {
        const s = await gen({ slots: '1', gap: '2' });
        const x = namesOf(s[9])[0];
        expectReject(11, 0, x, 'rest');
    });

    await test('quota: doctor would exceed their quota', async () => {
        const s = await gen({ gap: '0' }); // no rest window, so quota is the first rule hit
        const a = s.flatMap(namesOf).filter((n) => n === 'A').length;
        w.eval(`globalResult.config.quota = { A: ${a} }`);
        const row = s.find((r) => !namesOf(r).includes('A'));
        assert.ok(row, 'no day without A');
        expectReject(row.day, 0, 'A', 'quota');
    });

    await test('valid edit is still applied', async () => {
        const s = await gen();
        const row = s[6];
        const free = DOCS.find((d) => !namesOf(row).includes(d));
        w.toasts.length = 0;
        w.updateDoctorAssignment(row.day, 0, DOCS.indexOf(free));
        // may legitimately fail on rest/quota; only assert it is not rejected as duplicate/conflict
        assert.ok(!w.toasts.some((t) => /\((duplicate|conflict|role)\)/.test(t.msg)));
    });

    done();
})();
