const assert = require('assert');
const { loadApp, reset, setInput, runner } = require('./domHarness');

const EVIL = '<img src=x onerror=alert(1)>';

(async () => {
    const w = await loadApp();
    const d = w.document;
    const { test, done } = runner('htmlInjection');

    await test('table notes render a hostile doctor name as text', async () => {
        reset(w, [EVIL, 'B', 'C']);
        w.eval(`offData = [{ id: 1, date: '1', names: ${JSON.stringify(EVIL)} }];`);
        await w.generateSchedule();
        w.updateDoctorAssignment(1, 0, 0); // EVIL on day 1 although they asked for it off
        assert.strictEqual(d.querySelectorAll('#scheduleTableBody img').length, 0, 'img created');
        assert.ok(d.getElementById('note-day-1').textContent.includes(EVIL), 'note text missing');
    });

    await test('calendar notes and titles escape the locked-doctor badge', async () => {
        reset(w, [EVIL, 'B', 'C']);
        setInput(w, 'chkUseSpecialRule', true);
        setInput(w, 'inputSpecialDocs', EVIL);
        setInput(w, 'inputSpecialDays', '31');
        setInput(w, 'inputOffDutyPeriod', '0');
        await w.generateSchedule();
        w.setViewMode('calendar');
        const grid = d.getElementById('calendarGrid');
        assert.strictEqual(grid.querySelectorAll('img').length, 0, 'img created');
        const badge = [...grid.querySelectorAll('span[title]')].find((s) =>
            s.title.includes('Locked')
        );
        assert.ok(
            badge && badge.title.includes(EVIL),
            'title attribute should hold the literal name'
        );
    });

    await test('override names that are not doctors are pruned on commit, never rendered', async () => {
        reset(w);
        w.eval(`pendingOverrides = { 2: { 0: '<svg onload=alert(2)>' } };`);
        await w.generateSchedule();
        assert.deepStrictEqual(JSON.parse(w.eval('JSON.stringify(manualOverrides)')), {});
        assert.ok(!d.querySelector('#btn-day-2-slot-0 span.truncate').textContent.includes('<svg'));
        w.setViewMode('calendar');
        assert.strictEqual(d.querySelectorAll('[onload]').length, 0);
    });

    await test('off-request rows escape date and names', () => {
        reset(w);
        const date = '"><img src=x onerror=alert(3)>';
        w.eval(
            `offData = [{ id: 1, date: ${JSON.stringify(date)}, names: ${JSON.stringify(EVIL)} }]; renderOffRequests();`
        );
        const list = d.getElementById('offRequestsList');
        assert.strictEqual(list.querySelectorAll('img').length, 0, 'img created');
        assert.strictEqual(list.querySelector('input[type=text]').value, date);
        assert.ok(d.getElementById('offReqBtnText-1').textContent.includes(EVIL));
    });

    await test('extra-slot rows escape their values', () => {
        reset(w);
        w.eval(
            `extraSlotsData = [{ id: 1, date: '"><img src=x id=pwn1>', slots: '"><img src=x id=pwn2>' }]; renderExtraSlots();`
        );
        assert.strictEqual(d.querySelectorAll('#extraSlotsList img').length, 0);
    });

    await test('structured rows escape names and hand them to handlers intact', () => {
        const tricky = ['<img src=x id=r1>', 'x");window.__pwn=1;//', "O'Neil"];
        reset(w, tricky);
        const calls = [];
        w.updateRoleSlot = (name, delta) => calls.push([name, delta]);
        w.updateRoleQuota = (name, delta) => calls.push([name, delta]);
        w.updateSinglePoolQuota = (name, delta) => calls.push([name, delta]);
        setInput(
            w,
            'inputDoctorRoles',
            `${tricky[0]}:R1, ${tricky[1]}:R"2, ${tricky[2]}:<img src=x id=role1>`
        );
        w.renderStructuredDoctorRoles();
        w.renderStructuredRoleSlots();
        w.renderStructuredRoleQuotas();
        w.renderStructuredSinglePoolQuotas();
        [
            'structuredDoctorRolesContainer',
            'structuredRoleSlotsContainer',
            'structuredRoleQuotasContainer',
            'structuredSinglePoolQuotasContainer',
        ].forEach((id) => assert.strictEqual(d.querySelectorAll(`#${id} img`).length, 0, id));
        d.querySelectorAll(
            '#structuredRoleSlotsContainer button, #structuredRoleQuotasContainer button, #structuredSinglePoolQuotasContainer button'
        ).forEach((b) => b.click());
        assert.strictEqual(w.__pwn, undefined, 'inline handler broke out of its string');
        const received = new Set(calls.map((c) => c[0]));
        [...tricky, 'R"2', '<img src=x id=role1>'].forEach((n) =>
            assert.ok(received.has(n), `handler never received ${n}`)
        );
    });

    await test('conflict options and chips escape their text', () => {
        const breakout = '</select><img src=x id=c1>';
        reset(w, ['A', breakout]);
        setInput(w, 'inputConflicts', `A:${breakout}`);
        w.renderStructuredConflicts();
        assert.strictEqual(d.getElementById('c1'), null, 'option text escaped its <select>');
        setInput(w, 'inputSpecialHols', EVIL);
        w.renderStructuredChips(
            'inputSpecialHols',
            'structuredSpecialHolsContainer',
            'inputSpecialHolsUI'
        );
        assert.strictEqual(d.querySelectorAll('#structuredSpecialHolsContainer img').length, 0);
        assert.ok(
            d
                .querySelector('#structuredSpecialHolsContainer .chip-tag span')
                .textContent.includes(EVIL)
        );
    });

    await test('targeted cell update shows a non-doctor name once-escaped, as text', async () => {
        reset(w);
        await w.generateSchedule();
        w.setViewMode('calendar');
        w.eval(
            `globalResult.schedule[1].selectedDocs[0] = { name: '<b>x</b>', role: 'Default' }; updateTargetedCellDOM(2, 0);`
        );
        ['btn-day-2-slot-0', 'btn-cal-day-2-slot-0'].forEach((id) => {
            const btn = d.getElementById(id);
            assert.strictEqual(btn.querySelector('span.truncate').textContent, '<b>x</b>', id);
            assert.strictEqual(btn.querySelectorAll('b').length, 0, `${id} got a <b> element`);
        });
    });

    await test('quotes in a name cannot break out of title attributes', async () => {
        const quoted = 'x" onmouseover="window.__pwn=1';
        reset(w, [quoted, 'B', 'C']);
        setInput(w, 'chkUseSpecialRule', true);
        setInput(w, 'inputSpecialDocs', quoted);
        setInput(w, 'inputSpecialDays', '31');
        setInput(w, 'inputOffDutyPeriod', '0');
        w.eval(`offData = [{ id: 1, date: '1', names: ${JSON.stringify(quoted)} }];`);
        await w.generateSchedule();
        w.updateDoctorAssignment(1, 0, 0); // targeted-update path
        assert.strictEqual(
            d.querySelectorAll('[onmouseover]').length,
            0,
            'table: attribute injected'
        );
        w.setViewMode('calendar');
        assert.strictEqual(
            d.querySelectorAll('[onmouseover]').length,
            0,
            'calendar: attribute injected'
        );
        w.updateDoctorAssignment(1, 0, 0);
        assert.strictEqual(
            d.querySelectorAll('[onmouseover]').length,
            0,
            'targeted: attribute injected'
        );
    });

    done();
})();
