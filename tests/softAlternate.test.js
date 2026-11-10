const fs = require('fs');
const assert = require('assert');

// Helper to create a comprehensive mock element
function createMockElement(id = '') {
    const el = {
        id,
        value: '',
        checked: false,
        textContent: '',
        innerText: '',
        classList: {
            add: () => {},
            remove: () => {},
            toggle: () => {},
            contains: () => false,
        },
        className: '',
        innerHTML: '',
        dispatchEvent: () => {},
        querySelectorAll: () => [],
        querySelector: () => createMockElement(),
        setAttribute: () => {},
        getAttribute: () => null,
        removeAttribute: () => {},
        appendChild: (child) => child,
        insertBefore: (newNode, refNode) => newNode,
        removeChild: () => {},
        remove: () => {},
        click: () => {},
        style: {},
        children: [],
        childNodes: [],
    };
    return el;
}

// 1. Mock DOM and Globals
const mockDOM = {};
global.document = {
    getElementById: (id) => {
        if (!mockDOM[id]) {
            mockDOM[id] = createMockElement(id);
        }
        return mockDOM[id];
    },
    createElement: (tag) => {
        return createMockElement();
    },
    body: createMockElement('body'),
    addEventListener: () => {},
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
global.lucide = { createIcons: () => {} };
global.Node = { TEXT_NODE: 3 };

global.window.addEventListener = () => {};
global.localStorage = { getItem: () => 'en', setItem: () => {} };

// Helper to reset mocks
function resetMocks() {
    Object.keys(mockDOM).forEach((key) => delete mockDOM[key]);
    global.doctors = [];
    global.offData = [];
    global.extraSlotsData = [];

    mockDOM['inputMonth'] = createMockElement('inputMonth');
    mockDOM['inputMonth'].value = '7';
    mockDOM['inputYear'] = createMockElement('inputYear');
    mockDOM['inputYear'].value = '2026';
    mockDOM['inputDefaultSlots'] = createMockElement('inputDefaultSlots');
    mockDOM['inputDefaultSlots'].value = '2';
    mockDOM['inputSpecialHols'] = createMockElement('inputSpecialHols');
    mockDOM['inputNoDuty'] = createMockElement('inputNoDuty');
    mockDOM['inputSpecialDocs'] = createMockElement('inputSpecialDocs');
    mockDOM['inputSpecialDays'] = createMockElement('inputSpecialDays');
    mockDOM['inputSpecialDays'].value = '0';
    mockDOM['chkUseSpecialRule'] = createMockElement('chkUseSpecialRule');
    mockDOM['inputOffDutyPeriod'] = createMockElement('inputOffDutyPeriod');
    mockDOM['inputOffDutyPeriod'].value = '0';
    mockDOM['chkPreventLongGaps'] = createMockElement('chkPreventLongGaps');
    mockDOM['chkBalanceShifts'] = createMockElement('chkBalanceShifts');
    mockDOM['chkAllowBlankDays'] = createMockElement('chkAllowBlankDays');
    mockDOM['chkRoleBased'] = createMockElement('chkRoleBased');
    mockDOM['inputDoctorRoles'] = createMockElement('inputDoctorRoles');
    mockDOM['inputDefaultRoleSlots'] = createMockElement('inputDefaultRoleSlots');
    mockDOM['inputRoleQuotas'] = createMockElement('inputRoleQuotas');
    mockDOM['inputConflicts'] = createMockElement('inputConflicts');

    // New inputs
    mockDOM['chkSoftAlternate'] = createMockElement('chkSoftAlternate');
    mockDOM['chkSoftAlternate'].checked = true;
    mockDOM['selectAlternateStrength'] = createMockElement('selectAlternateStrength');
    mockDOM['selectAlternateStrength'].value = 'medium';

    global.isCustomDateRange = false;
    global.scheduleDates = [];
    for (let i = 1; i <= 31; i++) {
        global.scheduleDates.push(new Date(2026, 6, i)); // July 2026 has 31 days
    }
}

// Helper to create a dummy candidate
function createCandidate(scheduleDocs, tCounts, hCounts, wCounts) {
    let schedule = [];
    scheduleDocs.forEach((docsOnDay, idx) => {
        schedule.push({
            day: idx + 1,
            selectedDocs: docsOnDay.map((d) => ({ name: d, role: 'Default' })),
        });
    });
    return {
        schedule,
        tCounts: tCounts || { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
        hCounts: hCounts || { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
        wCounts: wCounts || { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
    };
}

function getPairFrequencies(schedule, activeDocs) {
    let freqs = {};
    schedule.forEach((day) => {
        let assigned = [];
        day.selectedDocs.forEach((d) => {
            if (activeDocs.includes(d.name)) {
                assigned.push(d.name);
            }
        });
        if (assigned.length >= 2) {
            assigned.sort();
            let key = assigned.join('|');
            freqs[key] = (freqs[key] || 0) + 1;
        }
    });
    return freqs;
}

// Load app.js code
let appJsCode;
try {
    appJsCode =
        fs.readFileSync('./translations.js', 'utf8') + '\n' + fs.readFileSync('./app.js', 'utf8');
} catch (e) {
    appJsCode =
        fs.readFileSync('../translations.js', 'utf8') + '\n' + fs.readFileSync('../app.js', 'utf8');
}

// Strip 'let' so app.js uses our global variables
appJsCode = appJsCode.replace(/let doctors = /g, 'global.doctors = ');
eval(appJsCode);

console.log('Running softAlternate.test.js...');
let passed = 0;
let failed = 0;

// TEST 1: PAIR PENALTY REDUCES REPEATED COMBINATIONS
// We call generateSingleScheduleCandidate directly (not window.generateSchedule)
// to avoid DOM-heavy UI code (renderResults, updateStatsDashboard) that can't run in tests.
try {
    resetMocks();
    global.doctors = ['A', 'B', 'C', 'D', 'E', 'F'];
    mockDOM['chkSoftAlternate'].checked = true;
    mockDOM['selectAlternateStrength'].value = 'high';
    mockDOM['chkBalanceShifts'].checked = false;
    mockDOM['inputDefaultSlots'].value = '2';

    const config = parseUIConfig();

    // Run 50 randomized candidates and pick the best by score (simulating the solver)
    let bestCandidate = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 50; i++) {
        const candidate = generateSingleScheduleCandidate(0.85, config);
        const score = scoreSchedule(candidate);
        if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
        }
    }

    const freqs = getPairFrequencies(bestCandidate.schedule, global.doctors);
    let maxRepeat = 0;
    let distinctPairs = Object.keys(freqs).length;
    Object.keys(freqs).forEach((key) => {
        if (freqs[key] > maxRepeat) maxRepeat = freqs[key];
    });

    assert.strictEqual(
        maxRepeat <= 8,
        true,
        `No single pair should appear more than 8 times, found: ${maxRepeat}`
    );
    assert.strictEqual(
        distinctPairs >= 3,
        true,
        `At least 3 distinct pairs should appear, found: ${distinctPairs}`
    );
    console.log('✅ TEST 1 PASSED: PAIR PENALTY REDUCES REPEATED COMBINATIONS');
    passed++;
} catch (e) {
    console.error('❌ TEST 1 FAILED:', e.message);
    failed++;
}

// TEST 2: SOFT ALTERNATE OFF — EXISTING BEHAVIOR
try {
    resetMocks();
    global.doctors = ['A', 'B'];
    let cand = createCandidate([
        ['A', 'B'],
        ['A', 'B'],
    ]);
    cand.chkSoftAlternate = false;

    scoreSchedule(cand);
    assert.strictEqual(cand.windowScore, 0, 'windowScore should be 0 when soft alternate is OFF');
    assert.strictEqual(cand.pairScore, 0, 'pairScore should be 0 when soft alternate is OFF');
    console.log('✅ TEST 2 PASSED: SOFT ALTERNATE OFF — EXISTING BEHAVIOR');
    passed++;
} catch (e) {
    console.error('❌ TEST 2 FAILED:', e.message);
    failed++;
}

// TEST 3: WINDOW PENALTY SCORES CORRECTLY
try {
    resetMocks();
    global.doctors = ['A']; // Isolate Doctor A

    // Doctor A works 3 days consecutively (day 1, 2, 3)
    let candConsecutive = createCandidate([['A'], ['A'], ['A'], ['B'], ['B'], ['B'], ['B']]);
    candConsecutive.chkSoftAlternate = true;
    candConsecutive.windowPenalty = 150;
    candConsecutive.pairPenalty = 0;

    // Doctor A works 3 days spread out (day 1, 4, 7)
    let candSpread = createCandidate([['A'], ['B'], ['B'], ['A'], ['B'], ['B'], ['A']]);
    candSpread.chkSoftAlternate = true;
    candSpread.windowPenalty = 150;
    candSpread.pairPenalty = 0;

    const scoreConsecutive = scoreSchedule(candConsecutive);
    const scoreSpread = scoreSchedule(candSpread);

    assert.strictEqual(
        candConsecutive.windowScore > 0,
        true,
        'windowScore should be > 0 for consecutive candidate'
    );
    assert.strictEqual(candSpread.windowScore, 0, 'windowScore should be 0 for spread candidate');
    assert.strictEqual(
        scoreSpread > scoreConsecutive,
        true,
        'Spread candidate should score higher (less penalty) than consecutive candidate'
    );
    console.log('✅ TEST 3 PASSED: WINDOW PENALTY SCORES CORRECTLY');
    passed++;
} catch (e) {
    console.error('❌ TEST 3 FAILED:', e.message);
    failed++;
}

// TEST 4: PAIR PENALTY SCORES CORRECTLY
try {
    resetMocks();
    global.doctors = ['A', 'B', 'C', 'D'];

    // A+B works all 5 days
    let candFirst = createCandidate([
        ['A', 'B'],
        ['A', 'B'],
        ['A', 'B'],
        ['A', 'B'],
        ['A', 'B'],
    ]);
    candFirst.chkSoftAlternate = true;
    candFirst.windowPenalty = 0;
    candFirst.pairPenalty = 300;

    // A+B works 2 days, C+D works 3 days
    let candSecond = createCandidate([
        ['A', 'B'],
        ['A', 'B'],
        ['C', 'D'],
        ['C', 'D'],
        ['C', 'D'],
    ]);
    candSecond.chkSoftAlternate = true;
    candSecond.windowPenalty = 0;
    candSecond.pairPenalty = 300;

    const scoreFirst = scoreSchedule(candFirst);
    const scoreSecond = scoreSchedule(candSecond);

    assert.strictEqual(
        candFirst.pairScore,
        4 * 300,
        'First candidate should have 4 excess pair repeats'
    );
    assert.strictEqual(
        candSecond.pairScore,
        3 * 300,
        'Second candidate should have 3 excess pair repeats'
    );
    assert.strictEqual(
        scoreSecond > scoreFirst,
        true,
        'Second candidate should score higher (less penalty) than first candidate'
    );
    console.log('✅ TEST 4 PASSED: PAIR PENALTY SCORES CORRECTLY');
    passed++;
} catch (e) {
    console.error('❌ TEST 4 FAILED:', e.message);
    failed++;
}

// TEST 5: STRENGTH LEVELS MAP TO CORRECT WEIGHTS
try {
    resetMocks();
    mockDOM['chkSoftAlternate'] = createMockElement('chkSoftAlternate');
    mockDOM['chkSoftAlternate'].checked = true;

    mockDOM['selectAlternateStrength'] = createMockElement('selectAlternateStrength');
    mockDOM['selectAlternateStrength'].value = 'low';
    let configLow = parseUIConfig();
    assert.strictEqual(configLow.pairPenalty, 100, 'Low strength pairPenalty should be 100');
    assert.strictEqual(configLow.windowPenalty, 50, 'Low strength windowPenalty should be 50');

    mockDOM['selectAlternateStrength'].value = 'medium';
    let configMedium = parseUIConfig();
    assert.strictEqual(configMedium.pairPenalty, 300, 'Medium strength pairPenalty should be 300');
    assert.strictEqual(
        configMedium.windowPenalty,
        150,
        'Medium strength windowPenalty should be 150'
    );

    mockDOM['selectAlternateStrength'].value = 'high';
    let configHigh = parseUIConfig();
    assert.strictEqual(configHigh.pairPenalty, 600, 'High strength pairPenalty should be 600');
    assert.strictEqual(configHigh.windowPenalty, 300, 'High strength windowPenalty should be 300');

    console.log('✅ TEST 5 PASSED: STRENGTH LEVELS MAP TO CORRECT WEIGHTS');
    passed++;
} catch (e) {
    console.error('❌ TEST 5 FAILED:', e.message);
    failed++;
}

// TEST 6: SAVE/LOAD ROUND TRIP
try {
    resetMocks();
    mockDOM['chkSoftAlternate'].checked = true;
    mockDOM['selectAlternateStrength'].value = 'high';

    let lastHref = null;
    global.document.createElement = (tag) => {
        const el = createMockElement();
        el.setAttribute = (name, val) => {
            if (name === 'href') lastHref = val;
        };
        return el;
    };

    window.exportConfigJSON();

    // Decode the data URL
    const jsonStr = decodeURIComponent(lastHref.replace('data:text/json;charset=utf-8,', ''));

    // Reset values to different values
    mockDOM['chkSoftAlternate'].checked = false;
    mockDOM['selectAlternateStrength'].value = 'low';

    // Import again
    const mockEvent = {
        target: {
            files: [{}],
        },
    };
    global.FileReader = function () {
        this.readAsText = function (file) {
            this.onload({
                target: {
                    result: jsonStr,
                },
            });
        };
    };

    window.importConfigJSON(mockEvent);

    assert.strictEqual(
        mockDOM['chkSoftAlternate'].checked,
        true,
        'chkSoftAlternate should be restored to true'
    );
    assert.strictEqual(
        mockDOM['selectAlternateStrength'].value,
        'high',
        'selectAlternateStrength should be restored to high'
    );
    console.log('✅ TEST 6 PASSED: SAVE/LOAD ROUND TRIP');
    passed++;
} catch (e) {
    console.error('❌ TEST 6 FAILED:', e.message);
    failed++;
}

// TEST 7: OLD JSON WITHOUT FIELDS — DEFAULTS CORRECTLY
try {
    resetMocks();

    // Setup JSON config missing alternate fields
    const oldConfig = {
        doctors: ['A', 'B'],
        offData: [],
        extraSlotsData: [],
        checkboxes: {
            chkCustomDateRange: false,
        },
        inputs: {
            inputMonth: '7',
            inputYear: '2026',
        },
    };
    const oldJsonStr = JSON.stringify(oldConfig);

    mockDOM['chkSoftAlternate'].checked = false;
    mockDOM['selectAlternateStrength'].value = 'low';

    const mockEvent = {
        target: {
            files: [{}],
        },
    };
    global.FileReader = function () {
        this.readAsText = function (file) {
            this.onload({
                target: {
                    result: oldJsonStr,
                },
            });
        };
    };

    window.importConfigJSON(mockEvent);

    assert.strictEqual(
        mockDOM['chkSoftAlternate'].checked,
        true,
        'Missing chkSoftAlternate should default to true'
    );
    assert.strictEqual(
        mockDOM['selectAlternateStrength'].value,
        'medium',
        "Missing selectAlternateStrength should default to 'medium'"
    );
    console.log('✅ TEST 7 PASSED: OLD JSON WITHOUT FIELDS — DEFAULTS CORRECTLY');
    passed++;
} catch (e) {
    console.error('❌ TEST 7 FAILED:', e.message);
    failed++;
}

// TEST 8: ROLE-BASED MODE PAIR KEY INCLUDES SLOT POSITION
try {
    resetMocks();
    global.doctors = ['A', 'B', 'C', 'D'];

    // A (slot0) with C (slot1), A (slot0) with D (slot1)
    let candRole = createCandidate([
        ['A', 'C'],
        ['A', 'D'],
    ]);
    candRole.config = {
        roleBased: true,
    };
    candRole.chkSoftAlternate = true;
    candRole.windowPenalty = 0;
    candRole.pairPenalty = 300;

    scoreSchedule(candRole);
    assert.strictEqual(
        candRole.pairScore,
        0,
        'Since the slot keys are slot0:A|slot1:C and slot0:A|slot1:D, they do not repeat, so pairScore = 0'
    );

    // A+C in same slots repeat
    let candRoleRepeat = createCandidate([
        ['A', 'C'],
        ['A', 'C'],
    ]);
    candRoleRepeat.config = {
        roleBased: true,
    };
    candRoleRepeat.chkSoftAlternate = true;
    candRoleRepeat.windowPenalty = 0;
    candRoleRepeat.pairPenalty = 300;

    scoreSchedule(candRoleRepeat);
    assert.strictEqual(
        candRoleRepeat.pairScore,
        300,
        'A+C in slot0:A|slot1:C repeats on day 2, so pairScore = 300'
    );
    console.log('✅ TEST 8 PASSED: ROLE-BASED MODE PAIR KEY INCLUDES SLOT POSITION');
    passed++;
} catch (e) {
    console.error('❌ TEST 8 FAILED:', e.message);
    failed++;
}

const totalTests = 8;
console.log(`\nsoftAlternate: PASSED: ${passed}, FAILED: ${totalTests - passed}\n`);
if (passed === totalTests) {
    process.exit(0);
} else {
    process.exit(1);
}
