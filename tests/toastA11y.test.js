// Toast and relaxation panel are announced to screen readers; multi-line toasts keep their line breaks.
const assert = require('assert');
const { loadApp, runner } = require('./domHarness');

(async () => {
    const w = await loadApp();
    const { test, done } = runner('toastA11y');
    const $ = (id) => w.document.getElementById(id);

    await test('F7: #toast is a polite atomic status region', async () => {
        assert.strictEqual($('toast').getAttribute('role'), 'status');
        assert.strictEqual($('toast').getAttribute('aria-live'), 'polite');
        assert.strictEqual($('toast').getAttribute('aria-atomic'), 'true');
    });

    await test('F7: #relaxationPanel is a polite status region', async () => {
        assert.strictEqual($('relaxationPanel').getAttribute('role'), 'status');
        assert.strictEqual($('relaxationPanel').getAttribute('aria-live'), 'polite');
    });

    await test('F7: an error toast is assertive, the next normal toast polite again', async () => {
        w.realShowToast('bad', true);
        assert.strictEqual($('toast').getAttribute('aria-live'), 'assertive');
        w.realShowToast('ok', false);
        assert.strictEqual($('toast').getAttribute('aria-live'), 'polite');
    });

    await test('F8: the toast message span keeps line breaks (whitespace-pre-line), still escaped', async () => {
        w.realShowToast('Dr. A: <b>x</b>\nDr. B: y', true);
        const span = $('toastMsg');
        assert.ok(span.classList.contains('whitespace-pre-line'), span.className);
        assert.ok(span.textContent.includes('\n'), 'newline lost');
        assert.ok(!span.querySelector('b'), 'markup was not escaped');
        w.realShowToast('ok', false);
        assert.ok($('toastMsg').classList.contains('whitespace-pre-line'));
    });

    done();
})();
