const fs = require('fs');
const assert = require('assert');

const mockDOM = {};
global.document = {
    getElementById: (id) => {
        if (!mockDOM[id]) {
            mockDOM[id] = {
                value: '',
                checked: false,
                classList: { add: () => {}, remove: () => {} },
                innerHTML: '',
                style: {},
                setAttribute: () => {},
                innerText: '',
                querySelector: () => ({ innerHTML: '' }),
            };
        }
        return mockDOM[id];
    },
    createElement: () => ({
        setAttribute: () => {},
        appendChild: () => {},
        classList: { add: () => {}, remove: () => {} },
        click: () => {},
        remove: () => {},
    }),
    body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } },
    addEventListener: () => {},
    documentElement: { lang: 'en', classList: { add: () => {}, remove: () => {} } },
    querySelectorAll: () => [],
};

global.window = {
    innerWidth: 1024,
    XLSX: {},
    addEventListener: () => {},
    setTimeout: (fn) => fn(),
};

global.navigator = { clipboard: { writeText: async () => {} } };
global.currentLang = 'th';
global.translations = { en: {}, th: {} };
global.lucide = { createIcons: () => {} };
global.localStorage = { getItem: () => 'th', setItem: () => {} };
global.doctors = [];
global.scheduleDates = [];
global.isCustomDateRange = false;

let toastMessages = [];
global.showToast = (msg, isError = false) => {
    toastMessages.push({ msg, isError });
};

function resetMocks() {
    Object.keys(mockDOM).forEach((key) => delete mockDOM[key]);
    mockDOM['selectCalendarScope'] = { value: '', innerHTML: '', options: [] };
    toastMessages = [];

    mockDOM['inputMonth'] = { value: '1', classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputYear'] = { value: '2026', classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputDefaultSlots'] = { value: '1', classList: { add: () => {}, remove: () => {} } };
    mockDOM['chkRoleBased'] = { checked: false };
    mockDOM['inputDoctorRoles'] = { value: '' };
    mockDOM['inputRoleQuotas'] = { value: '' };
    mockDOM['inputDefaultRoleSlots'] = { value: '' };
    mockDOM['inputConflicts'] = { value: '' };
    mockDOM['inputSpecialHols'] = { value: '' };
    mockDOM['inputNoDuty'] = { value: '' };
    mockDOM['chkAllowBlankDays'] = { checked: false };
    mockDOM['inputOffDutyPeriod'] = { value: '0' };
    mockDOM['chkBalanceShifts'] = { checked: true };
    mockDOM['btnCalculate'] = { innerHTML: 'Calc' };

    global.doctors = [];
    global.offData = [];
    global.extraSlotsData = [];
    global.isCustomDateRange = false;
    global.scheduleDates = [];
    global.isCalculating = false;
}

let appJsCode =
    fs.readFileSync('translations.js', 'utf8') +
    '\n' +
    fs.readFileSync('calendarExport.js', 'utf8') +
    '\n' +
    fs.readFileSync('app.js', 'utf8');

// Strip 'let' so app.js uses our global variables
appJsCode = appJsCode.replace(/let doctors = /g, 'global.doctors = ');
appJsCode = appJsCode.replace(/let offData = /g, 'global.offData = ');
appJsCode = appJsCode.replace(/let extraSlotsData = /g, 'global.extraSlotsData = ');
appJsCode = appJsCode.replace(/let manualOverrides = /g, 'global.manualOverrides = ');
appJsCode = appJsCode.replace(/let isCalculating = /g, 'global.isCalculating = ');
appJsCode = appJsCode.replace(/let isInitialLoad = /g, 'global.isInitialLoad = ');
appJsCode = appJsCode.replace(/let globalResult = /g, 'global.globalResult = ');
appJsCode = appJsCode.replace(/let viewMode = /g, 'global.viewMode = ');
appJsCode = appJsCode.replace(/let isCustomDateRange = /g, 'global.isCustomDateRange = ');
appJsCode = appJsCode.replace(/let scheduleDates = /g, 'global.scheduleDates = ');

appJsCode = appJsCode.replace(
    /document\.addEventListener\('DOMContentLoaded',\s*\(\)\s*=>\s*\{/g,
    'function dummyInit() {'
);
appJsCode = appJsCode.replace(/\}\);\s*\n\/\/ Toggle Role-Based/, '}\n// Toggle Role-Based');
appJsCode = appJsCode.replace(
    /function showToast\(msg, isError = false\) \{/,
    'function showToast(msg, isError = false) { toastMessages.push({msg, isError});'
);

eval(appJsCode);

let passed = 0;
let failed = 0;

async function waitForCalculation() {
    return new Promise((resolve) => {
        const check = () => {
            if (!global.isCalculating) resolve();
            else setImmediate(check);
        };
        check();
    });
}

async function runTests() {
    console.log('Running quotaSinglePool.test.js...');

    // TEST 1: NON-ROLE-BASED POOL — 3 DOCTORS BALANCED OVER 31 DAYS (1 SLOT/DAY)
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C'];
        mockDOM['inputDefaultSlots'].value = '1';

        await window.generateSchedule();
        await waitForCalculation();

        const res = globalResult;
        assert.ok(res, 'Result generated');
        const countA = res.summary.find((d) => d.name === 'A')?.total;
        const countB = res.summary.find((d) => d.name === 'B')?.total;
        const countC = res.summary.find((d) => d.name === 'C')?.total;
        // 31 days ÷ 3 doctors = ~10-11 shifts each
        assert.ok(countA >= 9 && countA <= 12, `A got ${countA} shifts (expected 9-12)`);
        assert.ok(countB >= 9 && countB <= 12, `B got ${countB} shifts (expected 9-12)`);
        assert.ok(countC >= 9 && countC <= 12, `C got ${countC} shifts (expected 9-12)`);
        assert.strictEqual(countA + countB + countC, 31, 'Total shifts must equal 31');

        console.log('✅ TEST 1 PASSED: SINGLE POOL QUOTA - EXACT MATCH');
        passed++;
    } catch (e) {
        console.log('❌ TEST 1 FAILED:', e.message);
        failed++;
    }

    // TEST 2: ROLE-BASED QUOTA — SUM MISMATCH TRIGGERS FAIL-SAFE ERROR
    // Setup: roleBased=true, 3 roles each with 1 slot/day (31 slots/role × 3 = 93 total)
    // Quotas A:5+B:5+C:5=15 ≠ 93 → engine must throw validation error
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C'];
        mockDOM['chkRoleBased'].checked = true;
        mockDOM['inputDoctorRoles'].value = 'A:A, B:B, C:C';
        mockDOM['inputDefaultRoleSlots'].value = 'A:1, B:1, C:1';
        mockDOM['inputRoleQuotas'].value = 'A:5, B:5, C:5'; // Total 15, but 93 slots available

        await window.generateSchedule();
        await waitForCalculation();

        let hasError = toastMessages.some((t) => t.isError && t.msg.includes('โควตารวม'));
        if (!hasError)
            hasError = toastMessages.some((t) => t.isError && t.msg.includes('Quotas sum to'));
        assert.ok(hasError, 'Should throw fail-safe error');

        console.log('✅ TEST 2 PASSED: SINGLE POOL QUOTA - SUM MISMATCH (FAIL SAFE)');
        passed++;
    } catch (e) {
        console.log('❌ TEST 2 FAILED:', e.message);
        failed++;
    } finally {
        console.error = originalConsoleError;
    }

    console.log(`\nquotaSinglePool: PASSED: ${passed}, FAILED: ${failed}`);
}

runTests().catch((e) => {
    console.log('UNHANDLED REJECTION IN runTests():', e.message, e.stack);
    process.exitCode = 1;
});
