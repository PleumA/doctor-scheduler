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
    addEventListener: () => {},
    setTimeout: (fn) => fn(),
};

let toastMessages = [];
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
global.offData = [];

let appJsCode =
    fs.readFileSync('./translations.js', 'utf8') + '\n' + fs.readFileSync('./app.js', 'utf8');
appJsCode = appJsCode.replace(/let doctors = /g, 'global.doctors = ');
appJsCode = appJsCode.replace(/let globalResult = /g, 'global.globalResult = ');
appJsCode = appJsCode.replace(/let viewMode = /g, 'global.viewMode = ');
appJsCode = appJsCode.replace(/let quota = /g, 'global.quota = ');
appJsCode = appJsCode.replace(/let scheduleDates = /g, 'global.scheduleDates = ');
appJsCode = appJsCode.replace(/let isCustomDateRange = /g, 'global.isCustomDateRange = ');
appJsCode = appJsCode.replace(/let offData = /g, 'global.offData = ');
appJsCode = appJsCode.replace(/const esc = /g, 'global.esc = ');
appJsCode = appJsCode.replace(
    /function showToast\(msg, isError = false\) \{/g,
    'function showToast(msg, isError = false) { toastMessages.push({msg, isError});'
);
appJsCode = appJsCode.replace(
    /const offMap = \{\};/g,
    'global.capturedOffMap = {}; const offMap = global.capturedOffMap;'
);
// Prevent generateSingleScheduleCandidate from doing heavy lifting during this parsing test
appJsCode = appJsCode.replace(
    /function generateSingleScheduleCandidate\([\s\S]*?\{/,
    'function generateSingleScheduleCandidate() { return { score: 100, schedule: [] }; \n'
);

eval(appJsCode);

function runTests() {
    console.log('Running offRequest.test.js...');
    let passed = 0;
    let failed = 0;

    function assertSetEqual(actualSet, expectedArray, testName) {
        if (!actualSet) {
            console.log(
                `❌ TEST FAILED: ${testName}\nSet is undefined, expected [${expectedArray.join(', ')}]`
            );
            failed++;
            return false;
        }
        const actualArray = Array.from(actualSet).sort();
        const expArray = expectedArray.sort();
        if (
            actualArray.length !== expArray.length ||
            !actualArray.every((v, i) => v === expArray[i])
        ) {
            console.log(
                `❌ TEST FAILED: ${testName}\nExpected: [${expArray.join(', ')}]\nActual: [${actualArray.join(', ')}]`
            );
            failed++;
            return false;
        }
        return true;
    }

    function setupTest(customDate = false) {
        toastMessages = [];
        global.isCustomDateRange = customDate;
        global.offData = [];
        global.capturedOffMap = {};

        // Setup UI inputs to bypass validation abortions
        mockDOM['inputMonth'] = { value: '5' };
        mockDOM['inputYear'] = { value: '2026' };
        mockDOM['inputDefaultSlots'] = { value: '1' };
        mockDOM['chkRoleBased'] = { checked: false };
        mockDOM['chkAllowBlankDays'] = { checked: true };
        mockDOM['inputSpecialStartDay'] = { value: '1' };
        mockDOM['inputSpecialDays'] = { value: '0' };
        mockDOM['inputSpecialHols'] = { value: '' };
        mockDOM['inputNoDuty'] = { value: '' };
        mockDOM['inputSpecialDocs'] = { value: '' };
        mockDOM['chkUseSpecialRule'] = { checked: false };
        mockDOM['lockConditionType'] = { value: 'firstNDays' };
        mockDOM['selectLockWeekday'] = { value: '0' };
        mockDOM['inputOffDutyPeriod'] = { value: '0' };
        mockDOM['chkPreventLongGaps'] = { checked: false };
        mockDOM['chkBalanceShifts'] = { checked: false };
        mockDOM['inputConflicts'] = { value: '' };
        mockDOM['inputSinglePoolQuota'] = { value: '' };
    }

    // 1. Single standard input
    try {
        setupTest(false);
        global.offData = [{ id: 1, date: '5', names: 'A, B' }];
        parseUIConfig();
        if (
            assertSetEqual(
                global.capturedOffMap[5],
                ['A', 'B'],
                'Single standard input parsed correctly'
            )
        ) {
            console.log('✅ TEST 1 PASSED: Single standard input');
            passed++;
        }
    } catch (e) {
        console.log(`❌ TEST FAILED (Crash): ${e.message}\nStack: ${e.stack}`);
        failed++;
    }

    // 2. Comma-separated standard inputs
    try {
        setupTest(false);
        global.offData = [{ id: 1, date: '5, 7, 10', names: 'A' }];
        parseUIConfig();
        let ok =
            assertSetEqual(global.capturedOffMap[5], ['A'], 'Comma-sep input day 5') &&
            assertSetEqual(global.capturedOffMap[7], ['A'], 'Comma-sep input day 7') &&
            assertSetEqual(global.capturedOffMap[10], ['A'], 'Comma-sep input day 10');
        if (ok) {
            console.log('✅ TEST 2 PASSED: Comma-separated standard input');
            passed++;
        }
    } catch (e) {
        console.log(`❌ TEST 2 FAILED (Crash): ${e.message}`);
        failed++;
    }

    // 3. Standard ranges
    try {
        setupTest(false);
        global.offData = [{ id: 1, date: '2-4', names: 'B' }];
        parseUIConfig();
        let ok =
            assertSetEqual(global.capturedOffMap[2], ['B'], 'Standard range day 2') &&
            assertSetEqual(global.capturedOffMap[3], ['B'], 'Standard range day 3') &&
            assertSetEqual(global.capturedOffMap[4], ['B'], 'Standard range day 4');
        if (ok) {
            console.log('✅ TEST 3 PASSED: Standard ranges');
            passed++;
        }
    } catch (e) {
        console.log(`❌ TEST 3 FAILED (Crash): ${e.message}`);
        failed++;
    }

    // 4. Mixed standard inputs
    try {
        setupTest(false);
        global.offData = [{ id: 1, date: '1, 3-5, 10', names: 'A, B' }];
        parseUIConfig();
        let ok =
            assertSetEqual(global.capturedOffMap[1], ['A', 'B'], 'Mixed day 1') &&
            assertSetEqual(global.capturedOffMap[3], ['A', 'B'], 'Mixed day 3') &&
            assertSetEqual(global.capturedOffMap[4], ['A', 'B'], 'Mixed day 4') &&
            assertSetEqual(global.capturedOffMap[5], ['A', 'B'], 'Mixed day 5') &&
            assertSetEqual(global.capturedOffMap[10], ['A', 'B'], 'Mixed day 10');
        if (ok) {
            console.log('✅ TEST 4 PASSED: Mixed standard input');
            passed++;
        }
    } catch (e) {
        console.log(`❌ TEST 4 FAILED (Crash): ${e.message}`);
        failed++;
    }

    // 5. Custom date inputs
    try {
        setupTest(true);
        global.scheduleDates = [new Date(2026, 4, 20)]; // May 20, 2026
        global.offData = [{ id: 1, date: '20/05/2026', names: 'A' }];
        parseUIConfig();
        let ok = assertSetEqual(
            global.capturedOffMap['20/05/2026'],
            ['A'],
            'Custom date parsed correctly'
        );
        if (ok) {
            console.log('✅ TEST 5 PASSED: Custom date inputs');
            passed++;
        }
    } catch (e) {
        console.log(`❌ TEST 5 FAILED (Crash): ${e.message}`);
        failed++;
    }

    // 6. Custom date ranges
    try {
        setupTest(true);
        global.scheduleDates = [new Date(2026, 1, 25), new Date(2026, 1, 26)];
        global.offData = [{ id: 1, date: '25/02/2026-26/02/2026', names: 'B' }];
        parseUIConfig();
        let ok =
            assertSetEqual(global.capturedOffMap['25/02/2026'], ['B'], 'Custom date range day 1') &&
            assertSetEqual(global.capturedOffMap['26/02/2026'], ['B'], 'Custom date range day 2');
        if (ok) {
            console.log('✅ TEST 6 PASSED: Custom date ranges');
            passed++;
        }
    } catch (e) {
        console.log(`❌ TEST 6 FAILED (Crash): ${e.message}`);
        failed++;
    }

    // 7. Invalid formats and inverted ranges
    try {
        setupTest(false);
        global.offData = [{ id: 1, date: '10-2', names: 'A' }];
        parseUIConfig();

        let hasError = toastMessages.some((t) => t.isError && t.msg.includes('10-2'));
        if (hasError) {
            console.log(`✅ TEST 7 PASSED: Caught inverted range error`);
            passed++;
        } else {
            console.log(`❌ TEST 7 FAILED: Expected error for inverted range`);
            failed++;
        }
    } catch (e) {
        console.log(`❌ TEST 7 FAILED (Crash): ${e.message}`);
        failed++;
    }

    console.log(`\nPASSED: ${passed}, FAILED: ${failed}`);
    if (failed > 0) process.exit(1);
}

runTests();
