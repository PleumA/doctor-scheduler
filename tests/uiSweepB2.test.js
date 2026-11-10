const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadApp, reset, settle, runner } = require('./domHarness');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const key = (w, k, e = {}) =>
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, ...e }));

(async () => {
    const w = await loadApp();
    const T = w.eval('translations');
    const d = w.document;
    const { test, done } = runner('uiSweepB2');
    const chips = (id) => d.getElementById(id).value;
    const fire = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));

    await test('B9 extra-slot placeholder, title and meta follow the language', async () => {
        reset(w);
        w.addExtraSlotRow();
        const ph = () => d.querySelector('#extraSlotsList input[type=text]').placeholder;
        assert.ok(!/[฀-๿]/.test(ph()), ph());
        w.toggleLanguage();
        assert.ok(/[฀-๿]/.test(ph()), ph());
        assert.ok(/[฀-๿]/.test(d.title));
        w.toggleLanguage();
        assert.ok(!/[฀-๿]/.test(d.title), d.title);
        assert.ok(!/[฀-๿]/.test(d.querySelector('meta[name=description]').content));
        await settle(w);
    });

    await test('B10 icon-only buttons carry translated aria-labels', async () => {
        reset(w);
        d.getElementById('inputNoDuty').value = '5';
        w.renderStructuredChips('inputNoDuty', 'structuredNoDutyContainer', 'inputNoDutyUI');
        w.addStructuredConflictPair();
        w.addExtraSlotRow();
        w.renderDoctorTags();
        w.renderStructuredSinglePoolQuotas();
        const bad = [...d.querySelectorAll('button')].filter(
            (b) => !b.textContent.trim() && !b.getAttribute('aria-label')
        );
        assert.deepStrictEqual(
            bad.map((b) => b.outerHTML.slice(0, 90)),
            []
        );
        w.toggleLanguage();
        const l = d
            .querySelector('#structuredSinglePoolQuotasContainer button')
            .getAttribute('aria-label');
        assert.ok(/[฀-๿]/.test(l), l);
        const tag = d.querySelector('.doctor-tag button').getAttribute('aria-label');
        assert.ok(/[฀-๿]/.test(tag) && tag.includes('A'), tag);
        w.toggleLanguage();
        await settle(w);
    });

    await test('B10 print stylesheet exists', () => {
        const html = src('index.html');
        const m = html.match(/@media print\s*{[\s\S]*?\n {8}}/);
        assert.ok(m, 'no @media print');
        ['header', '#settingsPanel', '#scheduleToolbar', '#fairnessStrip', '#toast'].forEach((s) =>
            assert.ok(m[0].includes(s), s)
        );
    });

    await test('B4 popover panel text colour is set', () => {
        const html = src('index.html');
        assert.ok(/#settingsPanel:popover-open\s*{[^}]*color:\s*#14252c/.test(html));
        assert.ok(/\.dark #settingsPanel:popover-open\s*{[^}]*color:\s*#e6eeec/.test(html));
    });

    await test('B5 mobile sheet: i18n, dialog, Escape, backdrop, focus', async () => {
        reset(w);
        await w.generateSchedule();
        w.innerWidth = 390;
        const sheet = d.getElementById('mobileDoctorSheet');
        const cell = d.querySelector('#btn-day-1-slot-0');
        cell.focus();
        cell.click();
        assert.ok(!sheet.classList.contains('hidden'));
        const html = d.getElementById('mobileDoctorList').innerHTML;
        assert.ok(!/[฀-๿]/.test(html), 'Thai in English UI');
        assert.ok(html.includes(T.en.shortageSlot));
        const dlg = sheet.querySelector('[role=dialog]');
        assert.ok(dlg && dlg.getAttribute('aria-modal') === 'true');
        assert.ok(sheet.contains(d.activeElement), 'focus inside sheet');
        key(w, 'Escape');
        assert.ok(sheet.classList.contains('hidden'), 'Escape closes');
        assert.strictEqual(d.activeElement, cell, 'focus returns');
        cell.click();
        assert.ok(!sheet.classList.contains('hidden'));
        sheet.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        assert.ok(sheet.classList.contains('hidden'), 'backdrop closes');
        w.toggleLanguage();
        cell.click();
        assert.ok(d.getElementById('mobileDoctorList').innerHTML.includes(T.th.shortageSlot));
        w.closeMobileSheet();
        w.toggleLanguage();
        w.innerWidth = 1024;
        await settle(w);
    });

    await test('B6 manual modal: inert when closed, dialog, Escape on document', () => {
        const modal = d.getElementById('manualModal');
        w.closeManualModal(); // first visit opens it on its own
        assert.ok(modal.hasAttribute('inert'), 'inert while closed');
        w.openManualModal();
        assert.ok(!modal.hasAttribute('inert'));
        const card = modal.querySelector('.relative');
        assert.strictEqual(card.getAttribute('role'), 'dialog');
        assert.strictEqual(card.getAttribute('aria-modal'), 'true');
        assert.ok(d.getElementById(card.getAttribute('aria-labelledby')));
        key(w, 'Escape');
        assert.ok(modal.hasAttribute('inert') && modal.classList.contains('opacity-0'));
    });

    await test('U3 manual sections 3 and 4 describe relaxing', () => {
        const t = T;
        for (const l of ['th', 'en']) {
            assert.ok(
                !/never puts them|ระบบจะไม่จัดสองคนนี้ในวันเดียวกัน หาก/.test(
                    t[l].manualSection3Body
                ),
                l
            );
        }
        assert.ok(/enough doctors/i.test(t.en.manualSection3Body));
        assert.ok(/Allow Blank Days/i.test(t.en.manualSection3Body));
        const html = src('index.html');
        assert.ok(html.includes(t.th.manualSection3Body.slice(0, 40)));
        assert.ok(html.includes(t.th.manualSection4Body.slice(0, 40)));
    });

    done();
})();
