// reset-all is local; cell dropdowns stay live after a pick; focus returns to the cell; footer contrast
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadApp, reset: baseReset, settle, setInput, snap, runner, validIdx } = require('./domHarness');
// No rest window: these tests make arbitrary edits, which the override validator would reject inside one
const reset = (w, docs) => {
    baseReset(w, docs);
    setInput(w, 'inputOffDutyPeriod', '0');
};

(async () => {
    const w = await loadApp();
    const d = w.document;
    const { test, done } = runner('lastFixes');
    const names = (day) => snap(w, `globalResult.schedule[${day - 1}].selectedDocs.map(s=>s.name)`);
    const ov = () => snap(w, 'manualOverrides');

    await test('clear-all with invalid inputs restores auto locally, no error, undo restores edits', async () => {
        reset(w);
        await w.generateSchedule();
        const auto = names(6);
        w.updateDoctorAssignment(6, 0, validIdx(w, 6, 0, auto[0] === 'C' ? 1 : 2));
        const edited = names(6);
        assert.notDeepStrictEqual(edited, auto);
        setInput(w, 'inputSinglePoolQuota', 'A:1'); // a run would now fail
        w.toasts.length = 0;
        w.clearManualOverrides();
        await settle(w);
        assert.deepStrictEqual(names(6), auto);
        assert.deepStrictEqual(ov(), {});
        assert.ok(!w.toasts.some((t) => t.isError), JSON.stringify(w.toasts));
        assert.strictEqual(
            d.getElementById('btn-day-6-slot-0').querySelector('span.truncate').textContent,
            auto[0]
        );
        w.undoLastAction();
        assert.deepStrictEqual(names(6), edited);
        assert.deepStrictEqual(Object.keys(ov()), ['6']);
    });

    await test('clear-all with no overrides does nothing', async () => {
        reset(w);
        await w.generateSchedule();
        w.toasts.length = 0;
        const n = snap(w, 'undoStack.length');
        w.clearManualOverrides();
        assert.strictEqual(w.toasts.length, 0);
        assert.strictEqual(snap(w, 'undoStack.length'), n);
    });

    for (const [view, btn, dd] of [
        ['table', 'btn-day-5-slot-0', 'tablecelldropdown-5-0'],
        ['calendar', 'btn-cal-day-5-slot-0', 'celldropdown-5-0'],
    ]) {
        await test(`${view} dropdown is live and focus returns after a pick`, async () => {
            reset(w);
            await w.generateSchedule();
            w.setViewMode('calendar');
            const b = d.getElementById(btn);
            b.click();
            const menu = d.getElementById(dd);
            assert.ok(!menu.classList.contains('hidden'));
            const opts = [...menu.querySelectorAll('button')];
            const target = opts.find((o) => o.textContent.trim() === 'D') || opts[1];
            const pick = target.textContent.trim();
            target.click();
            assert.strictEqual(d.activeElement, d.getElementById(btn), 'focus on cell button');
            b.click();
            const after = [...d.getElementById(dd).querySelectorAll('button')];
            assert.ok(
                after.some((o) => /resetCell|reset/i.test(o.getAttribute('onclick') || '')),
                'reset to auto present'
            );
            const cur = after.find((o) => o.className.includes('border-duty'));
            assert.ok(cur && cur.textContent.trim() === pick, `highlight on ${pick}`);
        });
    }

    await test('footer text meets contrast classes', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        const f = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
        assert.ok(!/text-slate-400 dark:text-slate-500 text-center/.test(f));
        assert.strictEqual(
            (f.match(/text-ink-2 dark:text-slate-400 text-center/g) || []).length,
            2
        );
    });

    done();
})();
