// Manual overrides must respect the hard rules; each rejected edit leaves the cell unchanged.
const assert = require('assert');
const { loadApp, reset, settle, setInput, snap, runner } = require('./domHarness');

(async () => {
    const w = await loadApp();
    const { test, done } = runner('overrideValidation');
    const DOCS = ['A', 'B', 'C', 'D'];
    const sched = () => snap(w, 'globalResult.schedule');
    const namesOf = (row) => row.selectedDocs.map((s) => s.name);

    const gen = async (opts = {}) => {
        reset(w, DOCS);
        setInput(w, 'inputDefaultSlots', opts.slots || '2');
        setInput(w, 'inputOffDutyPeriod', opts.gap || '1');
        (opts.inputs || []).forEach(([id, v]) => setInput(w, id, v));
        if (opts.off) w.eval(`offData = ${JSON.stringify(opts.off)}`);
        await w.generateSchedule();
        await settle(w);
        assert.ok(sched(), 'no schedule');
        return sched();
    };

    // Try the edit; assert rejection with the reason in the toast and the cell untouched
    const expectReject = (day, slot, doc, reason) => {
        const before = sched();
        w.toasts.length = 0;
        w.updateDoctorAssignment(day, slot, DOCS.indexOf(doc));
        const err = w.toasts.find((t) => t.isError && t.msg.includes(`(${reason})`));
        assert.ok(err, `expected ${reason}, got ${JSON.stringify(w.toasts)}`);
        assert.deepStrictEqual(sched(), before, 'schedule changed');
    };

    await test('duplicate: doctor already on that day', async () => {
        const s = await gen();
        const n = namesOf(s[2]);
        expectReject(3, 0, n[1], 'duplicate');
    });

    await test('conflict: conflicting doctor already on that day', async () => {
        const s = await gen({ inputs: [['inputConflicts', 'A:B']] });
        const row = s.find((r) => namesOf(r).includes('B'));
        const slot = namesOf(row).indexOf('B') === 0 ? 1 : 0;
        expectReject(row.day, slot, 'A', 'conflict');
    });

    await test('role: doctor of another role', async () => {
        const s = await gen({
            inputs: [
                ['chkRoleBased', true],
                ['inputDoctorRoles', 'A:R1,B:R1,C:R2,D:R2'],
                ['inputDefaultRoleSlots', 'R1:1, R2:1'],
            ],
        });
        const row = s[4];
        const slot = 0;
        const role = row.selectedDocs[slot].role;
        const roles = { A: 'R1', B: 'R1', C: 'R2', D: 'R2' };
        const wrong = DOCS.find((d) => roles[d] !== role && !namesOf(row).includes(d));
        assert.ok(wrong, 'no off-role doctor free');
        expectReject(row.day, slot, wrong, 'role');
    });

    await test('off: doctor requested off that day', async () => {
        const s = await gen({ off: [{ id: 1, date: '5', names: 'B' }] });
        assert.ok(!namesOf(s[4]).includes('B'));
        expectReject(5, 0, 'B', 'off');
    });

    await test('rest: doctor inside the rest window', async () => {
        const s = await gen({ slots: '1', gap: '2' });
        const x = namesOf(s[9])[0];
        expectReject(11, 0, x, 'rest');
    });

    await test('quota: doctor would exceed their quota', async () => {
        const s = await gen({ gap: '0' }); // no rest window, so quota is the first rule hit
        const a = s.flatMap(namesOf).filter((n) => n === 'A').length;
        w.eval(`globalResult.config.quota = { A: ${a} }`);
        const row = s.find((r) => !namesOf(r).includes('A'));
        assert.ok(row, 'no day without A');
        expectReject(row.day, 0, 'A', 'quota');
    });

    const idxOf = (n) => DOCS.indexOf(n);
    const dutyCount = (s, d) => s.flatMap(namesOf).filter((n) => n === d).length;

    await test('valid edit is applied (no toast error)', async () => {
        const s = await gen({ gap: '0' });
        const row = s[6];
        const free = DOCS.find((d) => !namesOf(row).includes(d));
        w.toasts.length = 0;
        w.updateDoctorAssignment(row.day, 0, idxOf(free));
        assert.ok(!w.toasts.some((t) => t.isError), JSON.stringify(w.toasts));
        assert.strictEqual(namesOf(sched()[6])[0], free);
    });

    await test('off tomorrow blocks a non-shift pick today', async () => {
        const s = await gen({ gap: '0', off: [{ id: 1, date: '7', names: 'B' }] });
        assert.ok(!namesOf(s[5]).includes('B'), 'solver kept B off day 6');
        expectReject(6, 0, 'B', 'off');
    });

    await test('holiday: back-to-back holiday duty is rejected', async () => {
        const s = await gen({ gap: '0' }); // Jan 3 (Sat) and Jan 4 (Sun) are holidays
        const x = namesOf(s[3]).find((n) => !namesOf(s[2]).includes(n));
        assert.ok(x, 'doctor on day 4 but not day 3');
        expectReject(3, 0, x, 'holiday');
    });

    await test("night to morning: last night's doctor cannot take the morning", async () => {
        const s = await gen({
            gap: '0',
            inputs: [
                ['chkShiftBased', true],
                ['inputMorningSlots', '1'],
                ['inputAfternoonSlots', '1'],
                ['inputNightSlots', '1'],
            ],
        });
        const d = s.find((r, i) => {
            const nxt = s[i + 1];
            return nxt && !nxt.isHoliday && !namesOf(nxt).includes(namesOf(r)[2]);
        });
        assert.ok(d, 'no usable day');
        expectReject(d.day + 1, 0, namesOf(d)[2], 'nightToMorning');
    });

    await test('floor: a doctor at exactly 1 duty cannot drop to 0', async () => {
        const s = await gen({ gap: '0' });
        // Leave A on one duty only (data-level edit), then try to take that duty away
        w.eval(`(() => { let kept = false; globalResult.schedule.forEach(r => r.selectedDocs.forEach(sl => {
            if (sl.name === 'A') { if (!kept) kept = true; else sl.name = 'B'; } })); })()`);
        w.eval('globalResult.config.minNightShifts = 1');
        const cur = sched();
        const row = cur.find((r) => namesOf(r).includes('A'));
        const slot = namesOf(row).indexOf('A');
        const other = DOCS.find((d) => d !== 'A' && !namesOf(row).includes(d));
        expectReject(row.day, slot, other, 'floor');
    });

    await test('floor: an existing shortfall does not block unrelated edits', async () => {
        const s = await gen({ gap: '0' });
        w.eval('globalResult.config.minNightShifts = 100'); // everyone already below
        const row = s[6];
        const free = DOCS.find((d) => !namesOf(row).includes(d));
        w.toasts.length = 0;
        w.updateDoctorAssignment(row.day, 0, idxOf(free));
        assert.ok(!w.toasts.some((t) => t.isError), JSON.stringify(w.toasts));
        assert.strictEqual(namesOf(sched()[6])[0], free);
    });

    await test('drag: a legal same-day swap is applied although its first step is a duplicate', async () => {
        const s = await gen({ gap: '0' });
        const [x, y] = namesOf(s[8]);
        w.toasts.length = 0;
        assert.strictEqual(
            w.applyPairedEdits([
                { day: 9, slotIndex: 0, docIndex: idxOf(y) },
                { day: 9, slotIndex: 1, docIndex: idxOf(x) },
            ]),
            true,
            JSON.stringify(w.toasts)
        );
        assert.deepStrictEqual(namesOf(sched()[8]), [y, x]);
    });

    await test('drag: an illegal cross-day swap changes nothing and toasts the rule', async () => {
        const s = await gen({ gap: '0', inputs: [['inputConflicts', 'A:B']] });
        // swap slot 0 of day d with slot 0 of day e so the incoming doctor meets a conflicting one
        let pair = null;
        for (let d = 1; d <= 31 && !pair; d++)
            for (let e = 1; e <= 31 && !pair; e++) {
                if (d === e) continue;
                const x = namesOf(s[d - 1])[0];
                const y = namesOf(s[e - 1])[0];
                const v = w.validateEdits(w.eval('resultConfig()'), [
                    { day: d, slotIndex: 0, doc: y },
                    { day: e, slotIndex: 0, doc: x },
                ]);
                if (!v.ok && v.reason === 'conflict') pair = { d, e, x, y };
            }
        assert.ok(pair, 'no conflicting swap found');
        const before = sched();
        const undo = w.eval('undoStack.length');
        w.toasts.length = 0;
        assert.strictEqual(
            w.applyPairedEdits([
                { day: pair.d, slotIndex: 0, docIndex: idxOf(pair.y) },
                { day: pair.e, slotIndex: 0, docIndex: idxOf(pair.x) },
            ]),
            false
        );
        assert.ok(w.toasts.some((t) => t.isError && t.msg.includes('(conflict)')));
        assert.deepStrictEqual(sched(), before);
        assert.strictEqual(w.eval('undoStack.length'), undo);
    });

    // A free doctor the validator accepts at (day, slot 0)
    const validPick = (day) => {
        const cur = namesOf(sched()[day - 1])[0];
        const doc = DOCS.find(
            (d) => d !== cur && w.validateManualAssignment(w.eval('resultConfig()'), day, 0, d).ok
        );
        assert.ok(doc, `no valid doctor for day ${day}`);
        return doc;
    };
    const regen = async () => {
        w.toasts.length = 0;
        await w.generateSchedule();
        await settle(w);
    };
    const droppedToast = () =>
        w.toasts.find((t) => t.isError && /Dropped 1|ยกเลิกการแก้ไข/.test(t.msg));

    await test('F4: an override made invalid by a new off request is dropped on regenerate', async () => {
        await gen({ gap: '0' });
        const x = validPick(8);
        w.updateDoctorAssignment(8, 0, idxOf(x));
        assert.strictEqual(namesOf(sched()[7])[0], x);
        w.eval(`offData = [{ id: 1, date: '8', names: '${x}' }]`);
        await regen();
        assert.deepStrictEqual(snap(w, 'manualOverrides'), {});
        assert.ok(!namesOf(sched()[7]).includes(x), `${x} is on day 8 despite the off request`);
        assert.ok(droppedToast(), JSON.stringify(w.toasts));
        assert.ok(/day 8/.test(droppedToast().msg), droppedToast().msg);
    });

    await test('F4: a valid same-day swap survives a regenerate', async () => {
        const s = await gen({ gap: '0' });
        const [x, y] = namesOf(s[8]);
        assert.ok(
            w.applyPairedEdits([
                { day: 9, slotIndex: 0, docIndex: idxOf(y) },
                { day: 9, slotIndex: 1, docIndex: idxOf(x) },
            ])
        );
        await regen();
        assert.deepStrictEqual(namesOf(sched()[8]), [y, x]);
        assert.deepStrictEqual(snap(w, 'manualOverrides'), { 9: { 0: y, 1: x } });
        assert.ok(!droppedToast(), JSON.stringify(w.toasts));
    });

    await test('F4: undo is re-validated, an old snapshot cannot bring an invalid override back', async () => {
        await gen({ gap: '0' });
        const x = validPick(8);
        w.updateDoctorAssignment(8, 0, idxOf(x));
        const y = validPick(12);
        w.updateDoctorAssignment(12, 0, idxOf(y)); // undo stack now holds the snapshot with only day 8
        w.eval(`offData = [{ id: 1, date: '8', names: '${x}' }]`);
        await regen();
        w.toasts.length = 0;
        w.undoLastAction(); // restores {8: x}, which is now illegal
        assert.ok(!namesOf(sched()[7]).includes(x), 'invalid override came back through undo');
        assert.strictEqual(snap(w, 'manualOverrides')[8], undefined);
        assert.ok(droppedToast(), JSON.stringify(w.toasts));
    });

    await test('F5: reset of one half of a swap is rejected and changes nothing', async () => {
        const s = await gen({ gap: '0' });
        const [x, y] = namesOf(s[8]);
        assert.ok(
            w.applyPairedEdits([
                { day: 9, slotIndex: 0, docIndex: idxOf(y) },
                { day: 9, slotIndex: 1, docIndex: idxOf(x) },
            ])
        );
        const before = sched();
        const overrides = snap(w, 'manualOverrides');
        const undo = w.eval('undoStack.length');
        w.toasts.length = 0;
        w.resetSlotToAuto(9, 0); // would put x back on slot 0 while slot 1 still holds x
        assert.ok(
            w.toasts.some((t) => t.isError),
            JSON.stringify(w.toasts)
        );
        assert.deepStrictEqual(sched(), before);
        assert.deepStrictEqual(snap(w, 'manualOverrides'), overrides);
        assert.strictEqual(w.eval('undoStack.length'), undo);
    });

    done();
})();
