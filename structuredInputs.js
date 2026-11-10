// --- STRUCTURED INPUTS FOR F8 ---

// Name passed to an inline handler: a JSON string literal, HTML-escaped for the attribute.
const jsArg = (v) => esc(JSON.stringify(v));

// Same ceiling as the per-day slots input; quotas are monthly, so up to the 90-day custom range
const MAX_ROLE_SLOTS = 10;
const MAX_QUOTA = 90;

function initStructuredInputs() {
    renderStructuredDoctorRoles();
    renderStructuredRoleSlots();
    renderStructuredRoleQuotas();
    renderStructuredSinglePoolQuotas();
    renderStructuredConflicts();
    renderStructuredChips(
        'inputSpecialHols',
        'structuredSpecialHolsContainer',
        'inputSpecialHolsUI'
    );
    renderStructuredChips('inputNoDuty', 'structuredNoDutyContainer', 'inputNoDutyUI');

    // Setup listeners for chip inputs
    setupChipInputListener(
        'inputSpecialHols',
        'structuredSpecialHolsContainer',
        'inputSpecialHolsUI'
    );
    setupChipInputListener('inputNoDuty', 'structuredNoDutyContainer', 'inputNoDutyUI');
}

// 1. Doctor Roles
function getUniqueRolesFromInput() {
    const val = document.getElementById('inputDoctorRoles').value;
    const pairs = val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    const roles = new Set();
    pairs.forEach((p) => {
        const parts = p.split(':');
        if (parts.length === 2 && parts[1].trim()) roles.add(parts[1].trim());
    });
    return Array.from(roles);
}

function renderStructuredDoctorRoles() {
    const container = document.getElementById('structuredDoctorRolesContainer');
    if (!container) return;

    // Existing roles mapping
    const val = document.getElementById('inputDoctorRoles').value;
    const pairs = val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    const roleMap = {};
    pairs.forEach((p) => {
        const parts = p.split(':');
        if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
            roleMap[parts[0].trim()] = parts[1].trim();
        }
    });

    const availableRoles = getUniqueRolesFromInput();
    if (availableRoles.length === 0) {
        availableRoles.push('R1', 'R2');
    } // Defaults

    const activeDocs = typeof doctors !== 'undefined' ? doctors : [];
    if (activeDocs.length === 0) {
        const msg = translations[currentLang]?.noDocsWarning ?? 'Please add doctors first';
        container.innerHTML = `<p class="text-xs text-slate-500 dark:text-slate-400 italic" data-i18n="noDocsWarning">${msg}</p>`;
        // Clear input if no docs
        document.getElementById('inputDoctorRoles').value = '';
        return;
    }

    let html = '';
    activeDocs.forEach((doc) => {
        const role = roleMap[doc] || availableRoles[0]; // match or default

        const newRoleText = translations[currentLang].newRoleOption;
        let roleOptions = availableRoles
            .map(
                (r) =>
                    `<option value="${esc(r)}" ${r === role ? 'selected' : ''}>${esc(r)}</option>`
            )
            .join('');
        roleOptions += `<option value="__NEW__">${newRoleText}</option>`;

        html += `
        <div class="flex items-center gap-2 mb-2">
            <input type="text" aria-label="${translations[currentLang].docListLabel}" class="doc-role-name flex-1 min-w-0 bg-paper dark:bg-night border border-rule dark:border-rule-dark rounded-[3px] px-2.5 py-1.5 text-[12px] font-medium text-ink dark:text-slate-200" value="${esc(doc)}" readonly>
            <select data-prev="${esc(role)}" aria-label="${esc(translations[currentLang].roleSelectAria.replace('{name}', () => doc))}" class="doc-role-select w-[100px] flex-shrink-0 bg-white dark:bg-sheet-dark border border-rule dark:border-rule-dark rounded-[3px] px-2 py-1.5 text-[12px] outline-none text-ink dark:text-slate-100 focus:border-duty" onchange="handleDocRoleSelectChange(this)">
                ${roleOptions}
            </select>
        </div>
        `;
    });
    container.innerHTML = html;

    syncStructuredDoctorRoles(true);

    if (window.lucide) lucide.createIcons();
}

function handleDocRoleSelectChange(selectElem) {
    if (selectElem.value === '__NEW__') {
        const newRole = prompt(
            currentLang === 'th' ? 'ป้อนชื่อบทบาทใหม่ (เช่น R3)' : 'Enter new role name (e.g., R3)'
        );
        const rName = sanitizeName(newRole);
        if (!rName) {
            selectElem.value = selectElem.dataset.prev; // cancelled or empty: keep the old role
            return;
        }
        if (rName === '__NEW__') {
            selectElem.value = selectElem.dataset.prev; // reserved for the "new role" option
            return;
        }
        // "r1" selects the existing "R1" instead of adding a lookalike role
        const existing = [...selectElem.options].find(
            (o) => o.value !== '__NEW__' && o.value.toLowerCase() === rName.toLowerCase()
        );
        if (existing) {
            selectElem.value = existing.value;
        } else {
            document.querySelectorAll('.doc-role-select').forEach((sel) => {
                const opt = document.createElement('option');
                opt.value = rName;
                opt.textContent = rName;
                sel.insertBefore(opt, sel.lastElementChild);
            });
            selectElem.value = rName;
        }
    }
    selectElem.dataset.prev = selectElem.value;
    syncStructuredDoctorRoles();
}

function syncStructuredDoctorRoles(skipSchedule = false) {
    const container = document.getElementById('structuredDoctorRolesContainer');
    if (!container) return;
    const rows = container.querySelectorAll('.flex');
    const newParts = [];
    rows.forEach((row) => {
        const name = row.querySelector('.doc-role-name').value.trim();
        const role = row.querySelector('.doc-role-select').value;
        if (name) {
            newParts.push(`${name}:${role}`);
        }
    });
    document.getElementById('inputDoctorRoles').value = newParts.join(', ');
    renderStructuredRoleSlots();
    renderStructuredRoleQuotas();
    if (!skipSchedule && typeof generateSchedule === 'function') generateSchedule();
}

// 2. Slots Per Role (Stepper)
function renderStructuredRoleSlots() {
    const container = document.getElementById('structuredRoleSlotsContainer');
    if (!container) return;
    const val = document.getElementById('inputDefaultRoleSlots').value;
    const pairs = val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    const slotsMap = {};
    pairs.forEach((p) => {
        const parts = p.split(':');
        if (parts.length === 2) {
            slotsMap[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
        }
    });

    const activeRoles = getUniqueRolesFromInput();
    let html = '';
    activeRoles.forEach((role) => {
        const count = slotsMap[role] !== undefined ? slotsMap[role] : 1;
        html += `
        <div class="flex items-center justify-between p-2 bg-white dark:bg-night border border-rule dark:border-rule-dark rounded-[3px]">
            <span class="text-[12px] font-medium text-ink dark:text-slate-200">${esc(role)}</span>
            <div class="flex items-center gap-3">
                <button type="button" aria-label="${translations[currentLang].ariaDecrease} ${esc(role)}" class="w-7 h-7 flex items-center justify-center rounded-[3px] border border-rule dark:border-rule-dark bg-paper dark:bg-night text-ink-2 dark:text-slate-300 hover:border-duty hover:text-duty" onclick="updateRoleSlot(${jsArg(role)}, -1)">
                    <i data-lucide="minus" class="w-4 h-4"></i>
                </button>
                <span class="w-6 text-center text-[13px] font-semibold text-ink dark:text-slate-200">${count}</span>
                <button type="button" aria-label="${translations[currentLang].ariaIncrease} ${esc(role)}" class="w-7 h-7 flex items-center justify-center rounded-[3px] border border-rule dark:border-rule-dark bg-paper dark:bg-night text-ink-2 dark:text-slate-300 hover:border-duty hover:text-duty" onclick="updateRoleSlot(${jsArg(role)}, 1)">
                    <i data-lucide="plus" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
        `;
    });
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

function updateRoleSlot(role, delta) {
    const val = document.getElementById('inputDefaultRoleSlots').value;
    const pairs = val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    const slotsMap = {};
    pairs.forEach((p) => {
        const parts = p.split(':');
        if (parts.length === 2) {
            slotsMap[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
        }
    });
    if (slotsMap[role] === undefined) slotsMap[role] = 1;
    slotsMap[role] = Math.min(MAX_ROLE_SLOTS, Math.max(0, slotsMap[role] + delta));

    const activeRoles = getUniqueRolesFromInput();
    activeRoles.forEach((r) => {
        if (slotsMap[r] === undefined) slotsMap[r] = 1;
    });
    // Every role at 0 would leave nobody to schedule
    if (activeRoles.reduce((n, r) => n + slotsMap[r], 0) < 1) {
        showToast(translations[currentLang].roleSlotsMinOne);
        return;
    }

    const newParts = [];
    for (const [r, c] of Object.entries(slotsMap)) {
        if (activeRoles.includes(r)) {
            newParts.push(`${r}:${c}`);
        }
    }
    document.getElementById('inputDefaultRoleSlots').value = newParts.join(', ');
    renderStructuredRoleSlots();
    if (typeof generateSchedule === 'function') generateSchedule();
}

// 3. Exact Monthly Quota (Role-Based)
function renderStructuredRoleQuotas() {
    const container = document.getElementById('structuredRoleQuotasContainer');
    if (!container) return;
    const val = document.getElementById('inputRoleQuotas').value;
    const pairs = val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    const quotasMap = {};
    pairs.forEach((p) => {
        const parts = p.split(':');
        if (parts.length === 2) {
            quotasMap[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
        }
    });

    const activeRoles = getUniqueRolesFromInput();
    let html = '';
    activeRoles.forEach((role) => {
        const count = quotasMap[role] !== undefined ? quotasMap[role] : '';
        const displayCount = count === '' ? '-' : count;
        html += `
        <div class="flex items-center justify-between p-2 bg-white dark:bg-night border border-rule dark:border-rule-dark rounded-[3px]">
            <span class="text-[12px] font-medium text-ink dark:text-slate-200">${esc(role)}</span>
            <div class="flex items-center gap-3">
                <button type="button" aria-label="${translations[currentLang].ariaDecrease} ${esc(role)}" class="w-7 h-7 flex items-center justify-center rounded-[3px] border border-rule dark:border-rule-dark bg-paper dark:bg-night text-ink-2 dark:text-slate-300 hover:border-duty hover:text-duty" onclick="updateRoleQuota(${jsArg(role)}, -1)">
                    <i data-lucide="minus" class="w-4 h-4"></i>
                </button>
                <span class="w-6 text-center text-[13px] font-semibold text-ink dark:text-slate-200">${displayCount}</span>
                <button type="button" aria-label="${translations[currentLang].ariaIncrease} ${esc(role)}" class="w-7 h-7 flex items-center justify-center rounded-[3px] border border-rule dark:border-rule-dark bg-paper dark:bg-night text-ink-2 dark:text-slate-300 hover:border-duty hover:text-duty" onclick="updateRoleQuota(${jsArg(role)}, 1)">
                    <i data-lucide="plus" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
        `;
    });
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

function updateRoleQuota(role, delta) {
    const val = document.getElementById('inputRoleQuotas').value;
    const pairs = val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    const quotasMap = {};
    pairs.forEach((p) => {
        const parts = p.split(':');
        if (parts.length === 2) {
            quotasMap[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
        }
    });

    if (quotasMap[role] === undefined) {
        if (delta < 0) return; // nothing to lower yet
        quotasMap[role] = 1;
    } else {
        quotasMap[role] = Math.min(MAX_QUOTA, quotasMap[role] + delta);
    }

    if (quotasMap[role] < 0) delete quotasMap[role];

    const activeRoles = getUniqueRolesFromInput();
    const newParts = [];
    for (const [r, c] of Object.entries(quotasMap)) {
        if (activeRoles.includes(r)) {
            newParts.push(`${r}:${c}`);
        }
    }
    document.getElementById('inputRoleQuotas').value = newParts.join(', ');
    renderStructuredRoleQuotas();
    if (typeof generateSchedule === 'function') generateSchedule();
}

// 3b. Exact Monthly Quota (Single Pool)
function renderStructuredSinglePoolQuotas() {
    const container = document.getElementById('structuredSinglePoolQuotasContainer');
    if (!container) return;
    const val = document.getElementById('inputSinglePoolQuota').value;
    const pairs = val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    const quotasMap = {};
    pairs.forEach((p) => {
        const parts = p.split(':');
        if (parts.length === 2) {
            quotasMap[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
        }
    });

    // Assume `doctors` array is available from app.js state
    const activeDocs = typeof doctors !== 'undefined' ? doctors : [];
    let html = '';
    activeDocs.forEach((doc) => {
        const count = quotasMap[doc] !== undefined ? quotasMap[doc] : '';
        const displayCount = count === '' ? '-' : count;
        html += `
        <div class="flex items-center justify-between p-2 bg-white dark:bg-night border border-rule dark:border-rule-dark rounded-[3px]">
            <span class="text-[12px] font-medium text-ink dark:text-slate-200">${esc(doc)}</span>
            <div class="flex items-center gap-3">
                <button type="button" aria-label="${translations[currentLang].ariaDecrease} ${esc(doc)}" class="w-7 h-7 flex items-center justify-center rounded-[3px] border border-rule dark:border-rule-dark bg-paper dark:bg-night text-ink-2 dark:text-slate-300 hover:border-duty hover:text-duty" onclick="updateSinglePoolQuota(${jsArg(doc)}, -1)">
                    <i data-lucide="minus" class="w-4 h-4"></i>
                </button>
                <span class="w-6 text-center text-[13px] font-semibold text-ink dark:text-slate-200">${displayCount}</span>
                <button type="button" aria-label="${translations[currentLang].ariaIncrease} ${esc(doc)}" class="w-7 h-7 flex items-center justify-center rounded-[3px] border border-rule dark:border-rule-dark bg-paper dark:bg-night text-ink-2 dark:text-slate-300 hover:border-duty hover:text-duty" onclick="updateSinglePoolQuota(${jsArg(doc)}, 1)">
                    <i data-lucide="plus" class="w-4 h-4"></i>
                </button>
            </div>
        </div>
        `;
    });
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

function updateSinglePoolQuota(doc, delta) {
    const val = document.getElementById('inputSinglePoolQuota').value;
    const pairs = val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    const quotasMap = {};
    pairs.forEach((p) => {
        const parts = p.split(':');
        if (parts.length === 2) {
            quotasMap[parts[0].trim()] = parseInt(parts[1].trim()) || 0;
        }
    });

    if (quotasMap[doc] === undefined) {
        if (delta < 0) return; // nothing to lower yet
        quotasMap[doc] = 1;
    } else {
        quotasMap[doc] = Math.min(MAX_QUOTA, quotasMap[doc] + delta);
    }

    if (quotasMap[doc] < 0) delete quotasMap[doc];

    const activeDocs = typeof doctors !== 'undefined' ? doctors : [];
    const newParts = [];
    for (const [d, c] of Object.entries(quotasMap)) {
        if (activeDocs.includes(d)) {
            newParts.push(`${d}:${c}`);
        }
    }
    document.getElementById('inputSinglePoolQuota').value = newParts.join(', ');
    renderStructuredSinglePoolQuotas();
    if (typeof generateSchedule === 'function') generateSchedule();
}

// 4. Conflicts
// Rows exactly as shown, half-filled ones included; the hidden input only keeps complete pairs
function readConflictRows() {
    const container = document.getElementById('structuredConflictsContainer');
    return [...container.querySelectorAll('.flex')].map((row) => [
        row.querySelector('.conflict-doc-1').value,
        row.querySelector('.conflict-doc-2').value,
    ]);
}

function renderStructuredConflicts(rows) {
    const container = document.getElementById('structuredConflictsContainer');
    if (!container) return;
    if (!rows) {
        const val = document.getElementById('inputConflicts').value;
        rows = val
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s)
            .map((p) => {
                let parts = p.includes(':')
                    ? p.split(':')
                    : p.includes(' conflicts with ')
                      ? p.split(' conflicts with ')
                      : [];
                if (parts.length < 2) parts = [p, ''];
                return [parts[0].trim(), parts[1].trim()];
            });
    }

    const activeDocs = typeof doctors !== 'undefined' ? doctors : [];

    let html = '';
    rows.forEach(([doc1, doc2], idx) => {
        let doc1Options = activeDocs
            .map(
                (d) =>
                    `<option value="${esc(d)}" ${d === doc1 ? 'selected' : ''}>${esc(d)}</option>`
            )
            .join('');
        if (!activeDocs.includes(doc1) && doc1)
            doc1Options += `<option value="${esc(doc1)}" selected>${esc(doc1)}</option>`;

        let doc2Options = activeDocs
            .map(
                (d) =>
                    `<option value="${esc(d)}" ${d === doc2 ? 'selected' : ''}>${esc(d)}</option>`
            )
            .join('');
        if (!activeDocs.includes(doc2) && doc2)
            doc2Options += `<option value="${esc(doc2)}" selected>${esc(doc2)}</option>`;

        html += `
        <div class="flex items-center gap-2 mb-2 bg-paper dark:bg-night p-2 rounded-[3px] border border-rule dark:border-rule-dark">
            <select aria-label="${translations[currentLang].conflictDoc1Aria}" class="conflict-doc-1 flex-1 bg-white dark:bg-sheet-dark border border-rule dark:border-rule-dark rounded-[3px] px-2 py-1.5 text-[12px] outline-none text-ink dark:text-slate-100" onchange="syncStructuredConflicts()">
                <option value="">--</option>
                ${doc1Options}
            </select>
            <span class="text-xs text-slate-500"><i data-lucide="zap" class="w-3.5 h-3.5 text-rose-400"></i></span>
            <select aria-label="${translations[currentLang].conflictDoc2Aria}" class="conflict-doc-2 flex-1 bg-white dark:bg-sheet-dark border border-rule dark:border-rule-dark rounded-[3px] px-2 py-1.5 text-[12px] outline-none text-ink dark:text-slate-100" onchange="syncStructuredConflicts()">
                <option value="">--</option>
                ${doc2Options}
            </select>
            <button type="button" aria-label="${translations[currentLang].ariaRemove} ${esc(doc1)} / ${esc(doc2)}" class="text-slate-400 hover:text-red-500" onclick="removeStructuredConflict(${idx})">
                <i data-lucide="x" class="w-4 h-4"></i>
            </button>
        </div>
        `;
    });
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
}

function addStructuredConflictPair() {
    const rows = readConflictRows();
    rows.push(['', '']);
    renderStructuredConflicts(rows);
}

function removeStructuredConflict(idx) {
    const rows = readConflictRows();
    rows.splice(idx, 1);
    renderStructuredConflicts(rows);
    syncStructuredConflicts();
}

function syncStructuredConflicts(skipSchedule = false) {
    const container = document.getElementById('structuredConflictsContainer');
    if (!container) return;
    const rows = container.querySelectorAll('.flex');
    const newParts = [];
    rows.forEach((row) => {
        const d1 = row.querySelector('.conflict-doc-1').value;
        const d2 = row.querySelector('.conflict-doc-2').value;
        if (d1 && d2) {
            newParts.push(`${d1}:${d2}`);
        }
    });
    const hidden = document.getElementById('inputConflicts');
    const next = newParts.join(', ');
    // Half-filled rows live only in the DOM, so they never change the schedule
    const changed = hidden.value !== next;
    hidden.value = next;
    if (changed && !skipSchedule && typeof generateSchedule === 'function') generateSchedule();
}

// 5 & 6. Chips (Special Holidays & No-Duty Days)
function renderStructuredChips(hiddenInputId, containerId, uiInputId) {
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(hiddenInputId);
    const uiInput = document.getElementById(uiInputId);
    if (!container || !hiddenInput || !uiInput) return;

    // Remove existing chips
    const tags = container.querySelectorAll('.chip-tag');
    tags.forEach((tag) => tag.remove());

    const val = hiddenInput.value;
    const items = val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);

    items.forEach((item, idx) => {
        const tag = document.createElement('span');
        tag.className =
            'chip-tag bg-white dark:bg-night text-ink dark:text-slate-200 border border-rule dark:border-rule-dark px-2 py-0.5 rounded-[3px] text-[12px] font-medium flex items-center gap-1.5 select-none';
        tag.innerHTML = `
            <span>${esc(item)}</span>
            <button type="button" aria-label="${translations[currentLang].ariaRemove} ${esc(item)}" onclick="event.stopPropagation(); removeStructuredChip('${hiddenInputId}', ${idx})" class="text-ink-2 hover:text-signal transition-colors">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
        `;
        container.insertBefore(tag, uiInput);
    });

    // Auto toggle input type based on mode if date picker is active
    if (typeof isCustomDateRange !== 'undefined') {
        uiInput.type = isCustomDateRange ? 'date' : 'text';
    }

    if (window.lucide) lucide.createIcons();
}

function removeStructuredChip(hiddenInputId, idx) {
    const hiddenInput = document.getElementById(hiddenInputId);
    const items = hiddenInput.value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    items.splice(idx, 1);
    hiddenInput.value = items.join(', ');

    // Determine which container to update
    if (hiddenInputId === 'inputSpecialHols') {
        renderStructuredChips(
            'inputSpecialHols',
            'structuredSpecialHolsContainer',
            'inputSpecialHolsUI'
        );
    } else if (hiddenInputId === 'inputNoDuty') {
        renderStructuredChips('inputNoDuty', 'structuredNoDutyContainer', 'inputNoDutyUI');
    }
    if (typeof generateSchedule === 'function') generateSchedule();
}

function setupChipInputListener(hiddenInputId, containerId, uiInputId) {
    const uiInput = document.getElementById(uiInputId);
    const container = document.getElementById(containerId);

    if (container && uiInput) {
        container.addEventListener('click', () => uiInput.focus());

        // Date inputs report a value while the year is still being typed (year 2 -> 0002),
        // so only a four-digit year counts as a finished date.
        const commit = () => {
            let v = uiInput.value.trim().replace(/,/g, '');
            if (uiInput.type === 'date') {
                if (!v || parseInt(v.split('-')[0], 10) < 1000) return;
                const dateObj = parseISODate(v);
                v =
                    ('0' + dateObj.getDate()).slice(-2) +
                    '/' +
                    ('0' + (dateObj.getMonth() + 1)).slice(-2) +
                    '/' +
                    dateObj.getFullYear();
            }
            if (!v) return;
            const hiddenInput = document.getElementById(hiddenInputId);
            const items = hiddenInput.value
                ? hiddenInput.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter((s) => s)
                : [];
            if (!items.includes(v)) {
                items.push(v);
                hiddenInput.value = items.join(', ');
                renderStructuredChips(hiddenInputId, containerId, uiInputId);
                if (typeof generateSchedule === 'function') generateSchedule();
            }
            uiInput.value = '';
        };

        uiInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commit();
            }
        });
        uiInput.addEventListener('change', () => {
            if (uiInput.type === 'date') commit();
        });
        uiInput.addEventListener('blur', () => {
            if (uiInput.type === 'date') commit();
        });
    }
}
