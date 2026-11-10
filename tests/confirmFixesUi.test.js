// Confirmation-review UI fixes: live cell aria-labels, undo button, dropdown close, a11y names, i18n, print.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    loadApp,
    reset: baseReset,
    settle,
    setInput,
    snap,
    runner,
    validIdx,
} = require('./domHarness');
// No rest window: these tests make arbitrary edits, which the override validator would reject inside one
const reset = (w, docs) => {
    baseReset(w, docs);
    setInput(w, 'inputOffDutyPeriod', '0');
};

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const hasThai = (s) => /[฀-๿]/.test(s);

(async () => {
    const w = await loadApp();
    const d = w.document;
    const T = w.eval('translations.en');
    const { test, done } = runner('confirmFixesUi');
    const key = (k, target = d) =>
        target.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
    const undoBtn = () => d.getElementById('btnUndo');

    await test('U1 cell aria-label follows an edit (table and calendar)', async () => {
        reset(w);
        await w.generateSchedule();
        w.setViewMode('calendar'); // render the calendar buttons too
        w.setViewMode('table');
        const di = validIdx(w, 5, 0, 3);
        const picked = snap(w, 'globalResult.doctors')[di];
        w.updateDoctorAssignment(5, 0, di);
        for (const id of ['btn-day-5-slot-0', 'btn-cal-day-5-slot-0']) {
            const l = d.getElementById(id).getAttribute('aria-label');
            assert.ok(l.includes(`Current: ${picked}.`), `${id}: ${l}`);
        }
        w.resetSlotToAuto(5, 0);
        const auto = snap(w, 'globalResult.schedule[4].selectedDocs[0].name');
        assert.ok(
            d
                .getElementById('btn-day-5-slot-0')
                .getAttribute('aria-label')
                .includes(`Current: ${auto}.`)
        );
    });

    await test('U2 off-request delete button has an accessible name', async () => {
        reset(w);
        w.addOffRow();
        const b = d.querySelector('#offRequestsList button[onclick^="deleteOffRow"]');
        assert.ok(b && b.getAttribute('aria-label').startsWith(T.ariaRemove), b && b.outerHTML);
    });

    await test('U3 Undo button shows only while there is something to undo', async () => {
        reset(w);
        await w.generateSchedule();
        assert.ok(undoBtn(), 'button exists');
        assert.strictEqual(undoBtn().getAttribute('onclick'), 'undoLastAction()');
        assert.strictEqual(undoBtn().querySelector('span').getAttribute('data-i18n'), 'undoBtn');
        assert.strictEqual(undoBtn().getAttribute('data-i18n-aria'), 'undoBtn');
        assert.ok(undoBtn().classList.contains('hidden'), 'hidden initially');
        w.updateDoctorAssignment(5, 0, validIdx(w, 5, 0, 3));
        assert.ok(!undoBtn().classList.contains('hidden'), 'shown after an edit');
        w.undoLastAction();
        assert.ok(undoBtn().classList.contains('hidden'), 'hidden after undoing the only edit');
        w.updateDoctorAssignment(5, 0, validIdx(w, 5, 0, 3));
        setInput(w, 'inputMonth', '2');
        await w.generateSchedule();
        assert.ok(
            undoBtn().classList.contains('hidden'),
            'hidden after the stack is cleared on commit'
        );
        assert.ok(T.undoBtn && w.eval('translations.th.undoBtn'), 'both languages');
    });

    await test('M1 role-mismatch note is English in English mode', async () => {
        reset(w);
        setInput(w, 'chkRoleBased', true);
        setInput(w, 'inputDoctorRoles', 'A:R1, B:R2, C:R1, D:R2');
        setInput(w, 'inputDefaultRoleSlots', 'R1:1, R2:1');
        await w.generateSchedule();
        const row = () => snap(w, 'globalResult.schedule[4]');
        const r1 = row().selectedDocs[0].role;
        // A role mismatch can only arrive unvalidated (e.g. an imported override): bypass the validator
        w.isDragAndDropOperation = true;
        w.updateDoctorAssignment(5, 0, r1 === 'R1' ? 1 : 0); // a doctor of the other role
        w.isDragAndDropOperation = false;
        const note = row().note;
        assert.ok(/Role Mismatch/.test(note), note);
        assert.ok(!hasThai(note), note);
        setInput(w, 'chkRoleBased', false);
    });

    await test('M2 cell dropdown closes after a choice and on Escape', async () => {
        reset(w);
        await w.generateSchedule();
        const dd = () => d.getElementById('tablecelldropdown-5-0');
        const ev = { stopPropagation() {} };
        w.openCellDropdown(ev, 'tablecelldropdown-5-0');
        assert.ok(!dd().classList.contains('hidden'), 'opened');
        w.updateDoctorAssignment(5, 0, validIdx(w, 5, 0, 2));
        assert.ok(dd().classList.contains('hidden'), 'closed after selection');
        w.openCellDropdown(ev, 'tablecelldropdown-5-0');
        key('Escape');
        assert.ok(dd().classList.contains('hidden'), 'closed by Escape');
        assert.strictEqual(d.activeElement.id, 'btn-day-5-slot-0');
    });

    await test('M3 every visible form control has an accessible name', async () => {
        reset(w);
        w.eval(`doctors.length = 0; doctors.push('A','B','C','D');`);
        setInput(w, 'chkRoleBased', true);
        setInput(w, 'inputDoctorRoles', 'A:R1, B:R2, C:R1, D:R2');
        setInput(w, 'inputSinglePoolQuota', 'A:3');
        w.renderDoctorTags();
        w.renderStructuredDoctorRoles();
        w.addStructuredConflictPair();
        w.addOffRow();
        w.addExtraSlotRow();
        w.renderStructuredSinglePoolQuotas();
        const text = (id) => (d.getElementById(id) || { textContent: '' }).textContent.trim();
        const named = (el) =>
            (el.getAttribute('aria-label') || '').trim() ||
            (el.getAttribute('aria-labelledby') || '').split(/\s+/).some((i) => text(i)) ||
            [...d.querySelectorAll('label')].some(
                (l) => l.textContent.trim() && ((l.htmlFor === el.id && el.id) || l.contains(el))
            );
        const bad = [...d.querySelectorAll('input, select, textarea')]
            .filter((el) => el.type !== 'hidden' && !el.classList.contains('hidden'))
            .filter((el) => !named(el))
            .map((el) => el.outerHTML.slice(0, 80));
        assert.deepStrictEqual(bad, []);
    });

    await test('M4 footer credit is translated', async () => {
        const f = () => d.querySelector('footer').textContent;
        assert.ok(!hasThai(f()));
        assert.ok(d.querySelector('footer a[href*="github.com"]'), 'GitHub link kept');
        w.toggleLanguage();
        assert.ok(hasThai(f()), f());
        assert.ok(d.querySelector('footer a[href*="github.com"]'));
        w.toggleLanguage();
        await settle(w);
    });

    await test('M5 role prompt matches case-insensitively and rejects __NEW__', async () => {
        reset(w);
        w.eval(`doctors.length = 0; doctors.push('A','B');`);
        setInput(w, 'chkRoleBased', true);
        setInput(w, 'inputDoctorRoles', 'A:R1, B:R2');
        w.renderStructuredDoctorRoles();
        const sel = () => d.querySelectorAll('.doc-role-select')[0];
        const ask = (answer) => {
            w.prompt = () => answer;
            sel().value = '__NEW__';
            w.handleDocRoleSelectChange(sel());
        };
        ask('r2');
        assert.strictEqual(sel().value, 'R2');
        assert.strictEqual(
            [...sel().options].filter((o) => o.value.toLowerCase() === 'r2').length,
            1
        );
        ask('__NEW__');
        assert.strictEqual(sel().value, 'R2', 'reserved name rejected, previous role kept');
        assert.ok(
            ![...sel().options].some((o) => o.value === '__NEW__' && o.textContent === '__NEW__')
        );
        await settle(w);
    });

    await test('M5 muted hints are readable in dark mode; Thai manual has no doubled phrase', async () => {
        const html = src('index.html');
        assert.ok(
            /text-slate-400 dark:text-slate-400 mt-2 leading-relaxed|dark:text-slate-400 mt-2 leading-relaxed/.test(
                html
            )
        );
        reset(w);
        w.renderOffRequests();
        w.renderExtraSlots();
        for (const sel of ['#offRequestsList p', '#extraSlotsList p']) {
            const p = d.querySelector(sel);
            assert.ok(
                p && p.className.includes('dark:text-slate-400'),
                `${sel}: ${p && p.className}`
            );
        }
        assert.ok(!/ใน 'กำหนดพิเศษ' ในส่วน 'กำหนดพิเศษ'/.test(src('translations.js')));
    });

    await test('M6 print stylesheet restores the table layout', () => {
        const m = src('index.html').match(/@media print\s*{[\s\S]*?\n {8}}/)[0];
        for (const s of ['#scheduleTableHeader', 'display: table-row', 'display: table-cell'])
            assert.ok(m.includes(s), s);
    });

    done();
})();
