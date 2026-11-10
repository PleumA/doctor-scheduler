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
                classList: { add: () => {}, remove: () => {}, contains: () => false },
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
                        classList: { add: () => {}, remove: () => {}, contains: () => false },
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
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        click: () => {},
        remove: () => {},
        querySelector: () => ({ innerHTML: '' }),
        innerHTML: '',
    }),
    body: {
        appendChild: () => {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
    },
    addEventListener: () => {},
    documentElement: {
        lang: 'en',
        classList: { add: () => {}, remove: () => {}, contains: () => false },
    },
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

let appJsCode =
    fs.readFileSync('./translations.js', 'utf8') + '\n' + fs.readFileSync('./app.js', 'utf8');
appJsCode = appJsCode.replace(/let doctors = /g, 'global.doctors = ');
appJsCode = appJsCode.replace(/let globalResult = /g, 'global.globalResult = ');
appJsCode = appJsCode.replace(/let viewMode = /g, 'global.viewMode = ');
appJsCode = appJsCode.replace(/let quota = /g, 'global.quota = ');
appJsCode = appJsCode.replace(/let scheduleDates = /g, 'global.scheduleDates = ');
appJsCode = appJsCode.replace(/let isCustomDateRange = /g, 'global.isCustomDateRange = ');
appJsCode = appJsCode.replace(/const esc = /g, 'global.esc = ');
appJsCode = appJsCode.replace(
    /function showToast\(msg, isError = false\) \{/g,
    'function showToast(msg, isError = false) { toastMessages.push({msg, isError});'
);
eval(appJsCode);

function resetMocks() {
    Object.keys(mockDOM).forEach((key) => delete mockDOM[key]);
    mockDOM['selectCalendarScope'] = { value: '', innerHTML: '', options: [] };
    toastMessages = [];
    mockDOM['inputMonth'] = { value: '1' };
    mockDOM['inputYear'] = { value: '2026' };
    mockDOM['inputDefaultSlots'] = { value: '2' };
    mockDOM['chkAllowBlankDays'] = { checked: false };
    mockDOM['chkRoleBased'] = { checked: false };
    mockDOM['inputDoctorRoles'] = { value: '' };
    mockDOM['inputDefaultRoleSlots'] = { value: '' };
    mockDOM['inputRoleQuotas'] = { value: '' };
    mockDOM['inputSinglePoolQuota'] = { value: '' };
    mockDOM['inputConflicts'] = { value: '' };
    mockDOM['inputOffDutyPeriod'] = { value: '0' };
    mockDOM['chkPreventLongGaps'] = { checked: false };
    mockDOM['chkBalanceShifts'] = { checked: false };
    mockDOM['chkUseSpecialRule'] = { checked: false };
    mockDOM['inputSpecialDocs'] = { value: '' };
    mockDOM['inputSpecialDays'] = { value: '' };
    mockDOM['inputSpecialStartDay'] = { value: '1' };

    global.isCustomDateRange = false;
    global.scheduleDates = [];
    for (let i = 1; i <= 31; i++) {
        global.scheduleDates.push(new Date(2026, 0, i)); // Jan 2026 has 31 days
    }
}

let passed = 0;
let failed = 0;

function runTests() {
    console.log('Running quotaUnified.test.js...');

    // TEST 1: ROLE-BASED QUOTA BEHAVIOR UNCHANGED
    try {
        resetMocks();
        global.doctors = ['A', 'B'];
        mockDOM['chkRoleBased'].checked = true;
        mockDOM['inputDoctorRoles'].value = 'A:R1, B:R2';
        mockDOM['inputDefaultRoleSlots'].value = 'R1:1, R2:1';
        mockDOM['inputRoleQuotas'].value = 'R1:6, R2:6';

        // Mock a 6-day range (total 6 slots of R1, 6 slots of R2)
        global.isCustomDateRange = true;
        global.scheduleDates = [];
        for (let i = 1; i <= 6; i++) {
            global.scheduleDates.push(new Date(2026, 0, i));
        }
        mockDOM['inputStartDate'] = { value: '2026-01-01' };
        mockDOM['inputEndDate'] = { value: '2026-01-06' };

        const config = parseUIConfig();
        const candidate = generateSingleScheduleCandidate(0, config);

        // Assert: R1 doctors work exactly 6 shifts collectively
        let r1Count = 0;
        let r2Count = 0;
        candidate.schedule.forEach((day) => {
            day.selectedDocs.forEach((d) => {
                if (d.role === 'R1') r1Count++;
                if (d.role === 'R2') r2Count++;
            });
        });
        assert.strictEqual(r1Count, 6, 'R1 doctors collectively should work exactly 6 shifts');
        assert.strictEqual(r2Count, 6, 'R2 doctors collectively should work exactly 6 shifts');
        console.log('✅ TEST 1 PASSED: ROLE-BASED QUOTA BEHAVIOR UNCHANGED');
        passed++;
    } catch (e) {
        console.log('❌ TEST 1 FAILED:', e.message);
        failed++;
    }

    // TEST 2: SINGLE-POOL QUOTA ENFORCED BY DOCTOR NAME
    try {
        resetMocks();
        global.doctors = ['A', 'B'];
        mockDOM['chkRoleBased'].checked = false;
        mockDOM['inputDefaultSlots'].value = '2';
        mockDOM['inputSinglePoolQuota'].value = 'A:3, B:3';

        // 3-day range (total 6 slots)
        global.isCustomDateRange = true;
        global.scheduleDates = [];
        for (let i = 1; i <= 3; i++) {
            global.scheduleDates.push(new Date(2026, 0, i));
        }
        mockDOM['inputStartDate'] = { value: '2026-01-01' };
        mockDOM['inputEndDate'] = { value: '2026-01-03' };

        const config = parseUIConfig();
        const candidate = generateSingleScheduleCandidate(0, config);

        let aCount = 0;
        let bCount = 0;
        candidate.schedule.forEach((day) => {
            day.selectedDocs.forEach((d) => {
                if (d.name === 'A') aCount++;
                if (d.name === 'B') bCount++;
            });
        });
        assert.strictEqual(aCount, 3, 'A should work exactly 3 shifts');
        assert.strictEqual(bCount, 3, 'B should work exactly 3 shifts');
        console.log('✅ TEST 2 PASSED: SINGLE-POOL QUOTA ENFORCED BY DOCTOR NAME');
        passed++;
    } catch (e) {
        console.log('❌ TEST 2 FAILED:', e.message);
        failed++;
    }

    // TEST 3: BLANK QUOTA — NO ENFORCEMENT EITHER MODE
    try {
        resetMocks();
        global.doctors = ['A', 'B'];
        mockDOM['chkRoleBased'].checked = true;
        mockDOM['inputRoleQuotas'].value = '';
        parseUIConfig();
        assert.deepStrictEqual(quota, {}, 'Quota should be empty for blank input (RoleBased ON)');

        mockDOM['chkRoleBased'].checked = false;
        mockDOM['inputSinglePoolQuota'].value = '';
        parseUIConfig();
        assert.deepStrictEqual(quota, {}, 'Quota should be empty for blank input (RoleBased OFF)');
        console.log('✅ TEST 3 PASSED: BLANK QUOTA — NO ENFORCEMENT EITHER MODE');
        passed++;
    } catch (e) {
        console.log('❌ TEST 3 FAILED:', e.message);
        failed++;
    }

    // TEST 4: PRE-FLIGHT MISMATCH ABORTS
    try {
        resetMocks();
        global.doctors = ['A', 'B'];
        mockDOM['chkRoleBased'].checked = false;
        mockDOM['inputDefaultSlots'].value = '2';
        mockDOM['inputSinglePoolQuota'].value = 'A:2, B:2'; // Sum is 4, but total slots is 6
        mockDOM['chkAllowBlankDays'].checked = false;

        global.isCustomDateRange = true;
        global.scheduleDates = [];
        for (let i = 1; i <= 3; i++) {
            global.scheduleDates.push(new Date(2026, 0, i));
        }
        mockDOM['inputStartDate'] = { value: '2026-01-01' };
        mockDOM['inputEndDate'] = { value: '2026-01-03' };

        assert.throws(
            () => {
                parseUIConfig();
            },
            /Error: Quotas sum to 4 but there are 6 slots/,
            'Should throw quota mismatch error'
        );
        console.log('✅ TEST 4 PASSED: PRE-FLIGHT MISMATCH ABORTS');
        passed++;
    } catch (e) {
        console.log('❌ TEST 4 FAILED:', e.message);
        failed++;
    }

    // TEST 5: ALLOW BLANK DAYS BYPASSES MISMATCH
    try {
        resetMocks();
        global.doctors = ['A', 'B'];
        mockDOM['chkRoleBased'].checked = false;
        mockDOM['inputDefaultSlots'].value = '2';
        mockDOM['inputSinglePoolQuota'].value = 'A:2, B:2'; // Sum is 4, total slots is 6
        mockDOM['chkAllowBlankDays'].checked = true;

        global.isCustomDateRange = true;
        global.scheduleDates = [];
        for (let i = 1; i <= 3; i++) {
            global.scheduleDates.push(new Date(2026, 0, i));
        }
        mockDOM['inputStartDate'] = { value: '2026-01-01' };
        mockDOM['inputEndDate'] = { value: '2026-01-03' };

        const config = parseUIConfig();
        const candidate = generateSingleScheduleCandidate(0, config);

        let aCount = 0;
        let bCount = 0;
        let shortageCount = 0;
        candidate.schedule.forEach((day) => {
            day.selectedDocs.forEach((d) => {
                if (d.name === 'A') aCount++;
                if (d.name === 'B') bCount++;
                if (d.name === '__SHORTAGE__') shortageCount++;
            });
        });

        assert.strictEqual(aCount, 2, 'A should work exactly 2 shifts');
        assert.strictEqual(bCount, 2, 'B should work exactly 2 shifts');
        assert.strictEqual(shortageCount, 2, 'Shortages should fill the remaining 2 slots');
        console.log('✅ TEST 5 PASSED: ALLOW BLANK DAYS BYPASSES MISMATCH');
        passed++;
    } catch (e) {
        console.log('❌ TEST 5 FAILED:', e.message);
        failed++;
    }

    // TEST 6: GETQUOTAKEY RETURNS CORRECT KEY PER MODE
    try {
        resetMocks();
        const doctorObj = { name: 'A', role: 'R1' };
        const keyRole = getQuotaKey(doctorObj, { roleBased: true });
        const keyName = getQuotaKey(doctorObj, { roleBased: false });

        assert.strictEqual(keyRole, 'R1', 'Should return R1 when roleBased is ON');
        assert.strictEqual(keyName, 'A', 'Should return A when roleBased is OFF');
        console.log('✅ TEST 6 PASSED: GETQUOTAKEY RETURNS CORRECT KEY PER MODE');
        passed++;
    } catch (e) {
        console.log('❌ TEST 6 FAILED:', e.message);
        failed++;
    }

    // TEST 7: SAVE/LOAD ROUND TRIP — UNIFIED KEY
    try {
        resetMocks();
        global.doctors = ['A', 'B'];
        mockDOM['inputSinglePoolQuota'].value = 'A:3, B:3';
        mockDOM['chkAllowBlankDays'].checked = true;
        parseUIConfig();

        let exportedConfig;
        const oldCreateElement = global.document.createElement;
        global.document.createElement = (tag) => {
            if (tag === 'a') {
                return {
                    setAttribute: (attr, val) => {
                        if (attr === 'href') {
                            const json = decodeURIComponent(
                                val.replace('data:text/json;charset=utf-8,', '')
                            );
                            exportedConfig = JSON.parse(json);
                        }
                    },
                    click: () => {},
                    remove: () => {},
                };
            }
            return oldCreateElement();
        };

        window.exportConfigJSON();
        global.document.createElement = oldCreateElement;

        assert.ok(
            Object.hasOwn(exportedConfig, 'quota'),
            "Exported config should contain 'quota' key"
        );
        assert.ok(
            !Object.hasOwn(exportedConfig, 'roleQuota'),
            "Exported config should not contain 'roleQuota' key"
        );
        assert.deepStrictEqual(exportedConfig.quota, { A: 3, B: 3 }, 'Quota object should match');

        // Reset and Import
        quota = {};
        const importEvent = {
            target: {
                files: [
                    {
                        name: 'config.json',
                        content: JSON.stringify(exportedConfig),
                    },
                ],
            },
        };

        const oldFileReader = global.FileReader;
        global.FileReader = function () {
            this.readAsText = (file) => {
                this.onload({ target: { result: file.content } });
            };
        };

        window.importConfigJSON(importEvent);
        global.FileReader = oldFileReader;

        assert.deepStrictEqual(
            quota,
            { A: 3, B: 3 },
            'Quota should be successfully restored on import'
        );
        console.log('✅ TEST 7 PASSED: SAVE/LOAD ROUND TRIP — UNIFIED KEY');
        passed++;
    } catch (e) {
        console.log('❌ TEST 7 FAILED:', e.message);
        failed++;
    }

    // TEST 8: MIGRATION — OLD "roleQuota" KEY LOADS CORRECTLY
    try {
        resetMocks();
        quota = {};
        const oldConfig = {
            doctors: ['A', 'B'],
            roleQuota: { R1: 10, R2: 5 },
        };

        const importEvent = {
            target: {
                files: [
                    {
                        content: JSON.stringify(oldConfig),
                    },
                ],
            },
        };

        const oldFileReader = global.FileReader;
        global.FileReader = function () {
            this.readAsText = (file) => {
                this.onload({ target: { result: file.content } });
            };
        };

        window.importConfigJSON(importEvent);
        global.FileReader = oldFileReader;

        assert.deepStrictEqual(quota, { R1: 10, R2: 5 }, 'Old roleQuota should migrate to quota');

        // Export again and verify it is under 'quota'
        let reExportedConfig;
        const oldCreateElement = global.document.createElement;
        global.document.createElement = (tag) => {
            if (tag === 'a') {
                return {
                    setAttribute: (attr, val) => {
                        if (attr === 'href') {
                            const json = decodeURIComponent(
                                val.replace('data:text/json;charset=utf-8,', '')
                            );
                            reExportedConfig = JSON.parse(json);
                        }
                    },
                    click: () => {},
                    remove: () => {},
                };
            }
            return oldCreateElement();
        };

        window.exportConfigJSON();
        global.document.createElement = oldCreateElement;

        assert.deepStrictEqual(
            reExportedConfig.quota,
            { R1: 10, R2: 5 },
            "Migrated config should be exported under 'quota'"
        );
        assert.ok(
            !Object.hasOwn(reExportedConfig, 'roleQuota'),
            "Migrated config export should not contain 'roleQuota'"
        );
        console.log('✅ TEST 8 PASSED: MIGRATION — OLD "roleQuota" KEY LOADS CORRECTLY');
        passed++;
    } catch (e) {
        console.log('❌ TEST 8 FAILED:', e.message);
        failed++;
    }

    // TEST 9: UNKNOWN KEY IN QUOTA — WARNING NO CRASH
    try {
        resetMocks();
        global.doctors = ['A', 'B'];
        mockDOM['chkRoleBased'].checked = false;
        mockDOM['inputSinglePoolQuota'].value = 'Ghost:5';

        parseUIConfig();

        assert.strictEqual(Object.hasOwn(quota, 'Ghost'), false, 'Ghost key should be deleted');
        assert.ok(
            toastMessages.some((t) => t.msg.includes('Ghost')),
            'Warning toast for Ghost should be shown'
        );
        console.log('✅ TEST 9 PASSED: UNKNOWN KEY IN QUOTA — WARNING NO CRASH');
        passed++;
    } catch (e) {
        console.log('❌ TEST 9 FAILED:', e.message);
        failed++;
    }

    // TEST 10: SWITCHING MODES CLEARS PREVIOUS QUOTA
    try {
        resetMocks();
        global.doctors = ['A', 'B'];
        mockDOM['inputDoctorRoles'].value = 'A:R1, B:R2';
        mockDOM['chkAllowBlankDays'].checked = true;

        // Set single-pool input
        mockDOM['chkRoleBased'].checked = false;
        mockDOM['inputSinglePoolQuota'].value = 'A:5, B:4';

        // Reparse
        parseUIConfig();
        assert.deepStrictEqual(quota, { A: 5, B: 4 }, 'Quota parsed from single-pool input');

        // Toggle roleBased ON
        mockDOM['chkRoleBased'].checked = true;
        mockDOM['inputRoleQuotas'].value = 'R1:12, R2:10';

        // Reparse
        parseUIConfig();
        assert.deepStrictEqual(
            quota,
            { R1: 12, R2: 10 },
            'Quota parsed from role input after toggling ON'
        );

        // Toggle roleBased OFF
        mockDOM['chkRoleBased'].checked = false;

        // Reparse
        parseUIConfig();
        assert.deepStrictEqual(
            quota,
            { A: 5, B: 4 },
            'Quota parsed from single-pool input after toggling OFF'
        );
        console.log('✅ TEST 10 PASSED: SWITCHING MODES CLEARS PREVIOUS QUOTA');
        passed++;
    } catch (e) {
        console.log('❌ TEST 10 FAILED:', e.message);
        failed++;
    }

    console.log(`\nPASSED: ${passed}, FAILED: ${failed}`);
    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
