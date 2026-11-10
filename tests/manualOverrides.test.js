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
                classList: { add: () => {}, remove: () => {}, contains: () => true },
                innerHTML: '',
                setAttribute: () => {},
                innerText: '',
                style: { display: '' },
                dispatchEvent: () => {},
                querySelectorAll: () => [],
                insertBefore: () => {},
                appendChild: () => {},
                querySelector: () => ({
                    classList: { add: () => {}, remove: () => {}, contains: () => true },
                    innerHTML: '',
                }),
            };
        }
        return mockDOM[id];
    },
    createElement: () => ({
        setAttribute: () => {},
        appendChild: () => {},
        classList: { add: () => {}, remove: () => {}, contains: () => true },
        click: () => {},
        remove: () => {},
        querySelector: () => ({ innerHTML: '' }),
    }),
    body: {
        appendChild: () => {},
        classList: { add: () => {}, remove: () => {}, contains: () => true },
    },
    addEventListener: () => {},
    documentElement: {
        lang: 'en',
        classList: { add: () => {}, remove: () => {}, contains: () => true },
    },
    querySelectorAll: () => [],
};

global.window = {
    innerWidth: 1024,
    XLSX: {},
    addEventListener: () => {},
    setTimeout: (fn) => fn(),
};
global.localStorage = { getItem: () => 'en', setItem: () => {} };
global.currentLang = 'en';
global.lucide = { createIcons: () => {} };

let toastMessages = [];

function resetMocks() {
    Object.keys(mockDOM).forEach((key) => delete mockDOM[key]);
    mockDOM['selectCalendarScope'] = { value: '', innerHTML: '', options: [] };
    toastMessages = [];

    mockDOM['inputMonth'] = { value: '1' };
    mockDOM['inputYear'] = { value: '2026' };
    mockDOM['inputDefaultSlots'] = { value: '2' };
    mockDOM['chkAllowBlankDays'] = { checked: false };
    mockDOM['chkRoleBased'] = { checked: false };
    mockDOM['btnCalculate'] = { disabled: false, innerHTML: 'Calculate' };

    globalResult = null;
    isCalculating = false;
    isCustomDateRange = false;
    scheduleDates = [];
    for (let i = 1; i <= 31; i++) {
        scheduleDates.push(new Date(2026, 0, i));
    }
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
appJsCode = appJsCode.replace(/const undoStack = /g, 'global.undoStack = ');
appJsCode = appJsCode.replace(/window\./g, 'global.');

appJsCode = appJsCode.replace(
    /function showToast\(msg, isError = false\) \{/,
    'function showToast(msg, isError = false) { toastMessages.push({msg, isError});'
);
eval(appJsCode);

// These tests exercise override plumbing, not the hard rules (see overrideValidation.test.js)
const relax = () =>
    Object.assign(globalResult.config, {
        offDutyPeriod: 1,
        offMap: {},
        quota: {},
        minNightShifts: 0,
        roleBased: false,
        carryOver: null,
        areConflicting: () => false,
    });
const freeIdx = (day) =>
    doctors.findIndex((d) => !globalResult.schedule[day - 1].selectedDocs.some((s) => s.name === d));

async function runTests() {
    console.log('Running manualOverrides.test.js...');
    let passed = 0;

    // TEST 1: Manual Override survives recalculation
    try {
        resetMocks();
        doctors = ['A', 'B', 'C'];
        manualOverrides = {};

        await global.generateSchedule();

        // Before override
        let initialDoc = globalResult.schedule[4].selectedDocs[1].name; // Day 5, slot 1

        // Apply override (C is index 2 in ["A", "B", "C"])
        relax();
        const free = freeIdx(5);
        global.updateDoctorAssignment(5, 1, free); // Day 5, slot 1 -> the doctor not on that day

        // Assert manualOverrides is updated correctly
        assert.strictEqual(manualOverrides['5']['1'], doctors[free]);

        // Re-generate schedule
        await global.generateSchedule();

        let newDoc = globalResult.schedule[4].selectedDocs[1].name;
        assert.strictEqual(newDoc, doctors[free], 'Override must persist through schedule generation');

        console.log('✅ TEST 1 PASSED: OVERRIDE SURVIVES RECALCULATION');
        passed++;
    } catch (e) {
        console.error('❌ TEST 1 FAILED:', e.stack);
    }

    // TEST 2: Resetting an override removes it
    try {
        resetMocks();
        doctors = ['A', 'B', 'C'];
        manualOverrides = { 5: { 1: 'C' } };

        await global.generateSchedule();
        assert.strictEqual(globalResult.schedule[4].selectedDocs[1].name, 'C');

        // Reset override (simulating UI passing -1)
        global.resetSlotToAuto(5, 1);

        // Assert manualOverrides is updated correctly
        assert.strictEqual(
            manualOverrides['5'] && manualOverrides['5']['1'],
            undefined,
            'Override should be deleted from state'
        );

        // Re-generate schedule
        await global.generateSchedule();

        // It shouldn't necessarily be "C" anymore since it's auto (or it could be by chance, but we just verify it was removed from manualOverrides)

        console.log('✅ TEST 2 PASSED: RESETTING OVERRIDE DELETES FROM STATE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 2 FAILED:', e.stack);
    }

    // TEST 3: Undo Stack
    try {
        resetMocks();
        doctors = ['A', 'B', 'C'];
        manualOverrides = {};
        // clear undo stack by emptying array if possible, wait, undoStack is a const in app.js
        // We can't clear a const array, but we can verify our new action is added.
        let initialLen = undoStack.length;

        await global.generateSchedule();

        relax();
        global.updateDoctorAssignment(10, 0, freeIdx(10));
        assert.strictEqual(undoStack.length, initialLen + 1, 'Undo stack should increase');
        assert.strictEqual(typeof undoStack[undoStack.length - 1], 'object');

        console.log('✅ TEST 3 PASSED: OVERRIDE PUSHES TO UNDO STACK');
        passed++;
    } catch (e) {
        console.error('❌ TEST 3 FAILED:', e.stack);
    }

    // TEST 4: UNDO STACK 20-ITEM CAP
    try {
        resetMocks();
        doctors = ['A', 'B', 'C'];
        manualOverrides = {};
        // Clear undo stack
        while (undoStack.length > 0) undoStack.pop();

        await global.generateSchedule();

        // Push 25 distinct overrides
        for (let i = 0; i < 25; i++) {
            manualOverrides = { [String(i + 1)]: { 0: 'C' } };
            global.pushToUndoStack();
        }

        assert.strictEqual(undoStack.length <= 20, true, 'Undo stack must never exceed 20 items');
        assert.strictEqual(undoStack.length, 20, 'Undo stack should be exactly 20 after 25 pushes');

        // 25th undo call should not crash
        let noCrash = true;
        for (let i = 0; i < 25; i++) {
            try {
                global.undoLastAction();
            } catch (e) {
                noCrash = false;
            }
        }
        assert.strictEqual(noCrash, true, '25 undo calls should not crash');

        console.log('✅ TEST 4 PASSED: UNDO STACK 20-ITEM CAP');
        passed++;
    } catch (e) {
        console.error('❌ TEST 4 FAILED:', e.stack);
    }

    // TEST 5: UNDO WITH NO HISTORY — NO CRASH
    try {
        resetMocks();
        doctors = ['A', 'B', 'C'];
        manualOverrides = {};
        // Clear undo stack
        while (undoStack.length > 0) undoStack.pop();

        let prevOverrides = JSON.stringify(manualOverrides);

        // Should not throw
        let noCrash = true;
        try {
            global.undoLastAction();
        } catch (e) {
            noCrash = false;
        }

        assert.strictEqual(noCrash, true, 'undoLastAction with empty stack should not throw');
        assert.strictEqual(
            JSON.stringify(manualOverrides),
            prevOverrides,
            'State should be unchanged'
        );

        // Should show "Nothing to undo" toast
        let hasToast = toastMessages.some((t) => t.isError && t.msg.includes('Nothing to undo'));
        assert.strictEqual(hasToast, true, "Should show 'Nothing to undo' toast");

        console.log('✅ TEST 5 PASSED: UNDO WITH NO HISTORY — NO CRASH');
        passed++;
    } catch (e) {
        console.error('❌ TEST 5 FAILED:', e.stack);
    }

    // TEST 6: SHORTAGE MARKER SLOT OVERRIDE
    try {
        resetMocks();
        doctors = ['A', 'B'];
        offData = [];
        manualOverrides = {};
        mockDOM['chkRoleBased'].checked = true;
        mockDOM['inputDoctorRoles'] = { value: 'A:R1, B:R1' };
        mockDOM['inputDefaultRoleSlots'] = { value: 'R1:1, R2:1' };
        mockDOM['chkAllowBlankDays'] = { checked: true };

        await global.generateSchedule();

        assert.notStrictEqual(globalResult, null);

        // Find a shortage slot
        let shortageDay = -1;
        let shortageSlot = -1;
        for (let i = 0; i < globalResult.schedule.length; i++) {
            let docs = globalResult.schedule[i].selectedDocs;
            for (let j = 0; j < docs.length; j++) {
                if (docs[j].name === '__SHORTAGE__') {
                    shortageDay = i + 1;
                    shortageSlot = j;
                    break;
                }
            }
            if (shortageDay > 0) break;
        }

        assert.strictEqual(shortageDay > 0, true, 'Should have at least one shortage slot');

        // Count initial shortages
        let initialShortages = 0;
        globalResult.schedule.forEach((day) => {
            day.selectedDocs.forEach((d) => {
                if (d.name === '__SHORTAGE__') initialShortages++;
            });
        });

        relax();
        // Override shortage slot with doctor A
        const freeDoc = freeIdx(shortageDay);
        assert.ok(freeDoc >= 0, 'a doctor must be free that day');
        global.updateDoctorAssignment(shortageDay, shortageSlot, freeDoc);

        // Verify the slot now contains doctor A
                let overriddenDoc = globalResult.schedule[shortageDay - 1].selectedDocs[shortageSlot].name;
        assert.strictEqual(overriddenDoc, doctors[freeDoc], 'Slot should now contain the free doctor');

        // Count new shortages
        let newShortages = 0;
        globalResult.schedule.forEach((day) => {
            day.selectedDocs.forEach((d) => {
                if (d.name === '__SHORTAGE__') newShortages++;
            });
        });
        assert.strictEqual(
            newShortages,
            initialShortages - 1,
            'Shortage count should decrease by 1'
        );

        console.log('✅ TEST 6 PASSED: SHORTAGE MARKER SLOT OVERRIDE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 6 FAILED:', e.stack);
    }

    const totalTests = 6;
    console.log(`\nmanualOverrides: PASSED: ${passed}, FAILED: ${totalTests - passed}\n`);
}

runTests();
