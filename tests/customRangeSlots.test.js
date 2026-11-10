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
                classList: { add: () => {}, remove: () => {}, toggle: () => {} },
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
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        click: () => {},
        remove: () => {},
    }),
    body: {
        appendChild: () => {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    },
    addEventListener: () => {},
    documentElement: {
        lang: 'en',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    },
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
    mockDOM['inputMonth'] = {
        value: '1',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputYear'] = {
        value: '2026',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputDefaultSlots'] = {
        value: '2',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputSpecialHols'] = {
        value: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputNoDuty'] = {
        value: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputSpecialDocs'] = {
        value: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputSpecialDays'] = {
        value: '0',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['chkUseSpecialRule'] = {
        checked: false,
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputOffDutyPeriod'] = {
        value: '1',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['chkPreventLongGaps'] = {
        checked: false,
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['chkBalanceShifts'] = {
        checked: false,
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['chkAllowBlankDays'] = {
        checked: false,
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['chkRoleBased'] = {
        checked: false,
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputDoctorRoles'] = {
        value: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputDefaultRoleSlots'] = {
        value: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputRoleQuotas'] = {
        value: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputConflicts'] = {
        value: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['chkCustomDateRange'] = {
        checked: false,
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputStartDate'] = {
        value: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['inputEndDate'] = {
        value: '',
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['toast'] = { classList: { add: () => {}, remove: () => {}, toggle: () => {} } };
    mockDOM['toastContent'] = {
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        innerHTML: '',
    };
    mockDOM['resultsContainer'] = {
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    };
    mockDOM['emptyState'] = { classList: { add: () => {}, remove: () => {}, toggle: () => {} } };
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

console.log('Running customRangeSlots.test.js...');

async function dayCount(date) {
    resetMocks();
    doctors = ['A', 'B'];
    mockDOM['inputDefaultSlots'].value = '1';
    mockDOM['chkCustomDateRange'].checked = true;
    mockDOM['inputStartDate'].value = '2026-07-01';
    mockDOM['inputEndDate'].value = '2026-07-31';
    isCustomDateRange = true;
    scheduleDates = [];
    for (let i = 1; i <= 31; i++) scheduleDates.push(new Date(2026, 6, i));
    extraSlotsData = [{ id: 1, date, slots: '3' }];
    await window.generateSchedule();
    assert.ok(globalResult, 'no schedule: ' + JSON.stringify(toastMessages));
    const row = globalResult.schedule[14];
    return row.selectedDocs.length;
}

(async () => {
    for (const d of ['15', '15/07/2026', '2026-07-15']) {
        assert.strictEqual(await dayCount(d), 3, `date ${d}`);
        console.log('PASS', d);
    }
})().catch((e) => {
    console.error('FAIL', e.message);
    process.exit(1);
});
