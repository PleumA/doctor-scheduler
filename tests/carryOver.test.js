// Rest and night->morning rules must hold across the month boundary.
const assert = require('assert');
const { loadApp, reset, settle, setInput, snap } = require('./domHarness');

(async () => {
    const w = await loadApp();
    const gen = async (month) => {
        setInput(w, 'inputMonth', String(month));
        await w.generateSchedule();
        await settle(w);
    };
    const names = (row) => row.selectedDocs.map((s) => s.name);
    const rows = () => snap(w, 'globalResult.schedule');

    const start = async () => {
        reset(w, ['A', 'B']);
        setInput(w, 'inputYear', '2026');
        setInput(w, 'inputDefaultSlots', '1');
        setInput(w, 'inputOffDutyPeriod', '1');
        await gen(1);
        const jan = rows();
        return names(jan[jan.length - 1])[0];
    };

    let failed = 0;
    const test = async (name, fn) => {
        try {
            await fn();
            console.log(`✅ [PASSED] ${name}`);
        } catch (e) {
            failed++;
            console.error(`❌ [FAILED] ${name}\n${e.message}`);
        }
    };

    await test('Feb 1 excludes the doctor who worked Jan 31', async () => {
        const last = await start();
        await gen(2);
        const feb1 = names(rows()[0]);
        assert.ok(!feb1.includes(last), `${last} worked Jan 31 and Feb 1`);
        assert.deepStrictEqual(feb1, [last === 'A' ? 'B' : 'A']);
    });

    await test('non-contiguous period gets no carry-over and day 1 is unconstrained', async () => {
        const last = await start();
        // April 1 is a Wednesday; forbid the other doctor so only the Jan 31 worker can take it
        w.eval(`offData = [{ id: 1, date: '1', names: '${last === 'A' ? 'B' : 'A'}' }]`);
        await gen(4);
        assert.strictEqual(snap(w, 'globalResult.config.carryOver'), null);
        assert.deepStrictEqual(names(rows()[0]), [last]);
    });

    await test('regenerating the same period keeps its carry-in', async () => {
        const last = await start();
        await gen(2);
        await gen(2);
        assert.ok(snap(w, 'globalResult.config.carryOver'), 'carry-in lost');
        assert.ok(!names(rows()[0]).includes(last));
    });

    await test('manual edit of the last day is what carries over', async () => {
        const last = await start();
        const other = last === 'A' ? 'B' : 'A';
        w.eval(`globalResult.schedule[30].selectedDocs[0].name = '${other}'`);
        await gen(2);
        const co = snap(w, 'globalResult.config.carryOver');
        assert.deepStrictEqual(co.dutiesByDoctor[other].pop().date, '2026-01-31');
        assert.ok(!names(rows()[0]).includes(other));
    });

    await test('holiday spacing: Jan 31 and Feb 1 are weekend days, no gap needed otherwise', async () => {
        reset(w, ['A', 'B']);
        setInput(w, 'inputYear', '2026');
        setInput(w, 'inputDefaultSlots', '1');
        setInput(w, 'inputOffDutyPeriod', '0');
        await gen(1);
        const last = names(rows()[rows().length - 1])[0];
        assert.ok(snap(w, 'globalResult.carryOver').dutiesByDoctor[last].pop().holiday);
        await gen(2);
        assert.ok(!names(rows()[0]).includes(last));
    });

    await test('night then next-day morning is blocked across the boundary', async () => {
        reset(w, ['A', 'B', 'C']);
        setInput(w, 'inputYear', '2026');
        setInput(w, 'chkShiftBased', true);
        setInput(w, 'inputMorningSlots', '1');
        setInput(w, 'inputAfternoonSlots', '0');
        setInput(w, 'inputNightSlots', '1');
        setInput(w, 'inputOffDutyPeriod', '0');
        await gen(1);
        const jan = rows();
        const night = jan[jan.length - 1].selectedDocs[1].name;
        const offDoc = ['A', 'B', 'C'].find((d) => d !== night);
        w.eval(`offData = [{ id: 1, date: '1', names: '${offDoc}' }]`);
        await gen(2);
        const co = snap(w, 'globalResult.config.carryOver');
        assert.deepStrictEqual(
            co.dutiesByDoctor[night].filter((d) => d.date === '2026-01-31').map((d) => d.type),
            ['night']
        );
        assert.notStrictEqual(rows()[0].selectedDocs[0].name, night);
    });

    await test('a partial result without config does not throw and carries nothing', async () => {
        w.eval(`
            globalResult = {
                schedule: [{ day: 1, selectedDocs: [{ name: 'A', role: 'Default' }] }],
                doctors: doctors.slice(),
                dates: [new Date(2026, 0, 31)],
            };
        `);
        const co = w.eval('parseUIConfig().carryOver');
        assert.strictEqual(co, null);
        w.eval('globalResult = { schedule: [], doctors: doctors.slice() };');
        assert.strictEqual(w.eval('parseUIConfig().carryOver'), null);
    });

    process.exit(failed ? 1 : 0);
})();
