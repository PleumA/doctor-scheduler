const fs = require('fs');
const assert = require('assert');

// Mock Globals
global.document = {
    getElementById: () => null,
    addEventListener: () => {},
    createElement: (tag) => ({
        className: '',
        innerHTML: '',
        style: {},
        setAttribute: () => {},
        querySelector: () => ({ textContent: '' }),
        appendChild: () => {},
        click: () => {},
        remove: () => {},
    }),
    body: {
        appendChild: () => {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
    },
};
global.window = {
    addEventListener: () => {},
    setTimeout: (fn) => fn(),
};
global.localStorage = { getItem: () => 'en', setItem: () => {} };
global.lucide = { createIcons: () => {} };

let appJsCode =
    fs.readFileSync('translations.js', 'utf8') +
    '\n' +
    fs.readFileSync('calendarExport.js', 'utf8') +
    '\n' +
    fs.readFileSync('app.js', 'utf8');

// Mock showToast by renaming the original function so it doesn't conflict
appJsCode = appJsCode.replace(
    'function showToast(msg, isError = false) {',
    'function original_showToast_disabled(msg, isError = false) {'
);

// Strip 'let' to expose globals
appJsCode = appJsCode.replace(/let doctors = /g, 'global.doctors = ');
appJsCode = appJsCode.replace(/let offData = /g, 'global.offData = ');
appJsCode = appJsCode.replace(/let extraSlotsData = /g, 'global.extraSlotsData = ');
appJsCode = appJsCode.replace(/let manualOverrides = /g, 'global.manualOverrides = ');
appJsCode = appJsCode.replace(/let quota = /g, 'global.quota = ');
appJsCode = appJsCode.replace(/let globalResult = /g, 'global.globalResult = ');
appJsCode = appJsCode.replace(/let scheduleDates = /g, 'global.scheduleDates = ');

let lastToastMessage = null;
global.showToast = (msg, isError = false) => {
    lastToastMessage = msg;
};

eval(appJsCode);

console.log('Running Shift-Based Scheduling Unit Tests...');
let passed = 0;

let mockDOM = {};
global.document.getElementById = (id) => {
    if (!mockDOM[id]) {
        mockDOM[id] = {
            value: '',
            checked: false,
            classList: { add: () => {}, remove: () => {}, contains: () => false },
            style: {},
            dispatchEvent: () => {},
            setAttribute: () => {},
            removeAttribute: () => {},
            querySelectorAll: () => [],
            innerHTML: '',
            appendChild: () => {},
            insertBefore: () => {},
        };
    }
    return mockDOM[id];
};

function resetMocks() {
    mockDOM = {};
    mockDOM['selectCalendarScope'] = { value: '', innerHTML: '', options: [] };
    lastToastMessage = null;
    const defaultVals = {
        inputMonth: '1',
        inputYear: '2026',
        inputDefaultSlots: '1',
        inputSpecialHols: '',
        inputNoDuty: '',
        inputDoctorRoles: '',
        inputDefaultRoleSlots: '',
        inputRoleQuotas: '',
        inputSinglePoolQuota: '',
        inputConflicts: '',
        inputSpecialDays: '0',
        inputSpecialDocs: '',
        chkUseSpecialRule: false,
        inputOffDutyPeriod: '1',
        chkPreventLongGaps: false,
        chkBalanceShifts: false,
        chkAllowBlankDays: false,
        chkRoleBased: false,
        chkCustomDateRange: false,
        lockConditionType: 'firstNDays',
        selectLockWeekday: '0',
        inputSpecialStartDay: '1',
        chkSoftAlternate: false,
        selectAlternateStrength: 'medium',

        // Shift-Based fields
        chkShiftBased: false,
        inputMorningSlots: '1',
        inputAfternoonSlots: '1',
        inputNightSlots: '1',
    };
    for (let key in defaultVals) {
        let val = defaultVals[key];
        let obj = {
            classList: { add: () => {}, remove: () => {}, contains: () => false },
            style: {},
            dispatchEvent: () => {},
            setAttribute: () => {},
            removeAttribute: () => {},
            querySelectorAll: () => [],
            innerHTML: '',
            appendChild: () => {},
            insertBefore: () => {},
        };
        if (typeof val === 'boolean') obj.checked = val;
        else obj.value = val;
        mockDOM[key] = obj;
    }

    global.doctors = [];
    global.offData = [];
    global.extraSlotsData = [];
    global.manualOverrides = {};
    global.quota = {};
    global.globalResult = null;
    global.scheduleDates = [];
}

async function runTest(name, testFn) {
    try {
        await testFn();
        console.log(`✅ ${name} PASSED`);
        passed++;
    } catch (e) {
        console.error(`❌ ${name} FAILED:`, e.message);
        console.error(e.stack);
    }
}

(async function runAll() {
    // TEST 1: Slot Configuration Parsing
    await runTest('TEST 1: Slot Configuration Parsing', async () => {
        resetMocks();
        mockDOM['chkShiftBased'].checked = true;
        mockDOM['inputMorningSlots'].value = '2';
        mockDOM['inputAfternoonSlots'].value = '1';
        mockDOM['inputNightSlots'].value = '2';

        const config = parseUIConfig();
        assert.strictEqual(config.isShiftBased, true);
        assert.strictEqual(config.morningSlots, 2);
        assert.strictEqual(config.afternoonSlots, 1);
        assert.strictEqual(config.nightSlots, 2);

        // Assert that getRoleSlotsForDay returns the sum of 5 slots
        const daySlots = config.getRoleSlotsForDay(1);
        assert.strictEqual(daySlots['Default'], 5);

        // Assert fallback of all zeros configuration to 1, 1, 1
        resetMocks();
        mockDOM['chkShiftBased'].checked = true;
        mockDOM['inputMorningSlots'].value = '0';
        mockDOM['inputAfternoonSlots'].value = '0';
        mockDOM['inputNightSlots'].value = '0';

        const configZero = parseUIConfig();
        assert.strictEqual(configZero.morningSlots, 1);
        assert.strictEqual(configZero.afternoonSlots, 1);
        assert.strictEqual(configZero.nightSlots, 1);
    });

    // TEST 2: Night-to-Morning Spacing Constraint
    await runTest('TEST 2: Night-to-Morning Spacing Constraint', async () => {
        resetMocks();
        global.doctors = ['DocA', 'DocB'];
        mockDOM['chkShiftBased'].checked = true;
        mockDOM['inputMorningSlots'].value = '1';
        mockDOM['inputAfternoonSlots'].value = '0';
        mockDOM['inputNightSlots'].value = '1'; // Total 2 slots per day: slot 0 is Morning, slot 1 is Night

        await window.generateSchedule();
        assert.ok(globalResult);

        // Find who worked Night on Day 1 (index 1)
        const day1NightDoc = globalResult.schedule[0].selectedDocs[1].name;
        assert.ok(day1NightDoc === 'DocA' || day1NightDoc === 'DocB');

        // On Day 2, that same doctor CANNOT work Morning (index 0).
        const day2MorningDoc = globalResult.schedule[1].selectedDocs[0].name;
        assert.notStrictEqual(
            day2MorningDoc,
            day1NightDoc,
            'The doctor who worked Night on Day 1 cannot work Morning on Day 2'
        );
    });

    // TEST 3: Off Requests Rules in Shift-Based Mode
    await runTest('TEST 3: Off Requests Rules in Shift-Based Mode', async () => {
        resetMocks();
        global.doctors = ['DocA', 'DocB'];
        mockDOM['chkShiftBased'].checked = true;
        mockDOM['inputMorningSlots'].value = '1';
        mockDOM['inputAfternoonSlots'].value = '1';
        mockDOM['inputNightSlots'].value = '1'; // Total 3 slots per day (indices: 0 = M, 1 = A, 2 = N)

        // DocA requests Day 2 off
        global.offData = [
            { id: 1, date: '2', names: 'DocA' }, // Only Day 2 is off, Day 1 is active
        ];

        await window.generateSchedule();
        assert.ok(globalResult);

        // Assert DocA is not scheduled on Day 2 at all
        globalResult.schedule[1].selectedDocs.forEach((s) => {
            if (s) assert.notStrictEqual(s.name, 'DocA', 'DocA should not work on Day 2 (off day)');
        });

        // Assert DocA is NOT blocked from Morning or Afternoon slots on Day 1 (day before off day)
        const day1Assigned = globalResult.schedule[0].selectedDocs.map((s) => (s ? s.name : ''));
        assert.ok(
            day1Assigned.includes('DocA'),
            'DocA should still work on Day 1 (before off day)'
        );

        // Assert DocA is NOT scheduled on Night slot of Day 1 (index 2)
        assert.notStrictEqual(
            globalResult.schedule[0].selectedDocs[2].name,
            'DocA',
            'DocA cannot work Night shift on Day 1 before Day 2 off'
        );
    });

    // TEST 4: Cascade Resilience
    await runTest('TEST 4: Cascade Resilience', async () => {
        resetMocks();
        global.doctors = ['DocA', 'DocB'];
        mockDOM['chkShiftBased'].checked = true;
        mockDOM['inputMorningSlots'].value = '1';
        mockDOM['inputAfternoonSlots'].value = '0';
        mockDOM['inputNightSlots'].value = '1';

        // Force DocB onto Day 1 slot 0 (Morning) using Lock Special Duty
        mockDOM['chkUseSpecialRule'].checked = true;
        mockDOM['inputSpecialDays'].value = '1';
        mockDOM['inputSpecialDocs'].value = 'DocB';
        mockDOM['lockConditionType'].value = 'firstNDays';
        mockDOM['inputSpecialStartDay'].value = '1';

        // DocB is off on Day 2
        global.offData = [{ id: 1, date: '2', names: 'DocB' }];

        await window.generateSchedule();
        assert.ok(globalResult);

        // Day 1 slot 0 is locked to DocB, so Day 1 slot 1 (Night) must be DocA
        assert.strictEqual(
            globalResult.schedule[0].selectedDocs[0].name,
            'DocB',
            'Day 1 Morning is DocB'
        );
        assert.strictEqual(
            globalResult.schedule[0].selectedDocs[1].name,
            'DocA',
            'Day 1 Night is DocA'
        );

        // Day 2 Morning (index 0) must NOT be DocA (should be shortage since DocA is blocked by Night-to-Morning rule, and DocB is off)
        const day2MorningName = globalResult.schedule[1].selectedDocs[0].name;
        assert.ok(
            day2MorningName === '-' ||
                day2MorningName === 'ภาระงานไม่สมดุล' ||
                day2MorningName === 'เวรว่าง' ||
                day2MorningName === '__SHORTAGE__',
            'Day 2 Morning must be blank/shortage: ' + day2MorningName
        );
    });

    // TEST 5: Manual Overrides Explanation
    await runTest('TEST 5: Manual Overrides Explanation', async () => {
        resetMocks();
        const config = parseUIConfig();
        config.isShiftBased = true;
        config.morningSlots = 1;
        config.afternoonSlots = 1;
        config.nightSlots = 1;

        // Mock schedule results for manual assignments
        globalResult = {
            schedule: [
                {
                    day: 1,
                    selectedDocs: [
                        { name: 'DocA', role: 'Default' },
                        { name: 'DocB', role: 'Default' },
                        { name: 'DocA', role: 'Default' },
                    ], // Slot 2 (Night) is DocA
                },
                {
                    day: 2,
                    selectedDocs: [
                        { name: 'DocA', role: 'Default' },
                        { name: 'DocB', role: 'Default' },
                        { name: 'DocB', role: 'Default' },
                    ], // Slot 0 (Morning) is DocA
                },
            ],
        };

        // Trigger explainSlotFailure for DocA on Day 2 (where they consecutive work Night -> Morning)
        lastToastMessage = null;
        window.explainSlotFailure(2, 'DocA', config);
        assert.ok(lastToastMessage);
        assert.ok(
            lastToastMessage.includes('worked Night shift yesterday') ||
                lastToastMessage.includes('ต่อเวรเช้าหลังเวรดึกเมื่อวาน'),
            'Should warn about consecutive Night-to-Morning override: ' + lastToastMessage
        );

        // Trigger for Day 1 Night shift when Day 2 is off day
        config.offMap = {
            2: new Set(['DocA']),
        };
        lastToastMessage = null;
        window.explainSlotFailure(1, 'DocA', config);
        assert.ok(lastToastMessage);
        assert.ok(
            lastToastMessage.includes('assigned to Night shift before off day') ||
                lastToastMessage.includes('ลงเวรดึกในวันก่อนขอพัก'),
            'Should warn about Night shift before off day: ' + lastToastMessage
        );
    });

    // TEST 6: Config JSON Serialization & Migration
    await runTest('TEST 6: Config JSON Serialization & Migration', async () => {
        resetMocks();
        mockDOM['chkShiftBased'].checked = true;
        mockDOM['inputMorningSlots'].value = '3';
        mockDOM['inputAfternoonSlots'].value = '2';
        mockDOM['inputNightSlots'].value = '1';

        // Verify backup serializes the correct keys
        // Mock download anchor click to capture data
        let capturedConfig = null;
        const oldCreateElement = global.document.createElement;
        global.document.createElement = (tag) => {
            const el = oldCreateElement(tag);
            el.setAttribute = (attr, val) => {
                if (attr === 'href') {
                    const decoded = decodeURIComponent(
                        val.replace('data:text/json;charset=utf-8,', '')
                    );
                    capturedConfig = JSON.parse(decoded);
                }
            };
            return el;
        };

        window.exportConfigJSON();
        global.document.createElement = oldCreateElement;

        assert.ok(capturedConfig);
        assert.strictEqual(capturedConfig.inputs.inputMorningSlots, '3');
        assert.strictEqual(capturedConfig.inputs.inputAfternoonSlots, '2');
        assert.strictEqual(capturedConfig.inputs.inputNightSlots, '1');
        assert.strictEqual(capturedConfig.checkboxes.chkShiftBased, true);

        // Mock import from old config without shift-based properties
        const oldConfigMock = {
            doctors: ['DocA', 'DocB'],
            offData: [],
            extraSlotsData: [],
            inputs: {},
            checkboxes: {},
        };

        // Mock file loading event
        const mockEvent = {
            target: {
                files: [
                    {
                        name: 'config.json',
                    },
                ],
            },
        };

        // Mock FileReader
        global.FileReader = function () {
            this.readAsText = () => {
                this.onload({ target: { result: JSON.stringify(oldConfigMock) } });
            };
        };

        window.importConfigJSON(mockEvent);

        // Verify default fallback variables populated
        assert.strictEqual(mockDOM['chkShiftBased'].checked, false);
        assert.strictEqual(mockDOM['inputMorningSlots'].value, '1');
        assert.strictEqual(mockDOM['inputAfternoonSlots'].value, '1');
        assert.strictEqual(mockDOM['inputNightSlots'].value, '1');
    });

    // TEST 7: View Layout & Copy/Export
    await runTest('TEST 7: View Layout & Copy/Export', async () => {
        resetMocks();
        mockDOM['chkShiftBased'].checked = true;
        mockDOM['inputMorningSlots'].value = '2';
        mockDOM['inputAfternoonSlots'].value = '1';
        mockDOM['inputNightSlots'].value = '1';

        const config = parseUIConfig();

        globalResult = {
            maxSlots: 4,
            month: 1,
            year: 2026,
            doctors: ['DocA', 'DocB', 'DocC', 'DocD'],
            dates: [new Date(2026, 0, 1)],
            isCustomDateRange: false,
            config,
            schedule: [
                {
                    day: 1,
                    dayName: 'Mon',
                    selectedDocs: [
                        { name: 'DocA' },
                        { name: 'DocB' },
                        { name: 'DocC' },
                        { name: 'DocD' },
                    ],
                    note: '',
                },
            ],
        };

        // Mock copy to clipboard function
        let capturedTSV = null;
        global.navigator = global.navigator || {}; // Node < 21 has no global navigator
        global.navigator.clipboard = {
            writeText: async (text) => {
                capturedTSV = text;
            },
        };

        window.copyScheduleForExcel();
        assert.ok(capturedTSV);
        assert.ok(
            capturedTSV.includes('Morning (8-16)') ||
                capturedTSV.includes('เวรเช้า (08:00 - 16:00)')
        );
        assert.ok(
            capturedTSV.includes('Afternoon (16-24)') ||
                capturedTSV.includes('เวรบ่าย (16:00 - 24:00)')
        );
        assert.ok(
            capturedTSV.includes('Night (24-8)') || capturedTSV.includes('เวรดึก (24:00 - 08:00)')
        );

        // Render Summary Table detailed shifts verification
        globalResult.summary = [
            {
                name: 'DocA',
                workdays: 1,
                holidays: 0,
                total: 1,
                morning: 1,
                afternoon: 0,
                night: 0,
            },
        ];

        renderSummaryTable(config);

        const sumHeader = mockDOM['summaryTableHeader'];
        const sumBody = mockDOM['summaryTableBody'];
        assert.ok(
            sumHeader &&
                (sumHeader.innerHTML.includes('Morning') || sumHeader.innerHTML.includes('เช้า'))
        );
        assert.ok(sumBody && sumBody.innerHTML.includes('DocA'));
    });

    // TEST 8: Role-Based Mode with Shift-Based Mode Compatibility
    await runTest('TEST 8: Role-Based Mode with Shift-Based Mode Compatibility', async () => {
        resetMocks();
        global.doctors = ['DocA', 'DocB', 'DocC'];
        mockDOM['chkShiftBased'].checked = true;
        mockDOM['chkRoleBased'].checked = true;
        mockDOM['inputMorningSlots'].value = '1';
        mockDOM['inputAfternoonSlots'].value = '1';
        mockDOM['inputNightSlots'].value = '1';

        mockDOM['inputDoctorRoles'].value = 'DocA:R1, DocB:R2, DocC:R1';
        mockDOM['inputDefaultRoleSlots'].value = 'R1:1, R2:1';

        await window.generateSchedule();
        assert.ok(globalResult);

        const day1Morning = globalResult.schedule[0].selectedDocs[0].name;
        const day1Afternoon = globalResult.schedule[0].selectedDocs[1].name;
        const day1Night = globalResult.schedule[0].selectedDocs[2].name;

        assert.ok(
            day1Morning === 'DocA' || day1Morning === 'DocC',
            'Morning shift should be assigned to an R1 doctor (DocA or DocC)'
        );
        assert.ok(
            day1Afternoon === 'DocA' || day1Afternoon === 'DocC',
            'Afternoon shift should be assigned to an R1 doctor (DocA or DocC)'
        );
        assert.strictEqual(
            day1Night,
            'DocB',
            'Night shift should be assigned to the R2 doctor (DocB)'
        );
    });

    // TEST 9: Shift Alternation Rotation
    await runTest('TEST 9: Shift Alternation Rotation', async () => {
        resetMocks();
        global.doctors = ['DocA', 'DocB', 'DocC'];
        mockDOM['chkShiftBased'].checked = true;
        mockDOM['inputMorningSlots'].value = '1';
        mockDOM['inputAfternoonSlots'].value = '1';
        mockDOM['inputNightSlots'].value = '1';

        await window.generateSchedule();
        assert.ok(globalResult);

        // Count shifts per type for DocA
        let mCount = 0;
        let aCount = 0;
        let nCount = 0;
        globalResult.schedule.forEach((day) => {
            day.selectedDocs.forEach((docObj, idx) => {
                if (docObj.name === 'DocA') {
                    if (idx === 0) mCount++;
                    else if (idx === 1) aCount++;
                    else if (idx === 2) nCount++;
                }
            });
        });

        const total = mCount + aCount + nCount;
        // Verify that DocA alternates shifts instead of working only one type
        if (total > 1) {
            const maxSingleType = Math.max(mCount, aCount, nCount);
            assert.ok(
                maxSingleType < total,
                `DocA should alternate shifts instead of working only one type (M:${mCount}, A:${aCount}, N:${nCount})`
            );
        }
    });

    // TEST 10: Summary Recalculation (recalculateCounts)
    await runTest('TEST 10: Summary Recalculation (recalculateCounts)', async () => {
        resetMocks();
        global.doctors = ['DocA'];
        mockDOM['chkShiftBased'].checked = true;
        mockDOM['inputMorningSlots'].value = '1';
        mockDOM['inputAfternoonSlots'].value = '1';
        mockDOM['inputNightSlots'].value = '1';

        globalResult = {
            maxSlots: 3,
            month: 1,
            year: 2026,
            doctors: ['DocA'],
            schedule: [
                {
                    day: 1,
                    dayName: 'Mon',
                    isNoDuty: false,
                    slots: 3,
                    selectedDocs: [{ name: 'DocA' }, { name: 'SHORTAGE' }, { name: 'DocA' }],
                    note: '',
                },
            ],
        };

        const config = parseUIConfig();
        recalculateCounts(config);

        assert.ok(globalResult.summary);
        const docASum = globalResult.summary.find((s) => s.name === 'DocA');
        assert.ok(docASum);
        assert.strictEqual(
            docASum.morning,
            1,
            'DocA morning shifts count should be recalculated to 1'
        );
        assert.strictEqual(
            docASum.afternoon,
            0,
            'DocA afternoon shifts count should be recalculated to 0'
        );
        assert.strictEqual(docASum.night, 1, 'DocA night shifts count should be recalculated to 1');
        assert.strictEqual(docASum.total, 2, 'DocA total shifts count should be recalculated to 2');
    });

    console.log(`\nTests completed: ${passed}/10 passed.`);
    if (passed !== 10) {
        process.exit(1);
    }
})();
