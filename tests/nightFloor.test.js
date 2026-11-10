// Night floor (>= N shifts per doctor) and the optional extra-doctor plan.
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

const countDuties = (schedule) => {
    const counts = {};
    let slots = 0;
    schedule.forEach((row) => {
        row.selectedDocs.forEach((slot) => {
            const name = slot && slot.name;
            if (name && name !== '-' && name !== 'SHORTAGE_MARKER') {
                counts[name] = (counts[name] || 0) + 1;
                slots++;
            }
        });
    });
    return { counts, slots };
};

(async () => {
    const w = await loadApp();

    const setup = (doctors, opts = {}) => {
        reset(w, doctors);
        setInput(w, 'inputMonth', String(opts.month || 4)); // April: 30 days
        setInput(w, 'inputYear', '2026');
        setInput(w, 'inputDefaultSlots', '2');
        setInput(w, 'inputMinNightShifts', String(opts.floor === undefined ? 14 : opts.floor));
        setInput(w, 'chkAllowExtraNightDoctor', opts.extra !== false);
        setInput(w, 'inputOffDutyPeriod', String(opts.gap === undefined ? 1 : opts.gap));
        if (opts.roleBased) {
            setInput(w, 'chkRoleBased', true);
            setInput(w, 'inputDoctorRoles', opts.roles || 'A:R1,B:R1,C:R2,D:R2,E:R2');
            setInput(w, 'inputDefaultRoleSlots', opts.roleSlots || 'R1:1, R2:1');
        }
        w.toasts.length = 0;
    };

    const setupShift = (doctors, opts = {}) => {
        reset(w, doctors);
        setInput(w, 'inputMonth', '4');
        setInput(w, 'inputYear', '2026');
        setInput(w, 'chkShiftBased', true);
        setInput(w, 'inputMorningSlots', '0');
        setInput(w, 'inputAfternoonSlots', '0');
        setInput(w, 'inputNightSlots', String(opts.nightSlots === undefined ? 2 : opts.nightSlots));
        setInput(w, 'inputMinNightShifts', String(opts.floor === undefined ? 14 : opts.floor));
        setInput(w, 'chkAllowExtraNightDoctor', opts.extra !== false);
        setInput(w, 'inputOffDutyPeriod', '1');
        w.toasts.length = 0;
    };

    const run = async () => {
        await w.generateSchedule();
        await settle(w);
        return snap(w, 'globalResult ? globalResult.schedule : null');
    };

    await test('5 doctors on a 30-day month: 10 extras, exactly 14 each', async () => {
        setup(['A', 'B', 'C', 'D', 'E']);
        const schedule = await run();
        assert.ok(schedule, 'no schedule');
        const { counts, slots } = countDuties(schedule);
        assert.strictEqual(slots, 70, `slots ${slots}`);
        assert.deepStrictEqual(counts, { A: 14, B: 14, C: 14, D: 14, E: 14 });
        const threeDoctorDays = schedule.filter(
            (row) => row.selectedDocs.filter((s) => s.name && s.name !== '-').length === 3
        ).length;
        assert.strictEqual(threeDoctorDays, 10, `extra nights ${threeDoctorDays}`);
    });

    await test('4 doctors: no extras, 15 each', async () => {
        setup(['A', 'B', 'C', 'D']);
        const schedule = await run();
        assert.ok(schedule);
        const { counts, slots } = countDuties(schedule);
        assert.strictEqual(slots, 60);
        assert.deepStrictEqual(counts, { A: 15, B: 15, C: 15, D: 15 });
    });

    await test('5 doctors with extras off: refuses with the arithmetic', async () => {
        setup(['A', 'B', 'C', 'D', 'E'], { extra: false });
        const schedule = await run();
        assert.strictEqual(schedule, null, 'should not render a roster');
        const err = w.toasts.find((t) => t.isError);
        assert.ok(err, 'no error toast');
        assert.ok(/70/.test(err.msg) && /60/.test(err.msg), err.msg);
    });

    await test('floor 15 with 4 doctors: 15 each', async () => {
        setup(['A', 'B', 'C', 'D'], { floor: 15 });
        const schedule = await run();
        assert.ok(schedule);
        assert.deepStrictEqual(countDuties(schedule).counts, { A: 15, B: 15, C: 15, D: 15 });
    });

    await test('two-day gap makes 14 impossible: refuses', async () => {
        setup(['A', 'B', 'C', 'D'], { gap: 2 });
        const schedule = await run();
        assert.strictEqual(schedule, null);
        assert.ok(
            w.toasts.some((t) => t.isError && /14/.test(t.msg)),
            'no capacity error'
        );
    });

    await test('role-based roster with equal role sizes honours the floor', async () => {
        setup(['A', 'B', 'C', 'D'], {
            roleBased: true,
            roles: 'A:R1,B:R1,C:R2,D:R2',
            roleSlots: 'R1:1, R2:1',
        });
        const schedule = await run();
        assert.ok(schedule, 'no schedule');
        assert.deepStrictEqual(countDuties(schedule).counts, {
            A: 15,
            B: 15,
            C: 15,
            D: 15,
        });
    });

    await test('role-based roster refuses when one role cannot meet the floor', async () => {
        setup(['A', 'B', 'C', 'D', 'E'], { roleBased: true });
        const schedule = await run();
        assert.strictEqual(schedule, null);
        assert.ok(
            w.toasts.some((t) => t.isError && /บทบาท|role/.test(t.msg)),
            JSON.stringify(w.toasts)
        );
    });

    await test('shift-night mode: 2 nights/day, 5 doctors, 14 nights each', async () => {
        setupShift(['A', 'B', 'C', 'D', 'E']);
        const schedule = await run();
        assert.ok(schedule, 'no schedule');
        const { counts, slots } = countDuties(schedule);
        assert.strictEqual(slots, 70);
        assert.deepStrictEqual(counts, { A: 14, B: 14, C: 14, D: 14, E: 14 });
    });

    await test('shift-night mode refuses when 1 night/day cannot reach 14 each', async () => {
        setupShift(['A', 'B', 'C', 'D', 'E'], { nightSlots: 1 });
        const schedule = await run();
        assert.strictEqual(schedule, null);
        assert.ok(
            w.toasts.some((t) => t.isError && /70|60/.test(t.msg)),
            JSON.stringify(w.toasts)
        );
    });

    await test('a manual edit cannot drop a doctor below the floor', async () => {
        setup(['A', 'B', 'C', 'D', 'E']);
        const schedule = await run();
        const row = schedule.find((r) => r.selectedDocs[0] && r.selectedDocs[0].name !== '-');
        const x = row.selectedDocs[0].name;
        // y must be clear of day-1..day+1 so the rest rule does not fire before the floor rule
        const near = [row.day - 1, row.day, row.day + 1].flatMap((d) =>
            schedule[d - 1] ? schedule[d - 1].selectedDocs.map((slot) => slot.name) : []
        );
        const y = ['A', 'B', 'C', 'D', 'E'].find((doc) => !near.includes(doc));
        const before = countDuties(schedule).counts[x];
        w.toasts.length = 0;
        w.updateDoctorAssignment(row.day, 0, ['A', 'B', 'C', 'D', 'E'].indexOf(y));
        const err = w.toasts.find((t) => t.isError && /below|ต่ำกว่า/.test(t.msg));
        assert.ok(err, JSON.stringify(w.toasts));
        const after = snap(w, 'globalResult.schedule');
        assert.strictEqual(after[row.day - 1].selectedDocs[0].name, x, 'edit was applied');
        assert.strictEqual(countDuties(after).counts[x], before);
    });

    await test('identical inputs produce an identical roster', async () => {
        setup(['A', 'B', 'C', 'D', 'E']);
        const first = await run();
        setup(['A', 'B', 'C', 'D', 'E']);
        const second = await run();
        assert.deepStrictEqual(first, second);
    });

    await test('floor 0 keeps the old behaviour (no forced extras)', async () => {
        setup(['A', 'B', 'C', 'D', 'E'], { floor: 0 });
        const schedule = await run();
        assert.ok(schedule);
        assert.strictEqual(countDuties(schedule).slots, 60);
    });

    console.log(`\nnightFloor: PASSED: ${passed}/${total}, FAILED: ${total - passed}`);
    process.exit(passed === total ? 0 : 1);
})();
