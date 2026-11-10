const assert = require('assert');
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');

let indexHtml = fs.readFileSync('index.html', 'utf8');
// Strip tailwind config script to prevent "tailwind is not defined" during JSDOM parsing
indexHtml = indexHtml.replace(/<script>[\s\S]*?tailwind\.config[\s\S]*?<\/script>/g, '');

// app.js auto-generates on load; the bare jsdom page has roles but no doctors, so that startup
// run throws a Critical Coverage Error. It is jsdom-environment noise: drop only that message.
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => {
    if (!String(e.message).includes('Critical Coverage Error')) console.error(e);
});
const dom = new JSDOM(indexHtml, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    virtualConsole,
});
const window = dom.window;
const document = window.document;
window.lucide = { createIcons: () => {} };

for (const file of ['structuredInputs.js', 'translations.js', 'calendarExport.js', 'app.js']) {
    const el = document.createElement('script');
    el.textContent = fs.readFileSync(file, 'utf8');
    document.body.appendChild(el);
}

let totalTests = 0;
let passedTests = 0;
function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        console.log(`✅ [PASSED] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`❌ [FAILED] ${name}`);
        console.error(err);
    }
}

const cardOf = (key) => document.querySelector(`[data-i18n="${key}"]`).closest('details, .sheet');

runTest('rarely used cards are collapsible and start closed', () => {
    ['docsPerDay', 'advSettings'].forEach((key) => {
        const card = document.querySelector(`[data-i18n="${key}"]`).closest('details');
        assert.ok(card, `${key} card is not a <details>`);
        assert.strictEqual(card.open, false, `${key} should start closed`);
        assert.ok(
            card.querySelector(':scope > summary [data-i18n="' + key + '"]'),
            `${key} title must be in <summary>`
        );
    });
});

runTest('cards with header controls stay plain (no controls inside a summary)', () => {
    ['basicSettings', 'offRequests', 'lockSpecial'].forEach((key) => {
        assert.strictEqual(
            document.querySelector(`[data-i18n="${key}"]`).closest('details'),
            null,
            key
        );
    });
    document.querySelectorAll('summary').forEach((s) => {
        assert.strictEqual(
            s.querySelector('button, input, select, a'),
            null,
            'interactive control inside <summary>'
        );
    });
});

runTest('settings pane is 340px wide and the schedule views have no 600px cap', () => {
    assert.ok(cardOf('basicSettings').closest('section').className.includes('lg:w-[340px]'));
    ['tableViewContainer', 'calendarViewContainer', 'personViewContainer'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) assert.ok(!el.className.includes('max-h-[600px]'), `${id} still capped`);
    });
});

runTest('settings column is a native popover opened by the header button', () => {
    const panel = document.getElementById('settingsPanel');
    assert.ok(panel, '#settingsPanel missing');
    assert.strictEqual(panel.getAttribute('popover'), 'auto');
    assert.ok(
        panel.querySelector('[data-i18n="basicSettings"]'),
        'panel must be the settings column'
    );
    const btn = document.getElementById('btnSettings');
    assert.strictEqual(btn.getAttribute('popovertarget'), 'settingsPanel');
    assert.ok(btn.className.includes('lg:hidden'));
});

runTest('spread tile and View schedule button are gone; new keys exist in th and en', () => {
    assert.strictEqual(document.getElementById('statSpread'), null);
    assert.strictEqual(document.querySelector('.mobile-view-btn'), null);
    const t = window.eval('translations');
    ['settingsBtn', 'summaryDetailsLabel'].forEach((k) => assert.ok(t.th[k] && t.en[k], k));
    assert.strictEqual(t.th.viewScheduleBtn, undefined);
});

const strip = () => document.getElementById('fairnessStrip');
const chips = () => [...strip().querySelectorAll('span.doc-chip')];

runTest('fairness row: one chip per doctor, ring only on the furthest from the mean', () => {
    window.renderFairnessStrip([
        { name: 'A', total: 10 },
        { name: 'B', total: 11 },
        { name: 'C', total: 10 },
        { name: 'D', total: 14 },
    ]);
    assert.strictEqual(chips().length, 4);
    const ringed = chips()
        .filter((c) => c.className.includes('ring-signal'))
        .map((c) => c.textContent.trim());
    assert.deepStrictEqual(ringed, ['D 14']);
    assert.ok(strip().textContent.includes('10–14'), 'spread min–max shown');
});

runTest('fairness row: equal totals or a single doctor → no ring', () => {
    window.renderFairnessStrip([
        { name: 'A', total: 10 },
        { name: 'B', total: 10 },
    ]);
    assert.strictEqual(chips().filter((c) => c.className.includes('ring-signal')).length, 0);
    window.renderFairnessStrip([{ name: 'A', total: 7 }]);
    assert.strictEqual(chips().filter((c) => c.className.includes('ring-signal')).length, 0);
});

runTest('fairness row: names render as text (no HTML injection), empty summary clears it', () => {
    window.renderFairnessStrip([{ name: '<img src=x onerror=alert(1)>', total: 3 }]);
    assert.strictEqual(strip().querySelector('img'), null);
    window.renderFairnessStrip([]);
    assert.strictEqual(strip().innerHTML, '');
});

runTest('full summary table lives in a <details> that starts open', () => {
    const d = document.getElementById('summaryTableBody').closest('details');
    assert.ok(d, 'summary table not inside <details>');
    assert.strictEqual(d.open, true);
});

runTest('phone CSS turns table rows into cards without sideways scroll', () => {
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    const m = css.match(/@media \(max-width: 767px\) \{([\s\S]*?)\n {8}\}/);
    assert.ok(m, 'no @media (max-width: 767px) block');
    const block = m[1];
    assert.ok(
        /#tableViewContainer table\s*\{[^}]*min-width:\s*0/.test(block),
        'table min-width not reset'
    );
    assert.ok(/#scheduleTableHeader\s*\{[^}]*display:\s*none/.test(block), 'header not hidden');
    assert.ok(/#scheduleTableBody tr\s*\{[^}]*display:\s*flex/.test(block), 'rows not flex cards');
    assert.ok(
        /#scheduleTableBody td:empty\s*\{[^}]*display:\s*none/.test(block),
        'empty note cell not hidden'
    );
    assert.ok(
        /#scheduleTableBody td:nth-child\(2\)\s*\{[^}]*flex:\s*1 0 auto/.test(block),
        'day cell does not fill line 1'
    );
    assert.ok(
        /#scheduleTableBody td:nth-child\(2\)\s*\{[^}]*min-width:\s*60%/.test(block),
        'day cell lost min-width: 60%, which is what pushes the duties to line 2'
    );
});

runTest('phone header scrolls away and drops the subtitle (<768px)', () => {
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    const header = document.querySelector('header');
    assert.ok(/\bmd:sticky\b/.test(header.className), 'header should be sticky only from md up');
    assert.ok(!/(^|\s)sticky(\s|$)/.test(header.className), 'bare sticky class still on header');
    assert.ok(!/position:\s*static\s*!important/.test(css), '!important override still present');
    // The critical CSS applies at every width, so it must not make the header sticky itself
    const outsideMin = css.replace(/@media \(min-width[^{]*\{[\s\S]*?\n {8}\}/g, '');
    assert.ok(
        !/(^|[\s}])header\s*\{[^}]*position:\s*sticky/.test(outsideMin),
        'a style rule sets position: sticky on header at every width'
    );
    const sub = document.querySelector('[data-i18n="subtitle"]');
    assert.ok(
        sub.className.includes('hidden') && sub.className.includes('md:block'),
        'subtitle not hidden on phones'
    );
});

console.log(`\nPASSED: ${passedTests}/${totalTests}, FAILED: ${totalTests - passedTests}`);
if (passedTests !== totalTests) process.exit(1);
