const fs = require('fs');
const assert = require('assert');

// Mock Globals
const mockDOM = {};
global.document = {
    getElementById: (id) => {
        if (!mockDOM[id]) {
            mockDOM[id] = {
                value: '',
                checked: false,
                classList: { add: () => {}, remove: () => {} },
                innerHTML: '',
                setAttribute: () => {},
                innerText: '',
                style: { display: '' },
                dispatchEvent: () => {},
                querySelectorAll: () => [],
                insertBefore: () => {},
                appendChild: function (c) {
                    this.innerHTML += c.innerHTML || '';
                },
                querySelector: function (s) {
                    if (s === 'span.truncate') return { innerText: '', innerHTML: '' };
                    return {
                        classList: { add: () => {}, remove: () => {} },
                        innerHTML: '',
                        innerText: '',
                    };
                },
            };
        }
        return mockDOM[id];
    },
    createElement: () => ({
        setAttribute: () => {},
        appendChild: function (c) {
            this.innerHTML += c.innerHTML || '';
        },
        classList: { add: () => {}, remove: () => {} },
        click: () => {},
        remove: () => {},
        querySelector: () => ({ innerHTML: '' }),
        innerHTML: '',
    }),
    body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } },
    addEventListener: () => {},
    documentElement: { lang: 'en', classList: { add: () => {}, remove: () => {} } },
    querySelectorAll: () => [],
};

global.window = {
    innerWidth: 1024,
    XLSX: {
        utils: {
            aoa_to_sheet: (data) => data,
            book_new: () => ({}),
            book_append_sheet: () => {},
        },
        writeFile: () => {},
    },
    addEventListener: () => {},
    setTimeout: (fn) => fn(),
};

let clipboardText = '';
// Bypass Node.js read-only global navigator property
Object.defineProperty(global, 'navigator', {
    value: {
        clipboard: {
            writeText: async (text) => {
                clipboardText = text;
                return Promise.resolve();
            },
        },
    },
    configurable: true,
    writable: true,
});

global.localStorage = { getItem: () => 'en', setItem: () => {} };
global.currentLang = 'en';
global.translations = {
    en: { tableDateCol: 'Date', tableDayCol: 'Day', tableDutyCol: 'Duty', tableNoteCol: 'Notes' },
    th: {},
};
global.lucide = { createIcons: () => {} };
global.doctors = ['A', 'B'];
global.scheduleDates = [];
global.isCustomDateRange = false;

let appJsCode =
    fs.readFileSync('./translations.js', 'utf8') + '\n' + fs.readFileSync('./app.js', 'utf8');
appJsCode = appJsCode.replace(/let doctors = /g, 'global.doctors = ');
appJsCode = appJsCode.replace(/let globalResult = /g, 'global.globalResult = ');
appJsCode = appJsCode.replace(/let viewMode = /g, 'global.viewMode = ');
appJsCode = appJsCode.replace(/const esc = /g, 'global.esc = ');
appJsCode = appJsCode.replace(
    /function showToast\(msg, isError = false\) \{/g,
    'function showToast(msg, isError = false) {'
);
eval(appJsCode);

function resetMocks() {
    Object.keys(mockDOM).forEach((key) => delete mockDOM[key]);
    clipboardText = '';
    mockDOM['inputMonth'] = { value: '1' };
    mockDOM['inputYear'] = { value: '2026' };
    mockDOM['inputDefaultSlots'] = { value: '2' };
    mockDOM['chkAllowBlankDays'] = { checked: false };
    mockDOM['chkRoleBased'] = { checked: false };
    mockDOM['inputDoctorRoles'] = { value: 'A:R1, B:R2' };
    mockDOM['inputDefaultRoleSlots'] = { value: 'R1:1, R2:1' };
    mockDOM['inputRoleQuotas'] = { value: '' };
    mockDOM['inputConflicts'] = { value: '' };
    mockDOM['inputOffDutyPeriod'] = { value: '0' };
    mockDOM['chkPreventLongGaps'] = { checked: false };
    mockDOM['chkBalanceShifts'] = { checked: false };

    globalResult = {
        schedule: [
            {
                day: 1,
                dayName: 'Monday',
                isHoliday: false,
                isSpecial: false,
                isNoDuty: false,
                slots: 2,
                selectedDocs: [
                    { name: 'A', role: 'R1' },
                    { name: 'B', role: 'R2' },
                ],
                note: '',
            },
        ],
        maxSlots: 2,
        month: 1,
        year: 2026,
        summary: [],
    };
}

// A displayed result is a self-contained snapshot: take the config after the test set its inputs
function snapshotResult() {
    Object.assign(globalResult, {
        doctors: ['A', 'B'],
        dates: [new Date(2026, 0, 1)],
        isCustomDateRange: false,
        config: parseUIConfig(),
    });
}

let passed = 0;
let failed = 0;

function runTests() {
    console.log('Running roleHeaderDisplay.test.js...');

    // TEST 1: Column header contains role when isRoleBased ON
    try {
        resetMocks();
        mockDOM['chkRoleBased'].checked = true;
        snapshotResult();
        renderTableView(parseUIConfig());
        const headerHTML = mockDOM['scheduleTableHeader'].innerHTML;
        assert.ok(headerHTML.includes('R1'), "Header should contain 'R1'");
        assert.ok(headerHTML.includes('R2'), "Header should contain 'R2'");
        console.log('✅ TEST 1 PASSED: Column header contains role when isRoleBased ON');
        passed++;
    } catch (e) {
        console.log('❌ TEST 1 FAILED:', e.message);
        failed++;
    }

    // TEST 2: Cell has no role suffix when isRoleBased ON
    try {
        resetMocks();
        mockDOM['chkRoleBased'].checked = true;
        snapshotResult();
        renderTableView(parseUIConfig());
        const bodyHTML = mockDOM['scheduleTableBody'].innerHTML;
        assert.ok(bodyHTML.includes('A'), "Cell should contain 'A'");
        assert.ok(
            !bodyHTML.includes('aria-hidden="true">A (R1)</span>'),
            "Cell should not contain 'A (R1)'"
        );
        console.log('✅ TEST 2 PASSED: Cell has no role suffix when isRoleBased ON');
        passed++;
    } catch (e) {
        console.log('❌ TEST 2 FAILED:', e.message);
        failed++;
    }

    // TEST 3: Headers unchanged when isRoleBased OFF
    try {
        resetMocks();
        mockDOM['chkRoleBased'].checked = false;
        snapshotResult();
        renderTableView(parseUIConfig());
        const headerHTML = mockDOM['scheduleTableHeader'].innerHTML;
        assert.ok(!headerHTML.includes('R1'), "Header should not contain 'R1'");
        console.log('✅ TEST 3 PASSED: Headers unchanged when isRoleBased OFF');
        passed++;
    } catch (e) {
        console.log('❌ TEST 3 FAILED:', e.message);
        failed++;
    }

    // TEST 4: XLSX header contains role label per duty column
    try {
        resetMocks();
        mockDOM['chkRoleBased'].checked = true;
        let exportedSheets = [];
        global.window.XLSX.utils.aoa_to_sheet = (data) => {
            exportedSheets.push(data);
            return {};
        };
        snapshotResult();
        window.exportToExcel();
        const headers = exportedSheets[0][0];
        assert.strictEqual(
            headers[2],
            'Duty 1 (R1)',
            'Excel Duty 1 header should contain role label'
        );
        assert.strictEqual(
            headers[3],
            'Duty 2 (R2)',
            'Excel Duty 2 header should contain role label'
        );
        console.log('✅ TEST 4 PASSED: XLSX header contains role label per duty column');
        passed++;
    } catch (e) {
        console.log('❌ TEST 4 FAILED:', e.message);
        failed++;
    }

    // TEST 5: XLSX data cell has no role suffix
    try {
        resetMocks();
        mockDOM['chkRoleBased'].checked = true;
        let exportedSheets = [];
        global.window.XLSX.utils.aoa_to_sheet = (data) => {
            exportedSheets.push(data);
            return {};
        };
        snapshotResult();
        window.exportToExcel();
        const row = exportedSheets[0][1];
        assert.strictEqual(row[2], 'A', 'Excel data cell should not contain role suffix');
        console.log('✅ TEST 5 PASSED: XLSX data cell has no role suffix');
        passed++;
    } catch (e) {
        console.log('❌ TEST 5 FAILED:', e.message);
        failed++;
    }

    // TEST 6: Clipboard header contains role label
    try {
        resetMocks();
        mockDOM['chkRoleBased'].checked = true;
        snapshotResult();
        window.copyScheduleForExcel();
        assert.ok(clipboardText.includes('Duty 1 (R1)'), 'Clipboard header should contain role');
        console.log('✅ TEST 6 PASSED: Clipboard header contains role label');
        passed++;
    } catch (e) {
        console.log('❌ TEST 6 FAILED:', e.message);
        failed++;
    }

    // TEST 7: Clipboard cell has no role suffix
    try {
        resetMocks();
        mockDOM['chkRoleBased'].checked = true;
        snapshotResult();
        window.copyScheduleForExcel();
        assert.ok(clipboardText.includes('\tA\t'), 'Clipboard cell should not contain role');
        console.log('✅ TEST 7 PASSED: Clipboard cell has no role suffix');
        passed++;
    } catch (e) {
        console.log('❌ TEST 7 FAILED:', e.message);
        failed++;
    }

    console.log(`\nPASSED: ${passed}, FAILED: ${failed}`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
