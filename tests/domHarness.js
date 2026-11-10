// Shared jsdom loader for the bug-sweep tests. Not a *.test.js file, so run-tests.js skips it.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Boot index.html + the four app scripts, wait for app.js's own startup run to settle.
async function loadApp() {
    const html = fs
        .readFileSync(path.join(ROOT, 'index.html'), 'utf8')
        // tailwind.config is a CDN-era inline script that would throw in jsdom
        .replace(/<script>[\s\S]*?tailwind\.config[\s\S]*?<\/script>/g, '');
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (e) => {
        if (!String(e.message).includes('Critical Coverage Error')) console.error(e);
    });
    const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        url: 'http://localhost/',
        virtualConsole,
    });
    const w = dom.window;
    w.lucide = { createIcons() {} };
    // jsdom has no innerText; browsers treat assigning it as text, so mirror that with textContent
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
        get() {
            return this.textContent;
        },
        set(v) {
            this.textContent = v;
        },
    });
    w.localStorage.setItem('schedule_lang', 'en');
    for (const f of ['structuredInputs.js', 'translations.js', 'calendarExport.js', 'app.js']) {
        const el = w.document.createElement('script');
        el.textContent = fs.readFileSync(path.join(ROOT, f), 'utf8');
        w.document.body.appendChild(el);
    }
    while (!w.initialized || w.eval('isCalculating')) await sleep(50);
    // Record toasts instead of rendering them; the real one stays on w.realShowToast
    w.toasts = [];
    w.realShowToast = w.showToast;
    w.showToast = (msg, isError) => w.toasts.push({ msg, isError: !!isError });
    return w;
}

function setInput(w, id, value) {
    const el = w.document.getElementById(id);
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value;
}

// Known state: 4 doctors, one pool, 2 slots, Jan 2026, every optional rule off.
function reset(w, doctors = ['A', 'B', 'C', 'D']) {
    Object.entries({
        inputMonth: '1',
        inputYear: '2026',
        inputDefaultSlots: '2',
        inputOffDutyPeriod: '1',
        inputMinNightShifts: '0',
        inputSpecialHols: '',
        inputNoDuty: '',
        inputSpecialDocs: '',
        inputSpecialDays: '0',
        inputConflicts: '',
        inputDoctorRoles: '',
        inputDefaultRoleSlots: '',
        inputRoleQuotas: '',
        inputSinglePoolQuota: '',
        inputMorningSlots: '1',
        inputAfternoonSlots: '1',
        inputNightSlots: '1',
        chkCustomDateRange: false,
        chkRoleBased: false,
        chkShiftBased: false,
        chkAllowBlankDays: false,
        chkUseSpecialRule: false,
    }).forEach(([id, v]) => setInput(w, id, v));
    w.eval(`
        doctors.length = 0; doctors.push(...${JSON.stringify(doctors)});
        offData = []; extraSlotsData = []; manualOverrides = {}; undoStack.length = 0; overridesPeriod = null; pendingOverrides = null;
        isCustomDateRange = false; globalResult = null; viewMode = 'table'; currentLang = 'en';
        scheduleDates = Array.from({ length: 31 }, (_, i) => new Date(2026, 0, i + 1));
    `);
    w.toasts.length = 0;
}

async function settle(w) {
    while (w.eval('isCalculating')) await sleep(20);
}

// JSON round trip: deepStrictEqual across the jsdom and Node realms fails on prototypes
const snap = (w, expr) => JSON.parse(w.eval(`JSON.stringify(${expr})`));

async function importJSON(w, objOrText) {
    const text = typeof objOrText === 'string' ? objOrText : JSON.stringify(objOrText);
    w.importConfigJSON({ target: { files: [new w.File([text], 'config.json')] } });
    await sleep(100); // FileReader is async
    await settle(w);
}

function runner(label) {
    let total = 0;
    let passed = 0;
    return {
        async test(name, fn) {
            total++;
            try {
                await fn();
                console.log(`✅ [PASSED] ${name}`);
                passed++;
            } catch (err) {
                console.error(`❌ [FAILED] ${name}`);
                console.error(err.message);
            }
        },
        done() {
            console.log(`\n${label}: PASSED: ${passed}/${total}, FAILED: ${total - passed}`);
            process.exit(passed === total ? 0 : 1);
        },
    };
}

module.exports = { loadApp, reset, settle, setInput, snap, importJSON, runner, sleep };
