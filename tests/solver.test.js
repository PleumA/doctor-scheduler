const fs = require('fs');
const assert = require('assert');

// 1. Mock DOM and Globals
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

// Create a mock for lucide
global.lucide = { createIcons: () => {} };

// Mock DOM functions
global.document.createElement = () => ({
    setAttribute: () => {},
    appendChild: () => {},
    classList: { add: () => {}, remove: () => {} },
});
global.document.body = { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } };
global.document.addEventListener = () => {};
global.window.addEventListener = () => {};
global.localStorage = { getItem: () => 'en', setItem: () => {} };

// Helper to reset mocks
function resetMocks() {
    Object.keys(mockDOM).forEach((key) => delete mockDOM[key]);
    global.doctors = [];
    global.offData = [];
    global.extraSlotsData = [];
    mockDOM['inputMonth'] = { value: '1' };
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
    mockDOM['inputConflicts'] = { value: '' };

    global.isCustomDateRange = false;
    global.scheduleDates = [];
    for (let i = 1; i <= 31; i++) {
        global.scheduleDates.push(new Date(2026, 0, i)); // Jan 2026 has 31 days
    }
}

// Load app.js code
let appJsCode =
    fs.readFileSync('./translations.js', 'utf8') + '\n' + fs.readFileSync('./app.js', 'utf8');

eval(appJsCode);

console.log('Running Solver Unit Tests...');
let passed = 0;
let failed = 0;

// TEST 1: Quotas that don't sum correctly
resetMocks();
global.doctors = ['A', 'B'];
mockDOM['chkRoleBased'].checked = true;
mockDOM['inputDoctorRoles'].value = 'A:R1, B:R1';
mockDOM['inputDefaultRoleSlots'].value = 'R1:2';
mockDOM['inputRoleQuotas'].value = 'R1:60'; // 60 * 2 docs = 120 != 62 (31 days * 2)
try {
    parseUIConfig();
    assert.fail('Should have thrown quota sum error');
} catch (e) {
    if (e.name === 'AssertionError') {
        console.log('❌ TEST 1 FAILED: ' + e.message);
        failed++;
    } else if (!e.message.includes('120') || !e.message.includes('62')) {
        console.log('❌ TEST 1 FAILED: Wrong error message: ' + e.message);
        failed++;
    } else {
        console.log("✅ TEST 1 PASSED: Quotas that don't sum correctly throw expected error.");
        passed++;
    }
}

// TEST 2: Circular conflict lists
resetMocks();
global.doctors = ['A', 'B', 'C'];
mockDOM['inputConflicts'].value = 'A:B, B:C, C:A';
mockDOM['inputDefaultSlots'].value = '3';
mockDOM['chkAllowBlankDays'].checked = false;
try {
    let config2 = parseUIConfig();
    const candidate = generateSingleScheduleCandidate(0, config2);
    if (candidate.schedule.length !== 31) {
        throw new Error('Schedule length is not 31.');
    }
    console.log('✅ TEST 2 PASSED: Circular conflicts fall back cleanly without infinite looping.');
    passed++;
} catch (e) {
    console.log('❌ TEST 2 FAILED: Solver crashed on circular conflicts: ' + e.message);
    failed++;
}

// TEST 3: Impossible constraint combinations (e.g., hard quota lockouts leading to coverage error)
resetMocks();
global.doctors = ['A'];
mockDOM['chkRoleBased'].checked = true;
mockDOM['inputDoctorRoles'].value = 'A:R1';
mockDOM['inputDefaultRoleSlots'].value = 'R1:1, R2:1';
mockDOM['chkAllowBlankDays'].checked = false;
try {
    const config3 = parseUIConfig();
    generateSingleScheduleCandidate(0, config3);
    assert.fail('Should have thrown coverage error');
} catch (e) {
    if (e.name === 'AssertionError') {
        console.log('❌ TEST 3 FAILED: ' + e.message);
        failed++;
    } else if (!e.message.includes('Critical Coverage Error')) {
        console.log('❌ TEST 3 FAILED: Wrong error message: ' + e.message);
        failed++;
    } else {
        console.log('✅ TEST 3 PASSED: Impossible constraints throw Critical Coverage Error.');
        passed++;
    }
}

console.log(`\nsolver: PASSED: ${passed}, FAILED: ${failed}`);
if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
