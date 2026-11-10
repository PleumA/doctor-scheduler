const assert = require('assert');
const { loadApp, reset, settle, setInput, snap, runner } = require('./domHarness');

(async () => {
    const w = await loadApp();
    const d = w.document;
    const { test, done } = runner('specialDoctor');
    const names = (row) => row.selectedDocs.map((s) => s.name);
    const candidate = () => w.generateSingleScheduleCandidate(0, w.parseUIConfig());

    await test('C3: removing a locked doctor unlocks them everywhere', async () => {
        reset(w);
        setInput(w, 'chkUseSpecialRule', true);
        setInput(w, 'inputSpecialDocs', 'D');
        setInput(w, 'inputSpecialDays', '3');
        w.eval(`offData = [{ id: 1, date: '2', names: 'D, A' }];`);
        w.removeDoctor(3);
        await settle(w);
        assert.strictEqual(d.getElementById('inputSpecialDocs').value, '');
        assert.ok(
            ![...d.querySelectorAll('#specialDocsCheckboxList label')].some((l) =>
                l.textContent.includes('D')
            )
        );
        assert.strictEqual(snap(w, 'offData')[0].names, 'A');
        const first3 = snap(
            w,
            'globalResult.schedule.slice(0, 3).flatMap((r) => r.selectedDocs.map((s) => s.name))'
        );
        assert.ok(!first3.includes('D'), `D still scheduled: ${first3}`);
    });

    await test('C3: parseUIConfig ignores special docs that are not doctors', () => {
        reset(w);
        setInput(w, 'inputSpecialDocs', 'D, Ghost');
        w.eval(`doctors = doctors.slice(0, 3);`);
        assert.deepStrictEqual(snap(w, 'parseUIConfig().specialDocs'), []);
    });

    // The search is randomized: repeat so a lucky run cannot hide a violation.
    const RUNS = 20;

    await test('C4: a special doctor never shares a day with a conflicting doctor', () => {
        reset(w);
        setInput(w, 'chkRoleBased', true);
        setInput(w, 'inputDoctorRoles', 'A:R1,B:R1,C:R2,D:R2');
        setInput(w, 'inputDefaultRoleSlots', 'R1:1,R2:1');
        setInput(w, 'inputConflicts', 'A:D, B:D');
        setInput(w, 'chkUseSpecialRule', true);
        setInput(w, 'inputSpecialDocs', 'D');
        setInput(w, 'inputSpecialDays', '31');
        for (let k = 0; k < RUNS; k++) {
            const r = candidate();
            const clashes = r.schedule.filter((row) => {
                const n = names(row);
                return n.includes('D') && (n.includes('A') || n.includes('B'));
            });
            assert.strictEqual(clashes.length, 0, `${clashes.length} of 31 days put D with A or B`);
            assert.ok(
                r.schedule.every((row) => !names(row).includes('__SHORTAGE__')),
                'fallback left a hole'
            );
        }
    });

    await test('C4: a special doctor obeys the rest window', () => {
        reset(w);
        setInput(w, 'chkUseSpecialRule', true);
        setInput(w, 'inputSpecialDocs', 'D');
        setInput(w, 'inputSpecialDays', '3');
        for (let k = 0; k < RUNS; k++) {
            const has = candidate()
                .schedule.slice(0, 3)
                .map((row) => names(row).includes('D'));
            assert.ok(!(has[0] && has[1]) && !(has[1] && has[2]), `D on consecutive days: ${has}`);
        }
    });

    await test('C4: a special doctor skips an off day and the day before it', () => {
        reset(w);
        setInput(w, 'chkUseSpecialRule', true);
        setInput(w, 'inputSpecialDocs', 'D');
        setInput(w, 'inputSpecialDays', '5');
        setInput(w, 'inputOffDutyPeriod', '0');
        w.eval(`offData = [{ id: 1, date: '3', names: 'D' }];`);
        for (let k = 0; k < RUNS; k++) {
            const has = candidate()
                .schedule.slice(0, 5)
                .map((row) => names(row).includes('D'));
            assert.ok(!has[1] && !has[2], `D on day 2 or 3: ${has}`);
        }
    });

    done();
})();
