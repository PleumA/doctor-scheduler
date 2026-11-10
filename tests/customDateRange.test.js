const fs = require('fs');
const assert = require('assert');

// 1. Mock DOM and Globals
const mockDOM = {};
let toastMessages = [];

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
    setTimeout: (fn) => fn(), // Execute immediately for tests unless we need async
};
global.navigator = { clipboard: { writeText: async () => {} } };
global.currentLang = 'en';
doctors = [];
offData = [];
extraSlotsData = [];
manualOverrides = {};
global.translations = { en: {}, th: {} };
isCalculating = false;
isInitialLoad = true;
globalResult = null;
scheduleData = [];
global.lucide = { createIcons: () => {} };
global.localStorage = { getItem: () => 'en', setItem: () => {} };
isCustomDateRange = false;
scheduleDates = [];
viewMode = 'table';

function resetMocks() {
    Object.keys(mockDOM).forEach((key) => delete mockDOM[key]);
    mockDOM['selectCalendarScope'] = { value: '', innerHTML: '', options: [] };
    toastMessages = [];
    doctors = [];
    offData = [];
    extraSlotsData = [];
    mockDOM['inputMonth'] = { value: '1', classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputYear'] = { value: '2026', classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputDefaultSlots'] = { value: '2', classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputSpecialHols'] = { value: '', classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputNoDuty'] = { value: '', classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputSpecialDocs'] = { value: '', classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputSpecialDays'] = { value: '0', classList: { add: () => {}, remove: () => {} } };
    mockDOM['chkUseSpecialRule'] = {
        checked: false,
        classList: { add: () => {}, remove: () => {} },
    };
    mockDOM['inputOffDutyPeriod'] = { value: '1', classList: { add: () => {}, remove: () => {} } };
    mockDOM['chkPreventLongGaps'] = {
        checked: false,
        classList: { add: () => {}, remove: () => {} },
    };
    mockDOM['chkBalanceShifts'] = {
        checked: false,
        classList: { add: () => {}, remove: () => {} },
    };
    mockDOM['chkAllowBlankDays'] = {
        checked: false,
        classList: { add: () => {}, remove: () => {} },
    };
    mockDOM['chkRoleBased'] = { checked: false, classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputDoctorRoles'] = { value: '', classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputDefaultRoleSlots'] = {
        value: '',
        classList: { add: () => {}, remove: () => {} },
    };
    mockDOM['inputRoleQuotas'] = { value: '', classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputConflicts'] = { value: '', classList: { add: () => {}, remove: () => {} } };
    mockDOM['chkCustomDateRange'] = {
        checked: false,
        classList: { add: () => {}, remove: () => {} },
    };
    mockDOM['inputStartDate'] = { value: '', classList: { add: () => {}, remove: () => {} } };
    mockDOM['inputEndDate'] = { value: '', classList: { add: () => {}, remove: () => {} } };
    mockDOM['toast'] = { classList: { add: () => {}, remove: () => {} } };
    mockDOM['toastContent'] = { classList: { add: () => {}, remove: () => {} }, innerHTML: '' };
    mockDOM['resultsContainer'] = { classList: { add: () => {}, remove: () => {} } };
    mockDOM['emptyState'] = { classList: { add: () => {}, remove: () => {} } };
    mockDOM['btnCalculate'] = { disabled: false, innerHTML: 'Calculate' };
    mockDOM['scheduleTableBody'] = { innerHTML: '' };
    mockDOM['scheduleTableHeader'] = { innerHTML: '' };
    mockDOM['calendarGrid'] = { innerHTML: '', appendChild: () => {} };
    mockDOM['summaryTableBody'] = { innerHTML: '' };

    globalResult = null;
    isCalculating = false;
    isCustomDateRange = false;
    scheduleDates = [];
    for (let i = 1; i <= 31; i++) {
        global.scheduleDates.push(new Date(2026, 0, i));
    }
}

// Load app.js code
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

// Override showToast to capture messages
appJsCode = appJsCode.replace(
    /function showToast\(msg, isError = false\) \{/,
    'function showToast(msg, isError = false) { toastMessages.push({msg, isError});'
);
eval(appJsCode);

console.log('Running customDateRange.test.js...');

async function runTests() {
    let passed = 0;
    let failed = 0;

    // 1. VALID RANGE
    try {
        resetMocks();
        doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '2026-05-14';
        mockDOM['inputEndDate'].value = '2026-07-02';
        isCustomDateRange = true;

        await window.generateSchedule();

        assert.strictEqual(scheduleDates.length, 50);
        assert.strictEqual(scheduleDates[0].getFullYear(), 2026);
        assert.strictEqual(scheduleDates[0].getMonth(), 4); // May
        assert.strictEqual(scheduleDates[0].getDate(), 14);
        assert.strictEqual(scheduleDates[49].getFullYear(), 2026);
        assert.strictEqual(scheduleDates[49].getMonth(), 6); // July
        assert.strictEqual(scheduleDates[49].getDate(), 2);
        assert.strictEqual(scheduleDates[0] instanceof Date, true);
        console.log('✅ TEST 1 PASSED: VALID RANGE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 1 FAILED:', e.message);
        failed++;
    }

    // 2. CROSS-MONTH DATES ARE CORRECT
    try {
        resetMocks();
        doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '2026-05-30';
        mockDOM['inputEndDate'].value = '2026-06-02';
        isCustomDateRange = true;

        await window.generateSchedule();
        assert.strictEqual(scheduleDates.length, 4);
        assert.strictEqual(scheduleDates[0].getDate(), 30);
        assert.strictEqual(scheduleDates[1].getDate(), 31);
        assert.strictEqual(scheduleDates[2].getDate(), 1);
        assert.strictEqual(scheduleDates[3].getDate(), 2);
        console.log('✅ TEST 2 PASSED: CROSS-MONTH DATES ARE CORRECT');
        passed++;
    } catch (e) {
        console.error('❌ TEST 2 FAILED:', e.message);
        failed++;
    }

    // 3. SINGLE DAY RANGE (start === end)
    try {
        resetMocks();
        doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '2026-06-01';
        mockDOM['inputEndDate'].value = '2026-06-01';
        isCustomDateRange = true;

        await window.generateSchedule();

        let hasError = toastMessages.some(
            (t) => t.isError && t.msg.includes('Start date must be before end date')
        );
        if (!hasError) {
            assert.fail('Function allowed start === end without error');
        }
        console.log('✅ TEST 3 PASSED: SINGLE DAY RANGE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 3 FAILED:', e.message);
        failed++;
    }

    // 4. START AFTER END
    try {
        resetMocks();
        doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '2026-07-01';
        mockDOM['inputEndDate'].value = '2026-06-01';
        isCustomDateRange = true;

        await window.generateSchedule();
        let hasError = toastMessages.some(
            (t) => t.isError && t.msg.includes('Start date must be before end date')
        );
        assert.strictEqual(hasError, true, 'Should return validation failure');
        assert.strictEqual(globalResult, null, 'No schedule generated');
        console.log('✅ TEST 4 PASSED: START AFTER END');
        passed++;
    } catch (e) {
        console.error('❌ TEST 4 FAILED:', e.message);
        failed++;
    }

    // 5. EMPTY START DATE
    try {
        resetMocks();
        doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '';
        mockDOM['inputEndDate'].value = '2026-07-01';
        isCustomDateRange = true;

        await window.generateSchedule();
        let hasError = toastMessages.some(
            (t) => t.isError && t.msg.includes('Please select start and end dates')
        );
        assert.strictEqual(hasError, true);
        console.log('✅ TEST 5 PASSED: EMPTY START DATE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 5 FAILED:', e.message);
        failed++;
    }

    // 6. EMPTY END DATE
    try {
        resetMocks();
        doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '2026-06-01';
        mockDOM['inputEndDate'].value = '';
        isCustomDateRange = true;

        await window.generateSchedule();
        let hasError = toastMessages.some(
            (t) => t.isError && t.msg.includes('Please select start and end dates')
        );
        assert.strictEqual(hasError, true);
        console.log('✅ TEST 6 PASSED: EMPTY END DATE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 6 FAILED:', e.message);
        failed++;
    }

    // 7. RANGE EXACTLY 90 DAYS
    try {
        resetMocks();
        doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '2026-01-01';
        mockDOM['inputEndDate'].value = '2026-03-31'; // 31 + 28 + 31 = 90 days
        isCustomDateRange = true;

        await window.generateSchedule();
        assert.strictEqual(scheduleDates.length, 90);
        console.log('✅ TEST 7 PASSED: RANGE EXACTLY 90 DAYS');
        passed++;
    } catch (e) {
        console.error('❌ TEST 7 FAILED:', e.message);
        failed++;
    }

    // 8. RANGE EXCEEDS 90 DAYS
    try {
        resetMocks();
        doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '2026-01-01';
        mockDOM['inputEndDate'].value = '2026-04-01'; // 91 days
        isCustomDateRange = true;

        await window.generateSchedule();
        let hasError = toastMessages.some(
            (t) => t.isError && t.msg.includes('Range exceeds 90 days')
        );
        assert.strictEqual(hasError, true);
        assert.strictEqual(globalResult, null);
        console.log('✅ TEST 8 PASSED: RANGE EXCEEDS 90 DAYS');
        passed++;
    } catch (e) {
        console.error('❌ TEST 8 FAILED:', e.message);
        failed++;
    }

    // 9. WEEKEND DETECTION IN CUSTOM RANGE
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '2026-05-14';
        mockDOM['inputEndDate'].value = '2026-05-20';
        global.isCustomDateRange = true;

        await window.generateSchedule();
        assert.strictEqual(scheduleDates[0].getDay(), 4, 'May 14 2026 is Thursday');
        assert.strictEqual(scheduleDates[2].getDay(), 6, 'May 16 2026 is Saturday');
        assert.strictEqual(scheduleDates[3].getDay(), 0, 'May 17 2026 is Sunday');

        // Ensure they are marked as holidays in the schedule generator
        const conf = parseUIConfig();
        assert.strictEqual(conf.holidaySet.has(3), true, 'Saturday should be in holidaySet');
        assert.strictEqual(conf.holidaySet.has(4), true, 'Sunday should be in holidaySet');

        console.log('✅ TEST 9 PASSED: WEEKEND DETECTION IN CUSTOM RANGE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 9 FAILED:', e.message);
        failed++;
    }

    // 10. CUSTOM RANGE MODE OFF
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = false;
        mockDOM['inputMonth'].value = '6';
        mockDOM['inputYear'].value = '2026';
        global.isCustomDateRange = false;

        await window.generateSchedule();
        assert.strictEqual(scheduleDates.length, 30, 'June has 30 days');
        assert.strictEqual(scheduleDates[0].getFullYear(), 2026);
        assert.strictEqual(scheduleDates[0].getMonth(), 5);
        assert.strictEqual(scheduleDates[0].getDate(), 1);
        console.log('✅ TEST 10 PASSED: CUSTOM RANGE MODE OFF');
        passed++;
    } catch (e) {
        console.error('❌ TEST 10 FAILED:', e.message);
        failed++;
    }

    // 11. CALENDAR VIEW DAY LABELS RESET AT MONTH BOUNDARY
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '2026-07-22';
        mockDOM['inputEndDate'].value = '2026-08-05';
        global.isCustomDateRange = true;
        global.viewMode = 'calendar';

        // Override createElement to return real objects that track innerHTML
        const origCreateElement = global.document.createElement;
        global.document.createElement = (tag) => ({
            innerHTML: '',
            className: '',
            setAttribute: () => {},
            appendChild: () => {},
            classList: { add: () => {}, remove: () => {} },
            click: () => {},
            remove: () => {},
        });

        // Override calendarGrid.appendChild to accumulate innerHTML
        let capturedGridHtml = '';
        mockDOM['calendarGrid'].appendChild = (el) => {
            capturedGridHtml += el.innerHTML || '';
        };

        await window.generateSchedule();
        renderCalendarView(parseUIConfig());

        // The cell for Jul 31 should show 31, not an incrementing index
        assert.strictEqual(
            capturedGridHtml.includes('>31<') ||
                capturedGridHtml.includes('>31 Jul<') ||
                capturedGridHtml.includes('>31 ก.ค.<'),
            true,
            'Jul 31 cell displays 31'
        );
        // The cell for Aug 1 should show 1, not 32
        assert.strictEqual(!capturedGridHtml.includes('>32<'), true, 'No 32 index');
        assert.strictEqual(
            capturedGridHtml.includes('>1 Aug<') || capturedGridHtml.includes('>1 ส.ค.<'),
            true,
            'Aug 1 cell displays 1 with month'
        );

        global.document.createElement = origCreateElement;
        console.log('✅ TEST 11 PASSED: CALENDAR VIEW DAY LABELS RESET AT MONTH BOUNDARY');
        passed++;
    } catch (e) {
        console.error('❌ TEST 11 FAILED:', e.message);
        failed++;
    }

    // 12. PERSON VIEW DAY LABELS RESET AT MONTH BOUNDARY
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '2026-07-22';
        mockDOM['inputEndDate'].value = '2026-08-05';
        global.isCustomDateRange = true;
        global.viewMode = 'person';

        await window.generateSchedule();

        // Mock the person view headers
        mockDOM['personViewHeader'] = { innerHTML: '' };
        mockDOM['personViewBody'] = { innerHTML: '' };

        // Need to add this since it's called by renderResults()
        const origGetElementById = global.document.getElementById;
        global.document.getElementById = (id) => {
            if (id === 'personViewHeader') return mockDOM['personViewHeader'];
            if (id === 'personViewBody') return mockDOM['personViewBody'];
            return origGetElementById(id);
        };

        renderPersonCentricView(parseUIConfig());
        let headerHtml = mockDOM['personViewHeader'].innerHTML;

        assert.strictEqual(
            headerHtml.includes('>31<') ||
                headerHtml.includes('>31 Jul<') ||
                headerHtml.includes('>31 ก.ค.<'),
            true,
            'Person view has Jul 31'
        );
        assert.strictEqual(!headerHtml.includes('>32<'), true, 'No 32 index');
        assert.strictEqual(
            headerHtml.includes('>1 Aug<') || headerHtml.includes('>1 ส.ค.<'),
            true,
            'Person view has Aug 1'
        );

        global.document.getElementById = origGetElementById;
        console.log('✅ TEST 12 PASSED: PERSON VIEW DAY LABELS RESET AT MONTH BOUNDARY');
        passed++;
    } catch (e) {
        console.error('❌ TEST 12 FAILED:', e.message);
        failed++;
    }

    // 13. LIST VIEW UNAFFECTED (REGRESSION CHECK)
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        mockDOM['inputStartDate'].value = '2026-07-22';
        mockDOM['inputEndDate'].value = '2026-08-05';
        global.isCustomDateRange = true;

        await window.generateSchedule();
        renderTableView(parseUIConfig());

        let bodyHtml = mockDOM['scheduleTableBody'].innerHTML;
        assert.strictEqual(bodyHtml.includes('31/07/2026'), true, 'List view has 31 Jul');
        assert.strictEqual(bodyHtml.includes('01/08/2026'), true, 'List view has 1 Aug');

        console.log('✅ TEST 13 PASSED: LIST VIEW UNAFFECTED');
        passed++;
    } catch (e) {
        console.error('❌ TEST 13 FAILED:', e.message);
        failed++;
    }

    // 14. AUTO-CALCULATE FIRES WHEN BOTH DATES FILLED
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        global.isCustomDateRange = true;
        mockDOM['inputStartDate'].value = '2026-07-01';

        let origGen = window.generateSchedule;
        let called = 0;
        window.generateSchedule = async () => {
            called++;
        };

        await window.handleCustomDateRangeChange(); // only start date
        mockDOM['inputEndDate'].value = '2026-07-10';
        await window.handleCustomDateRangeChange(); // both dates

        assert.strictEqual(called, 1);
        window.generateSchedule = origGen;
        console.log('✅ TEST 14 PASSED: AUTO-CALCULATE FIRES WHEN BOTH DATES FILLED');
        passed++;
    } catch (e) {
        console.error('❌ TEST 14 FAILED:', e.message);
        failed++;
    }

    // 15. AUTO-CALCULATE DOES NOT FIRE WITH ONLY START DATE
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        global.isCustomDateRange = true;
        mockDOM['inputStartDate'].value = '2026-07-01';
        mockDOM['inputEndDate'].value = '';

        let origGen = window.generateSchedule;
        let called = false;
        window.generateSchedule = async () => {
            called = true;
        };

        await window.handleCustomDateRangeChange();

        assert.strictEqual(called, false);
        window.generateSchedule = origGen;
        console.log('✅ TEST 15 PASSED: AUTO-CALCULATE DOES NOT FIRE WITH ONLY START DATE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 15 FAILED:', e.message);
        failed++;
    }

    // 16. AUTO-CALCULATE DOES NOT FIRE WITH ONLY END DATE
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        global.isCustomDateRange = true;
        mockDOM['inputStartDate'].value = '';
        mockDOM['inputEndDate'].value = '2026-07-01';

        let origGen = window.generateSchedule;
        let called = false;
        window.generateSchedule = async () => {
            called = true;
        };

        await window.handleCustomDateRangeChange();

        assert.strictEqual(called, false);
        window.generateSchedule = origGen;
        console.log('✅ TEST 16 PASSED: AUTO-CALCULATE DOES NOT FIRE WITH ONLY END DATE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 16 FAILED:', e.message);
        failed++;
    }

    // 17. AUTO-CALCULATE DOES NOT FIRE WHEN START >= END
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        global.isCustomDateRange = true;
        mockDOM['inputStartDate'].value = '2026-08-10';
        mockDOM['inputEndDate'].value = '2026-07-01';

        let origGen = window.generateSchedule;
        let called = false;
        window.generateSchedule = async () => {
            called = true;
        };

        await window.handleCustomDateRangeChange();

        assert.strictEqual(called, false);
        let hasError = toastMessages.some(
            (t) => t.isError && t.msg.includes('Start date must be before end date')
        );
        assert.strictEqual(hasError, true);

        window.generateSchedule = origGen;
        console.log('✅ TEST 17 PASSED: AUTO-CALCULATE DOES NOT FIRE WHEN START >= END');
        passed++;
    } catch (e) {
        console.error('❌ TEST 17 FAILED:', e.message);
        failed++;
    }

    // 18. AUTO-CALCULATE FIRES ON START DATE CHANGE WHEN END DATE ALREADY FILLED
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        global.isCustomDateRange = true;
        mockDOM['inputEndDate'].value = '2026-08-31';

        let origGen = window.generateSchedule;
        let called = false;
        window.generateSchedule = async () => {
            called = true;
        };

        mockDOM['inputStartDate'].value = '2026-08-01';
        await window.handleCustomDateRangeChange();

        assert.strictEqual(called, true);
        window.generateSchedule = origGen;
        console.log('✅ TEST 18 PASSED: AUTO-CALCULATE FIRES ON START DATE CHANGE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 18 FAILED:', e.message);
        failed++;
    }

    // 19. AUTO-CALCULATE FIRES ON END DATE CHANGE WHEN START DATE ALREADY FILLED
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        global.isCustomDateRange = true;
        mockDOM['inputStartDate'].value = '2026-07-01';

        let origGen = window.generateSchedule;
        let called = false;
        window.generateSchedule = async () => {
            called = true;
        };

        mockDOM['inputEndDate'].value = '2026-07-31';
        await window.handleCustomDateRangeChange();

        assert.strictEqual(called, true);
        window.generateSchedule = origGen;
        console.log('✅ TEST 19 PASSED: AUTO-CALCULATE FIRES ON END DATE CHANGE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 19 FAILED:', e.message);
        failed++;
    }

    // 20. UPDATING A DATE AFTER FIRST CALCULATION TRIGGERS RECALCULATION
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        global.isCustomDateRange = true;
        mockDOM['inputStartDate'].value = '2026-08-01';
        mockDOM['inputEndDate'].value = '2026-08-15';

        await window.handleCustomDateRangeChange();
        assert.strictEqual(scheduleDates.length, 15);

        mockDOM['inputEndDate'].value = '2026-08-31';
        await window.handleCustomDateRangeChange();
        assert.strictEqual(scheduleDates.length, 31);

        console.log('✅ TEST 20 PASSED: UPDATING A DATE AFTER FIRST CALCULATION');
        passed++;
    } catch (e) {
        console.error('❌ TEST 20 FAILED:', e.message);
        failed++;
    }

    // 21. TOGGLE ON WITH DATES PRE-FILLED — AUTO-CALCULATES
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['inputStartDate'].value = '2026-07-01';
        mockDOM['inputEndDate'].value = '2026-07-31';
        global.isCustomDateRange = false;

        // Simulating the toggle logic
        global.isCustomDateRange = true;
        await window.handleCustomDateRangeChange();

        assert.strictEqual(scheduleDates.length, 31);

        console.log('✅ TEST 21 PASSED: TOGGLE ON WITH DATES PRE-FILLED');
        passed++;
    } catch (e) {
        console.error('❌ TEST 21 FAILED:', e.message);
        failed++;
    }

    // 22. TOGGLE ON WITH DATES EMPTY — DOES NOT AUTO-CALCULATE
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['inputStartDate'].value = '';
        mockDOM['inputEndDate'].value = '';
        global.isCustomDateRange = false;

        let origGen = window.generateSchedule;
        let called = false;
        window.generateSchedule = async () => {
            called = true;
        };

        global.isCustomDateRange = true;
        await window.handleCustomDateRangeChange();

        assert.strictEqual(called, false);
        window.generateSchedule = origGen;
        console.log('✅ TEST 22 PASSED: TOGGLE ON WITH DATES EMPTY');
        passed++;
    } catch (e) {
        console.error('❌ TEST 22 FAILED:', e.message);
        failed++;
    }

    // 23. TOGGLE OFF — AUTO-RECALCULATES IN STANDARD MODE
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['inputMonth'].value = '6'; // June
        mockDOM['inputYear'].value = '2026';
        global.isCustomDateRange = false;

        await window.generateSchedule();
        assert.strictEqual(scheduleDates.length, 30);

        console.log('✅ TEST 23 PASSED: TOGGLE OFF AUTO-RECALCULATES');
        passed++;
    } catch (e) {
        console.error('❌ TEST 23 FAILED:', e.message);
        failed++;
    }

    // 24. RAPID DATE CHANGES ARE ROUTED THROUGH THE REGENERATE QUEUE
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        global.isCustomDateRange = true;

        let origGen = window.generateSchedule;
        let runCount = 0;
        let concurrentCalls = 0;

        window.generateSchedule = async () => {
            concurrentCalls++;
            runCount++;

            // simulate async work
            await new Promise((resolve) => setTimeout(resolve, 5));

            concurrentCalls--;
        };

        mockDOM['inputEndDate'].value = '2026-08-31';

        global.isCalculating = true; // a run is in progress; the real generateSchedule would queue
        mockDOM['inputStartDate'].value = '2026-08-01';
        window.handleCustomDateRangeChange();

        mockDOM['inputStartDate'].value = '2026-08-05';
        window.handleCustomDateRangeChange();

        mockDOM['inputStartDate'].value = '2026-08-10';
        await window.handleCustomDateRangeChange();

        global.isCalculating = false; // finish original run

        // The handler no longer queues itself: every change goes to generateSchedule, whose own
        // queue (covered in editingState.test.js) serialises runs. Each one must be delegated.
        assert.strictEqual(runCount, 3, 'every range change is routed through generateSchedule');

        window.generateSchedule = origGen;
        console.log(
            '✅ TEST 24 PASSED: RAPID DATE CHANGES ARE ROUTED THROUGH THE REGENERATE QUEUE'
        );
        passed++;
    } catch (e) {
        console.error('❌ TEST 24 FAILED:', e.message);
        failed++;
    }

    // 25. VALIDATION STILL RUNS BEFORE AUTO-CALCULATE
    try {
        resetMocks();
        global.doctors = ['A', 'B', 'C', 'D'];
        mockDOM['chkCustomDateRange'].checked = true;
        global.isCustomDateRange = true;
        mockDOM['inputStartDate'].value = '2026-06-01';
        mockDOM['inputEndDate'].value = '2026-09-01'; // > 90 days

        let origGen = window.generateSchedule;
        let called = false;
        window.generateSchedule = async () => {
            called = true;
        };

        await window.handleCustomDateRangeChange();

        assert.strictEqual(called, false);
        let hasError = toastMessages.some(
            (t) => t.isError && t.msg.includes('Range exceeds 90 days')
        );
        assert.strictEqual(hasError, true);

        window.generateSchedule = origGen;
        console.log('✅ TEST 25 PASSED: VALIDATION STILL RUNS BEFORE AUTO-CALCULATE');
        passed++;
    } catch (e) {
        console.error('❌ TEST 25 FAILED:', e.message);
        failed++;
    }

    console.log(`\ncustomDateRange: PASSED: ${passed}, FAILED: ${failed}`);
}

runTests();
