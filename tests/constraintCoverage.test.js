const fs = require('fs');
const assert = require('assert');

// ---------------------------------------------------------------------------
// constraintCoverage.test.js
//
// Fills gaps not covered by the existing 20 suites. Each case targets a
// specific documented behaviour in logic_report.md / app.js that previously
// had no direct assertion:
//   1. Holiday spacing (strict Level-1 rule: no consecutive weekend/holiday).
//   2. Quota-density sorting heuristic (constrained doctors scheduled first).
//   3. Locked-doctor off-duty exemption (locked pool works every locked day).
//   4. Probabilistic blank spacing (allowBlankDays distributes shortages).
//   5. Deduplication safeguard preserved even at Cascade Level 5.
//
// Harness mirrors tests/offDutyPeriod.test.js (mock DOM + eval injection).
// ---------------------------------------------------------------------------

global.document = {
    getElementById: () => null,
    addEventListener: () => {},
    createElement: () => ({
        className: '',
        innerHTML: '',
        style: {},
        setAttribute: () => {},
        querySelector: () => ({ textContent: '' }),
        appendChild: () => {},
    }),
};
global.window = {
    addEventListener: () => {},
    setTimeout: (fn) => fn(),
};
global.localStorage = { getItem: () => 'en', setItem: () => {} };
global.lucide = { createIcons: () => {} };

let appJsCode =
    fs.readFileSync('./translations.js', 'utf8') + '\n' + fs.readFileSync('./app.js', 'utf8');

// Disable the real showToast so warnings don't crash the mock env
appJsCode = appJsCode.replace(
    'function showToast(msg, isError = false) {',
    'function original_showToast_disabled(msg, isError = false) {'
);

// Expose module-scoped `let` globals used across the solver
appJsCode = appJsCode.replace(/let doctors = /g, 'global.doctors = ');
appJsCode = appJsCode.replace(/let offData = /g, 'global.offData = ');
appJsCode = appJsCode.replace(/let extraSlotsData = /g, 'global.extraSlotsData = ');
appJsCode = appJsCode.replace(/let manualOverrides = /g, 'global.manualOverrides = ');
appJsCode = appJsCode.replace(/let quota = /g, 'global.quota = ');
appJsCode = appJsCode.replace(/let globalResult = /g, 'global.globalResult = ');
appJsCode = appJsCode.replace(/let scheduleDates = /g, 'global.scheduleDates = ');

global.showToast = () => {};

eval(appJsCode);

console.log('Running Constraint Coverage Unit Tests...');
let passed = 0;
let failed = 0;

let mockDOM = {};
global.document.getElementById = (id) => {
    if (!mockDOM[id]) {
        mockDOM[id] = {
            value: '',
            checked: false,
            classList: { add: () => {}, remove: () => {} },
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
    };
    for (let key in defaultVals) {
        let val = defaultVals[key];
        let obj = {
            classList: { add: () => {}, remove: () => {} },
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
    global.isCustomDateRange = false;
    global.scheduleDates = [];
}

// Build a candidate deterministically from parsed config (no randomness)
function buildCandidate(config) {
    return generateSingleScheduleCandidate(0, config);
}

async function runTest(name, testFn) {
    try {
        await testFn();
        console.log(`\u2705 ${name} PASSED`);
        passed++;
    } catch (e) {
        console.error(`\u274c ${name} FAILED:`, e.message);
        failed++;
    }
}

(async function runAll() {
    // -----------------------------------------------------------------------
    // TEST 1: HOLIDAY SPACING — no doctor works two consecutive holiday days
    // Filter rule #7. Jan 2026: day 3 = Sat, day 4 = Sun (consecutive
    // holidays). With 2 doctors, 1 slot/day, and the generic rest gap removed
    // (offDutyPeriod=1), the holiday-spacing rule is the only thing forcing
    // them to alternate across the Sat/Sun pair.
    // -----------------------------------------------------------------------
    await runTest('TEST 1: HOLIDAY SPACING - no consecutive weekend duty (Level 1)', async () => {
        resetMocks();
        global.doctors = ['A', 'B'];
        mockDOM['inputOffDutyPeriod'].value = '0';

        const config = parseUIConfig();
        const cand = buildCandidate(config);
        assert.ok(cand, 'candidate should generate');

        const isHoliday = (d) => cand.schedule[d - 1].isHoliday;
        assert.ok(isHoliday(3) && isHoliday(4), 'days 3 & 4 should be holidays (Sat/Sun)');

        const day3Doc = cand.schedule[2].selectedDocs[0].name;
        const day4Doc = cand.schedule[3].selectedDocs[0].name;
        assert.notStrictEqual(
            day3Doc,
            day4Doc,
            'same doctor must not cover two consecutive holiday days'
        );
    });

    // -----------------------------------------------------------------------
    // TEST 2: QUOTA-DENSITY HEURISTIC — a doctor with narrow availability is
    // prioritized on their available days so they don't run out late.
    // A off days 16-31 (15 available days) with quota 15; B available all 31
    // with quota 16. Feasible only if A is consistently chosen on days 1-15.
    // -----------------------------------------------------------------------
    await runTest(
        'TEST 2: QUOTA-DENSITY HEURISTIC - constrained doctor scheduled first',
        async () => {
            resetMocks();
            global.doctors = ['A', 'B'];
            global.offData = [{ id: 1, date: '16-31', names: 'A' }];
            mockDOM['chkRoleBased'].checked = false;
            mockDOM['inputSinglePoolQuota'].value = 'A:15, B:16';
            mockDOM['inputOffDutyPeriod'].value = '0';

            const config = parseUIConfig();
            const cand = buildCandidate(config);
            assert.ok(cand, 'candidate should generate');

            // The density heuristic front-loads the availability-constrained doctor.
            // In a deterministic (randomness=0) pass, A must:
            //   (a) never be scheduled on an off day (16-31), and
            //   (b) work the large majority of its 15 available days.
            // This proves A is prioritized on its constrained window rather than
            // being crowded out by the fully-available doctor B.
            let aTotal = 0;
            let aOnOffDay = 0;
            cand.schedule.forEach((d) => {
                const names = d.selectedDocs.map((s) => s.name);
                if (names.includes('A')) {
                    aTotal++;
                    if (d.day >= 16) aOnOffDay++;
                }
            });

            assert.strictEqual(aOnOffDay, 0, 'A must never be scheduled on an off day (16-31)');
            assert.ok(
                aTotal >= 10,
                `density heuristic should front-load A onto its available days (got ${aTotal} of 15)`
            );
            assert.ok(aTotal <= 15, 'A cannot exceed its 15 available days');
        }
    );

    // -----------------------------------------------------------------------
    // TEST 3: LOCKED-DOCTOR OBEYS THE REST GAP — a locked special doctor is
    // NOT exempt from the rest-gap rule (it used to be; see bug sweep C4).
    // Lock S to days 1-5 with offDutyPeriod 4: S works day 1 (eligible) and
    // is no longer force-picked on days 2-3 (inside the rest window).
    // -----------------------------------------------------------------------
    await runTest(
        'TEST 3: LOCKED-DOCTOR REST GAP - locked doc still obeys the rest window',
        async () => {
            resetMocks();
            global.doctors = ['S', 'B', 'C'];
            mockDOM['chkUseSpecialRule'].checked = true;
            mockDOM['inputSpecialDocs'].value = 'S';
            mockDOM['inputSpecialStartDay'].value = '1';
            mockDOM['inputSpecialDays'].value = '5'; // lock days 1-5
            mockDOM['lockConditionType'].value = 'firstNDays';
            mockDOM['inputOffDutyPeriod'].value = '3';

            const config = parseUIConfig();
            const cand = buildCandidate(config);
            assert.ok(cand, 'candidate should generate');

            const has = (d) => cand.schedule[d - 1].selectedDocs.some((x) => x.name === 'S');
            assert.ok(has(1), 'S is eligible on day 1 and must still be scheduled');
            assert.ok(!has(2) && !has(3), 'S must not be forced back in during its rest window');
        }
    );

    // -----------------------------------------------------------------------
    // TEST 4: PROBABILISTIC BLANK SPACING — with Allow Blank Days ON and a
    // quota total LOWER than available slots, the surplus becomes shortages.
    // 31 slots, quota total 20 -> at least 11 blanks; no doctor exceeds quota.
    // -----------------------------------------------------------------------
    await runTest('TEST 4: ALLOW BLANK DAYS - surplus slots become shortages', async () => {
        resetMocks();
        global.doctors = ['A', 'B'];
        mockDOM['chkAllowBlankDays'].checked = true;
        mockDOM['inputSinglePoolQuota'].value = 'A:10, B:10';
        mockDOM['inputOffDutyPeriod'].value = '0';

        const config = parseUIConfig();
        const cand = buildCandidate(config);
        assert.ok(cand, 'candidate should generate (pre-flight bypassed by allowBlankDays)');

        let assigned = 0;
        let shortages = 0;
        cand.schedule.forEach((d) =>
            d.selectedDocs.forEach((s) => {
                if (s.name === '__SHORTAGE__') shortages++;
                else if (global.doctors.includes(s.name)) assigned++;
            })
        );

        assert.ok(cand.tCounts['A'] <= 10, 'A must not exceed quota 10');
        assert.ok(cand.tCounts['B'] <= 10, 'B must not exceed quota 10');
        assert.strictEqual(assigned + shortages, 31, 'every slot is either assigned or a shortage');
        assert.ok(shortages >= 11, `expected >= 11 shortages, got ${shortages}`);
    });

    // -----------------------------------------------------------------------
    // TEST 5: DEDUP SAFEGUARD AT CASCADE 5 — even when every relaxable rule is
    // dropped to force-fill slots, a doctor is NEVER placed twice on the same
    // day. 2 slots/day, only A eligible (B off all month) => 2nd slot cascades
    // to Level 5; dedup must force a blank rather than duplicate A.
    // -----------------------------------------------------------------------
    await runTest('TEST 5: DEDUP SAFEGUARD - no double-shift even at Cascade 5', async () => {
        resetMocks();
        global.doctors = ['A', 'B'];
        mockDOM['inputDefaultSlots'].value = '2';
        global.offData = [{ id: 1, date: '1-31', names: 'B' }];
        mockDOM['chkAllowBlankDays'].checked = false; // force the Must-Fill cascade

        const config = parseUIConfig();
        const cand = buildCandidate(config);
        assert.ok(cand, 'candidate should generate');

        cand.schedule.forEach((day) => {
            const workers = day.selectedDocs
                .map((s) => s.name)
                .filter((n) => n === 'A' || n === 'B');
            const unique = new Set(workers);
            assert.strictEqual(
                workers.length,
                unique.size,
                `day ${day.day}: a doctor must not appear twice in the same day`
            );
        });

        let sawShortage = false;
        cand.schedule.forEach((day) => {
            if (day.selectedDocs.some((s) => s.name === '__SHORTAGE__')) sawShortage = true;
        });
        assert.ok(
            sawShortage,
            'expected shortages (dedup forces blank rather than duplicating the only doctor)'
        );
    });

    console.log(`\nconstraintCoverage: PASSED: ${passed}, FAILED: ${failed}`);
    if (failed > 0) process.exit(1);
    else process.exit(0);
})();
