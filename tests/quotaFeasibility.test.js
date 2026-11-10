const fs = require('fs');
const assert = require('assert');

// Mock DOM and Globals
const mockDOM = {};
global.document = {
    getElementById: (id) => {
        if (!mockDOM[id]) {
            mockDOM[id] = { value: '', checked: false };
        }
        return mockDOM[id];
    },
};
global.window = {
    innerWidth: 1024,
    XLSX: {},
};
global.navigator = {};
global.currentLang = 'en';
global.doctors = [];
global.offData = [];
global.extraSlotsData = [];
global.manualOverrides = {};
global.translations = { en: {} };
global.isCalculating = false;
global.isInitialLoad = true;
global.globalResult = null;
global.scheduleData = [];
global.isCustomDateRange = false;
global.scheduleDates = [];

global.lucide = { createIcons: () => {} };
global.document.createElement = () => ({
    setAttribute: () => {},
    appendChild: () => {},
    classList: { add: () => {}, remove: () => {} },
});
global.document.body = { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } };
global.document.addEventListener = () => {};
global.window.addEventListener = () => {};
global.localStorage = { getItem: () => 'en', setItem: () => {} };

let lastToast = null;

function resetMocks() {
    Object.keys(mockDOM).forEach((key) => delete mockDOM[key]);
    global.doctors = [];
    global.offData = [];
    global.extraSlotsData = [];
    mockDOM['inputMonth'] = { value: '9' };
    mockDOM['inputYear'] = { value: '2026' };
    mockDOM['inputDefaultSlots'] = { value: '2' };
    mockDOM['inputSpecialHols'] = { value: '' };
    mockDOM['inputNoDuty'] = { value: '' };
    mockDOM['inputSpecialDocs'] = { value: '' };
    mockDOM['inputSpecialDays'] = { value: '0' };
    mockDOM['chkUseSpecialRule'] = { checked: false };
    mockDOM['inputOffDutyPeriod'] = { value: '1' };
    mockDOM['chkPreventLongGaps'] = { checked: false };
    mockDOM['chkBalanceShifts'] = { checked: false };
    mockDOM['chkAllowBlankDays'] = { checked: false };
    mockDOM['chkRoleBased'] = { checked: false };
    mockDOM['inputDoctorRoles'] = { value: '' };
    mockDOM['inputDefaultRoleSlots'] = { value: '' };
    mockDOM['inputRoleQuotas'] = { value: '' };
    mockDOM['inputSinglePoolQuota'] = { value: '' };
    mockDOM['inputConflicts'] = { value: '' };

    global.isCustomDateRange = false;
    global.scheduleDates = [];
    for (let i = 1; i <= 30; i++) {
        global.scheduleDates.push(new Date(2026, 8, i));
    }
    lastToast = null;
}
let appJsCode =
    fs.readFileSync('./translations.js', 'utf8') + '\n' + fs.readFileSync('./app.js', 'utf8');
// Mock showToast by renaming the original function so it doesn't conflict
appJsCode = appJsCode.replace(
    'function showToast(msg, isError = false) {',
    'function original_showToast_disabled(msg, isError = false) {'
);

// Inject a setter into appJsCode so we can modify the internal 'let' variables
appJsCode += `\nglobal.setAppJsVars = function(configObj) {
    if (typeof scheduleDates !== 'undefined' && configObj.scheduleDates !== undefined) scheduleDates = configObj.scheduleDates;
    if (typeof isCustomDateRange !== 'undefined' && configObj.isCustomDateRange !== undefined) isCustomDateRange = configObj.isCustomDateRange;
    if (typeof doctors !== 'undefined' && configObj.doctors !== undefined) doctors = configObj.doctors;
    if (typeof offData !== 'undefined' && configObj.offData !== undefined) offData = configObj.offData;
    if (typeof extraSlotsData !== 'undefined' && configObj.extraSlotsData !== undefined) extraSlotsData = configObj.extraSlotsData;
    if (typeof manualOverrides !== 'undefined' && configObj.manualOverrides !== undefined) manualOverrides = configObj.manualOverrides;
};\n`;

eval(appJsCode);

// Inject our mock showToast into the global scope
global.showToast = (msg, type) => {
    lastToast = { msg, type };
};
showToast = global.showToast;

// Wrap parseUIConfig to sync all test data into the closure before executing
const origParseUIConfig = typeof parseUIConfig !== 'undefined' ? parseUIConfig : () => {};
global.parseUIConfig = function () {
    if (typeof global.setAppJsVars === 'function') {
        global.setAppJsVars({
            scheduleDates: global.scheduleDates,
            isCustomDateRange: global.isCustomDateRange,
            doctors: global.doctors,
            offData: global.offData,
            extraSlotsData: global.extraSlotsData,
            manualOverrides: global.manualOverrides,
        });
    }
    return origParseUIConfig();
};
parseUIConfig = global.parseUIConfig;
if (typeof showToast !== 'undefined') {
    global.showToast = (msg, type) => {
        lastToast = { msg, type };
    };
    showToast = global.showToast;
}

// Do one initial call
resetMocks();

console.log('Running Quota Feasibility Unit Tests...');
let passed = 0;
let failed = 0;

function runTest(name, testFn) {
    try {
        testFn();
        console.log(`✅ ${name} PASSED`);
        passed++;
    } catch (e) {
        console.log(`❌ ${name} FAILED: ` + e.message);
        failed++;
    }
}

runTest('TEST 1: IMPOSSIBLE QUOTA DETECTED — ABORTS', () => {
    resetMocks();
    global.doctors = ['A', 'B', 'C', 'D', 'E'];
    mockDOM['chkAllowBlankDays'].checked = false;
    mockDOM['inputOffDutyPeriod'].value = '1';
    mockDOM['inputSinglePoolQuota'].value = 'A:12, B:12, C:12, D:12, E:12'; // sum 60
    global.offData = [{ names: 'A', date: '22-30' }];

    try {
        parseUIConfig();
        assert.fail('Should have thrown error');
    } catch (e) {
        if (e.name === 'AssertionError') throw e;
        assert(
            e.message.includes('Dr. A: Quota 12 is impossible'),
            'Missing Dr A in error: ' + e.message
        );
        assert(e.message.includes('21 available days'), 'Missing 21 available days in error');
        assert(e.message.includes('max achievable 11 shifts'), 'Missing max 11 shifts in error');
    }
});

runTest('TEST 2: FEASIBLE QUOTA — NO VIOLATION', () => {
    resetMocks();
    global.doctors = ['A', 'B', 'C', 'D', 'E'];
    mockDOM['chkAllowBlankDays'].checked = false;
    mockDOM['inputOffDutyPeriod'].value = '1';
    mockDOM['inputSinglePoolQuota'].value = 'A:10, B:12, C:13, D:13, E:12'; // sum 60
    global.offData = [{ names: 'A', date: '22-30' }];

    let config;
    assert.doesNotThrow(() => {
        config = parseUIConfig();
    });
    assert(config !== undefined);
});

runTest('TEST 3: ALLOW BLANK DAYS — WARNING NOT ABORT', () => {
    resetMocks();
    global.doctors = ['A', 'B', 'C', 'D', 'E'];
    mockDOM['chkAllowBlankDays'].checked = true;
    mockDOM['inputOffDutyPeriod'].value = '1';
    mockDOM['inputSinglePoolQuota'].value = 'A:12';
    global.offData = [{ names: 'A', date: '22-30' }];

    const config = parseUIConfig();
    assert(lastToast !== null, 'Toast should be shown');
    assert(
        lastToast.msg.includes('Dr. A: Quota 12 is impossible'),
        'Missing correct toast msg: ' + lastToast.msg
    );
});

runTest('TEST 4: NO REST GAP — EVERY DAY AVAILABLE', () => {
    resetMocks();
    global.doctors = ['A'];
    mockDOM['inputOffDutyPeriod'].value = '0';
    mockDOM['inputSinglePoolQuota'].value = 'A:20';
    global.offData = [{ names: 'A', date: '1-5' }];
    mockDOM['chkAllowBlankDays'].checked = true;

    parseUIConfig();
    assert(
        lastToast === null,
        'Should not show toast, got: ' + (lastToast ? lastToast.msg : 'null')
    );

    // Additional assert where quota = 26 exceeds availableDays = 25
    lastToast = null;
    mockDOM['inputSinglePoolQuota'].value = 'A:26';
    parseUIConfig();
    assert(lastToast !== null, 'Toast should have fired since quota 26 exceeds 25 available days');
    assert(
        lastToast.msg.includes('Quota 26 is impossible'),
        'Warning message should mention quota 26'
    );
});

runTest('TEST 5: ALL DOCTORS OFF SAME DAY — ROLE-BASED CHECK', () => {
    resetMocks();
    global.doctors = ['A', 'B'];
    mockDOM['chkRoleBased'].checked = true;
    mockDOM['inputDoctorRoles'].value = 'A:R1, B:R1';
    mockDOM['inputRoleQuotas'].value = 'R1:10';
    mockDOM['inputOffDutyPeriod'].value = '1';
    mockDOM['chkAllowBlankDays'].checked = true;

    global.offData = [{ names: 'A, B', date: '15' }];

    parseUIConfig();
    assert(
        lastToast === null,
        'Should not show toast, got: ' + (lastToast ? lastToast.msg : 'null')
    );

    // Second scenario: A and B both have off requests covering 20+ days each with quota making individual share infeasible
    lastToast = null;
    global.offData = [
        { names: 'A', date: '1-22' },
        { names: 'B', date: '9-30' },
    ];
    parseUIConfig();
    assert(lastToast !== null, 'Toast should have fired due to infeasible role-based quota');
});

runTest('TEST 6: DOCTOR WITH ZERO AVAILABLE DAYS', () => {
    resetMocks();
    global.doctors = ['A', 'B', 'C', 'D', 'E'];
    mockDOM['inputOffDutyPeriod'].value = '1';
    mockDOM['inputSinglePoolQuota'].value = 'A:1, B:14, C:15, D:15, E:15'; // sum 60
    global.offData = [{ names: 'A', date: '1-30' }];

    try {
        parseUIConfig();
        assert.fail('Should throw');
    } catch (e) {
        if (e.name === 'AssertionError') throw e;
        assert(
            e.message.includes('0 available days'),
            'Expected 0 available days in msg: ' + e.message
        );
        assert(
            e.message.includes('max achievable 0 shifts'),
            'Expected 0 max shifts in msg: ' + e.message
        );
    }
});

runTest('TEST 7: CUSTOM DATE RANGE MODE — CORRECT DAYS USED', () => {
    resetMocks();
    global.doctors = ['A', 'B', 'C', 'D', 'E'];
    global.isCustomDateRange = true;
    global.scheduleDates = [];
    for (let i = 22; i <= 31; i++) global.scheduleDates.push(new Date(2026, 6, i));
    for (let i = 1; i <= 10; i++) global.scheduleDates.push(new Date(2026, 7, i));

    mockDOM['inputSinglePoolQuota'].value = 'A:6, B:10, C:8, D:8, E:8'; // sum 40
    // F4 parser requires date ranges to be formatted without spaces (dd/mm/yyyy-dd/mm/yyyy)
    global.offData = [{ names: 'A', date: '25/07/2026-05/08/2026' }];
    mockDOM['inputOffDutyPeriod'].value = '1';

    try {
        parseUIConfig();
        assert.fail('Should throw');
    } catch (e) {
        if (e.name === 'AssertionError') throw e;
        assert(
            e.message.includes('Quota 6 is impossible'),
            'Missing Quota 6 impossible: ' + e.message
        );
        assert(e.message.includes('8 available days'), 'Missing 8 available days: ' + e.message);
        assert(e.message.includes('max achievable 4 shifts'), 'Missing max 4 shifts: ' + e.message);
    }
});

runTest('TEST 8: MULTIPLE DOCTORS VIOLATIONS IN ONE RUN', () => {
    resetMocks();
    global.doctors = ['A', 'B', 'C', 'D', 'E'];
    mockDOM['chkAllowBlankDays'].checked = false;
    mockDOM['inputOffDutyPeriod'].value = '1';
    mockDOM['inputSinglePoolQuota'].value = 'A:16, B:16, C:10, D:10, E:8'; // sum 60
    global.offData = [
        { names: 'A', date: '1-5' },
        { names: 'B', date: '20-25' },
    ];

    try {
        parseUIConfig();
        assert.fail('Should throw');
    } catch (e) {
        if (e.name === 'AssertionError') throw e;
        assert(e.message.includes('Dr. A'), 'Should mention Dr A');
        assert(e.message.includes('Dr. B'), 'Should mention Dr B');
    }
});

runTest('TEST 9: NO QUOTA SET — CHECK SKIPPED', () => {
    resetMocks();
    global.doctors = ['A'];
    mockDOM['inputSinglePoolQuota'].value = '';
    mockDOM['chkAllowBlankDays'].checked = true;

    parseUIConfig();
    assert(
        lastToast === null,
        'No toast if no quota, got: ' + (lastToast ? lastToast.msg : 'null')
    );
});

runTest('TEST 10: 1-DAY REST GAP REDUCES MAX SHIFTS (DEFAULT)', () => {
    resetMocks();
    global.doctors = ['A', 'B', 'C', 'D', 'E'];
    mockDOM['inputOffDutyPeriod'].value = '1';
    mockDOM['inputSinglePoolQuota'].value = 'A:14, B:12, C:12, D:11, E:11'; // sum 60
    global.offData = [{ names: 'A', date: '1-5' }];
    mockDOM['chkAllowBlankDays'].checked = false;

    try {
        parseUIConfig();
        assert.fail('Should throw');
    } catch (e) {
        if (e.name === 'AssertionError') throw e;
        assert(e.message.includes('max achievable 13 shifts'), 'Got: ' + e.message);
    }
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
