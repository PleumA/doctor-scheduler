// Solver relaxation telemetry: recorded, scored, and surfaced in the results panel.
const assert = require('assert');
const { loadApp, reset, settle, setInput, snap, runner } = require('./domHarness');

(async () => {
    const w = await loadApp();
    const { test, done } = runner('relaxationReport');
    const panel = () => w.document.getElementById('relaxationPanel');
    const generate = async () => {
        w.toasts.length = 0;
        await w.generateSchedule();
        await settle(w);
    };

    await test('conflicting pair forced into one day is recorded, shown and counted', async () => {
        // Two slots a day with only A and B: the pair must share days, so the conflict is relaxed.
        reset(w, ['A', 'B']);
        setInput(w, 'inputDefaultSlots', '2');
        setInput(w, 'inputConflicts', 'A-B');
        setInput(w, 'chkAllowBlankDays', false);
        await generate();
        const rel = snap(w, 'globalResult.relaxations');
        assert.ok(rel.length > 0, 'relaxations recorded');
        const c = rel.find((r) => r.kind === 'conflict');
        assert.ok(c, 'a conflict relaxation exists');
        assert.strictEqual(c.level, 3);
        assert.ok(c.doctors.includes('A') || c.doctors.includes('B'));
        assert.ok(!panel().classList.contains('hidden'), 'panel visible');
        assert.ok(panel().textContent.includes(`Day ${c.day}:`), 'panel names the exact day');
        assert.ok(c.doctors.length >= 2, 'conflict record names the clashing pair');
        const ok = w.toasts.find((t) => /successfully/.test(t.msg));
        assert.ok(ok && ok.msg.includes(String(rel.length)), JSON.stringify(w.toasts));
    });

    await test('clean run has no relaxations, hidden panel, no warning count', async () => {
        reset(w);
        await generate();
        assert.strictEqual(snap(w, 'globalResult.relaxations.length'), 0);
        assert.ok(panel().classList.contains('hidden'));
        assert.ok(
            w.toasts.every((t) => !/warning|คำเตือน/.test(t.msg)),
            JSON.stringify(w.toasts)
        );
    });

    await test('relaxations lower the score; conflict outweighs spacing', async () => {
        const score = (rel) =>
            w.eval(`scoreSchedule({schedule:[],tCounts:{A:0,B:0},hCounts:{A:0,B:0},wCounts:{A:0,B:0},
                relaxations:${JSON.stringify(rel)}})`);
        const r = (kind) => ({ day: 1, slot: 0, level: 2, kind, doctors: ['A'] });
        const clean = score([]);
        assert.ok(clean > score([r('spacing')]), 'clean ranks above relaxed');
        assert.strictEqual(clean - score([r('conflict')]), 50000);
        assert.strictEqual(clean - score([r('dayBeforeOff')]), 5000);
        assert.strictEqual(clean - score([r('spacing')]), 1000);
        assert.strictEqual(clean - score([r('special')]), 1000);
    });

    await test('panel and toast copy are Thai, and follow the language toggle', async () => {
        reset(w, ['A', 'B']);
        setInput(w, 'inputDefaultSlots', '2');
        setInput(w, 'inputConflicts', 'A-B');
        w.eval("currentLang = 'th'");
        await generate();
        const ok = w.toasts.find((t) => /สำเร็จ/.test(t.msg));
        assert.ok(ok && /คำเตือน \d+ รายการ/.test(ok.msg), JSON.stringify(w.toasts));
        assert.ok(panel().textContent.includes('เงื่อนไขที่ต้องผ่อนปรน'), 'Thai title');
        assert.ok(panel().textContent.includes('คู่ที่ห้ามอยู่เวรร่วมกัน'), 'Thai kind');
        w.toggleLanguage();
        assert.ok(panel().textContent.includes('Rules relaxed'), 'toggle re-renders panel');
    });

    done();
})();
