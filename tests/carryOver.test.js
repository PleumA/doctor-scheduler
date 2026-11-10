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

    await test('non-contiguous period gets no carry-over', async () => {
        await start();
        await gen(4);
        assert.strictEqual(snap(w, 'globalResult.config.carryOver'), null);
    });

    await test('night then next-day morning is blocked across the boundary', async () => {
        reset(w, ['A', 'B']);
        setInput(w, 'inputYear', '2026');
        setInput(w, 'chkShiftBased', true);
        setInput(w, 'inputMorningSlots', '1');
        setInput(w, 'inputAfternoonSlots', '0');
        setInput(w, 'inputNightSlots', '1');
        setInput(w, 'inputOffDutyPeriod', '0');
        await gen(1);
        const jan = rows();
        const night = jan[jan.length - 1].selectedDocs[1].name;
        await gen(2);
        assert.notStrictEqual(rows()[0].selectedDocs[0].name, night);
    });

    process.exit(failed ? 1 : 0);
})();
