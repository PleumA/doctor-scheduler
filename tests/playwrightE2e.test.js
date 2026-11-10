// End-to-end check in a real browser. Runs last in `npm test`; uses the system Chrome
// through playwright-core, so no browser download is needed.
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');

const APP_URL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

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

async function waitFor(page, fn, timeout = 10000) {
    const started = process.hrtime.bigint();
    for (;;) {
        if (await fn()) return;
        if (Number(process.hrtime.bigint() - started) / 1e6 > timeout)
            throw new Error('timed out waiting for condition');
        await page.waitForTimeout(100);
    }
}

(async () => {
    const browser = await chromium.launch({
        executablePath: CHROME,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);

    // Skip the first-visit manual modal; localStorage may be unavailable on file://
    await page.addInitScript(() => {
        try {
            localStorage.setItem('hasSeenManual', 'true');
            localStorage.setItem('schedule_dark', 'false');
            localStorage.setItem('schedule_lang', 'en');
        } catch {
            /* ignore */
        }
    });

    try {
        await page.goto(APP_URL, { waitUntil: 'load' });
        await page.waitForSelector('#resultsContainer:not(.hidden)');
        await waitFor(page, async () => (await page.locator('#scheduleTableBody tr').count()) > 0);

        await test('a schedule renders from the default roster', async () => {
            const rows = await page.locator('#scheduleTableBody tr').count();
            assert.ok(rows >= 28, `expected a month of rows, got ${rows}`);
            const totalDuties = await page.locator('#statTotalDuties').innerText();
            assert.ok(parseInt(totalDuties, 10) > 0, `total duties not set: "${totalDuties}"`);
            assert.ok((await page.locator('#fairnessStrip .doc-chip').count()) >= 6);
        });

        await test('default roster meets the 14-shift floor', async () => {
            const data = await page.evaluate(() => ({
                floor: globalResult.config.minNightShifts,
                totals: globalResult.summary.map((s) => s.total),
                plan: globalResult.config.floorPlan,
                note: document.getElementById('floorPlanNote').textContent,
            }));
            assert.strictEqual(data.floor, 14, 'floor not applied');
            assert.ok(data.totals.length > 0, 'no summary');
            assert.ok(
                data.totals.every((t) => t >= 14),
                `totals below the floor: ${data.totals}`
            );
            assert.ok(data.plan && data.plan.extrasNeeded >= 0, 'no floor plan');
            assert.ok(/Plan:|แผน:/.test(data.note), `plan note: "${data.note}"`);
        });

        await test('duty-sheet identity is applied', async () => {
            const bodyBg = await page.evaluate(
                () => getComputedStyle(document.body).backgroundColor
            );
            assert.strictEqual(bodyBg, 'rgb(242, 245, 244)', 'paper page background');
            const headerBg = await page.evaluate(
                () => getComputedStyle(document.querySelector('header')).backgroundColor
            );
            assert.strictEqual(headerBg, 'rgb(20, 37, 44)', 'ink masthead');
            const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
            assert.ok(font.includes('Anuphan'), `body font is ${font}`);
            const spine = await page.evaluate(() => {
                const chip = document.querySelector('.doc-chip');
                const s = getComputedStyle(chip);
                return { width: s.borderLeftWidth, color: s.borderLeftColor };
            });
            assert.strictEqual(spine.width, '4px', 'doctor chip spine width');
            assert.notStrictEqual(spine.color, 'rgba(0, 0, 0, 0)', 'doctor chip spine colour');
        });

        await test('weekends carry a semantic edge', async () => {
            const edge = page.locator('#scheduleTableBody .weekend-edge').first();
            assert.ok((await edge.count()) > 0, 'no weekend row');
            const shadow = await edge.evaluate((el) => getComputedStyle(el).boxShadow);
            assert.ok(shadow !== 'none' && shadow.includes('inset'), `edge shadow: ${shadow}`);
        });

        await test('table, calendar and person views switch', async () => {
            await page.click('#btnCalendarView');
            await waitFor(page, () => page.locator('#calendarViewContainer').isVisible());
            assert.ok(
                !(await page.locator('#tableViewContainer').isVisible()),
                'table still visible'
            );
            assert.ok((await page.locator('#calendarGrid > div').count()) > 0, 'calendar empty');

            await page.click('#btnPersonView');
            await waitFor(page, () => page.locator('#personViewContainer').isVisible());
            assert.ok((await page.locator('#personViewBody tr').count()) > 0, 'person rows empty');

            await page.click('#btnTableView');
            await waitFor(page, () => page.locator('#tableViewContainer').isVisible());
        });

        await test('phone settings drawer opens and closes with Escape', async () => {
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForTimeout(200);
            assert.ok(await page.locator('#btnSettings').isVisible(), 'settings button hidden');
            await page.click('#btnSettings');
            await waitFor(page, () => page.locator('#settingsPanel').isVisible());
            await page.keyboard.press('Escape');
            await waitFor(page, async () => !(await page.locator('#settingsPanel').isVisible()));
            await page.setViewportSize({ width: 1440, height: 1000 });
        });

        await test('print view keeps the document header and hides chrome', async () => {
            await page.emulateMedia({ media: 'print' });
            assert.ok(await page.locator('#printHeader').isVisible(), 'print header hidden');
            assert.ok(!(await page.locator('header').isVisible()), 'masthead printed');
            const period = await page.locator('#printPeriod').innerText();
            assert.ok(period.trim().length > 0, 'print period empty');
            await page.emulateMedia({ media: 'screen' });
        });
    } finally {
        await browser.close();
    }

    console.log(`\nplaywrightE2e: PASSED: ${passed}/${total}, FAILED: ${total - passed}`);
    process.exit(passed === total ? 0 : 1);
})().catch((err) => {
    console.error('❌ [FAILED] playwrightE2e crashed');
    console.error(err);
    process.exit(1);
});
