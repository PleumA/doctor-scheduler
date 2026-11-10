// Multi-language translation dictionaries and initialization logic have been moved to translations.js

// Default doctors populated to give a stunning starting look
let doctors = ['A', 'B', 'C', 'D', 'E', 'F'];
let offData = [];
let extraSlotsData = [];
let globalResult = null;
let isInitialLoad = true;
let viewMode = 'table'; // 'table' or 'calendar'
let isCustomDateRange = false;
let scheduleDates = [];

// Manual override object tracking custom cell edits
// Format: { [day]: { [slotIndex]: docName } }
let manualOverrides = {};
// Period the manual overrides belong to; null means "adopt the next run's period" (set by import)
let overridesPeriod = null;
// Overrides from an imported file: adopted into manualOverrides only when a run commits
let pendingOverrides = null;
// Deterministic PRNG (mulberry32) so identical inputs produce the same roster.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
// Spread the planned extra night doctors across the range, weekdays first.
function chooseExtraNightDays(nightDays, holidaySet, count) {
    if (count <= 0) return [];
    const pool = nightDays
        .filter((d) => !holidaySet.has(d))
        .concat(nightDays.filter((d) => holidaySet.has(d)));
    const chosen = [];
    const step = pool.length / count;
    for (let i = 0; i < count; i++) {
        let idx = Math.min(pool.length - 1, Math.floor((i + 0.5) * step));
        while (chosen.includes(pool[idx])) idx = (idx + 1) % pool.length;
        chosen.push(pool[idx]);
    }
    return chosen.sort((a, b) => a - b);
}
const warnedChips = new Set(); // day chips already reported as dropped
let quota = {};

// Shared doctor tag palette (indexed by doctor order). The chip itself is neutral;
// the 4px left spine carries the doctor's colour — see .doc-chip in src/input.css.
const DOC_COLORS = [
    'border-l-teal-600 dark:border-l-teal-400',
    'border-l-indigo-600 dark:border-l-indigo-400',
    'border-l-emerald-600 dark:border-l-emerald-400',
    'border-l-amber-600 dark:border-l-amber-400',
    'border-l-purple-600 dark:border-l-purple-400',
    'border-l-sky-600 dark:border-l-sky-400',
    'border-l-rose-600 dark:border-l-rose-400',
];
const DOC_COLOR = (doc) =>
    'doc-chip ' + DOC_COLORS[resultCtx().doctors.indexOf(doc) % DOC_COLORS.length];

// Locale-aware day/month name helpers (replaces duplicated name arrays)
const localeTag = () => (currentLang === 'th' ? 'th-TH' : 'en-US');
const dayName = (dateObj) => dateObj.toLocaleDateString(localeTag(), { weekday: 'long' });
const monthName = (dateObj) => dateObj.toLocaleDateString(localeTag(), { month: 'short' });

// Shared parsers for "Name: 2, Other: 3" style textarea inputs (newline or comma separated)
const parseKV = (str) => {
    const map = {};
    (str || '').split(/[\n,]+/).forEach((part) => {
        const pair = part.split(':');
        if (pair.length !== 2) return;
        const key = pair[0].trim();
        const val = pair[1].trim();
        if (key && val) map[key] = val;
    });
    return map;
};
const parseKVNum = (str) => {
    const map = {};
    Object.entries(parseKV(str)).forEach(([k, v]) => {
        const n = parseInt(v);
        if (!isNaN(n)) map[k] = n;
    });
    return map;
};
const expandSlots = (roleSlots) =>
    Object.entries(roleSlots).flatMap(([role, count]) => Array(count).fill(role));

function getQuotaKey(doctor, config) {
    const isRoleBased = config ? config.roleBased : false;
    const docName = typeof doctor === 'string' ? doctor : doctor.name;
    const docRole =
        typeof doctor === 'object' && doctor.role
            ? doctor.role
            : config && config.doctorRoles
              ? config.doctorRoles[docName]
              : 'Default';
    return isRoleBased ? docRole : docName;
}

// Dark Mode state
let darkMode =
    localStorage.getItem('schedule_dark') !== null
        ? localStorage.getItem('schedule_dark') === 'true'
        : window.matchMedia
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : false;

// Initial setup on document load
document.addEventListener('DOMContentLoaded', () => {
    // An open settings popover must not float over the inline layout after an iPad rotates to landscape
    window
        .matchMedia?.('(min-width: 1024px)')
        ?.addEventListener(
            'change',
            (e) => e.matches && document.getElementById('settingsPanel')?.hidePopover?.()
        );
    const d = new Date();
    document.getElementById('inputMonth').value = d.getMonth() + 1;
    document.getElementById('inputYear').value =
        currentLang === 'th' ? d.getFullYear() + 543 : d.getFullYear();

    // Sync default doctors
    syncDoctorsToInput();
    renderDoctorTags();
    if (typeof initStructuredInputs === 'function') initStructuredInputs();
    renderSpecialDocsCheckboxList();

    // Custom Date Range Listener
    const chkCustom = document.getElementById('chkCustomDateRange');
    if (chkCustom) {
        chkCustom.addEventListener('change', function (e) {
            isCustomDateRange = e.target.checked;
            // The chip inputs switch between text and date entry
            renderStructuredChips(
                'inputSpecialHols',
                'structuredSpecialHolsContainer',
                'inputSpecialHolsUI'
            );
            renderStructuredChips('inputNoDuty', 'structuredNoDutyContainer', 'inputNoDutyUI');
            const customContainer = document.getElementById('customDateRangeContainer');
            const monthYearContainer = document.getElementById('standardMonthYearContainer');
            const btnCalendarView = document.getElementById('btnCalendarView');
            const offNote = document.getElementById('offRequestCustomNote');

            if (isCustomDateRange) {
                customContainer.classList.remove('hidden');
                monthYearContainer.classList.add('hidden');
                if (btnCalendarView) btnCalendarView.classList.add('hidden');
                if (offNote) offNote.classList.remove('hidden');
                if (viewMode === 'calendar') window.setViewMode('table');
                window.handleCustomDateRangeChange();
            } else {
                customContainer.classList.add('hidden');
                monthYearContainer.classList.remove('hidden');
                if (btnCalendarView) btnCalendarView.classList.remove('hidden');
                if (offNote) offNote.classList.add('hidden');
                generateSchedule();
            }
        });
    }

    // Apply language i18n
    applyTranslations();

    // Apply dark mode theme
    applyDarkMode();

    // Show manual automatically on first visit
    try {
        if (!localStorage.getItem('hasSeenManual')) {
            setTimeout(() => {
                if (typeof window.openManualModal === 'function') {
                    window.openManualModal();
                }
            }, 800);
            localStorage.setItem('hasSeenManual', 'true');
        }
    } catch (e) {
        // Ignored if localStorage is unavailable
    }

    // Set up listeners for the tag input text box
    const docInput = document.getElementById('doctorInput');
    docInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const value = this.value.trim();
            if (value) {
                addDoctor(value);
                this.value = '';
            }
        } else if (e.key === 'Backspace' && !e.repeat && this.value === '') {
            if (doctors.length > 0) removeDoctor(doctors.length - 1);
        }
    });

    // Handle paste of comma separated lists
    docInput.addEventListener('input', function () {
        if (this.value.includes(',')) {
            const parts = this.value.split(',');
            const lastPart = parts.pop();
            parts.forEach((part) => {
                addDoctor(part);
            });
            this.value = lastPart;
        }
    });

    // Click container to focus input
    const tagContainer = document.getElementById('doctorTagsContainer');
    tagContainer.addEventListener('click', () => {
        docInput.focus();
    });

    // Initial render elements
    renderOffRequests();
    renderExtraSlots();
    toggleSpecialRuleUI();

    // Listeners for new inputs
    const rolesInput = document.getElementById('inputDoctorRoles');
    if (rolesInput) {
        rolesInput.addEventListener('change', () => generateSchedule());
    }
    const defaultRoleSlotsInput = document.getElementById('inputDefaultRoleSlots');
    if (defaultRoleSlotsInput) {
        defaultRoleSlotsInput.addEventListener('change', () => generateSchedule());
    }
    const roleQuotasInput = document.getElementById('inputRoleQuotas');
    if (roleQuotasInput) {
        roleQuotasInput.addEventListener('change', () => generateSchedule());
    }
    const singlePoolQuotaInput = document.getElementById('inputSinglePoolQuota');
    if (singlePoolQuotaInput) {
        singlePoolQuotaInput.addEventListener('change', () => generateSchedule());
    }
    const conflictsInput = document.getElementById('inputConflicts');
    if (conflictsInput) {
        conflictsInput.addEventListener('change', () => generateSchedule());
    }
    const offDutyPeriodInput = document.getElementById('inputOffDutyPeriod');
    if (offDutyPeriodInput) {
        offDutyPeriodInput.addEventListener('change', () => generateSchedule());
    }
    const preventLongGapsInput = document.getElementById('chkPreventLongGaps');
    if (preventLongGapsInput) {
        preventLongGapsInput.addEventListener('change', () => generateSchedule());
    }
    const balanceShiftsInput = document.getElementById('chkBalanceShifts');
    if (balanceShiftsInput) {
        balanceShiftsInput.addEventListener('change', () => generateSchedule());
    }
    const allowBlankDaysInput = document.getElementById('chkAllowBlankDays');
    if (allowBlankDaysInput) {
        allowBlankDaysInput.addEventListener('change', () => generateSchedule());
    }
    const softAlternateInput = document.getElementById('chkSoftAlternate');
    if (softAlternateInput) {
        softAlternateInput.addEventListener('change', (e) => {
            const container = document.getElementById('alternateStrengthContainer');
            if (container) {
                if (e.target.checked) {
                    container.classList.remove('hidden');
                } else {
                    container.classList.add('hidden');
                }
            }
            generateSchedule();
        });
    }
    const alternateStrengthInput = document.getElementById('selectAlternateStrength');
    if (alternateStrengthInput) {
        alternateStrengthInput.addEventListener('change', () => generateSchedule());
    }
    const roleBasedInput = document.getElementById('chkRoleBased');
    if (roleBasedInput) {
        roleBasedInput.addEventListener('change', () => {
            toggleRoleBasedUI();
            generateSchedule();
        });
    }

    const shiftBasedInput = document.getElementById('chkShiftBased');
    if (shiftBasedInput) {
        shiftBasedInput.addEventListener('change', () => {
            toggleShiftBasedUI();
            generateSchedule();
        });
    }
    const morningSlotsInput = document.getElementById('inputMorningSlots');
    if (morningSlotsInput) {
        morningSlotsInput.addEventListener('change', () => generateSchedule());
    }
    const afternoonSlotsInput = document.getElementById('inputAfternoonSlots');
    if (afternoonSlotsInput) {
        afternoonSlotsInput.addEventListener('change', () => generateSchedule());
    }
    const nightSlotsInput = document.getElementById('inputNightSlots');
    if (nightSlotsInput) {
        nightSlotsInput.addEventListener('change', () => generateSchedule());
    }

    const defaultSlotsInput = document.getElementById('inputDefaultSlots');
    if (defaultSlotsInput) {
        defaultSlotsInput.addEventListener('change', () => generateSchedule());
    }
    const monthInput = document.getElementById('inputMonth');
    if (monthInput) {
        monthInput.addEventListener('change', () => generateSchedule());
    }
    const yearInput = document.getElementById('inputYear');
    if (yearInput) {
        yearInput.addEventListener('change', () => generateSchedule());
    }
    const specialHolsInput = document.getElementById('inputSpecialHols');
    if (specialHolsInput) {
        specialHolsInput.addEventListener('change', () => generateSchedule());
    }
    const noDutyInput = document.getElementById('inputNoDuty');
    if (noDutyInput) {
        noDutyInput.addEventListener('change', () => generateSchedule());
    }
    const specialDocsInput = document.getElementById('inputSpecialDocs');
    if (specialDocsInput) {
        specialDocsInput.addEventListener('change', () => generateSchedule());
    }
    const specialDaysInput = document.getElementById('inputSpecialDays');
    if (specialDaysInput) {
        specialDaysInput.addEventListener('change', () => generateSchedule());
    }
    const specialStartDayInput = document.getElementById('inputSpecialStartDay');
    if (specialStartDayInput) {
        specialStartDayInput.addEventListener('change', () => generateSchedule());
    }

    const inputStartDate = document.getElementById('inputStartDate');
    if (inputStartDate) {
        inputStartDate.addEventListener('change', () => window.handleCustomDateRangeChange());
    }
    const inputEndDate = document.getElementById('inputEndDate');
    if (inputEndDate) {
        inputEndDate.addEventListener('change', () => window.handleCustomDateRangeChange());
    }

    // Sync roles mapping input
    syncDoctorRolesInput();
    toggleRoleBasedUI();
    toggleShiftBasedUI();

    // Sync alternate strength container visibility
    const softAlternateInputInit = document.getElementById('chkSoftAlternate');
    if (softAlternateInputInit) {
        const container = document.getElementById('alternateStrengthContainer');
        if (container) {
            if (softAlternateInputInit.checked) {
                container.classList.remove('hidden');
            } else {
                container.classList.add('hidden');
            }
        }
    }

    // Start automatic calculation
    setTimeout(() => {
        generateSchedule();
        window.initialized = true;
    }, 200);
});

// Toggle Role-Based settings visibility
function toggleRoleBasedUI() {
    const isOn = document.getElementById('chkRoleBased')?.checked;
    const panel = document.getElementById('roleBasedSettings');
    if (panel) {
        panel.style.display = isOn ? '' : 'none';
    }
    const defaultSlotsContainer = document.getElementById('defaultSlotsContainer');
    const isShiftActive = document.getElementById('chkShiftBased')?.checked;
    if (defaultSlotsContainer) {
        if (isOn || isShiftActive) {
            defaultSlotsContainer.classList.add('hidden');
        } else {
            defaultSlotsContainer.classList.remove('hidden');
        }
    }
    const singlePoolQuotaContainer = document.getElementById('singlePoolQuotaContainer');
    if (singlePoolQuotaContainer) {
        if (isOn) {
            singlePoolQuotaContainer.classList.add('hidden');
        } else {
            singlePoolQuotaContainer.classList.remove('hidden');
        }
    }
    syncCustomSlotsDivider();
}

// Drop the divider above #customSlotsContainer when nothing is shown above it
function syncCustomSlotsDivider() {
    const customSlotsContainer = document.getElementById('customSlotsContainer');
    if (!customSlotsContainer) return;
    const nothingAbove = ['defaultSlotsContainer', 'singlePoolQuotaContainer'].every(
        (id) => document.getElementById(id)?.classList.contains('hidden') ?? true
    );
    ['border-t', 'pt-4'].forEach((c) =>
        nothingAbove
            ? customSlotsContainer.classList.remove(c)
            : customSlotsContainer.classList.add(c)
    );
}

// Toggle Shift-Based settings visibility
function toggleShiftBasedUI() {
    const isShiftBased = document.getElementById('chkShiftBased')?.checked;
    const shiftSlotsCountsContainer = document.getElementById('shiftSlotsCountsContainer');
    const defaultSlotsContainer = document.getElementById('defaultSlotsContainer');
    const customSlotsContainer = document.getElementById('customSlotsContainer');
    const chkRoleBased = document.getElementById('chkRoleBased');
    const isRoleActive = chkRoleBased?.checked;

    if (shiftSlotsCountsContainer) {
        if (isShiftBased) {
            shiftSlotsCountsContainer.classList.remove('hidden');
        } else {
            shiftSlotsCountsContainer.classList.add('hidden');
        }
    }

    if (isShiftBased) {
        if (defaultSlotsContainer) defaultSlotsContainer.classList.add('hidden');
        if (customSlotsContainer) customSlotsContainer.classList.add('hidden');
    } else {
        if (defaultSlotsContainer && !isRoleActive) {
            defaultSlotsContainer.classList.remove('hidden');
        }
        if (customSlotsContainer) {
            customSlotsContainer.classList.remove('hidden');
        }
    }
    syncCustomSlotsDivider();
}

// Close dropdown selectors when clicking outside
document.addEventListener('click', () => {
    const dropdowns = document.querySelectorAll('[id^="dropdown-"]');
    dropdowns.forEach((d) => d.classList.add('hidden'));

    const cellDropdowns = document.querySelectorAll(
        '[id^="celldropdown-"], [id^="tablecelldropdown-"]'
    );
    cellDropdowns.forEach((d) => d.classList.add('hidden'));
});

// Language Translation Handler
window.toggleLanguage = function () {
    currentLang = currentLang === 'th' ? 'en' : 'th';
    localStorage.setItem('schedule_lang', currentLang);

    // Auto convert year between BE / AD format
    const yearInput = document.getElementById('inputYear');
    if (yearInput) {
        let yearVal = parseInt(yearInput.value);
        if (!isNaN(yearVal)) {
            if (currentLang === 'en' && yearVal > 2500) {
                yearInput.value = yearVal - 543;
            } else if (currentLang === 'th' && yearVal < 2200) {
                yearInput.value = yearVal + 543;
            }
        }
    }

    applyTranslations();
    showToast(currentLang === 'th' ? 'เปลี่ยนภาษาเป็นไทยแล้ว' : 'Language switched to English');
};

function applyTranslations() {
    const lang = currentLang;

    // Set document language attribute
    document.documentElement.lang = lang === 'th' ? 'th' : 'en';
    document.title = translations[lang].pageTitle;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', translations[lang].metaDescription);

    // Update simple text elements
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            // Check if it's an input field placeholder
            if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
                el.setAttribute('placeholder', translations[lang][key]);
            } else {
                // Safely replace text node without breaking lucide icons inside buttons
                let textNode = Array.from(el.childNodes).find((n) => n.nodeType === Node.TEXT_NODE);
                if (textNode) {
                    textNode.nodeValue = translations[lang][key];
                } else {
                    el.innerText = translations[lang][key];
                }
            }
        }
    });

    // Update tooltip (title) attributes
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const v = translations[lang][el.getAttribute('data-i18n-title')];
        if (v) el.setAttribute('title', v);
    });

    // Update aria-label attributes
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
        const v = translations[lang][el.getAttribute('data-i18n-aria')];
        if (v) el.setAttribute('aria-label', v);
    });

    // Update HTML elements (preserves rich formatting like <code> tags)
    const htmlElements = document.querySelectorAll('[data-i18n-html]');
    htmlElements.forEach((el) => {
        const key = el.getAttribute('data-i18n-html');
        if (translations[lang][key]) {
            el.innerHTML = translations[lang][key];
        }
    });

    // Update placeholders manually to be safe
    const docInput = document.getElementById('doctorInput');
    if (docInput) {
        docInput.placeholder = translations[lang]['docInputPlaceholder'];
    }

    const specialHolsInput = document.getElementById('inputSpecialHols');
    if (specialHolsInput) {
        specialHolsInput.placeholder = lang === 'th' ? 'เช่น 13, 14, 15' : 'e.g. 13, 14, 15';
    }

    const noDutyInput = document.getElementById('inputNoDuty');
    if (noDutyInput) {
        noDutyInput.placeholder = lang === 'th' ? 'เช่น 15, 16' : 'e.g. 15, 16';
    }

    // Update language toggle button text
    const btnLang = document.getElementById('btnLanguage');
    if (btnLang) {
        btnLang.innerText = lang === 'th' ? 'EN' : 'ไทย';
    }

    // Update calendar header grid days
    const calHeaders = document.getElementById('calendarHeaderDays');
    if (calHeaders) {
        calHeaders.innerHTML = `
            <div class="text-rose-500 py-1">${translations[lang].daySun}</div>
            <div class="py-1">${translations[lang].dayMon}</div>
            <div class="py-1">${translations[lang].dayTue}</div>
            <div class="py-1">${translations[lang].dayWed}</div>
            <div class="py-1">${translations[lang].dayThu}</div>
            <div class="py-1">${translations[lang].dayFri}</div>
            <div class="text-rose-500 py-1">${translations[lang].daySat}</div>
        `;
    }

    // Re-render components with the new language
    if (globalResult) {
        try {
            updateDayNamesLanguage();
            renderResults();
            updateStatsDashboard();
        } catch (err) {
            // The result view is secondary: never leave the rest of the UI half-translated
            console.error('Result re-render failed:', err);
        }
    }

    renderOffRequests();
    renderExtraSlots();
    renderSpecialDocsCheckboxList();
    // Rendered rows hold language-dependent text (aria-labels, the "new role" option, the no-doctors warning)
    if (typeof renderStructuredChips === 'function') {
        renderDoctorTags();
        renderStructuredChips(
            'inputSpecialHols',
            'structuredSpecialHolsContainer',
            'inputSpecialHolsUI'
        );
        renderStructuredChips('inputNoDuty', 'structuredNoDutyContainer', 'inputNoDutyUI');
    }
}

// Cell button aria-label; displayDoc is already escaped (or a translated label)
const cellAria = (day, slot, name) =>
    translations[currentLang].cellAria
        .replace('{day}', day)
        .replace('{slot}', slot + 1)
        .replace('{name}', () => name);

function updateDayNamesLanguage() {
    if (!globalResult) return;

    // Only the displayed result's own snapshot: live inputs may be invalid or describe the next run
    const ctx = resultCtx();
    const dates = ctx.isCustomDateRange ? ctx.dates : null;

    globalResult.schedule.forEach((row) => {
        row.dayName = dayName(ctx.dates[row.day - 1]);
        if (dates)
            row.dayDisplay = formatShortDate(row.day, ctx.month, ctx.year, currentLang, dates);

        // Reconstruct warning flags using active language i18n
        updateDayNote(row, null, ctx.config, ctx);
    });
}

// Dark Mode Handler
window.toggleDarkMode = function () {
    darkMode = !darkMode;
    localStorage.setItem('schedule_dark', darkMode);
    applyDarkMode();
    showToast(
        currentLang === 'th'
            ? darkMode
                ? 'เปิดโหมดมืดแล้ว'
                : 'ปิดโหมดมืดแล้ว'
            : darkMode
              ? 'Dark mode enabled'
              : 'Light mode enabled'
    );
};

function applyDarkMode() {
    const html = document.documentElement;
    const icon = document.getElementById('iconDarkMode');

    if (darkMode) {
        html.classList.add('dark');
        if (icon) icon.setAttribute('data-lucide', 'sun');
    } else {
        html.classList.remove('dark');
        if (icon) icon.setAttribute('data-lucide', 'moon');
    }

    lucide.createIcons();
}

// Tag Chip Input functions
function syncDoctorsToInput() {
    document.getElementById('inputDoctors').value = doctors.join(', ');
}

function syncDoctorRolesInput() {
    const roleInput = document.getElementById('inputDoctorRoles');
    if (!roleInput) return;

    const currentRoles = {};
    roleInput.value.split(/[\n,]+/).forEach((part) => {
        const pair = part.split(':');
        if (pair.length === 2) {
            const doc = pair[0].trim();
            const role = pair[1].trim();
            if (doc && role) {
                currentRoles[doc] = role;
            }
        }
    });

    const newRolesArr = [];
    doctors.forEach((doc, index) => {
        let role = currentRoles[doc];
        if (!role) {
            role = index % 2 === 0 ? 'R1' : 'R2';
        }
        newRolesArr.push(`${doc}:${role}`);
    });

    roleInput.value = newRolesArr.join(', ');
}

function renderDoctorTags() {
    const container = document.getElementById('doctorTagsContainer');
    const inputField = document.getElementById('doctorInput');

    // Remove all existing tag badges
    const tags = container.querySelectorAll('.doctor-tag');
    tags.forEach((tag) => tag.remove());

    // Draw tag badges
    doctors.forEach((doc, index) => {
        const tag = document.createElement('span');
        tag.className = 'doctor-tag ' + DOC_COLOR(doc) + ' select-none';
        tag.innerHTML = `
            <span></span>
            <button type="button" aria-label="${translations[currentLang].ariaRemove} ${esc(doc)}" onclick="event.stopPropagation(); removeDoctor(${index})" class="text-ink-2 hover:text-signal transition-colors">
                <i data-lucide="x" class="w-3 h-3"></i>
            </button>
        `;
        tag.querySelector('span').textContent = doc;
        container.insertBefore(tag, inputField);
    });

    lucide.createIcons();
    updateDoctorSelectors();
    if (typeof renderStructuredDoctorRoles === 'function') renderStructuredDoctorRoles();
    if (typeof window.renderStructuredSinglePoolQuotas === 'function')
        window.renderStructuredSinglePoolQuotas();
    // Conflict dropdowns list the doctors, so they follow adds and removes too
    if (
        typeof window.readConflictRows === 'function' &&
        document.getElementById('structuredConflictsContainer')
    )
        window.renderStructuredConflicts(window.readConflictRows());
}

function addDoctor(name) {
    name = sanitizeName(name);
    if (!name) return;
    if (doctors.includes(name)) {
        showToast(
            currentLang === 'th'
                ? 'มีชื่อแพทย์ท่านนี้ในระบบแล้ว'
                : 'This doctor is already in the system',
            true
        );
        return;
    }
    doctors.push(name);
    syncDoctorsToInput();
    syncDoctorRolesInput();
    renderDoctorTags();
    generateSchedule();
}

function removeDoctor(index) {
    const name = doctors[index];
    if (!name) return;
    // Not undoable: undo would resurrect the removed doctor as a ghost in the schedule
    doctors = doctors.filter((_, i) => i !== index);
    // Their overrides are pruned when a run commits (a failed run still shows this doctor)

    // ...and from off requests and the locked-doctor list
    offData.forEach((req) => {
        req.names = String(req.names)
            .split(',')
            .map((n) => n.trim())
            .filter((n) => n && n !== name)
            .join(', ');
    });
    const specialInput = document.getElementById('inputSpecialDocs');
    specialInput.value = specialInput.value
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d && d !== name)
        .join(', ');

    const quotaInput = document.getElementById('inputSinglePoolQuota');
    if (quotaInput)
        quotaInput.value = quotaInput.value
            .split(',')
            .map((q) => q.trim())
            .filter((q) => q && q.split(':')[0].trim() !== name)
            .join(', ');

    // A conflict row naming the removed doctor loses that side; the caller regenerates below
    if (
        typeof window.readConflictRows === 'function' &&
        document.getElementById('structuredConflictsContainer')
    ) {
        window.renderStructuredConflicts(
            window.readConflictRows().map((r) => r.map((n) => (n === name ? '' : n)))
        );
        window.syncStructuredConflicts(true);
    }

    syncDoctorsToInput();
    syncDoctorRolesInput();
    renderDoctorTags();
    renderOffRequests();
    generateSchedule();
}

function updateDoctorSelectors() {
    // Update dropdown values inside Off requests list
    offData.forEach((req) => {
        const dropdown = document.getElementById(`dropdown-${req.id}`);
        if (dropdown) {
            dropdown.innerHTML = getDropdownOptionsHtml(req.id, req.names);
        }
    });

    // Update special lock choices
    renderSpecialDocsCheckboxList();
}

// Dropdown selection list for Off requests
function getDropdownOptionsHtml(reqId, selectedNamesStr) {
    const selectedNames = selectedNamesStr
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n);
    let optionsHtml = '';
    doctors.forEach((doc, index) => {
        const isChecked = selectedNames.includes(doc) ? 'checked' : '';
        optionsHtml += `
            <label class="flex items-center gap-2.5 px-3.5 py-2 hover:bg-paper dark:hover:bg-night cursor-pointer text-[13px] font-medium border-b border-rule dark:border-rule-dark last:border-0">
                <input type="checkbox" value="${esc(doc)}" ${isChecked} onchange="toggleOffDoctorByIndex(${reqId}, ${index}, this.checked)" class="rounded text-orange-500 focus:ring-orange-200 w-4 h-4 dark:border-slate-700 dark:bg-slate-900">
                <span class="text-slate-700 dark:text-slate-200">${esc(doc)}</span>
            </label>
        `;
    });
    if (doctors.length === 0) {
        optionsHtml = `<div class="p-3 text-xs text-slate-400 text-center" data-i18n="offRequestsNoDocs">ไม่มีรายชื่อแพทย์</div>`;
    }
    return optionsHtml;
}

window.toggleDropdown = function (event, dropdownId) {
    event.stopPropagation();

    // Close other dropdowns
    const dropdowns = document.querySelectorAll(
        '[id^="dropdown-"], [id^="celldropdown-"], [id^="tablecelldropdown-"]'
    );
    dropdowns.forEach((d) => {
        if (d.id !== dropdownId) d.classList.add('hidden');
    });

    const dropdown = document.getElementById(dropdownId);
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
};

window.toggleOffDoctor = function (reqId, doc, isChecked) {
    const index = offData.findIndex((o) => o.id === reqId);
    if (index === -1) return;

    let selected = offData[index].names
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n);
    if (isChecked) {
        if (!selected.includes(doc)) selected.push(doc);
    } else {
        selected = selected.filter((d) => d !== doc);
    }

    offData[index].names = selected.join(', ');

    const btnText = document.querySelector(`#offReqBtnText-${reqId}`);
    if (btnText) {
        btnText.innerText =
            selected.length > 0
                ? selected.join(', ')
                : currentLang === 'th'
                  ? 'เลือกแพทย์...'
                  : 'Select...';
    }

    generateSchedule();
};

window.toggleOffDoctorByIndex = function (reqId, index, isChecked) {
    const doc = doctors[index];
    if (doc) window.toggleOffDoctor(reqId, doc, isChecked);
};

// Render special lock selections
function renderSpecialDocsCheckboxList() {
    const container = document.getElementById('specialDocsCheckboxList');
    if (!container) return;

    const inputVal = document.getElementById('inputSpecialDocs').value;
    const selected = inputVal
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d);

    container.innerHTML = '';
    if (doctors.length === 0) {
        container.innerHTML = `<span class="text-xs text-slate-500 dark:text-slate-400">${currentLang === 'th' ? 'กรุณาเพิ่มรายชื่อแพทย์เพื่อตั้งค่า' : 'Please add doctors first'}</span>`;
        return;
    }

    doctors.forEach((doc, index) => {
        const isChecked = selected.includes(doc) ? 'checked' : '';
        const label = document.createElement('label');
        label.className = `flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-bold transition-all ${isChecked ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-400' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`;
        label.innerHTML = `
            <input type="checkbox" value="${esc(doc)}" ${isChecked} onchange="toggleSpecialDocByIndex(${index}, this.checked)" class="rounded text-indigo-600 focus:ring-indigo-200 w-3.5 h-3.5 dark:border-slate-700 dark:bg-slate-900">
            <span>${esc(doc)}</span>
        `;
        container.appendChild(label);
    });
}

window.toggleSpecialDoc = function (doc, isChecked) {
    const input = document.getElementById('inputSpecialDocs');
    let selected = input.value
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d);

    if (isChecked) {
        if (!selected.includes(doc)) selected.push(doc);
    } else {
        selected = selected.filter((d) => d !== doc);
    }

    input.value = selected.join(', ');
    renderSpecialDocsCheckboxList();
    generateSchedule();
};

window.toggleSpecialDocByIndex = function (index, isChecked) {
    const doc = doctors[index];
    if (doc) window.toggleSpecialDoc(doc, isChecked);
};

// UI Handlers
function toggleSpecialRuleUI() {
    const isChecked = document.getElementById('chkUseSpecialRule').checked;
    const container = document.getElementById('specialRuleContainer');
    const body = document.getElementById('specialRuleBody');

    if (isChecked) {
        container.className =
            'sheet transition-all overflow-hidden border-duty/40 dark:border-duty-bright/30';
        body.style.display = 'block';
    } else {
        container.className = 'sheet transition-all overflow-hidden';
        body.style.display = 'none';
    }
    toggleLockConditionUI();
    if (window.initialized) {
        generateSchedule();
    }
}

function toggleLockConditionUI() {
    const type = document.getElementById('lockConditionType')?.value || 'firstNDays';
    const firstNContainer = document.getElementById('lockFirstNDaysContainer');
    const everyWeekdayContainer = document.getElementById('lockEveryWeekdayContainer');

    if (type === 'firstNDays') {
        if (firstNContainer) firstNContainer.classList.remove('hidden');
        if (everyWeekdayContainer) everyWeekdayContainer.classList.add('hidden');
    } else {
        if (firstNContainer) firstNContainer.classList.add('hidden');
        if (everyWeekdayContainer) everyWeekdayContainer.classList.remove('hidden');
    }
}
window.toggleLockConditionUI = toggleLockConditionUI;

let toastTimer;
// Optional third argument: duration in ms (default 3s, 10s for errors). Read via `arguments` so the
// two-parameter signature that many test harnesses patch by regex stays intact.
function showToast(msg, isError = false) {
    const duration = arguments[2] ?? (isError ? 10000 : 3000);
    const toast = document.getElementById('toast');
    const toastContent = document.getElementById('toastContent');
    const safeMsg = esc(msg);

    if (isError) {
        toastContent.className =
            'flex items-center gap-3 px-4 py-3 rounded-md shadow-2xl font-medium text-[13px] border bg-signal/10 text-signal dark:text-signal-bright border-signal/30';
        toastContent.innerHTML = `<i data-lucide="alert-circle" class="w-5 h-5 text-signal-bright"></i> <span id="toastMsg">${safeMsg}</span>`;
    } else {
        toastContent.className =
            'flex items-center gap-3 px-4 py-3 rounded-md shadow-2xl font-medium text-[13px] border bg-ink dark:bg-sheet-dark text-white border-ink dark:border-rule-dark';
        toastContent.innerHTML = `<i data-lucide="check-circle-2" class="w-5 h-5 text-duty-bright"></i> <span id="toastMsg">${safeMsg}</span>`;
    }
    lucide.createIcons();

    toast.classList.remove('opacity-0', 'translate-y-8', 'scale-95', 'pointer-events-none');
    toast.classList.add('opacity-100', 'translate-y-0', 'scale-100');

    clearTimeout(toastTimer); // an older toast's timeout must not hide this one early
    toastTimer = setTimeout(() => {
        toast.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
        toast.classList.add('opacity-0', 'translate-y-8', 'scale-95', 'pointer-events-none');
    }, duration);
}

function renderOffRequests() {
    const container = document.getElementById('offRequestsList');
    if (offData.length === 0) {
        container.innerHTML = `<p class="text-[12px] text-slate-500 dark:text-slate-400 text-center py-2">${translations[currentLang].offRequestsNone || ''}</p>`;
        return;
    }
    container.innerHTML = '';
    offData.forEach((req) => {
        const div = document.createElement('div');
        div.className =
            'flex gap-2 items-center bg-paper dark:bg-night p-2 rounded-[3px] border border-rule dark:border-rule-dark';

        const optionsHtml = getDropdownOptionsHtml(req.id, req.names);
        const selectedNames = req.names
            .split(',')
            .map((n) => n.trim())
            .filter((n) => n);

        div.innerHTML = `
            <div class="${isCustomDateRange ? 'w-56' : 'w-48'} shrink-0 font-sans">
                <input type="text" aria-label="${translations[currentLang].tableDateCol}" placeholder="${isCustomDateRange ? (currentLang === 'th' ? 'เช่น 20/05/2026 หรือ 25/02/2026-04/03/2026' : 'e.g. 20/05/2026, or 25/02/2026-04/03/2026') : currentLang === 'th' ? 'เช่น 5, 12 หรือ 2-10' : 'e.g. 5, 12, or 2-10'}" value="${esc(req.date)}" onchange="updateOffRow(${req.id}, 'date', this.value)" class="w-full text-center border border-rule dark:border-rule-dark rounded-[3px] py-1.5 text-[12px] outline-none focus:border-duty bg-white dark:bg-night font-medium text-ink dark:text-slate-100">
            </div>
            <div class="relative flex-1">
                <button type="button" onclick="toggleDropdown(event, 'dropdown-${req.id}')" class="w-full text-left border border-rule dark:border-rule-dark rounded-[3px] px-2.5 py-1.5 text-[12px] bg-white dark:bg-night flex justify-between items-center hover:border-duty transition-colors">
                    <span id="offReqBtnText-${req.id}" class="truncate text-slate-700 dark:text-slate-200 font-semibold">${selectedNames.length > 0 ? esc(selectedNames.join(', ')) : currentLang === 'th' ? 'เลือกแพทย์...' : 'Select...'}</span>
                    <i data-lucide="chevron-down" class="w-4 h-4 text-slate-400 shrink-0"></i>
                </button>
                <div id="dropdown-${req.id}" onclick="event.stopPropagation()" class="absolute left-0 mt-1 w-full bg-white dark:bg-sheet-dark border border-rule dark:border-rule-dark rounded-md shadow-lg z-50 py-1 hidden max-h-48 overflow-y-auto custom-scrollbar">
                    ${optionsHtml}
                </div>
            </div>
            <button type="button" onclick="deleteOffRow(${req.id})" aria-label="${translations[currentLang].ariaRemove}${req.date ? ' ' + esc(req.date) : ''}" class="text-ink-2 hover:text-signal hover:bg-signal/5 p-1.5 rounded-[3px] transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

function addOffRow() {
    const newId = offData.length > 0 ? Math.max(...offData.map((o) => o.id)) + 1 : 1;
    offData.push({ id: newId, date: '', names: '' });
    renderOffRequests();
}
function updateOffRow(id, field, value) {
    const index = offData.findIndex((o) => o.id === id);
    if (index !== -1) {
        offData[index][field] = value;
        generateSchedule();
    }
}
function deleteOffRow(id) {
    offData = offData.filter((o) => o.id !== id);
    renderOffRequests();
    generateSchedule();
}

function renderExtraSlots() {
    const container = document.getElementById('extraSlotsList');
    if (extraSlotsData.length === 0) {
        container.innerHTML = `<p class="text-[12px] text-slate-500 dark:text-slate-400 text-center py-2">${translations[currentLang].customSlotsNone || ''}</p>`;
        return;
    }
    container.innerHTML = '';
    extraSlotsData.forEach((item) => {
        const div = document.createElement('div');
        div.className =
            'flex gap-2 items-center bg-indigo-50/50 dark:bg-indigo-950/20 p-2 rounded-lg border border-indigo-100 dark:border-indigo-950/35 font-sans';
        div.innerHTML = `
            <div class="w-20 shrink-0">
                <label for="extraDate-${item.id}" class="text-[10px] text-slate-500 dark:text-slate-400 block">${translations[currentLang].tableDateCol}</label>
                <input type="number" id="extraDate-${item.id}" min="1" max="31" value="${esc(item.date)}" onchange="updateExtraSlot(${item.id}, 'date', this.value)" class="w-full text-center border border-rule dark:border-rule-dark rounded-[3px] py-1 text-[12px] outline-none bg-white dark:bg-night font-medium text-ink dark:text-slate-100">
            </div>
            <div class="w-28 shrink-0">
                <label for="extraSlots-${item.id}" class="text-[10px] text-slate-500 dark:text-slate-400 block">${translations[currentLang].defaultSlots}</label>
                <input type="text" id="extraSlots-${item.id}" value="${esc(item.slots)}" onchange="updateExtraSlot(${item.id}, 'slots', this.value)" class="w-full text-center border border-rule dark:border-rule-dark rounded-[3px] py-1 text-[11px] outline-none bg-white dark:bg-night font-medium text-ink dark:text-slate-100" placeholder="${esc(translations[currentLang].extraSlotPlaceholder)}">
            </div>
            <button onclick="deleteExtraSlot(${item.id})" aria-label="${translations[currentLang].ariaRemove} ${esc(item.date)}" class="text-slate-400 hover:text-red-500 p-1 rounded transition-colors mt-4"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

function addExtraSlotRow() {
    const newId = extraSlotsData.length > 0 ? Math.max(...extraSlotsData.map((o) => o.id)) + 1 : 1;
    const roleBased = document.getElementById('chkRoleBased')?.checked;
    const defaultVal = roleBased
        ? document.getElementById('inputDefaultRoleSlots')?.value || 'R1:1, R2:1'
        : document.getElementById('inputDefaultSlots')?.value || '2';
    extraSlotsData.push({ id: newId, date: '', slots: defaultVal });
    renderExtraSlots();
}
function updateExtraSlot(id, field, value) {
    const index = extraSlotsData.findIndex((o) => o.id === id);
    if (index !== -1) {
        extraSlotsData[index][field] = value;
        generateSchedule();
    }
}
function deleteExtraSlot(id) {
    extraSlotsData = extraSlotsData.filter((o) => o.id !== id);
    renderExtraSlots();
    generateSchedule();
}

// View Mode Toggle
window.setViewMode = function (mode) {
    viewMode = mode;

    const btnTable = document.getElementById('btnTableView');
    const btnCal = document.getElementById('btnCalendarView');
    const btnPerson = document.getElementById('btnPersonView');

    const tableContainer = document.getElementById('tableViewContainer');
    const calendarContainer = document.getElementById('calendarViewContainer');
    const personContainer = document.getElementById('personViewContainer');

    // Reset styles
    [btnTable, btnCal, btnPerson].forEach((btn) => {
        if (btn)
            btn.className =
                'px-3 py-1.5 text-[11px] font-medium rounded-[3px] transition-colors flex items-center gap-1.5 text-ink-2 dark:text-slate-400 hover:text-ink dark:hover:text-slate-100';
    });

    // Hide all
    if (tableContainer) tableContainer.classList.add('hidden');
    if (calendarContainer) calendarContainer.classList.add('hidden');
    if (personContainer) personContainer.classList.add('hidden');

    const activeClass =
        'px-3 py-1.5 text-[11px] font-medium rounded-[3px] transition-colors flex items-center gap-1.5 bg-white dark:bg-sheet-dark text-ink dark:text-slate-100 shadow-sm';

    if (mode === 'table') {
        if (btnTable) btnTable.className = activeClass;
        if (tableContainer) tableContainer.classList.remove('hidden');
    } else if (mode === 'calendar') {
        if (btnCal) btnCal.className = activeClass;
        if (calendarContainer) calendarContainer.classList.remove('hidden');
    } else if (mode === 'person') {
        if (btnPerson) btnPerson.className = activeClass;
        if (personContainer) personContainer.classList.remove('hidden');
    }

    renderResults();
};

// --- Core Smart Logic & Optimization Solver ---

// EveryWeekdayLockProxy removed: locked days are computed directly as a plain Set.
// The old proxy sniffed arguments.callee.caller / Error.stack to guess which day
// was being compared; the solver now asks the Set explicitly (specialRuleDays.has(day)).

function parseUIConfig() {
    const year = parseInt(document.getElementById('inputYear').value);
    const month = parseInt(document.getElementById('inputMonth').value);
    const specialHolidaysInput = document.getElementById('inputSpecialHols').value;
    const noDutyDaysInput = document.getElementById('inputNoDuty').value;
    const defaultSlots = Math.min(
        parseInt(document.getElementById('inputDefaultSlots').value) || 2,
        50
    );
    const useSpecialRule = document.getElementById('chkUseSpecialRule').checked;
    const specialRuleDocsInput = document.getElementById('inputSpecialDocs').value;
    const lockConditionType = document.getElementById('lockConditionType')?.value || 'firstNDays';
    const selectLockWeekday =
        document.getElementById('selectLockWeekday')?.value !== undefined
            ? parseInt(document.getElementById('selectLockWeekday').value)
            : 0;
    // The UI is 0-based: 0 = no gap, 1 = one day off after a night.
    // The solver keeps its 1-based offDutyPeriod internally for compatibility.
    const offDutyGapRaw = parseInt(document.getElementById('inputOffDutyPeriod')?.value, 10);
    const offDutyGap = Number.isFinite(offDutyGapRaw) ? Math.max(0, Math.min(6, offDutyGapRaw)) : 1;
    const offDutyPeriod = offDutyGap + 1;
    const minShiftsEl = document.getElementById('inputMinNightShifts');
    const minShiftsRaw = minShiftsEl ? parseInt(minShiftsEl.value, 10) : NaN;
    const minNightShifts = Number.isFinite(minShiftsRaw)
        ? Math.max(0, Math.min(60, minShiftsRaw))
        : 0;
    const allowExtraEl = document.getElementById('chkAllowExtraNightDoctor');
    const allowExtraNightDoctor = allowExtraEl ? !!allowExtraEl.checked : true;
    const preventLongGaps = document.getElementById('chkPreventLongGaps').checked;
    const balanceShifts = document.getElementById('chkBalanceShifts')?.checked;
    const allowBlankDays = document.getElementById('chkAllowBlankDays')?.checked;
    const roleBased = document.getElementById('chkRoleBased')?.checked;

    const isShiftBased = document.getElementById('chkShiftBased')?.checked || false;
    const shiftSlots = (id) => {
        const n = parseInt(document.getElementById(id)?.value);
        return Math.max(0, Math.min(10, Number.isNaN(n) ? 1 : n));
    };
    let morningSlots = shiftSlots('inputMorningSlots');
    let afternoonSlots = shiftSlots('inputAfternoonSlots');
    let nightSlots = shiftSlots('inputNightSlots');
    if (isShiftBased && morningSlots === 0 && afternoonSlots === 0 && nightSlots === 0) {
        morningSlots = 1;
        afternoonSlots = 1;
        nightSlots = 1;
    }

    const chkSoftAlternate = document.getElementById('chkSoftAlternate')?.checked ?? true;
    const selectAlternateStrength =
        document.getElementById('selectAlternateStrength')?.value || 'medium';

    let windowPenalty = 150;
    let pairPenalty = 300;
    if (selectAlternateStrength === 'low') {
        windowPenalty = 50;
        pairPenalty = 100;
    } else if (selectAlternateStrength === 'high') {
        windowPenalty = 300;
        pairPenalty = 600;
    }

    const calcYear = year > 2500 ? year - 543 : year;
    const parseDateDDMMYYYY = (str) => {
        const parts = str.split('/');
        if (parts.length !== 3) return null;
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        let y = parseInt(parts[2], 10);
        if (y > 2500)
            y -= 543; // Buddhist era
        else if (y < 100) y += 2000; // new Date(26, ...) would be 1926
        const date = new Date(y, m, d);
        if (isNaN(date.getTime())) return null;
        return date;
    };

    // Day list chips: plain day numbers, or DD/MM/YYYY in a custom range (mapped to the range's day index)
    const parseDayTokens = (input) =>
        input
            .split(',')
            .map((t) => t.trim())
            .map((t) => {
                if (!isCustomDateRange) return parseInt(t);
                const dt = parseDateDDMMYYYY(t);
                const idx =
                    dt && scheduleDates.length
                        ? Math.round((dt - scheduleDates[0]) / 86400000) + 1
                        : NaN;
                if (idx >= 1 && idx <= scheduleDates.length) return idx;
                // Dropped: say so once per chip instead of silently ignoring it
                if (t && !warnedChips.has(t)) {
                    warnedChips.add(t);
                    showToast(
                        translations[currentLang].dayChipDropped.replace('{chip}', () => t),
                        true
                    );
                }
                return NaN;
            })
            .filter((d) => !isNaN(d));
    const specialHols = parseDayTokens(specialHolidaysInput);
    const noDutyDays = parseDayTokens(noDutyDaysInput);
    let numDays = scheduleDates.length;

    // Fallback for isolated test environments that don't trigger generateSchedule
    if (numDays === 0 && !isCustomDateRange) {
        numDays = new Date(calcYear, month, 0).getDate();
    }

    const holidaySet = new Set(specialHols);
    const noDutySet = new Set(noDutyDays);

    // Locked days for the special rule, as a plain Set of day numbers
    const specialRuleDays = new Set();
    if (useSpecialRule) {
        if (lockConditionType === 'firstNDays') {
            const startD = parseInt(document.getElementById('inputSpecialStartDay')?.value) || 1;
            const endD = parseInt(document.getElementById('inputSpecialDays').value) || 0;
            for (let d = startD; d <= endD; d++) specialRuleDays.add(d);
        } else {
            for (let d = 1; d <= numDays; d++) {
                const dateObj =
                    scheduleDates.length > 0
                        ? scheduleDates[d - 1]
                        : new Date(calcYear, month - 1, d);
                if (dateObj.getDay() === selectLockWeekday) specialRuleDays.add(d);
            }
        }
    }

    let hasMatchingWeekday = false;
    for (let d = 1; d <= numDays; d++) {
        const dateObj =
            scheduleDates.length > 0 ? scheduleDates[d - 1] : new Date(calcYear, month - 1, d);
        if (dateObj.getDay() === selectLockWeekday) {
            hasMatchingWeekday = true;
        }
    }
    if (useSpecialRule && lockConditionType === 'everyWeekday' && !hasMatchingWeekday) {
        if (!window.lockWarningShown) {
            showToast(
                currentLang === 'th'
                    ? 'ไม่พบวันที่ตรงเงื่อนไข'
                    : 'No matching days found for the selected weekday',
                true
            );
            window.lockWarningShown = true;
        }
    }

    for (let d = 1; d <= numDays; d++) {
        const dateObj =
            scheduleDates.length > 0 ? scheduleDates[d - 1] : new Date(calcYear, month - 1, d);
        const dayOfWeek = dateObj.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) holidaySet.add(d);
    }

    const formatDateDDMMYYYY = (date) => {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    };

    const offMap = {};
    offData.forEach((req) => {
        const fullDateStr = String(req.date).trim();
        if (!fullDateStr || !req.names) return;

        const namesArr = req.names
            .split(',')
            .map((n) => n.trim())
            .filter((n) => n);
        if (namesArr.length === 0) return;

        const tokens = fullDateStr
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t);

        tokens.forEach((token) => {
            if (isCustomDateRange) {
                if (token.includes('-')) {
                    const parts = token.split('-');
                    const startStr = parts[0].trim();
                    const endStr = parts[1].trim();
                    const startDate = parseDateDDMMYYYY(startStr);
                    const endDate = parseDateDDMMYYYY(endStr);

                    if (startDate && endDate) {
                        if (startDate > endDate) {
                            showToast(
                                currentLang === 'th'
                                    ? `ช่วงวันที่ไม่ถูกต้อง: ${token}`
                                    : `Invalid date range: ${token}`,
                                'error'
                            );
                            return;
                        }
                        const spanDays = Math.round((endDate - startDate) / 86400000) + 1;
                        if (spanDays > 90) {
                            showToast(
                                currentLang === 'th'
                                    ? `ช่วงวันที่ยาวเกินไป (>90 วัน): ${token}`
                                    : `Date range too long (>90 days): ${token}`,
                                'warning'
                            );
                        }
                        if (spanDays > 366) return; // the ">90 days" warning above already told the user
                        for (let i = 0; i < spanDays; i++) {
                            // Step by calendar day: adding 24 h skips a date across a DST change
                            const curDate = new Date(
                                startDate.getFullYear(),
                                startDate.getMonth(),
                                startDate.getDate() + i
                            );
                            const curStr = formatDateDDMMYYYY(curDate);
                            if (!offMap[curStr]) offMap[curStr] = new Set();
                            namesArr.forEach((n) => offMap[curStr].add(n));
                        }
                    } else {
                        showToast(
                            currentLang === 'th'
                                ? `รูปแบบวันที่ไม่ถูกต้อง: ${token}`
                                : `Invalid date format: ${token}`,
                            'warning'
                        );
                    }
                } else {
                    const d = parseDateDDMMYYYY(token);
                    if (d) {
                        const curStr = formatDateDDMMYYYY(d);
                        if (!offMap[curStr]) offMap[curStr] = new Set();
                        namesArr.forEach((n) => offMap[curStr].add(n));
                    } else {
                        showToast(
                            currentLang === 'th'
                                ? `รูปแบบวันที่ไม่ถูกต้อง: ${token}`
                                : `Invalid date format: ${token}`,
                            'warning'
                        );
                    }
                }
            } else {
                if (token.includes('-')) {
                    const parts = token.split('-');
                    const start = parseInt(parts[0], 10);
                    const end = parseInt(parts[1], 10);
                    if (!isNaN(start) && !isNaN(end)) {
                        if (start > end) {
                            showToast(
                                currentLang === 'th'
                                    ? `ช่วงวันที่ไม่ถูกต้อง: ${token}`
                                    : `Invalid date range: ${token}`,
                                'error'
                            );
                            return;
                        }
                        if (end - start + 1 > 90) {
                            showToast(
                                currentLang === 'th'
                                    ? `ช่วงวันที่ยาวเกินไป (>90 วัน): ${token}`
                                    : `Date range too long (>90 days): ${token}`,
                                'warning'
                            );
                        }
                        for (let i = start; i <= Math.min(end, numDays); i++) {
                            if (!offMap[i]) offMap[i] = new Set();
                            namesArr.forEach((n) => offMap[i].add(n));
                        }
                    } else {
                        showToast(
                            currentLang === 'th'
                                ? `รูปแบบวันที่ไม่ถูกต้อง: ${token}`
                                : `Invalid format: ${token}`,
                            'warning'
                        );
                    }
                } else {
                    const d = parseInt(token, 10);
                    if (!isNaN(d)) {
                        if (!offMap[d]) offMap[d] = new Set();
                        namesArr.forEach((n) => offMap[d].add(n));
                    } else {
                        showToast(
                            currentLang === 'th'
                                ? `รูปแบบวันที่ไม่ถูกต้อง: ${token}`
                                : `Invalid format: ${token}`,
                            'warning'
                        );
                    }
                }
            }
        });
    });

    const extraSlotsMap = {};
    extraSlotsData.forEach((req) => {
        const dateStr = String(req.date).trim();
        const s = req.slots;
        if (isCustomDateRange) {
            if (dateStr && s) extraSlotsMap[dateStr] = s;
        } else {
            if (dateStr.includes('-')) {
                const parts = dateStr.split('-');
                const start = parseInt(parts[0]);
                const end = parseInt(parts[1]);
                if (!isNaN(start) && !isNaN(end) && start <= end && s) {
                    for (let i = start; i <= end; i++) {
                        extraSlotsMap[i] = s;
                    }
                }
            } else {
                const d = parseInt(dateStr);
                if (d && s) extraSlotsMap[d] = s;
            }
        }
    });

    const doctorRoles = {};
    doctors.forEach((doc) => {
        doctorRoles[doc] = 'Default';
    });
    if (roleBased) {
        Object.entries(parseKV(document.getElementById('inputDoctorRoles')?.value)).forEach(
            ([doc, role]) => {
                doctorRoles[doc] = String(role);
            }
        );
    }

    const defaultRoleSlots = {};
    if (roleBased) {
        const parsed = parseKVNum(document.getElementById('inputDefaultRoleSlots')?.value);
        Object.entries(parsed).forEach(([role, count]) => {
            if (count > 0) defaultRoleSlots[role] = count;
        });
    }
    if (Object.keys(defaultRoleSlots).length === 0) defaultRoleSlots['Default'] = defaultSlots;

    quota = {};
    const quotaInputId = roleBased ? 'inputRoleQuotas' : 'inputSinglePoolQuota';
    Object.entries(parseKV(document.getElementById(quotaInputId)?.value)).forEach(([key, raw]) => {
        const count = parseInt(raw);
        if (isNaN(count) || count <= 0) {
            showToast(
                currentLang === 'th'
                    ? `ข้อผิดพลาดโควตา: ${key} ต้องมากกว่า 0`
                    : `Quota error: ${key} must be > 0`,
                true
            );
        } else {
            quota[key] = count;
        }
    });

    // Filter invalid keys (Step 5: unknown key in quota -> warning toast, skip entry)
    if (Object.keys(quota).length > 0) {
        if (roleBased) {
            const activeRoles = new Set(doctors.map((doc) => doctorRoles[doc] || 'Default'));
            Object.keys(quota).forEach((role) => {
                if (!activeRoles.has(role)) {
                    showToast(
                        currentLang === 'th'
                            ? `คำเตือนโควตา: ไม่พบกลุ่มเวร "${role}"`
                            : `Quota warning: Role "${role}" not found`,
                        true
                    );
                    delete quota[role];
                }
            });
        } else {
            Object.keys(quota).forEach((doc) => {
                if (!doctors.includes(doc)) {
                    showToast(
                        currentLang === 'th'
                            ? `คำเตือนโควตา: ไม่พบแพทย์ชื่อ "${doc}"`
                            : `Quota warning: Doctor "${doc}" not found`,
                        true
                    );
                    delete quota[doc];
                }
            });
        }
    }
    const hasQuotas = Object.keys(quota).length > 0;

    const conflicts = [];
    const conflictsText = document.getElementById('inputConflicts').value || '';
    conflictsText.split(/[\n,]+/).forEach((part) => {
        part = part.trim();
        if (!part) return;
        let pair = [];
        if (part.includes(' conflicts with ')) pair = part.split(' conflicts with ');
        else if (part.includes(' conflicts ')) pair = part.split(' conflicts ');
        else if (part.includes(':')) pair = part.split(':');
        else if (part.includes('-')) pair = part.split('-');
        else pair = part.split(/\s+/);

        if (pair.length >= 2) {
            const doc1 = pair[0].trim();
            const doc2 = pair[1].trim();
            if (doc1 && doc2) conflicts.push([doc1, doc2]);
        }
    });

    const getRoleSlotsForDay = (day) => {
        let key = day;
        if (isCustomDateRange) {
            const dateObj = scheduleDates[day - 1];
            const dd = String(dateObj.getDate()).padStart(2, '0');
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const yyyy = dateObj.getFullYear();
            key = `${dd}/${mm}/${yyyy}`;
        }

        if (isShiftBased) {
            if (roleBased) {
                let rawSlots = {};
                const slotsVal = extraSlotsMap[key];
                if (slotsVal !== undefined) {
                    const slotsStr = String(slotsVal).trim();
                    if (/^\d+$/.test(slotsStr)) {
                        rawSlots['Default'] = Math.min(parseInt(slotsStr), 50);
                    } else {
                        const parsed = parseKVNum(slotsStr);
                        Object.entries(parsed).forEach(([role, count]) => {
                            if (count > 0) rawSlots[role] = count;
                        });
                    }
                } else {
                    rawSlots = { ...defaultRoleSlots };
                }
                if (Object.keys(rawSlots).length === 0) rawSlots['Default'] = 1;

                const rolesSeq = expandSlots(rawSlots);

                const dayRoleSlots = {};
                const totalShifts = morningSlots + afternoonSlots + nightSlots;
                for (let i = 0; i < totalShifts; i++) {
                    const role = rolesSeq[i % rolesSeq.length] || 'Default';
                    dayRoleSlots[role] = (dayRoleSlots[role] || 0) + 1;
                }
                return dayRoleSlots;
            } else {
                return { Default: morningSlots + afternoonSlots + nightSlots };
            }
        }

        const slotsVal = extraSlotsMap[key];
        if (slotsVal === undefined) return { ...defaultRoleSlots };
        let dayRoleSlots = {};
        const slotsStr = String(slotsVal).trim();
        if (/^\d+$/.test(slotsStr)) {
            dayRoleSlots['Default'] = Math.min(parseInt(slotsStr), 50);
        } else {
            const parsed = parseKVNum(slotsStr);
            Object.entries(parsed).forEach(([role, count]) => {
                if (count > 0) dayRoleSlots[role] = count;
            });
        }
        if (Object.keys(dayRoleSlots).length === 0) dayRoleSlots['Default'] = defaultSlots;
        if (!roleBased) {
            let total = 0;
            Object.keys(dayRoleSlots).forEach((r) => (total += dayRoleSlots[r]));
            dayRoleSlots = { Default: total };
        }
        return dayRoleSlots;
    };

    const cleanName = (name) => name.trim().toLowerCase();
    const conflictSet = new Set();
    conflicts.forEach(([d1, d2]) => {
        conflictSet.add(`${cleanName(d1)}:${cleanName(d2)}`);
        conflictSet.add(`${cleanName(d2)}:${cleanName(d1)}`);
    });
    const areConflicting = (doc1, doc2) => conflictSet.has(`${cleanName(doc1)}:${cleanName(doc2)}`);

    const specialDocs = specialRuleDocsInput
        .split(',')
        .map((d) => d.trim())
        .filter((d) => d && doctors.includes(d));

    // Mathematical Validation (Fail-Safe) - only needs to run once per generation cycle
    if (hasQuotas) {
        let totalSlotsInMonth = 0;
        for (let d = 1; d <= numDays; d++) {
            if (!noDutySet.has(d)) {
                let dRoleSlots = getRoleSlotsForDay(d);
                Object.keys(dRoleSlots).forEach((role) => (totalSlotsInMonth += dRoleSlots[role]));
            }
        }
        let totalRequiredShifts = 0;
        doctors.forEach((doc) => {
            const key = getQuotaKey(doc, { roleBased, doctorRoles });
            if (quota[key] !== undefined) {
                totalRequiredShifts += quota[key];
            }
        });

        if (!allowBlankDays && totalRequiredShifts !== totalSlotsInMonth) {
            const diff = Math.abs(totalRequiredShifts - totalSlotsInMonth);
            const msgTH =
                totalRequiredShifts < totalSlotsInMonth
                    ? `ข้อผิดพลาด: โควตารวม (${totalRequiredShifts}) แต่มีทั้งหมด ${totalSlotsInMonth} ช่อง - กรุณาเพิ่มอีก ${diff} เวรในโควตา (หรือเปิดอนุญาตเว้นว่าง)`
                    : `ข้อผิดพลาด: โควตารวม (${totalRequiredShifts}) แต่มีทั้งหมด ${totalSlotsInMonth} ช่อง - กรุณาลดโควตาลง ${diff} เวร`;
            const msgEN =
                totalRequiredShifts < totalSlotsInMonth
                    ? `Error: Quotas sum to ${totalRequiredShifts} but there are ${totalSlotsInMonth} slots — add ${diff} more shifts.`
                    : `Error: Quotas sum to ${totalRequiredShifts} but there are ${totalSlotsInMonth} slots — remove ${diff} shifts.`;
            throw new Error(currentLang === 'th' ? msgTH : msgEN);
        } else if (allowBlankDays && totalRequiredShifts > totalSlotsInMonth) {
            const diff = totalRequiredShifts - totalSlotsInMonth;
            throw new Error(
                currentLang === 'th'
                    ? `ข้อผิดพลาด: โควตารวม (${totalRequiredShifts}) เกินกว่าจำนวนเวรทั้งหมดในเดือน (${totalSlotsInMonth}) - กรุณาลดลง ${diff} เวร`
                    : `Error: Quotas sum to ${totalRequiredShifts} but there are only ${totalSlotsInMonth} slots — remove ${diff} shifts.`
            );
        }
    }

    const configObj = {
        year,
        month,
        numDays,
        isCustomDateRange,
        holidaySet,
        noDutySet,
        offMap,
        roleBased,
        doctorRoles,
        quota,
        hasQuotas,
        useSpecialRule,
        specialDocs,
        specialRuleDays,
        offDutyPeriod,
        preventLongGaps,
        balanceShifts,
        allowBlankDays,
        getRoleSlotsForDay,
        areConflicting,
        specialHols,
        chkSoftAlternate,
        selectAlternateStrength,
        windowPenalty,
        pairPenalty,
        isShiftBased,
        morningSlots,
        afternoonSlots,
        nightSlots,
        minNightShifts,
        allowExtraNightDoctor,
    };

    // Warning: With 2 slots but only 2 doctors, the same pair is forced to repeat
    if (chkSoftAlternate && typeof showToast === 'function') {
        if (roleBased) {
            const roles = Object.keys(defaultRoleSlots);
            roles.forEach((role) => {
                const count = defaultRoleSlots[role];
                const docsInRole = doctors.filter(
                    (doc) => (doctorRoles[doc] || 'Default') === role
                );
                if (count === 2 && docsInRole.length === 2) {
                    const msgTH = `คำเตือน: มีแพทย์เพียง 2 คนสำหรับบทบาท "${role}" ซึ่งต้องจัด 2 เวรต่อวัน ทำให้ต้องจัดคู่เดิมซ้ำเสมอ`;
                    const msgEN = `Warning: Only 2 doctors available for role "${role}" requiring 2 slots per day. The same pair will always repeat.`;
                    showToast(currentLang === 'th' ? msgTH : msgEN, true);
                }
            });
        } else {
            if (doctors.length === 2 && defaultSlots === 2) {
                const msgTH =
                    'คำเตือน: มีแพทย์เพียง 2 คนสำหรับ 2 เวรต่อวัน ทำให้ต้องจัดคู่เดิมซ้ำเสมอ';
                const msgEN =
                    'Warning: Only 2 doctors available for 2 slots per day. The same pair will always repeat.';
                showToast(currentLang === 'th' ? msgTH : msgEN, true);
            }
        }
    }

    if (hasQuotas) {
        const violations = checkQuotaFeasibility(configObj);
        if (violations.length > 0) {
            const errorMessagesTH = [];
            const errorMessagesEN = [];

            violations.forEach((v) => {
                const gapTH = v.restGap > 1 ? ` (เว้นช่วง ${v.restGap - 1} วัน)` : '';
                const gapEN = v.restGap > 1 ? ` (with ${v.restGap - 1}-day gap)` : '';

                if (v.isRoleShare) {
                    errorMessagesTH.push(
                        `นพ./พญ. ${v.name} (กลุ่ม ${v.role}): โควต้าเฉลี่ย ${v.required} เกินกว่าที่เป็นไปได้ — มีวันว่าง ${v.availableDays} วัน สามารถทำเวรได้สูงสุด ${v.maxShifts} เวร${gapTH}`
                    );
                    errorMessagesEN.push(
                        `Dr. ${v.name} (Role ${v.role}): Quota share ${v.required} is impossible — ${v.availableDays} available days, max achievable ${v.maxShifts} shifts${gapEN}`
                    );
                } else {
                    errorMessagesTH.push(
                        `นพ./พญ. ${v.name}: โควต้า ${v.required} เกินกว่าที่เป็นไปได้ — มีวันว่าง ${v.availableDays} วัน สามารถทำเวรได้สูงสุด ${v.maxShifts} เวร${gapTH}`
                    );
                    errorMessagesEN.push(
                        `Dr. ${v.name}: Quota ${v.required} is impossible — ${v.availableDays} available days, max achievable ${v.maxShifts} shifts${gapEN}`
                    );
                }
            });

            const msgTH = errorMessagesTH.join('\n');
            const msgEN = errorMessagesEN.join('\n');
            const finalMsg =
                typeof currentLang !== 'undefined' && currentLang === 'th' ? msgTH : msgEN;

            if (!allowBlankDays) {
                throw new Error(finalMsg);
            } else {
                if (typeof showToast === 'function') {
                    showToast(finalMsg, 'warning');
                }
            }
        }
    }

    configObj.solverSeed = hashString(
        JSON.stringify({
            doctors,
            offData,
            extraSlotsData,
            month,
            year,
            numDays,
            isCustomDateRange,
            roleBased,
            isShiftBased,
            defaultSlots,
            defaultRoleSlots,
            quota,
            offDutyPeriod,
            minNightShifts,
            allowExtraNightDoctor,
            holidays: Array.from(holidaySet),
            noDuty: Array.from(noDutySet),
        })
    );
    configObj.rng = mulberry32(configObj.solverSeed);

    // Night floor + extra-doctor plan. Applies to standard and role-based rosters;
    // shift-based and quota-driven rosters stay on the legacy solver for now.
    const floorApplies = minNightShifts > 0 && !hasQuotas && !(roleBased && isShiftBased);
    configObj.minNightShifts = floorApplies ? minNightShifts : 0;
    if (
        minNightShifts > 0 &&
        !floorApplies &&
        typeof showToast === 'function' &&
        !window.floorModeWarningShown
    ) {
        window.floorModeWarningShown = true;
        showToast(
            currentLang === 'th'
                ? 'ขั้นต่ำเวรใช้กับโหมดปกติ แยกบทบาท และกะกลางคืนเท่านั้น — โหมดกะ+บทบาทและโควตายังใช้ระบบเดิม'
                : 'The shift minimum applies to standard, role-based and shift-night rosters; role+shift and quota modes use the legacy solver.',
            true
        );
    }
    let floorPlanError = null;
    try {
        if (floorApplies) {
            const nightDays = [];
            for (let d = 1; d <= numDays; d++) if (!noDutySet.has(d)) nightDays.push(d);
            const keyForDay = (d) => {
                if (!isCustomDateRange) return d;
                const dt = scheduleDates[d - 1];
                return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
            };
            let baseSlots = 0;
            nightDays.forEach((d) => {
                if (isShiftBased) {
                    baseSlots += nightSlots;
                    return;
                }
                const daySlots = getRoleSlotsForDay(d);
                Object.values(daySlots).forEach((count) => {
                    baseSlots += count || 0;
                });
            });
            const required = doctors.length * minNightShifts;
            const maxSlots = baseSlots + nightDays.length;

            // Per-doctor capacity with rest gaps and off requests (earliest-first is optimal).
            const shortCapacity = [];
            doctors.forEach((doc) => {
                let count = 0;
                let last = -99;
                nightDays.forEach((d) => {
                    const offSet = offMap[keyForDay(d)] || new Set();
                    if (offSet.has(doc)) return;
                    if (d - last >= offDutyPeriod) {
                        count++;
                        last = d;
                    }
                });
                if (count < minNightShifts) shortCapacity.push({ doc, max: count });
            });
            if (shortCapacity.length > 0) {
                throw new Error(
                    currentLang === 'th'
                        ? shortCapacity
                              .map(
                                  (c) =>
                                      `นพ./พญ. ${c.doc}: ขั้นต่ำ ${minNightShifts} เวร แต่ทำได้สูงสุด ${c.max} เวร`
                              )
                              .join('\n')
                        : shortCapacity
                              .map(
                                  (c) =>
                                      `Dr. ${c.doc}: minimum ${minNightShifts} shifts, but at most ${c.max} are possible`
                              )
                              .join('\n')
                );
            }
            if (required > maxSlots) {
                throw new Error(
                    currentLang === 'th'
                        ? `ต้องมี ${required} เวร (${doctors.length} คน × ${minNightShifts}) แต่มี ${baseSlots} ช่อง + แพทย์เสริมได้อีก ${nightDays.length} = ${maxSlots} — ไม่พอ`
                        : `Need ${required} shifts (${doctors.length} doctors × ${minNightShifts}) but only ${baseSlots} slots + ${nightDays.length} possible extras = ${maxSlots} — not enough`
                );
            }
            if (required > baseSlots && !allowExtraNightDoctor) {
                throw new Error(
                    currentLang === 'th'
                        ? `ต้องมี ${required} เวร แต่มี ${baseSlots} ช่อง และปิดแพทย์เสริม — เปิดแพทย์เสริมหรือลดขั้นต่ำ`
                        : `Need ${required} shifts but there are ${baseSlots} slots and extra doctors are off — enable extras or lower the minimum`
                );
            }
            const extrasNeeded = Math.max(0, required - baseSlots);
            const extraDays = chooseExtraNightDays(nightDays, holidaySet, extrasNeeded);

            // In role mode, extras must go to the role that is short of its own floor.
            const baseByRole = {};
            const doctorsByRole = {};
            if (roleBased && !isShiftBased) {
                nightDays.forEach((d) => {
                    const daySlots = getRoleSlotsForDay(d);
                    Object.entries(daySlots).forEach(([role, count]) => {
                        baseByRole[role] = (baseByRole[role] || 0) + (count || 0);
                    });
                });
                doctors.forEach((doc) => {
                    const role = doctorRoles[doc] || 'Default';
                    doctorsByRole[role] = (doctorsByRole[role] || 0) + 1;
                });
                const roleNeed = {};
                Object.keys(doctorsByRole).forEach((role) => {
                    roleNeed[role] = Math.max(
                        0,
                        doctorsByRole[role] * minNightShifts - (baseByRole[role] || 0)
                    );
                });
                const totalRoleNeed = Object.values(roleNeed).reduce((a, n) => a + n, 0);
                if (totalRoleNeed > extrasNeeded) {
                    throw new Error(
                        currentLang === 'th'
                            ? `ขั้นต่ำ ${minNightShifts} เวรต่อคนเป็นไปไม่ได้ตามบทบาท — ต้องเพิ่ม ${totalRoleNeed} ช่อง แต่เพิ่มแพทย์เสริมได้ ${extrasNeeded}`
                            : `The ${minNightShifts}-shift minimum is impossible per role — ${totalRoleNeed} extra slots needed, only ${extrasNeeded} possible`
                    );
                }
                if (extraDays.length > 0) {
                    // Fix the role of each extra night once, at plan time.
                    const extraRoleByDay = {};
                    const fallbackRole = Object.keys(doctorsByRole)[0] || 'Default';
                    extraDays.forEach((day) => {
                        const rolesWithNeed = Object.keys(roleNeed)
                            .filter((role) => roleNeed[role] > 0)
                            .sort((a, b) => roleNeed[b] - roleNeed[a]);
                        const role = rolesWithNeed[0] || fallbackRole;
                        extraRoleByDay[day] = role;
                        if (roleNeed[role] > 0) roleNeed[role]--;
                    });
                    const baseGetSlots = configObj.getRoleSlotsForDay;
                    configObj.getRoleSlotsForDay = (day) => {
                        const slots = baseGetSlots(day);
                        const role = extraRoleByDay[day];
                        if (role) slots[role] = (slots[role] || 0) + 1;
                        return slots;
                    };
                }
            } else if (extraDays.length > 0) {
                const extraSet = new Set(extraDays);
                const baseGetSlots = configObj.getRoleSlotsForDay;
                configObj.getRoleSlotsForDay = (day) => {
                    const slots = baseGetSlots(day);
                    if (extraSet.has(day)) slots.Default = (slots.Default || 0) + 1;
                    return slots;
                };
            }
            configObj.extraNightDays = extraDays;
            configObj.floorPlan = {
                baseSlots,
                required,
                maxSlots,
                extrasNeeded,
                nights: nightDays.length,
            };
        }
    } catch (error) {
        floorPlanError = error.message;
    }
    configObj.floorPlan = { ...(configObj.floorPlan || {}), error: floorPlanError };

    return configObj;
}

function getRestDaysForDoctor(doctorName, config) {
    return config.offDutyPeriod !== undefined ? config.offDutyPeriod : 2;
}

function checkQuotaFeasibility(config) {
    const violations = [];
    const {
        offMap,
        roleBased,
        doctorRoles,
        quota,
        numDays,
        isShiftBased,
        morningSlots,
        afternoonSlots,
        nightSlots,
    } = config;
    Object.keys(quota).forEach((key) => {
        const required = quota[key];
        if (required <= 0) return;

        if (roleBased) {
            const role = key;
            const doctorsInRole =
                typeof doctors !== 'undefined'
                    ? doctors.filter((doc) => (doctorRoles[doc] || 'Default') === role)
                    : [];
            if (doctorsInRole.length === 0) return;

            doctorsInRole.forEach((docName) => {
                let docOffCount = 0;
                for (let d = 1; d <= numDays; d++) {
                    let dayKey = d;
                    if (
                        typeof isCustomDateRange !== 'undefined' &&
                        isCustomDateRange &&
                        typeof scheduleDates !== 'undefined' &&
                        scheduleDates.length > 0
                    ) {
                        const dateObj = scheduleDates[d - 1];
                        const dd = String(dateObj.getDate()).padStart(2, '0');
                        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const yyyy = dateObj.getFullYear();
                        dayKey = `${dd}/${mm}/${yyyy}`;
                    }
                    const offSet = offMap[dayKey] || new Set();
                    if (offSet.has(docName)) {
                        docOffCount++;
                    }
                }

                const activeDays = numDays - (config.noDutySet ? config.noDutySet.size : 0);
                const docAvailDays = Math.max(0, activeDays - docOffCount);
                const restGap = getRestDaysForDoctor(docName, config);
                const maxShifts = docAvailDays > 0 ? Math.ceil(docAvailDays / restGap) : 0;

                if (required > maxShifts) {
                    violations.push({
                        name: docName,
                        required,
                        maxShifts: maxShifts,
                        availableDays: docAvailDays,
                        offCount: docOffCount,
                        restGap: restGap,
                        isRoleShare: true,
                        role: role,
                    });
                }
            });
        } else {
            const doctorName = key;
            let offCount = 0;
            for (let d = 1; d <= numDays; d++) {
                let dayKey = d;
                if (
                    typeof isCustomDateRange !== 'undefined' &&
                    isCustomDateRange &&
                    typeof scheduleDates !== 'undefined' &&
                    scheduleDates.length > 0
                ) {
                    const dateObj = scheduleDates[d - 1];
                    const dd = String(dateObj.getDate()).padStart(2, '0');
                    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const yyyy = dateObj.getFullYear();
                    dayKey = `${dd}/${mm}/${yyyy}`;
                }
                const offSet = offMap[dayKey] || new Set();
                if (offSet.has(doctorName)) {
                    offCount++;
                }
            }

            const activeDays = numDays - (config.noDutySet ? config.noDutySet.size : 0);
            const availableDays = Math.max(0, activeDays - offCount);
            const restGap = getRestDaysForDoctor(doctorName, config);
            const maxShifts = availableDays > 0 ? Math.ceil(availableDays / restGap) : 0;

            if (required > maxShifts) {
                violations.push({
                    name: doctorName,
                    required,
                    maxShifts,
                    availableDays,
                    offCount,
                    restGap,
                });
            }
        }
    });

    return violations;
}

// Single trial of greedy scheduling with added randomness
function generateSingleScheduleCandidate(randomness = 0, config) {
    const {
        numDays,
        holidaySet,
        noDutySet,
        offMap,
        roleBased,
        doctorRoles,
        quota,
        hasQuotas,
        useSpecialRule,
        specialDocs,
        specialRuleDays,
        offDutyPeriod,
        preventLongGaps,
        balanceShifts,
        allowBlankDays,
        getRoleSlotsForDay,
        areConflicting,
        month,
        year,
        specialHols,
        isShiftBased,
        morningSlots,
        afternoonSlots,
        nightSlots,
    } = config;

    const rng = config && typeof config.rng === 'function' ? config.rng : Math.random;

    const wCounts = {};
    const hCounts = {};
    const tCounts = {};
    const lastShift = {};
    const mCounts = {};
    const aCounts = {};
    const nCounts = {};
    doctors.forEach((doc) => {
        wCounts[doc] = 0;
        hCounts[doc] = 0;
        tCounts[doc] = 0;
        lastShift[doc] = -99;
        mCounts[doc] = 0;
        aCounts[doc] = 0;
        nCounts[doc] = 0;
    });

    const scheduleData = [];
    const scheduleMap = {};
    let maxSlotsFound = 0;

    // Pre-calculate remaining quotas vs remaining slots for probabilistic blank spacing
    let remainingRoleSlots = {};
    let remainingRoleQuotas = {};
    if (allowBlankDays && hasQuotas) {
        for (let d = 1; d <= numDays; d++) {
            if (!noDutySet.has(d)) {
                let dRoleSlots = getRoleSlotsForDay(d);
                Object.keys(dRoleSlots).forEach((role) => {
                    const key = roleBased ? role : 'Default';
                    remainingRoleSlots[key] = (remainingRoleSlots[key] || 0) + dRoleSlots[role];
                });
            }
        }
        doctors.forEach((doc) => {
            const key = getQuotaKey(doc, config);
            if (quota[key] !== undefined) {
                remainingRoleQuotas[key] = (remainingRoleQuotas[key] || 0) + quota[key];
            }
        });
    }

    // Sort doctors by workload counters, with random perturbation for exploring alternatives
    const sortDoctors = (docsList, isHol, currentDay) => {
        const noise = {};
        docsList.forEach((doc) => {
            noise[doc] = (rng() - 0.5) * randomness;
        });

        docsList.sort((a, b) => {
            // Priority 0: Night floor (shift mode counts nights; standard counts all duties)
            const floor = config.minNightShifts || 0;
            if (floor > 0) {
                const countFor = (doc) => (isShiftBased ? nCounts[doc] : tCounts[doc]);
                const aCount = countFor(a);
                const bCount = countFor(b);
                const aBelow = aCount < floor;
                const bBelow = bCount < floor;
                if (aBelow !== bBelow) return aBelow ? -1 : 1;
                if (aCount !== bCount) return aCount - bCount;
            }

            // Priority 1: Minimum Shift Quota Fulfillment
            if (hasQuotas) {
                const keyA = getQuotaKey(a, config);
                const keyB = getQuotaKey(b, config);
                const quotaA = quota[keyA] || 0;
                const quotaB = quota[keyB] || 0;

                const aNeedsQuota = quotaA > 0 && tCounts[a] < quotaA;
                const bNeedsQuota = quotaB > 0 && tCounts[b] < quotaB;

                if (aNeedsQuota && !bNeedsQuota) return -1;
                if (!aNeedsQuota && bNeedsQuota) return 1;

                if (aNeedsQuota && bNeedsQuota) {
                    const diffQuotaA = quotaA - tCounts[a];
                    const diffQuotaB = quotaB - tCounts[b];

                    const getRemainingAvailableDays = (doc) => {
                        let count = 0;
                        for (let d = currentDay; d <= numDays; d++) {
                            let dayKey = d;
                            if (isCustomDateRange) {
                                const dateObj = scheduleDates[d - 1];
                                const dd = String(dateObj.getDate()).padStart(2, '0');
                                const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                                const yyyy = dateObj.getFullYear();
                                dayKey = `${dd}/${mm}/${yyyy}`;
                            }
                            const offSet = offMap[dayKey] || new Set();
                            if (!offSet.has(doc)) {
                                count++;
                            }
                        }
                        return count;
                    };
                    const availA = getRemainingAvailableDays(a);
                    const availB = getRemainingAvailableDays(b);
                    const densityA = availA > 0 ? diffQuotaA / availA : 0;
                    const densityB = availB > 0 ? diffQuotaB / availB : 0;

                    if (densityA !== densityB) return densityB - densityA;
                }
            }

            if (balanceShifts) {
                if (isHol) {
                    const diff = hCounts[a] + noise[a] - (hCounts[b] + noise[b]);
                    if (diff !== 0) return diff;
                } else {
                    const diff = wCounts[a] + noise[a] - (wCounts[b] + noise[b]);
                    if (diff !== 0) return diff;
                }

                const diffT = tCounts[a] + noise[a] - (tCounts[b] + noise[b]);
                if (diffT !== 0) return diffT;
            }

            if (preventLongGaps) {
                const diffL = lastShift[a] + noise[a] * 2 - (lastShift[b] + noise[b] * 2);
                if (Math.abs(diffL) > 0.4) return diffL;
            }
            return noise[a] - noise[b];
        });
    };

    for (let day = 1; day <= numDays; day++) {
        const isHoliday = holidaySet.has(day);
        const isNoDuty = noDutySet.has(day);

        let offKeyToday = day;
        let offKeyTomorrow = day + 1;
        if (isCustomDateRange) {
            const dateObj = scheduleDates[day - 1];
            const dd = String(dateObj.getDate()).padStart(2, '0');
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const yyyy = dateObj.getFullYear();
            offKeyToday = `${dd}/${mm}/${yyyy}`;
            if (day < numDays) {
                const tomorrowObj = scheduleDates[day];
                const tm_dd = String(tomorrowObj.getDate()).padStart(2, '0');
                const tm_mm = String(tomorrowObj.getMonth() + 1).padStart(2, '0');
                const tm_yyyy = tomorrowObj.getFullYear();
                offKeyTomorrow = `${tm_dd}/${tm_mm}/${tm_yyyy}`;
            } else {
                offKeyTomorrow = null;
            }
        }

        const offToday = offMap[offKeyToday] || new Set();
        const offTomorrow =
            offKeyTomorrow !== null && offMap[offKeyTomorrow] ? offMap[offKeyTomorrow] : new Set();

        const isBlockedByOffRequest = (doc, slotIdx) => {
            if (offToday.has(doc)) return true;
            if (offTomorrow.has(doc)) {
                if (isShiftBased) {
                    return slotIdx >= morningSlots + afternoonSlots;
                } else {
                    return true;
                }
            }
            return false;
        };

        const isBlockedByNightToMorning = (doc, slotIdx) => {
            if (isShiftBased && slotIdx < morningSlots && day > 1) {
                const prevDayDocs = scheduleMap[day - 1] || [];
                for (
                    let s = morningSlots + afternoonSlots;
                    s < morningSlots + afternoonSlots + nightSlots;
                    s++
                ) {
                    if (prevDayDocs[s] === doc) return true;
                }
            }
            return false;
        };

        let slotsPerDay = 0;
        let dayRoleSlots = getRoleSlotsForDay(day);
        const daySlotsList = expandSlots(dayRoleSlots);
        Object.values(dayRoleSlots).forEach((count) => {
            slotsPerDay += count;
        });

        if (slotsPerDay > maxSlotsFound) maxSlotsFound = slotsPerDay;

        let selected = [];

        if (isNoDuty) {
            scheduleMap[day] = [];
            for (let i = 0; i < slotsPerDay; i++) selected.push('-');
        } else {
            let chosenToday = [];
            let specialDoctorAssigned = false;
            let chosenSpecial = null;
            let specialRole = null;

            // Hard rules shared by the normal pick (cascade level 1) and the special-doctor pick
            const strictOk = (doc, slotIdx) => {
                if (chosenToday.includes(doc)) return false;
                if (isBlockedByOffRequest(doc, slotIdx) || isBlockedByNightToMorning(doc, slotIdx))
                    return false;
                for (let lookBack = 1; lookBack < offDutyPeriod; lookBack++) {
                    if ((scheduleMap[day - lookBack] || []).includes(doc)) return false;
                }
                if (
                    isHoliday &&
                    holidaySet.has(day - 1) &&
                    (scheduleMap[day - 1] || []).includes(doc)
                )
                    return false;
                return !chosenToday.some((otherDoc) => areConflicting(doc, otherDoc));
            };

            if (useSpecialRule && specialRuleDays.has(day) && specialDocs.length > 0) {
                let availableSpecial = specialDocs.filter((doc) => {
                    // 1. Hard Quota Ceiling
                    const key = getQuotaKey(doc, config);
                    if (quota[key] !== undefined && tCounts[doc] >= quota[key]) return false;
                    // Same hard rules as a normal pick
                    return strictOk(doc, 0);
                });

                if (availableSpecial.length > 0) {
                    sortDoctors(availableSpecial, isHoliday, day);
                    chosenSpecial = availableSpecial[0];
                    specialRole = doctorRoles[chosenSpecial] || 'Default';
                }
            }

            for (let i = 0; i < slotsPerDay; i++) {
                const reqRole = daySlotsList[i];
                if (
                    chosenSpecial &&
                    specialRole === reqRole &&
                    !specialDoctorAssigned &&
                    strictOk(chosenSpecial, i)
                ) {
                    selected.push(chosenSpecial);
                    chosenToday.push(chosenSpecial);
                    specialDoctorAssigned = true;
                    if (allowBlankDays && hasQuotas) {
                        const targetKey = roleBased ? reqRole : 'Default';
                        if (remainingRoleSlots[targetKey] !== undefined) {
                            remainingRoleSlots[targetKey]--;
                            const quotaKey = getQuotaKey(chosenSpecial, config);
                            if (remainingRoleQuotas[quotaKey] !== undefined) {
                                remainingRoleQuotas[quotaKey]--;
                            }
                        }
                    }
                } else {
                    // 2. Strict Role Isolation
                    const baseRoleDocs = roleBased
                        ? doctors.filter((doc) => (doctorRoles[doc] || 'Default') === reqRole)
                        : doctors;
                    const roleDocs = baseRoleDocs.filter((doc) => {
                        // 1. Hard Quota Ceiling
                        const key = getQuotaKey(doc, config);
                        if (quota[key] !== undefined) {
                            const qVal = quota[key];
                            if (tCounts[doc] >= qVal) return false;
                        }
                        return true;
                    });
                    let availableDocs = [];

                    // Cascade Level 1: Strict Constraints (Ideal Case)
                    availableDocs = roleDocs.filter(
                        (doc) =>
                            strictOk(doc, i) &&
                            !(chosenSpecial && specialDocs.includes(doc) && doc !== chosenSpecial)
                    );

                    // Must-Fill cascade: only runs when Allow Blank Days is OFF
                    if (availableDocs.length === 0 && !allowBlankDays) {
                        // Cascade Level 2: Relax spacing / consecutive rules
                        availableDocs = roleDocs.filter((doc) => {
                            if (chosenToday.includes(doc)) return false;
                            if (isBlockedByOffRequest(doc, i) || isBlockedByNightToMorning(doc, i))
                                return false;
                            if (chosenToday.some((otherDoc) => areConflicting(doc, otherDoc)))
                                return false;
                            if (chosenSpecial && specialDocs.includes(doc) && doc !== chosenSpecial)
                                return false;
                            return true;
                        });
                    }

                    if (availableDocs.length === 0 && !allowBlankDays) {
                        // Cascade Level 3: Relax conflict rules
                        availableDocs = roleDocs.filter((doc) => {
                            if (chosenToday.includes(doc)) return false;
                            if (isBlockedByOffRequest(doc, i) || isBlockedByNightToMorning(doc, i))
                                return false;
                            if (chosenSpecial && specialDocs.includes(doc) && doc !== chosenSpecial)
                                return false;
                            return true;
                        });
                    }

                    if (availableDocs.length === 0 && !allowBlankDays) {
                        // Cascade Level 4: Relax Off Requests
                        availableDocs = roleDocs.filter((doc) => {
                            if (chosenToday.includes(doc)) return false;
                            if (offToday.has(doc) || isBlockedByNightToMorning(doc, i))
                                return false;
                            if (chosenSpecial && specialDocs.includes(doc) && doc !== chosenSpecial)
                                return false;
                            return true;
                        });
                    }

                    if (availableDocs.length === 0 && !allowBlankDays) {
                        // Cascade Level 5: Absolute fallback (Any doctor with matching role, but not already working today)
                        availableDocs = roleDocs.filter(
                            (doc) =>
                                !chosenToday.includes(doc) &&
                                !offToday.has(doc) &&
                                !isBlockedByNightToMorning(doc, i)
                        );
                    }

                    // Final assignment
                    if (availableDocs.length > 0) {
                        // Probabilistically leave it blank to balance shortages across the month
                        if (allowBlankDays && hasQuotas) {
                            const targetKey = roleBased ? reqRole : 'Default';
                            const slotsLeft = remainingRoleSlots[targetKey];
                            let quotaLeft = 0;
                            if (roleBased) {
                                quotaLeft = remainingRoleQuotas[reqRole] || 0;
                            } else {
                                doctors.forEach((doc) => {
                                    quotaLeft += remainingRoleQuotas[doc] || 0;
                                });
                            }
                            if (slotsLeft > quotaLeft && quotaLeft > 0 && randomness > 0) {
                                const blankProb = (slotsLeft - quotaLeft) / slotsLeft;
                                if (rng() < blankProb * (0.8 + rng() * 0.4)) {
                                    availableDocs = []; // Force blank
                                }
                            }
                        }
                    }

                    if (availableDocs.length > 0) {
                        sortDoctors(availableDocs, isHoliday, day);
                        const chosenDoc = availableDocs[0];
                        selected.push(chosenDoc);
                        chosenToday.push(chosenDoc);
                        if (allowBlankDays && hasQuotas) {
                            const targetKey = roleBased ? reqRole : 'Default';
                            if (remainingRoleSlots[targetKey] !== undefined) {
                                remainingRoleSlots[targetKey]--;
                                const quotaKey = getQuotaKey(chosenDoc, config);
                                if (remainingRoleQuotas[quotaKey] !== undefined) {
                                    remainingRoleQuotas[quotaKey]--;
                                }
                            }
                        }
                    } else if (baseRoleDocs.length === 0 && !allowBlankDays) {
                        // Critical Coverage Error: no doctors mapped to this role at all
                        throw new Error(
                            `Critical Coverage Error: Day ${day} cannot be covered for role "${reqRole}". There are no doctors mapped to this role.`
                        );
                    } else {
                        // Blank day / shortage marker
                        selected.push(SHORTAGE_MARKER);
                        if (allowBlankDays && hasQuotas) {
                            const targetKey = roleBased ? reqRole : 'Default';
                            if (remainingRoleSlots[targetKey] !== undefined) {
                                remainingRoleSlots[targetKey]--;
                            }
                        }
                    }
                }
            }

            selected.forEach((doc, slotIdx) => {
                if (doctors.includes(doc)) {
                    if (isHoliday) hCounts[doc]++;
                    else wCounts[doc]++;
                    tCounts[doc]++;
                    lastShift[doc] = day;
                    if (isShiftBased) {
                        if (slotIdx < morningSlots) {
                            mCounts[doc]++;
                        } else if (slotIdx < morningSlots + afternoonSlots) {
                            aCounts[doc]++;
                        } else {
                            nCounts[doc]++;
                        }
                    }
                }
            });

            scheduleMap[day] = selected;
        }

        // Temporary note object that will be fully translated later
        let tempDayRow = {
            day,
            dayName: '',
            isHoliday,
            isSpecial: specialHols.includes(day),
            isNoDuty,
            slots: slotsPerDay,
            selectedDocs: selected.map((doc, idx) => ({
                name: doc,
                role:
                    doc === SHORTAGE_MARKER || doc === '-'
                        ? 'Default'
                        : daySlotsList[idx] || 'Default',
            })),
            note: '',
        };

        scheduleData.push(tempDayRow);
    }

    const summaryData = doctors.map((doc) => ({
        name: doc,
        workdays: wCounts[doc] || 0,
        holidays: hCounts[doc] || 0,
        total: tCounts[doc] || 0,
        morning: mCounts[doc] || 0,
        afternoon: aCounts[doc] || 0,
        night: nCounts[doc] || 0,
    }));

    return {
        schedule: scheduleData,
        summary: summaryData,
        wCounts,
        hCounts,
        tCounts,
        nCounts,
        maxSlots: maxSlotsFound,
        config: config,
    };
}

// Scoring algorithm evaluating candidate quality
// Higher scores represent better fairness, spacing, and fewer shortages
function scoreSchedule(candidate) {
    let score = 0;
    const activeDocsCount = doctors.length;
    if (activeDocsCount === 0) return 0;

    // 1. Heavy penalty for shortages (SHORTAGE_MARKER)
    let shortages = 0;
    candidate.schedule.forEach((day) => {
        day.selectedDocs.forEach((docObj) => {
            if (docObj.name === SHORTAGE_MARKER) shortages++;
        });
    });
    score -= shortages * 15000;

    // 1b. The night floor is effectively lexicographic: any shortfall loses to any schedule without one.
    const floor = candidate.config?.minNightShifts || 0;
    if (floor > 0) {
        let shortfall = 0;
        doctors.forEach((doc) => {
            const count = candidate.config?.isShiftBased
                ? (candidate.nCounts?.[doc] ?? 0)
                : (candidate.tCounts?.[doc] ?? 0);
            if (count < floor) shortfall += floor - count;
        });
        score -= shortfall * 100000;
    }

    // 2. Workload balance (Standard Deviation)
    const totals = Object.values(candidate.tCounts);
    const holidays = Object.values(candidate.hCounts);
    const workdays = Object.values(candidate.wCounts);

    const avgTotal = totals.reduce((a, b) => a + b, 0) / activeDocsCount;
    const avgHol = holidays.reduce((a, b) => a + b, 0) / activeDocsCount;
    const avgWork = workdays.reduce((a, b) => a + b, 0) / activeDocsCount;

    const stdDevTotal = Math.sqrt(
        totals.reduce((sum, val) => sum + Math.pow(val - avgTotal, 2), 0) / activeDocsCount
    );
    const stdDevHol = Math.sqrt(
        holidays.reduce((sum, val) => sum + Math.pow(val - avgHol, 2), 0) / activeDocsCount
    );
    const stdDevWork = Math.sqrt(
        workdays.reduce((sum, val) => sum + Math.pow(val - avgWork, 2), 0) / activeDocsCount
    );

    // Penalize high standard deviations
    score -= stdDevTotal * 600;
    score -= stdDevHol * 1200; // Holiday duties are precious, prioritize strict balance
    score -= stdDevWork * 300;

    // 3. Gap distribution: penalize gaps shorter than offDutyPeriod
    const configOffDutyPeriod = candidate.config?.offDutyPeriod ?? 2;
    doctors.forEach((doc) => {
        let dutyDays = [];
        candidate.schedule.forEach((day) => {
            if (day.selectedDocs.some((d) => d.name === doc)) {
                dutyDays.push(day.day);
            }
        });

        for (let i = 1; i < dutyDays.length; i++) {
            let gap = dutyDays[i] - dutyDays[i - 1];
            if (gap < configOffDutyPeriod) {
                // Proportional penalty: closer gaps get heavier penalty
                const severity = configOffDutyPeriod - gap;
                score -= severity * 80;
            }
        }
    });

    // 3.5. Shift alternation/rotation variance penalty (under Shift-Based Mode)
    if (candidate.config?.isShiftBased) {
        const cfg = candidate.config;
        const M = cfg.morningSlots || 0;
        const A = cfg.afternoonSlots || 0;
        const N = cfg.nightSlots || 0;

        const activeShiftsCount = (M > 0 ? 1 : 0) + (A > 0 ? 1 : 0) + (N > 0 ? 1 : 0);
        if (activeShiftsCount > 1) {
            doctors.forEach((doc) => {
                let mCount = 0;
                let aCount = 0;
                let nCount = 0;

                candidate.schedule.forEach((day) => {
                    day.selectedDocs.forEach((docObj, idx) => {
                        if (docObj.name === doc) {
                            if (idx < M) mCount++;
                            else if (idx < M + A) aCount++;
                            else nCount++;
                        }
                    });
                });

                const totalShifts = mCount + aCount + nCount;
                if (totalShifts > 1) {
                    const avg = totalShifts / activeShiftsCount;
                    let varianceSum = 0;
                    if (M > 0) varianceSum += Math.pow(mCount - avg, 2);
                    if (A > 0) varianceSum += Math.pow(aCount - avg, 2);
                    if (N > 0) varianceSum += Math.pow(nCount - avg, 2);

                    const variance = varianceSum / activeShiftsCount;
                    // Apply a penalty to encourage even distribution (alternating shifts)
                    score -= variance * 600;
                }
            });
        }
    }

    // 4. Soft alternate penalty
    let windowScore = 0;
    let pairScore = 0;

    const chkSoftAlternate =
        candidate.chkSoftAlternate ?? candidate.config?.chkSoftAlternate ?? true;
    const windowPenalty = candidate.windowPenalty ?? candidate.config?.windowPenalty ?? 150;
    const pairPenalty = candidate.pairPenalty ?? candidate.config?.pairPenalty ?? 300;

    if (chkSoftAlternate) {
        // PENALTY TERM A — Solo Repeat Window
        let windowExcess = 0;
        const numDays = candidate.schedule.length;
        doctors.forEach((doc) => {
            for (let d = 3; d <= numDays; d++) {
                let count = 0;
                for (let dayOffset = d - 2; dayOffset <= d; dayOffset++) {
                    const dayData = candidate.schedule[dayOffset - 1];
                    if (dayData && dayData.selectedDocs.some((o) => o.name === doc)) {
                        count++;
                    }
                }
                if (count > 1) {
                    windowExcess += count - 1;
                }
            }
        });
        windowScore = windowExcess * windowPenalty;

        // PENALTY TERM B — Pair/Group Repeat
        const roleBased = candidate.config?.roleBased ?? false;

        let pairCounts = {};
        candidate.schedule.forEach((day) => {
            if (day.isNoDuty) return;

            let assigned = [];
            day.selectedDocs.forEach((docObj, idx) => {
                const docName = docObj.name;
                if (doctors.includes(docName)) {
                    if (roleBased) {
                        assigned.push(`slot${idx}:${docName}`);
                    } else {
                        assigned.push(docName);
                    }
                }
            });
            if (assigned.length >= 2) {
                assigned.sort();
                const key = assigned.join('|');
                pairCounts[key] = (pairCounts[key] || 0) + 1;
            }
        });

        let pairExcess = 0;
        Object.keys(pairCounts).forEach((key) => {
            const count = pairCounts[key];
            if (count > 1) {
                pairExcess += count - 1;
            }
        });
        pairScore = pairExcess * pairPenalty;
    }

    candidate.windowScore = windowScore;
    candidate.pairScore = pairScore;

    return score - windowScore - pairScore;
}

// Overrides are keyed by day index only, so they are only meaningful inside one period
function periodKey() {
    if (isCustomDateRange) {
        return `${document.getElementById('inputStartDate')?.value}_${document.getElementById('inputEndDate')?.value}`;
    }
    const year = parseInt(document.getElementById('inputYear').value);
    return `${parseInt(document.getElementById('inputMonth').value)}-${year > 2500 ? year - 543 : year}`;
}

let isCalculating = false;
let regenPending = false;
let regenLoop = null;
// A change made mid-calculation is remembered and re-run with the latest inputs afterwards.
// The queued caller gets the running loop's promise, so awaiting it waits for the rerun too.
window.generateSchedule = function () {
    if (isCalculating) {
        regenPending = true;
        return regenLoop;
    }
    regenLoop = (async () => {
        do {
            regenPending = false;
            await runScheduleOnce();
        } while (regenPending);
    })();
    return regenLoop;
};

async function runScheduleOnce() {
    window.lockWarningShown = false;
    window.floorModeWarningShown = false;

    const btn = document.getElementById('btnCalculate');
    let originalHtml = '';
    if (btn) originalHtml = btn.innerHTML;
    let committed = false;

    try {
        // Read the period inputs once; the whole run, including its awaits, uses these locals
        const year = parseInt(document.getElementById('inputYear').value);
        const month = parseInt(document.getElementById('inputMonth').value);
        const calcYear = year > 2500 ? year - 543 : year;
        if (!isCustomDateRange && !(calcYear >= 1000)) {
            showToast(translations[currentLang].yearInvalid, true);
            return;
        }
        if (!isCustomDateRange && !(month >= 1 && month <= 12)) {
            showToast(translations[currentLang].monthInvalid, true);
            return;
        }
        if (doctors.length < 2) {
            document.getElementById('resultsContainer').classList.add('hidden');
            document.getElementById('emptyState').classList.remove('hidden');
            if (!isInitialLoad) showToast(translations[currentLang].emptyStateDesc, true);
            isInitialLoad = false;
            return;
        }

        // Custom Date Range Validation & Dates Population
        if (isCustomDateRange) {
            const startStr = document.getElementById('inputStartDate').value;
            const endStr = document.getElementById('inputEndDate').value;
            if (!startStr || !endStr) {
                if (btn) btn.innerHTML = originalHtml;
                showToast(
                    currentLang === 'th'
                        ? 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุด'
                        : 'Please select start and end dates',
                    true
                );
                return;
            }
            const sd = parseISODate(startStr);
            const ed = parseISODate(endStr);
            if (sd >= ed) {
                if (btn) btn.innerHTML = originalHtml;
                showToast(
                    currentLang === 'th'
                        ? 'วันที่เริ่มต้นต้องน้อยกว่าวันที่สิ้นสุด'
                        : 'Start date must be before end date',
                    true
                );
                return;
            }
            const diffDays = Math.round((ed - sd) / (1000 * 60 * 60 * 24)) + 1;
            if (diffDays > 90) {
                if (btn) btn.innerHTML = originalHtml;
                showToast(
                    currentLang === 'th'
                        ? 'ช่วงวันที่เกิน 90 วัน กรุณาตรวจสอบ'
                        : 'Range exceeds 90 days, please check',
                    true
                );
                return;
            }

            scheduleDates = [];
            let curr = new Date(sd);
            while (curr <= ed) {
                scheduleDates.push(new Date(curr));
                curr.setDate(curr.getDate() + 1);
            }
        } else {
            const daysInMonth = new Date(calcYear, month, 0).getDate();
            scheduleDates = [];
            for (let i = 1; i <= daysInMonth; i++) {
                scheduleDates.push(new Date(calcYear, month - 1, i));
            }
        }

        const key = periodKey();

        isInitialLoad = false;
        isCalculating = true;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i data-lucide="loader" class="w-5 h-5 animate-spin"></i> <span>${currentLang === 'th' ? 'กำลังจัดตาราง...' : 'Calculating...'}</span>`;
            lucide.createIcons();
        }

        // Show a loading toast before the loop starts
        showToast(currentLang === 'th' ? 'กำลังจัดตารางเวร...' : 'Calculating schedule...');

        // Yield to allow browser to render the disabled state, loader spinner, and toast
        // Parse config ONCE, before the first await, so later input changes cannot mix into this run
        const config = parseUIConfig();
        if (config.floorPlan && config.floorPlan.error) {
            throw new Error(config.floorPlan.error);
        }
        // Everything the finished result needs from live state, captured with the config
        const snapshot = {
            month,
            year,
            dates: scheduleDates.slice(),
            isCustomDateRange,
            doctors: doctors.slice(),
            periodKey: key,
            config,
        };
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Run smart solver search: generate multiple schedules and pick the highest scoring one
        let bestCandidate = null;
        let bestScore = -Infinity;

        // 1. Run baseline greedy (0 randomness)
        const baseline = generateSingleScheduleCandidate(0, config);
        bestCandidate = baseline;
        bestScore = scoreSchedule(baseline);

        // 2. Search alternative spaces via randomized greedy trials (300 iterations)
        const iterations = 300;
        const batchSize = 30; // Break the 300 iterations into 10 chunks of 30

        for (let i = 0; i < iterations; i += batchSize) {
            for (let j = 0; j < batchSize && i + j < iterations; j++) {
                const candidate = generateSingleScheduleCandidate(0.85, config);
                const score = scoreSchedule(candidate);
                if (score > bestScore) {
                    bestScore = score;
                    bestCandidate = candidate;
                }
            }
            // Yield control back to the main thread unconditionally after each chunk
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (regenPending) {
                // Inputs changed mid-solve: this run is stale, the rerun starts from scratch
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalHtml;
                    lucide.createIcons();
                }
                return;
            }
        }

        // 3. Fail-Safe Verification:
        // Check if the constraints are mathematically impossible (e.g. if the best schedule found consists entirely of shortages)
        let totalSlots = 0;
        let shortages = 0;
        bestCandidate.schedule.forEach((day) => {
            day.selectedDocs.forEach((docObj) => {
                totalSlots++;
                if (docObj.name === SHORTAGE_MARKER) shortages++;
            });
        });

        if (shortages === totalSlots && totalSlots > 0) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
                lucide.createIcons();
            }
            const errorMsg =
                currentLang === 'th'
                    ? 'ระบบจัดตารางล้มเหลว: เงื่อนไขการจัดเวรขัดแย้งกันเกินไปจนเป็นไปไม่ได้ กรุณาลดข้อจำกัดลง'
                    : 'Scheduling failed: Conflict constraints make the schedule impossible. Please reduce restrictions.';
            showToast(errorMsg, true);
            return;
        }

        // 4. Finalize the UI properties for the chosen best candidate (called only once!)
        bestCandidate.schedule.forEach((row) => {
            const dateObj = isCustomDateRange
                ? scheduleDates[row.day - 1]
                : new Date(calcYear, month - 1, row.day);
            row.dayName = dayName(dateObj);

            if (isCustomDateRange)
                row.dayDisplay = formatShortDate(row.day, month, year, currentLang);

            updateDayNote(row, null, config, snapshot);
        });

        // Final floor verification: never render a roster that missed the minimum.
        if (config.minNightShifts > 0) {
            const floorCounts = config.isShiftBased ? bestCandidate.nCounts : {};
            if (!config.isShiftBased) {
                bestCandidate.schedule.forEach((row) => {
                    row.selectedDocs.forEach((slot) => {
                        if (slot && slot.name && slot.name !== SHORTAGE_MARKER && slot.name !== '-')
                            floorCounts[slot.name] = (floorCounts[slot.name] || 0) + 1;
                    });
                });
            }
            const short = doctors.filter((doc) => (floorCounts[doc] || 0) < config.minNightShifts);
            if (short.length > 0) {
                throw new Error(
                    currentLang === 'th'
                        ? `จัดไม่ได้ตามขั้นต่ำ: ${short
                              .map(
                                  (doc) =>
                                      `${doc} ได้ ${floorCounts[doc] || 0}/${config.minNightShifts}`
                              )
                              .join(', ')}`
                        : `Could not reach the minimum: ${short
                              .map(
                                  (doc) =>
                                      `${doc} got ${floorCounts[doc] || 0}/${config.minNightShifts}`
                              )
                              .join(', ')}`
                );
            }
        }

        // Exports, edits and views of this result read this snapshot, never later input changes
        globalResult = {
            schedule: JSON.parse(JSON.stringify(bestCandidate.schedule)),
            originalSchedule: JSON.parse(JSON.stringify(bestCandidate.schedule)),
            summary: bestCandidate.summary,
            maxSlots: bestCandidate.maxSlots,
            ...snapshot,
        };
        committed = true;

        // Commit-only: a changed period discards the old period's manual edits
        if (pendingOverrides) {
            manualOverrides = pendingOverrides;
            undoStack.length = 0;
        } else if (overridesPeriod !== null && overridesPeriod !== key) {
            if (Object.keys(manualOverrides).length > 0) {
                showToast(translations[currentLang].overridesCleared);
            }
            manualOverrides = {};
            undoStack.length = 0;
        }
        pendingOverrides = null;
        overridesPeriod = key;
        pruneOverrides(globalResult.doctors);

        // Apply manual overrides saved previously
        applyManualOverrides(config);

        renderResults();
        updateStatsDashboard();

        document.getElementById('emptyState').classList.add('hidden');
        const resultsEl = document.getElementById('resultsContainer');
        resultsEl.classList.remove('hidden', 'reveal');
        void resultsEl.offsetWidth;
        resultsEl.classList.add('reveal');

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            lucide.createIcons();
        }

        if (shortages > 0) {
            showToast(
                currentLang === 'th'
                    ? 'จัดตารางเวรเสร็จสิ้น แต่บางเวรขาดคนเนื่องจากเงื่อนไขโควตาแบบเป๊ะขัดแย้งกัน'
                    : 'Schedule completed, but some slots could not be filled strictly due to constraint conflicts.',
                true
            );
        } else {
            showToast(
                currentLang === 'th'
                    ? 'จัดตารางเวรด้วย Smart Solver สำเร็จ!'
                    : 'Schedule calculated successfully with Smart Solver!'
            );
        }
    } catch (error) {
        console.error(error);
        const btn = document.getElementById('btnCalculate');
        if (btn && originalHtml) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            lucide.createIcons();
        }

        if (error.message && error.message.includes('Critical Coverage Error')) {
            showToast(error.message, true);
            const emptyState = document.getElementById('emptyState');
            if (emptyState) {
                emptyState.classList.remove('hidden');
                const titleEl =
                    emptyState.querySelector('[data-i18n="emptyStateTitle"]') ||
                    emptyState.querySelector('h3');
                const descEl =
                    emptyState.querySelector('[data-i18n="emptyStateDesc"]') ||
                    emptyState.querySelector('p');
                if (titleEl)
                    titleEl.innerText =
                        currentLang === 'th'
                            ? 'ข้อผิดพลาดร้ายแรงเกี่ยวกับการครอบคลุมเวร'
                            : 'Critical Coverage Error';
                if (descEl) descEl.innerText = error.message;
            }
            document.getElementById('resultsContainer')?.classList.add('hidden');
        } else {
            showToast(
                error.message ||
                    (currentLang === 'th'
                        ? 'เกิดข้อผิดพลาดในการคำนวณ'
                        : 'Error calculating schedule'),
                true
            );
        }
    } finally {
        // scheduleDates was reassigned for the new period; a run that never committed keeps the old result's dates
        if (!committed && globalResult && globalResult.dates)
            scheduleDates = globalResult.dates.slice();
        isCalculating = false;
    }
}

// The config the displayed schedule was built with (inputs may have changed or gone invalid since)
// Everything that describes the displayed result lives on globalResult itself. Consumers that
// render or act on the displayed schedule read this; live inputs are only for the next run.
// Before the first result it falls back to the live state.
const resultCtx = () =>
    globalResult || {
        get config() {
            return parseUIConfig();
        },
        dates: scheduleDates,
        isCustomDateRange,
        doctors,
        month: parseInt(document.getElementById('inputMonth').value),
        year: parseInt(document.getElementById('inputYear').value),
    };
const resultConfig = () => resultCtx().config;

// Drop overrides naming a doctor who is not in the given list
function pruneOverrides(docs) {
    Object.keys(manualOverrides).forEach((day) => {
        Object.keys(manualOverrides[day]).forEach((slot) => {
            const n = manualOverrides[day][slot];
            if (n !== SHORTAGE_MARKER && n !== '-' && !docs.includes(n))
                delete manualOverrides[day][slot];
        });
        if (Object.keys(manualOverrides[day]).length === 0) delete manualOverrides[day];
    });
}

// Apply manual edits to the current global result
function applyManualOverrides(config) {
    if (!globalResult) return;

    // Start from the solver's own picks so an override that was removed (undo, reset) reverts
    if (globalResult.originalSchedule) {
        globalResult.schedule.forEach((row, i) => {
            row.selectedDocs = globalResult.originalSchedule[i].selectedDocs.map((s) => ({ ...s }));
        });
    }

    Object.keys(manualOverrides).forEach((dayStr) => {
        const day = parseInt(dayStr);
        const dayRow = globalResult.schedule[day - 1];
        if (dayRow && !dayRow.isNoDuty) {
            Object.keys(manualOverrides[day]).forEach((slotStr) => {
                const slotIndex = parseInt(slotStr);
                if (slotIndex < dayRow.slots) {
                    dayRow.selectedDocs[slotIndex] = {
                        name: manualOverrides[day][slotIndex],
                        role: dayRow.selectedDocs[slotIndex]?.role || 'Default',
                    };
                }
            });
        }
    });

    // Notes depend on who is assigned, so refresh them all
    globalResult.schedule.forEach((row) => updateDayNote(row, null, config));

    // Recalculate summary totals based on overrides
    recalculateCounts(config);
}

// Toggle clear overrides
window.clearManualOverrides = function () {
    if (!Object.keys(manualOverrides).length) return;
    pushToUndoStack();
    manualOverrides = {};
    // "Auto" is the stored solver result, so re-apply locally like undo (no solver run)
    const config = resultConfig();
    applyManualOverrides(config);
    renderTableView(config);
    renderCalendarView(config);
    if (typeof renderPersonCentricView === 'function') renderPersonCentricView(config);
    recalculateCounts(config);
    renderSummaryTable(config);
    updateStatsDashboard();
    showToast(
        currentLang === 'th'
            ? 'คืนค่าเริ่มต้นจากระบบคำนวณทั้งหมดแล้ว'
            : 'All manual overrides reset to auto'
    );
};

// Recalculate summary metrics based on manual overrides
function recalculateCounts(config) {
    if (!globalResult) return;

    const wCounts = {};
    const hCounts = {};
    const tCounts = {};
    const mCounts = {};
    const aCounts = {};
    const nCounts = {};
    const { doctors } = resultCtx();
    doctors.forEach((doc) => {
        wCounts[doc] = 0;
        hCounts[doc] = 0;
        tCounts[doc] = 0;
        mCounts[doc] = 0;
        aCounts[doc] = 0;
        nCounts[doc] = 0;
    });

    const { holidaySet, isShiftBased, morningSlots, afternoonSlots } = config;

    globalResult.schedule.forEach((row) => {
        if (row.isNoDuty) return;
        const isHoliday = holidaySet.has(row.day);
        row.selectedDocs.forEach((docObj, slotIdx) => {
            const docName = docObj.name;
            if (doctors.includes(docName)) {
                if (isHoliday) {
                    hCounts[docName] = (hCounts[docName] || 0) + 1;
                } else {
                    wCounts[docName] = (wCounts[docName] || 0) + 1;
                }
                tCounts[docName] = (tCounts[docName] || 0) + 1;

                if (isShiftBased) {
                    if (slotIdx < morningSlots) {
                        mCounts[docName] = (mCounts[docName] || 0) + 1;
                    } else if (slotIdx < morningSlots + afternoonSlots) {
                        aCounts[docName] = (aCounts[docName] || 0) + 1;
                    } else {
                        nCounts[docName] = (nCounts[docName] || 0) + 1;
                    }
                }
            }
        });
    });

    globalResult.summary = doctors.map((doc) => ({
        name: doc,
        workdays: wCounts[doc] || 0,
        holidays: hCounts[doc] || 0,
        total: tCounts[doc] || 0,
        morning: mCounts[doc] || 0,
        afternoon: aCounts[doc] || 0,
        night: nCounts[doc] || 0,
    }));
}

// Dynamically update day warning notes on override change
// `ctx` is the result context the row belongs to (the new snapshot while it is being committed)
function updateDayNote(dayRow, offTodayList, config, ctx = resultCtx()) {
    const lang = currentLang;
    const { doctors } = ctx;
    let noteStr = '';

    const {
        roleBased,
        year,
        month,
        specialHols,
        doctorRoles,
        areConflicting,
        getRoleSlotsForDay,
        offMap,
    } = config;

    // Build base note labels
    let baseNotes = [];
    if (specialHols.includes(dayRow.day)) {
        baseNotes.push(translations[lang].specialHolidayLabel);
    } else if (dayRow.isHoliday) {
        baseNotes.push(translations[lang].holidayLabel);
    }

    if (dayRow.isNoDuty) {
        baseNotes.push(translations[lang].noDutyNote);
    }

    noteStr = baseNotes.join(' / ');

    // Check for shortages
    const hasShortage = dayRow.selectedDocs.some((d) => d.name === SHORTAGE_MARKER);
    if (hasShortage) {
        noteStr += (noteStr ? ' / ' : '') + translations[lang].shortageWarning;
    }

    // Check for Lock special rule
    const specialDocs = config.specialDocs;
    if (config.useSpecialRule && config.specialRuleDays.has(dayRow.day) && specialDocs.length > 0) {
        const assignedSpecial = dayRow.selectedDocs.find((d) => specialDocs.includes(d.name));
        if (assignedSpecial) {
            noteStr +=
                (noteStr ? ' / ' : '') +
                translations[lang].lockedBadge.replace('{name}', assignedSpecial.name);
        }
    }

    // Gather off requests for this day
    let offToday = offTodayList;
    if (!offToday) {
        let key = dayRow.day;
        if (ctx.isCustomDateRange && ctx.dates[dayRow.day - 1]) {
            const dt = ctx.dates[dayRow.day - 1];
            key = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
        }
        offToday = offMap[key] || [];
    }

    let offWarnings = [];
    dayRow.selectedDocs.forEach((docObj) => {
        if (Array.from(offToday).includes(docObj.name)) {
            offWarnings.push(translations[lang].offWarning.replace('{name}', docObj.name));
        }
    });

    if (offWarnings.length > 0) {
        noteStr += (noteStr ? ' / ' : '') + offWarnings.join(' / ');
    }

    // Check for doctor conflicts on this day
    let dayConflicts = [];
    for (let i = 0; i < dayRow.selectedDocs.length; i++) {
        for (let j = i + 1; j < dayRow.selectedDocs.length; j++) {
            const doc1 = dayRow.selectedDocs[i].name;
            const doc2 = dayRow.selectedDocs[j].name;
            if (doctors.includes(doc1) && doctors.includes(doc2)) {
                if (areConflicting(doc1, doc2)) {
                    dayConflicts.push(`${doc1}-${doc2}`);
                }
            }
        }
    }
    if (dayConflicts.length > 0) {
        const warnMsg =
            lang === 'th'
                ? `⚠️ ขัดแย้ง: ${dayConflicts.join(', ')}`
                : `⚠️ Conflict: ${dayConflicts.join(', ')}`;
        noteStr += (noteStr ? ' / ' : '') + warnMsg;
    }

    // Check for role mismatch on this day
    let dayRoleSlots = getRoleSlotsForDay(dayRow.day);
    const daySlotsList = expandSlots(dayRoleSlots);

    let roleMismatches = [];
    if (roleBased) {
        for (let i = 0; i < dayRow.selectedDocs.length; i++) {
            const docObj = dayRow.selectedDocs[i];
            const docName = docObj.name;
            if (doctors.includes(docName)) {
                const docRole = doctorRoles[docName] || 'Default';
                const reqRole = docObj.role || 'Default';
                if (docRole !== reqRole && reqRole !== 'Default') {
                    roleMismatches.push(
                        `${docName}(${docRole}${translations[lang].roleMismatchFor}${reqRole})`
                    );
                }
            }
        }
    }
    if (roleMismatches.length > 0) {
        const warnMsg =
            lang === 'th'
                ? `⚠️ ผิดบทบาท: ${roleMismatches.join(', ')}`
                : `⚠️ Role Mismatch: ${roleMismatches.join(', ')}`;
        noteStr += (noteStr ? ' / ' : '') + warnMsg;
    }

    dayRow.note = noteStr.trim();
}

function updateTargetedCellDOM(day, slotIndex) {
    if (!globalResult) return;

    const { doctors } = globalResult;
    const row = globalResult.schedule[day - 1];
    const docObj = row.selectedDocs[slotIndex];
    const docName = docObj ? docObj.name : '';
    const docRole = docObj ? docObj.role : 'Default';

    // Calculate new styles
    let badgeClass =
        'bg-white dark:bg-night border border-rule dark:border-rule-dark text-ink-2 dark:text-slate-300';
    let calBadgeClass = badgeClass;

    if (docName === SHORTAGE_MARKER && !row.isNoDuty) {
        badgeClass =
            'bg-signal/5 dark:bg-signal-bright/10 border border-signal/30 dark:border-signal-bright/30 text-signal dark:text-signal-bright font-medium';
        calBadgeClass = badgeClass;
    } else if (docName === '-' || docName === '' || row.isNoDuty) {
        badgeClass =
            'text-ink-2/40 dark:text-slate-600 bg-transparent border border-dashed border-rule dark:border-rule-dark';
        calBadgeClass = badgeClass;
    } else if (doctors.includes(docName)) {
        badgeClass = DOC_COLOR(docName);
        calBadgeClass = badgeClass;
    }

    let displayDoc = docName;
    if (docName === SHORTAGE_MARKER) {
        displayDoc = translations[currentLang].shortageSlot;
    } else if (docName === '-' || docName === '') {
        displayDoc = translations[currentLang].emptySlot;
    } else if (doctors.includes(docName)) {
        displayDoc = docName;
    }

    // 1. Update Table View Button
    const btnTable = document.getElementById(`btn-day-${day}-slot-${slotIndex}`);
    if (btnTable) {
        btnTable.className = `w-full text-left text-sm px-2.5 py-1.5 rounded-[3px] ${badgeClass} flex justify-between items-center transition-colors cursor-grab active:cursor-grabbing`;
        btnTable.setAttribute('aria-label', cellAria(day, slotIndex, displayDoc));
        const span = btnTable.querySelector('span.truncate');
        if (span) span.innerText = displayDoc;
    }

    // 2. Update Calendar View Button
    const btnCal = document.getElementById(`btn-cal-day-${day}-slot-${slotIndex}`);
    if (btnCal) {
        btnCal.className = `w-full text-left text-[11px] px-2.5 py-1 rounded-[3px] ${calBadgeClass} flex justify-between items-center transition-colors cursor-grab active:cursor-grabbing`;
        btnCal.setAttribute('aria-label', cellAria(day, slotIndex, displayDoc));
        const span = btnCal.querySelector('span.truncate');
        if (span) span.innerText = displayDoc;
    }

    // A choice or reset refreshes (highlight, Reset to auto) and closes this cell's dropdowns;
    // focus goes back to the cell button of whichever dropdown was open
    const optionsHtml = getCellDropdownOptionsHtml(day, slotIndex, docName, resultConfig());
    let focusBtn = null;
    [
        ['tablecelldropdown', btnTable],
        ['celldropdown', btnCal],
    ].forEach(([prefix, btn]) => {
        const dd = document.getElementById(`${prefix}-${day}-${slotIndex}`);
        if (!dd) return;
        if (!dd.classList.contains('hidden')) focusBtn = btn;
        dd.innerHTML = optionsHtml;
        dd.classList.add('hidden');
    });
    if (focusBtn) focusBtn.focus();

    // 3. Rebuild Notes
    let noteHtmlTable = '';
    let noteHtmlCal = '';
    if (row.note) {
        let textClass = 'font-medium text-slate-600 dark:text-slate-300';
        if (row.isNoDuty) textClass = 'font-medium text-slate-400 dark:text-slate-500';
        else if (row.isSpecial) textClass = 'font-medium text-orange-800 dark:text-orange-300';
        else if (row.isHoliday) textClass = 'font-medium text-rose-800 dark:text-rose-300';

        const parts = row.note.split('/');
        noteHtmlTable = '<div class="flex flex-wrap gap-1.5">';

        parts.forEach((p) => {
            const text = p.trim();
            if (!text) return;

            // Table
            let badgeClassTable =
                textClass && !row.isNoDuty
                    ? 'bg-white dark:bg-night border border-rule dark:border-rule-dark'
                    : 'bg-paper dark:bg-night border border-rule dark:border-rule-dark text-ink-2 dark:text-slate-400';
            if (
                text.includes(translations[currentLang].noDutyNote) ||
                text.includes(translations[currentLang].noDutyBadge)
            )
                badgeClassTable =
                    'bg-paper dark:bg-night text-ink-2 dark:text-slate-400 border border-rule dark:border-rule-dark';
            else if (text.startsWith('[ล็อคคิว') || text.startsWith('[Locked'))
                badgeClassTable =
                    'bg-duty/5 dark:bg-duty-bright/10 text-duty dark:text-duty-bright border border-duty/25 dark:border-duty-bright/30';
            else if (text.includes(SHORTAGE_MARKER) || text.includes('Shortage'))
                badgeClassTable =
                    'bg-signal/5 dark:bg-signal-bright/10 text-signal dark:text-signal-bright border border-signal/30 dark:border-signal-bright/30';
            else if (text.includes('ขอพัก') || text.includes('Off'))
                badgeClassTable =
                    'bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900';
            noteHtmlTable += `<span class="text-[10px] px-2 py-0.5 rounded-[3px] font-medium ${badgeClassTable}">${esc(text)}</span>`;

            // Calendar
            if (
                !row.isNoDuty &&
                !text.includes('Off') &&
                !text.includes('Shortage') &&
                !text.includes('ขอพัก') &&
                !text.includes(SHORTAGE_MARKER)
            ) {
                let badgeStyleCal =
                    'bg-paper dark:bg-night text-ink-2 dark:text-slate-400 text-[8px] px-1 py-0.5 rounded-[2px]';
                if (text.startsWith('[ล็อคคิว') || text.startsWith('[Locked')) {
                    badgeStyleCal =
                        'bg-duty/5 dark:bg-duty-bright/10 border border-duty/25 dark:border-duty-bright/30 text-duty dark:text-duty-bright text-[8px] px-1 py-0.5 rounded-[2px] font-medium';
                }
                noteHtmlCal += `<span class="${badgeStyleCal} truncate block max-w-full" title="${esc(text)}">${esc(text)}</span>`;
            }
        });
        noteHtmlTable += '</div>';
    }

    // 4. Update Note Cells
    const noteCellTable = document.getElementById(`note-day-${day}`);
    if (noteCellTable) noteCellTable.innerHTML = noteHtmlTable;

    const noteCellCal = document.getElementById(`note-cal-day-${day}`);
    if (noteCellCal) noteCellCal.innerHTML = noteHtmlCal;
}

// Apply a specific doctor change to a slot
// Apply a specific doctor change to a slot
window.updateDoctorAssignment = function (day, slotIndex, docIndex) {
    if (!globalResult) return;

    let newDoctor = '-';
    if (docIndex === -1) {
        newDoctor = SHORTAGE_MARKER;
    } else if (docIndex >= 0) {
        newDoctor = globalResult.doctors[docIndex];
    }
    if (!newDoctor) return;
    const config = resultConfig();

    // A manual edit may not drop a doctor below the night floor.
    const floor = config.minNightShifts || 0;
    if (floor > 0) {
        const isShift = !!config.isShiftBased;
        const nightStart = (config.morningSlots || 0) + (config.afternoonSlots || 0);
        if (!isShift || slotIndex >= nightStart) {
            const prev = globalResult.schedule[day - 1].selectedDocs[slotIndex]?.name;
            const counts = {};
            globalResult.schedule.forEach((row) => {
                row.selectedDocs.forEach((slot, idx) => {
                    if (isShift && idx < nightStart) return;
                    const name = slot && slot.name;
                    if (name && name !== SHORTAGE_MARKER && name !== '-')
                        counts[name] = (counts[name] || 0) + 1;
                });
            });
            if (prev && prev !== newDoctor) counts[prev] = (counts[prev] || 0) - 1;
            if (newDoctor !== SHORTAGE_MARKER && newDoctor !== '-')
                counts[newDoctor] = (counts[newDoctor] || 0) + 1;
            const broken = Object.keys(counts).filter((doc) => counts[doc] < floor);
            if (broken.length > 0) {
                showToast(
                    currentLang === 'th'
                        ? `แก้ไม่ได้: ${broken.join(', ')} จะต่ำกว่า ${floor} เวร`
                        : `Cannot edit: ${broken.join(', ')} would fall below ${floor} shifts`,
                    true
                );
                return;
            }
        }
    }

    // We only push to stack if this was not part of an internal bulk operation like drag-and-drop
    // Drag-and-drop handles its own stack pushing.
    if (!window.isDragAndDropOperation) pushToUndoStack();

    // Save to overrides tracker
    if (!manualOverrides[day]) manualOverrides[day] = {};
    manualOverrides[day][slotIndex] = newDoctor;

    // Update active state
    globalResult.schedule[day - 1].selectedDocs[slotIndex] = {
        name: newDoctor,
        role: globalResult.schedule[day - 1].selectedDocs[slotIndex]?.role || 'Default',
    };
    updateDayNote(globalResult.schedule[day - 1], null, config);

    updateTargetedCellDOM(day, slotIndex);

    showToast(
        currentLang === 'th'
            ? `อัปเดตเวรวันที่ ${day} สำเร็จ!`
            : `Day ${day} duty updated successfully!`
    );

    explainSlotFailure(day, newDoctor, config);
    recalculateCounts(config);
    renderSummaryTable(config);
    updateStatsDashboard();
};

// Explain why a manual swap might violate a constraint
window.explainSlotFailure = function (day, doc, config) {
    if (!doc || doc === SHORTAGE_MARKER || doc === '-' || !config) return;
    const { offDutyPeriod, offMap } = config;
    let reasons = [];

    const ctx = resultCtx();
    const dates = ctx.dates;
    let dayKey = day;
    if (ctx.isCustomDateRange && dates.length > 0) {
        const dateObj = dates[day - 1];
        if (dateObj) {
            const dd = String(dateObj.getDate()).padStart(2, '0');
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const yyyy = dateObj.getFullYear();
            dayKey = `${dd}/${mm}/${yyyy}`;
        }
    }
    const offSet = offMap[dayKey];
    if (offSet && offSet.has(doc)) {
        reasons.push(currentLang === 'th' ? `ขอพัก/ลาในวันนี้` : `requested off today`);
    }

    let tomorrowKey = day + 1;
    if (ctx.isCustomDateRange && dates.length > 0) {
        if (day < dates.length) {
            const tomorrowObj = dates[day];
            if (tomorrowObj) {
                const dd = String(tomorrowObj.getDate()).padStart(2, '0');
                const mm = String(tomorrowObj.getMonth() + 1).padStart(2, '0');
                const yyyy = tomorrowObj.getFullYear();
                tomorrowKey = `${dd}/${mm}/${yyyy}`;
            }
        } else {
            tomorrowKey = null;
        }
    }
    const offTomorrowSet = tomorrowKey !== null && offMap[tomorrowKey] ? offMap[tomorrowKey] : null;
    if (offTomorrowSet && offTomorrowSet.has(doc)) {
        if (config.isShiftBased) {
            const dayRow = globalResult.schedule[day - 1];
            const M = config.morningSlots || 0;
            const A = config.afternoonSlots || 0;
            let assignedToNight = false;
            if (dayRow) {
                dayRow.selectedDocs.forEach((s, sIdx) => {
                    if (s && s.name === doc && sIdx >= M + A) assignedToNight = true;
                });
            }
            if (assignedToNight) {
                reasons.push(
                    currentLang === 'th'
                        ? `ลงเวรดึกในวันก่อนขอพัก`
                        : `assigned to Night shift before off day`
                );
            }
        } else {
            reasons.push(currentLang === 'th' ? `ขอพัก/ลาในวันพรุ่งนี้` : `requested off tomorrow`);
        }
    }

    if (config.isShiftBased) {
        const M = config.morningSlots || 0;
        const A = config.afternoonSlots || 0;
        const dayRow = globalResult.schedule[day - 1];

        let assignedToMorning = false;
        if (dayRow) {
            dayRow.selectedDocs.forEach((s, sIdx) => {
                if (s && s.name === doc && sIdx < M) assignedToMorning = true;
            });
        }

        if (assignedToMorning && day > 1) {
            const prevDayRow = globalResult.schedule[day - 2];
            let workedNightYesterday = false;
            if (prevDayRow) {
                prevDayRow.selectedDocs.forEach((s, sIdx) => {
                    if (s && s.name === doc && sIdx >= M + A) workedNightYesterday = true;
                });
            }
            if (workedNightYesterday) {
                reasons.push(
                    currentLang === 'th'
                        ? `ต่อเวรเช้าหลังเวรดึกเมื่อวาน`
                        : `worked Night shift yesterday and Morning shift today`
                );
            }
        }

        let assignedToNight = false;
        if (dayRow) {
            dayRow.selectedDocs.forEach((s, sIdx) => {
                if (s && s.name === doc && sIdx >= M + A) assignedToNight = true;
            });
        }

        if (assignedToNight && day < globalResult.schedule.length) {
            const nextDayRow = globalResult.schedule[day];
            let worksMorningTomorrow = false;
            if (nextDayRow) {
                nextDayRow.selectedDocs.forEach((s, sIdx) => {
                    if (s && s.name === doc && sIdx < M) worksMorningTomorrow = true;
                });
            }
            if (worksMorningTomorrow) {
                reasons.push(
                    currentLang === 'th'
                        ? `ต่อเวรดึกก่อนเวรเช้าพรุ่งนี้`
                        : `assigned to Night shift today and Morning shift tomorrow`
                );
            }
        }
    }

    if (offDutyPeriod > 1) {
        for (let lookBack = 1; lookBack < offDutyPeriod; lookBack++) {
            const prevDayIdx = day - 1 - lookBack;
            if (prevDayIdx >= 0 && globalResult.schedule[prevDayIdx]) {
                const prevDay = globalResult.schedule[prevDayIdx];
                if (prevDay.selectedDocs.some((s) => s && s.name === doc)) {
                    const daysAgoStr =
                        lookBack === 1
                            ? currentLang === 'th'
                                ? 'เมื่อวาน'
                                : 'yesterday'
                            : currentLang === 'th'
                              ? `${lookBack} วันก่อน`
                              : `${lookBack} days ago`;
                    const restMsg = translations[currentLang].offDutyPeriodExplainer.replace(
                        '{n}',
                        offDutyPeriod - 1
                    );
                    reasons.push(
                        `${currentLang === 'th' ? 'อยู่เวร' : 'worked'} ${daysAgoStr} (${restMsg})`
                    );
                    break;
                }
            }
        }
        const nextDayIdx = day;
        if (nextDayIdx < globalResult.schedule.length && globalResult.schedule[nextDayIdx]) {
            const tomorrow = globalResult.schedule[nextDayIdx];
            if (tomorrow.selectedDocs.some((s) => s && s.name === doc)) {
                reasons.push(
                    currentLang === 'th' ? `อยู่เวรติดกัน (พรุ่งนี้)` : `working tomorrow`
                );
            }
        }
    }

    const dayRow = globalResult.schedule[day - 1];
    let slotsInDay = 0;
    if (dayRow) {
        dayRow.selectedDocs.forEach((s) => {
            if (s && s.name === doc) slotsInDay++;
        });
        if (slotsInDay > 1)
            reasons.push(
                currentLang === 'th' ? `ถูกจัดเวรซ้ำซ้อนในวันนี้` : `assigned multiple times today`
            );
    }

    if (reasons.length > 0) {
        showToast(
            `⚠️ ${currentLang === 'th' ? 'ข้อควรระวัง: ' : 'Warning: '}${doc} ${reasons.join(', ')}`,
            true
        );
    }
};

// Reset overridden cell back to algorithm calculated value
window.resetSlotToAuto = function (day, slotIndex) {
    pushToUndoStack();
    if (manualOverrides[day]) {
        delete manualOverrides[day][slotIndex];
        if (Object.keys(manualOverrides[day]).length === 0) {
            delete manualOverrides[day];
        }
    }

    if (globalResult && globalResult.originalSchedule) {
        const autoDoc = globalResult.originalSchedule[day - 1].selectedDocs[slotIndex];
        globalResult.schedule[day - 1].selectedDocs[slotIndex] = {
            name: autoDoc ? autoDoc.name : '',
            role: autoDoc ? autoDoc.role : 'Default',
        };
        const config = resultConfig();
        updateDayNote(globalResult.schedule[day - 1], null, config);

        updateTargetedCellDOM(day, slotIndex);

        recalculateCounts(config);
        renderSummaryTable(config);
        updateStatsDashboard();
        if (typeof renderPersonCentricView === 'function') renderPersonCentricView(config);
    }
    showToast(
        currentLang === 'th'
            ? `คืนค่าระบบคำนวณ วันที่ ${day} สำเร็จ!`
            : `Reset Day ${day} to automatic solver`
    );
};

// Stats Dashboard Rendering
function updateStatsDashboard() {
    if (!globalResult) return;

    let totalDuties = 0;
    let shortages = 0;

    globalResult.schedule.forEach((row) => {
        if (row.isNoDuty) return;
        row.selectedDocs.forEach((docObj) => {
            if (docObj.name === SHORTAGE_MARKER) {
                shortages++;
            } else if (docObj.name !== '-' && docObj.name !== '') {
                totalDuties++;
            }
        });
    });

    document.getElementById('statTotalDuties').innerHTML =
        `${totalDuties}<span class="ml-1 text-[12px] font-normal text-ink-2 dark:text-slate-400">${currentLang === 'th' ? 'เวร' : 'duties'}</span>`;

    const shortagesCard = document.getElementById('statShortagesCard');
    const shortagesText = document.getElementById('statShortages');

    shortagesText.innerHTML = `${shortages}<span class="ml-1 text-[12px] font-normal text-ink-2 dark:text-slate-400">${currentLang === 'th' ? 'วัน' : 'days'}</span>`;
    shortagesText.className =
        'mt-1.5 text-[24px] leading-none font-semibold tracking-tight ' +
        (shortages > 0 ? 'text-signal dark:text-signal-bright' : 'text-ink dark:text-slate-100');
    shortagesCard.className =
        'px-3 py-3 sm:px-5 sm:py-4 transition-colors' +
        (shortages > 0 ? ' bg-signal/5 dark:bg-signal-bright/10' : '');

    const activeDocCount = globalResult.doctors.length;
    const avg = activeDocCount > 0 ? (totalDuties / activeDocCount).toFixed(1) : '0.0';
    document.getElementById('statAvgDuties').innerHTML =
        `${avg}<span class="ml-1 text-[12px] font-normal text-ink-2 dark:text-slate-400">${currentLang === 'th' ? 'เวร/คน' : 'duties/doc'}</span>`;

    const printPeriod = document.getElementById('printPeriod');
    if (printPeriod && globalResult) printPeriod.textContent = periodLabel(currentLang);

    const floorPlanNote = document.getElementById('floorPlanNote');
    if (floorPlanNote) {
        const plan = globalResult && globalResult.config && globalResult.config.floorPlan;
        const floor = globalResult && globalResult.config ? globalResult.config.minNightShifts : 0;
        if (plan && floor > 0) {
            const perDoctor =
                globalResult.doctors.length > 0
                    ? Math.round(plan.required / globalResult.doctors.length)
                    : floor;
            floorPlanNote.textContent =
                currentLang === 'th'
                    ? `แผน: ${plan.baseSlots} ช่อง + ${plan.extrasNeeded} แพทย์เสริม = ${plan.baseSlots + plan.extrasNeeded} เวร → ${perDoctor} เวร/คน`
                    : `Plan: ${plan.baseSlots} slots + ${plan.extrasNeeded} extras = ${plan.baseSlots + plan.extrasNeeded} shifts → ${perDoctor} each`;
            floorPlanNote.classList.remove('hidden');
        } else {
            floorPlanNote.classList.add('hidden');
        }
    }

    syncUndoBtn();

    // Toggle visibility of clear manual overrides button
    const clearOverridesBtn = document.getElementById('btnClearOverrides');
    if (clearOverridesBtn) {
        if (Object.keys(manualOverrides).length > 0) {
            clearOverridesBtn.classList.remove('hidden');
        } else {
            clearOverridesBtn.classList.add('hidden');
        }
    }

    lucide.createIcons();
}

// Render Results Router (handles Table & Calendar view)
// Render only the Summary Table
function renderSummaryTable(config) {
    if (!globalResult) return;

    const { doctorRoles, quota, roleBased, isShiftBased } = config;

    // Draw header section dynamically
    const sumHeader = document.getElementById('summaryTableHeader');
    if (sumHeader) {
        if (isShiftBased) {
            sumHeader.innerHTML = `
                <tr class="text-ink-2 dark:text-slate-400 border-b border-rule dark:border-rule-dark text-[11px]">
                    <th class="py-2.5 px-5 text-left font-medium">${currentLang === 'th' ? 'แพทย์' : 'Doctor'}</th>
                    <th class="py-2.5 px-4 font-medium">${currentLang === 'th' ? 'เช้า (M)' : 'Morning (M)'}</th>
                    <th class="py-2.5 px-4 font-medium">${currentLang === 'th' ? 'บ่าย (A)' : 'Afternoon (A)'}</th>
                    <th class="py-2.5 px-4 font-medium">${currentLang === 'th' ? 'ดึก (N)' : 'Night (N)'}</th>
                    <th class="py-2.5 px-4 font-medium text-duty dark:text-duty-bright">${currentLang === 'th' ? 'ทำการ (จ-ศ)' : 'Weekday'}</th>
                    <th class="py-2.5 px-4 font-medium text-signal dark:text-signal-bright">${currentLang === 'th' ? 'หยุด (ส-อา, พิเศษ)' : 'Weekend/Hol'}</th>
                    <th class="py-2.5 px-5 font-semibold text-ink dark:text-slate-200">${currentLang === 'th' ? 'รวมทั้งหมด' : 'Grand Total'}</th>
                </tr>
            `;
        } else {
            sumHeader.innerHTML = `
                <tr class="text-ink-2 dark:text-slate-400 border-b border-rule dark:border-rule-dark text-[11px]">
                    <th class="py-2.5 px-5 text-left font-medium">${currentLang === 'th' ? 'แพทย์' : 'Doctor'}</th>
                    <th class="py-2.5 px-4 font-medium text-duty dark:text-duty-bright">${currentLang === 'th' ? 'ทำการ (จ-ศ)' : 'Weekday'}</th>
                    <th class="py-2.5 px-4 font-medium text-signal dark:text-signal-bright">${currentLang === 'th' ? 'หยุด (ส-อา, พิเศษ)' : 'Weekend/Hol'}</th>
                    <th class="py-2.5 px-5 font-semibold text-ink dark:text-slate-200">${currentLang === 'th' ? 'รวมทั้งหมด' : 'Grand Total'}</th>
                </tr>
            `;
        }
    }

    // Draw summary body rows
    const sumBody = document.getElementById('summaryTableBody');
    if (!sumBody) return;
    sumBody.innerHTML = '';
    let totalShifts = 0;

    globalResult.summary.forEach((sum) => {
        totalShifts += sum.total;
        const role = doctorRoles[sum.name] || 'Default';
        const displayName =
            role !== 'Default' && roleBased ? `${esc(sum.name)} (${esc(role)})` : esc(sum.name);

        let quotaIndicator = '';
        const key = getQuotaKey(sum.name, config);
        const docQuota = quota[key];
        if (docQuota !== undefined && docQuota > 0) {
            if (sum.total >= docQuota) {
                quotaIndicator = `<span class="ml-2 inline-flex items-center text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded text-[10px] font-bold border border-emerald-200 dark:border-emerald-800/50"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 mr-0.5"><path d="M20 6 9 17l-5-5"/></svg>Quota</span>`;
            } else {
                quotaIndicator = `<span class="ml-2 inline-flex items-center text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-1.5 py-0.5 rounded text-[10px] font-bold border border-orange-200 dark:border-orange-800/50"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 mr-0.5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>${sum.total}/${docQuota}</span>`;
            }
        }

        if (isShiftBased) {
            sumBody.innerHTML += `
                <tr class="hover:bg-paper/70 dark:hover:bg-night/50 transition-colors">
                    <td class="py-2.5 px-5 text-left flex items-center gap-2"><span class="${DOC_COLOR(sum.name)}">${displayName}</span>${quotaIndicator}</td>
                    <td class="py-2.5 px-4 text-ink-2 dark:text-slate-400">${sum.morning || 0}</td>
                    <td class="py-2.5 px-4 text-ink-2 dark:text-slate-400">${sum.afternoon || 0}</td>
                    <td class="py-2.5 px-4 text-ink-2 dark:text-slate-400">${sum.night || 0}</td>
                    <td class="py-2.5 px-4 text-duty dark:text-duty-bright font-medium">${sum.workdays}</td>
                    <td class="py-2.5 px-4 text-signal dark:text-signal-bright font-medium">${sum.holidays}</td>
                    <td class="py-2.5 px-5 font-semibold text-ink dark:text-slate-100 text-[14px]">${sum.total}</td>
                </tr>
            `;
        } else {
            sumBody.innerHTML += `
                <tr class="hover:bg-paper/70 dark:hover:bg-night/50 transition-colors">
                    <td class="py-2.5 px-5 text-left flex items-center gap-2"><span class="${DOC_COLOR(sum.name)}">${displayName}</span>${quotaIndicator}</td>
                    <td class="py-2.5 px-4 text-duty dark:text-duty-bright font-medium">${sum.workdays}</td>
                    <td class="py-2.5 px-4 text-signal dark:text-signal-bright font-medium">${sum.holidays}</td>
                    <td class="py-2.5 px-5 font-semibold text-ink dark:text-slate-100 text-[14px]">${sum.total}</td>
                </tr>
            `;
        }
    });

    const sumTotalCount = document.getElementById('sumTotalCount');
    if (sumTotalCount) sumTotalCount.innerText = totalShifts;
    renderFairnessStrip(globalResult.summary);
}

// Compact per-doctor totals; the doctor(s) furthest from the mean get a red ring
function renderFairnessStrip(summary) {
    const strip = document.getElementById('fairnessStrip');
    if (!strip) return;
    if (!summary || summary.length === 0) {
        strip.innerHTML = '';
        return;
    }
    const totals = summary.map((s) => s.total);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    const maxDev = Math.max(...totals.map((t) => Math.abs(t - mean)));
    const chipsHtml = summary
        .map((s) => {
            const ring =
                maxDev > 0 && Math.abs(s.total - mean) === maxDev ? ' ring-1 ring-signal/60' : '';
            return `<span class="${DOC_COLOR(s.name)}${ring}">${esc(s.name)} ${s.total}</span>`;
        })
        .join('');
    strip.innerHTML = `${chipsHtml}<span class="ml-auto text-[11px] font-medium text-ink-2 dark:text-slate-400">${esc(translations[currentLang].statsSpread)} ${Math.min(...totals)}–${Math.max(...totals)}</span>`;
}

// Render Results Router (handles Table & Calendar view)
function renderResults() {
    if (!globalResult) return;

    const config = resultConfig();
    renderSummaryTable(config);
    renderCalendarScopeOptions(config);

    if (viewMode === 'table') {
        renderTableView(config);
    } else if (viewMode === 'calendar') {
        renderCalendarView(config);
    } else if (viewMode === 'person') {
        renderPersonCentricView(config);
    }
}

// Render standard Table List View
const roleColors = {
    R1: 'text-ink-2 dark:text-slate-400',
    R2: 'text-ink-2 dark:text-slate-400',
    R3: 'text-ink-2 dark:text-slate-400',
    Staff: 'text-ink-2 dark:text-slate-400',
};

function getSlotRole(slotIdx) {
    if (!globalResult) return 'Default';
    for (let r of globalResult.schedule) {
        const docObj = r.selectedDocs && r.selectedDocs[slotIdx];
        if (
            docObj &&
            docObj.name !== SHORTAGE_MARKER &&
            docObj.name !== '-' &&
            docObj.name !== ''
        ) {
            if (docObj.role && docObj.role !== 'Default') {
                return docObj.role;
            }
        }
    }
    try {
        const config = resultConfig();
        const daySlotsList = expandSlots(config.getRoleSlotsForDay(1));
        if (daySlotsList[slotIdx]) return daySlotsList[slotIdx];
    } catch (e) {
        // Ignore
    }
    return 'Default';
}

function getRoleBadgeColorClass(role) {
    if (['R1', 'R2', 'R3', 'Staff'].includes(role))
        return 'text-ink-2 dark:text-slate-300 bg-paper dark:bg-night border-rule dark:border-rule-dark';
    return 'text-ink-2 dark:text-slate-400 bg-paper dark:bg-night border-rule dark:border-rule-dark';
}

function renderTableView(config) {
    const { doctors } = globalResult;
    const headerRow = document.getElementById('scheduleTableHeader');
    let headerHtml = `
        <tr class="text-ink-2 dark:text-slate-400 text-[11px]">
            <th class="py-2.5 px-5 border-b border-rule dark:border-rule-dark font-medium w-16 whitespace-nowrap">${translations[currentLang].tableDateCol}</th>
            <th class="py-2.5 px-4 border-b border-rule dark:border-rule-dark font-medium w-24 whitespace-nowrap">${translations[currentLang].tableDayCol}</th>
    `;
    const isShiftBased = config.isShiftBased;
    const M = config.morningSlots || 0;
    const A = config.afternoonSlots || 0;
    const N = config.nightSlots || 0;
    const isRoleBasedEnabled = config.roleBased;

    for (let i = 1; i <= globalResult.maxSlots; i++) {
        let subHeader = '';
        let headerTitle = `${translations[currentLang].tableDutyCol} ${i}`;

        if (isShiftBased) {
            const idx = i - 1;
            if (idx < M) {
                headerTitle = translations[currentLang].shiftMorning;
            } else if (idx < M + A) {
                headerTitle = translations[currentLang].shiftAfternoon;
            } else {
                headerTitle = translations[currentLang].shiftNight;
            }
        } else if (isRoleBasedEnabled) {
            const role = getSlotRole(i - 1);
            if (role && role !== 'Default') {
                const colorClass = roleColors[role] || 'text-ink-2 dark:text-slate-400';
                subHeader = `<div class="text-[10px] font-medium mt-0.5 ${colorClass}">${role}</div>`;
            }
        }
        headerHtml += `
            <th class="py-2.5 px-4 border-b border-rule dark:border-rule-dark font-medium">
                <div>${headerTitle}</div>
                ${subHeader}
            </th>
        `;
    }
    headerHtml += `<th class="py-2.5 px-5 border-b border-rule dark:border-rule-dark font-medium">${translations[currentLang].tableNoteCol}</th></tr>`;
    headerRow.innerHTML = headerHtml;

    const schedBody = document.getElementById('scheduleTableBody');
    schedBody.innerHTML = '';

    globalResult.schedule.forEach((row) => {
        let rowClass = 'hover:bg-paper/70 dark:hover:bg-night/50 transition-colors';
        let textClass = 'font-medium text-ink dark:text-slate-200';
        let edgeClass = '';

        if (row.isNoDuty) {
            rowClass = 'bg-paper dark:bg-night/40 opacity-60';
            textClass = 'font-medium text-ink-2/70 dark:text-slate-500';
        } else if (row.isSpecial) {
            rowClass =
                'bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50/70 dark:hover:bg-amber-950/20';
            textClass = 'font-medium text-amber-900 dark:text-amber-200';
            edgeClass = 'weekend-edge';
        } else if (row.isHoliday) {
            rowClass =
                'bg-signal/5 dark:bg-signal-bright/5 hover:bg-signal/10 dark:hover:bg-signal-bright/10';
            textClass = 'font-medium text-ink dark:text-slate-100';
            edgeClass = 'weekend-edge';
        }

        let noteHtml = '';
        if (row.note) {
            const parts = row.note.split('/');
            noteHtml = '<div class="flex flex-wrap gap-1.5">';
            parts.forEach((p) => {
                const text = p.trim();
                if (!text) return;
                let badgeClass =
                    textClass && !row.isNoDuty
                        ? 'bg-white dark:bg-night border border-rule dark:border-rule-dark'
                        : 'bg-paper dark:bg-night border border-rule dark:border-rule-dark text-ink-2 dark:text-slate-400';
                if (
                    text.includes(translations[currentLang].noDutyNote) ||
                    text.includes(translations[currentLang].noDutyBadge)
                )
                    badgeClass =
                        'bg-paper dark:bg-night text-ink-2 dark:text-slate-400 border border-rule dark:border-rule-dark';
                else if (text.startsWith('[ล็อคคิว') || text.startsWith('[Locked'))
                    badgeClass =
                        'bg-duty/5 dark:bg-duty-bright/10 text-duty dark:text-duty-bright border border-duty/25 dark:border-duty-bright/30';
                else if (text.includes(SHORTAGE_MARKER) || text.includes('Shortage'))
                    badgeClass =
                        'bg-signal/5 dark:bg-signal-bright/10 text-signal dark:text-signal-bright border border-signal/30 dark:border-signal-bright/30';
                else if (text.includes('ขอพัก') || text.includes('Off'))
                    badgeClass =
                        'bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900';
                noteHtml += `<span class="text-[10px] px-2 py-0.5 rounded-[3px] font-medium ${badgeClass}">${esc(text)}</span>`;
            });
            noteHtml += '</div>';
        }

        let displayDay = row.dayDisplay || row.day;
        let colsHtml = `<td class="py-2.5 px-5 whitespace-nowrap font-semibold text-ink dark:text-slate-100 ${edgeClass}">${displayDay}</td><td class="py-2.5 px-4 whitespace-nowrap text-ink-2 dark:text-slate-400 text-[12px]">${row.dayName}</td>`;
        for (let i = 0; i < globalResult.maxSlots; i++) {
            // Days without a planned extra have fewer slots than maxSlots; leave those cells empty
            // instead of showing them as an unfilled "Open" duty.
            if (i >= row.selectedDocs.length) {
                colsHtml += `<td class="py-2.5 px-4"></td>`;
                continue;
            }
            let docObj = row.selectedDocs[i];
            let d = docObj ? docObj.name : '';
            let dRole = docObj ? docObj.role : 'Default';
            let badgeClass =
                'bg-white dark:bg-night border border-rule dark:border-rule-dark text-ink-2 dark:text-slate-300';

            if (d === SHORTAGE_MARKER && !row.isNoDuty) {
                badgeClass =
                    'bg-signal/5 dark:bg-signal-bright/10 border border-signal/30 dark:border-signal-bright/30 text-signal dark:text-signal-bright font-medium';
            } else if (d === '-' || d === '' || row.isNoDuty) {
                badgeClass =
                    'text-ink-2/40 dark:text-slate-600 bg-transparent border border-dashed border-rule dark:border-rule-dark';
            } else if (doctors.includes(d)) {
                badgeClass = DOC_COLOR(d);
            }

            let displayDoc = esc(d);
            if (d === SHORTAGE_MARKER) {
                displayDoc = translations[currentLang].shortageSlot;
            } else if (d === '-' || d === '') {
                displayDoc = translations[currentLang].emptySlot;
            } else if (doctors.includes(d)) {
                displayDoc = esc(d);
            }

            if (row.isNoDuty) {
                colsHtml += `<td class="py-2.5 px-4 text-ink-2/40 dark:text-slate-700 font-medium">-</td>`;
            } else {
                let docIndexToPass = -2;
                if (d === SHORTAGE_MARKER) docIndexToPass = -1;
                else if (doctors.includes(d)) docIndexToPass = doctors.indexOf(d);

                colsHtml += `
                    <td class="py-2.5 px-4">
                        <div class="relative group/cell inline-block min-w-[110px]">
                            <button id="btn-day-${row.day}-slot-${i}" aria-label="${cellAria(row.day, i, displayDoc)}"
                                draggable="true" ondragstart="handleDragStart(event, ${row.day}, ${i}, ${docIndexToPass})" ondragover="handleDragOver(event)" ondrop="handleDrop(event, ${row.day}, ${i}, ${docIndexToPass})"
                                onclick="openCellDropdown(event, 'tablecelldropdown-${row.day}-${i}')" class="w-full text-left text-sm px-2.5 py-1.5 rounded-[3px] ${badgeClass} flex justify-between items-center transition-colors cursor-grab active:cursor-grabbing">
                                <span class="truncate" aria-hidden="true">${displayDoc}</span>
                                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 opacity-0 group-hover/cell:opacity-60 transition-opacity"><path d="m6 9 6 6 6-6"/></svg>
                            </button>
                            <div id="tablecelldropdown-${row.day}-${i}" onclick="event.stopPropagation()" class="absolute left-0 mt-1 w-40 bg-white dark:bg-sheet-dark border border-rule dark:border-rule-dark rounded-md shadow-lg z-20 py-1 hidden max-h-48 overflow-y-auto custom-scrollbar">
                                ${getCellDropdownOptionsHtml(row.day, i, d, config)}
                            </div>
                        </div>
                    </td>
                `;
            }
        }
        colsHtml += `<td id="note-day-${row.day}" class="py-2.5 px-5">${noteHtml}</td>`;
        schedBody.innerHTML += `<tr class="${rowClass}">${colsHtml}</tr>`;
    });
}

// Render Calendar Layout View
function renderCalendarView(config) {
    const { doctors } = globalResult;
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const ctx = resultCtx();
    const calcYear = ctx.year > 2500 ? ctx.year - 543 : ctx.year;
    const firstDateObj = ctx.dates[0] || new Date(calcYear, ctx.month - 1, 1);
    const startDayOfWeek = firstDateObj.getDay();

    // Empty placeholder boxes for alignment offset
    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className =
            'hidden md:block bg-paper dark:bg-night border border-rule/60 dark:border-rule-dark rounded-[3px] min-h-[105px] opacity-40';
        grid.appendChild(emptyCell);
    }

    // Populate monthly days
    globalResult.schedule.forEach((dayRow) => {
        const dayCell = document.createElement('div');

        let cardBg = 'bg-white dark:bg-sheet-dark border-rule dark:border-rule-dark';
        let dateNumClass = 'text-ink dark:text-slate-100 font-semibold';

        if (dayRow.isNoDuty) {
            cardBg = 'bg-paper dark:bg-night border-rule dark:border-rule-dark opacity-60';
            dateNumClass = 'text-ink-2/60 dark:text-slate-600 font-semibold';
        } else if (dayRow.isSpecial) {
            cardBg =
                'bg-amber-50/60 dark:bg-amber-950/10 border-amber-200/70 dark:border-amber-900/40';
            dateNumClass = 'text-amber-900 dark:text-amber-200 font-semibold';
        } else if (dayRow.isHoliday) {
            cardBg =
                'bg-signal/5 dark:bg-signal-bright/5 border-signal/25 dark:border-signal-bright/25';
            dateNumClass = 'text-ink dark:text-slate-100 font-semibold';
        }

        dayCell.className = `border rounded-[3px] p-2.5 min-h-[110px] flex flex-col gap-1.5 transition-colors ${cardBg}`;

        let displayDateNum = dayRow.day;
        let monthLabel = '';
        if (ctx.isCustomDateRange && ctx.dates[dayRow.day - 1]) {
            const dateObj = ctx.dates[dayRow.day - 1];
            displayDateNum = dateObj.getDate();
            if (displayDateNum === 1 || dayRow.day === 1) {
                monthLabel = ` ${monthName(dateObj)}`;
            }
        }

        let dayHeaderHtml = `
            <div class="flex justify-between items-center border-b border-rule/70 dark:border-rule-dark pb-1">
                <span class="text-[13px] ${dateNumClass}">${displayDateNum}${monthLabel}</span>
                <span class="text-[10px] text-ink-2/70 dark:text-slate-500 font-medium">${dayRow.dayName.substring(0, 3)}</span>
            </div>
        `;

        let docsHtml = '<div class="flex flex-col gap-1 flex-1 justify-start pt-0.5">';
        if (dayRow.isNoDuty) {
            docsHtml += `<span class="text-[10px] text-center font-medium text-ink-2/70 dark:text-slate-500 py-1.5 bg-paper dark:bg-night rounded-[3px]">${translations[currentLang].noDutyBadge}</span>`;
        } else {
            for (let i = 0; i < dayRow.slots; i++) {
                const docObj = dayRow.selectedDocs[i];
                const doc = docObj ? docObj.name : '';
                const dRole = docObj ? docObj.role : 'Default';
                let badgeClass =
                    'bg-white dark:bg-night border border-rule dark:border-rule-dark text-ink-2 dark:text-slate-300';
                if (doc === SHORTAGE_MARKER) {
                    badgeClass =
                        'bg-signal/5 dark:bg-signal-bright/10 border border-signal/30 dark:border-signal-bright/30 text-signal dark:text-signal-bright font-medium';
                } else if (doc === '-' || doc === '') {
                    badgeClass =
                        'text-ink-2/40 dark:text-slate-600 bg-transparent border border-dashed border-rule dark:border-rule-dark';
                } else if (doctors.includes(doc)) {
                    badgeClass = DOC_COLOR(doc);
                }

                let displayDoc = esc(doc);
                let docIndexToPass = -2;
                if (doc === SHORTAGE_MARKER) {
                    displayDoc = translations[currentLang].shortageSlot;
                    docIndexToPass = -1;
                } else if (doc === '-' || doc === '') {
                    displayDoc = translations[currentLang].emptySlot;
                } else if (doctors.includes(doc)) {
                    displayDoc = esc(doc);
                    docIndexToPass = doctors.indexOf(doc);
                }

                if (config && config.isShiftBased) {
                    const M = config.morningSlots || 0;
                    const A = config.afternoonSlots || 0;
                    let prefix = '';
                    if (i < M) {
                        prefix = currentLang === 'th' ? 'ช: ' : 'M: ';
                    } else if (i < M + A) {
                        prefix = currentLang === 'th' ? 'บ: ' : 'A: ';
                    } else {
                        prefix = currentLang === 'th' ? 'ด: ' : 'N: ';
                    }
                    displayDoc = prefix + displayDoc;
                }

                docsHtml += `
                    <div class="relative group/cell">
                        <button id="btn-cal-day-${dayRow.day}-slot-${i}" aria-label="${cellAria(dayRow.day, i, displayDoc)}" 
                            draggable="true" ondragstart="handleDragStart(event, ${dayRow.day}, ${i}, ${docIndexToPass})" ondragover="handleDragOver(event)" ondrop="handleDrop(event, ${dayRow.day}, ${i}, ${docIndexToPass})"
                            onclick="openCellDropdown(event, 'celldropdown-${dayRow.day}-${i}')" class="w-full text-left text-[11px] px-2.5 py-1 rounded-[3px] ${badgeClass} flex justify-between items-center transition-colors cursor-grab active:cursor-grabbing">
                            <span class="truncate" aria-hidden="true">${displayDoc}</span>
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-2.5 h-2.5 opacity-0 group-hover/cell:opacity-60 transition-opacity"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                        <div id="celldropdown-${dayRow.day}-${i}" onclick="event.stopPropagation()" class="absolute left-0 mt-1 w-36 bg-white dark:bg-sheet-dark border border-rule dark:border-rule-dark rounded-md shadow-xl z-20 py-1 hidden max-h-48 overflow-y-auto custom-scrollbar">
                            ${getCellDropdownOptionsHtml(dayRow.day, i, doc, config)}
                        </div>
                    </div>
                `;
            }
        }
        docsHtml += '</div>';

        let noteHtml = '';
        if (dayRow.note && !dayRow.isNoDuty) {
            const parts = dayRow.note.split('/');
            parts.forEach((p) => {
                const text = p.trim();
                if (
                    !text ||
                    text.includes('Off') ||
                    text.includes('Shortage') ||
                    text.includes('ขอพัก') ||
                    text.includes(SHORTAGE_MARKER)
                )
                    return; // Skip lengthy notes in calendar view grid

                let badgeStyle =
                    'bg-paper dark:bg-night text-ink-2 dark:text-slate-400 text-[8px] px-1 py-0.5 rounded-[2px]';
                if (text.startsWith('[ล็อคคิว') || text.startsWith('[Locked')) {
                    badgeStyle =
                        'bg-duty/5 dark:bg-duty-bright/10 border border-duty/25 dark:border-duty-bright/30 text-duty dark:text-duty-bright text-[8px] px-1 py-0.5 rounded-[2px] font-medium';
                }
                noteHtml += `<span class="${badgeStyle} truncate block max-w-full" title="${esc(text)}">${esc(text)}</span>`;
            });
        }

        dayCell.innerHTML = `
            ${dayHeaderHtml}
            ${docsHtml}
            <div id="note-cal-day-${dayRow.day}" class="mt-1 flex flex-col gap-0.5">${noteHtml}</div>
        `;

        grid.appendChild(dayCell);
    });
}

// Cell Dropdown content builder for custom updates
function getCellDropdownOptionsHtml(day, slotIndex, currentDoc, config) {
    let optionsHtml = '';

    const { doctorRoles } = config;
    const { doctors } = globalResult;

    // Show "Reset to Auto" option if cell has a manual override applied
    const isOverridden = manualOverrides[day] && manualOverrides[day][slotIndex] !== undefined;
    const btnClassBase = 'w-full text-left px-3 py-1.5 text-xs';

    if (isOverridden) {
        optionsHtml += `
            <button onclick="resetSlotToAuto(${day}, ${slotIndex})" class="${btnClassBase} text-duty dark:text-duty-bright hover:bg-duty/5 dark:hover:bg-duty-bright/10 font-medium flex items-center gap-2 border-b border-rule dark:border-rule-dark">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg> <span>${translations[currentLang].resetCellBtn || 'คืนค่าระบบคำนวณ'}</span>
            </button>
        `;
    }

    doctors.forEach((doc, index) => {
        const isCurrent =
            doc === currentDoc
                ? 'bg-duty/10 dark:bg-duty-bright/10 text-duty dark:text-duty-bright font-medium border-l-2 border-duty'
                : 'text-ink dark:text-slate-300 font-medium';
        const role = doctorRoles[doc] || 'Default';
        const displayName = role !== 'Default' ? `${doc} (${role})` : doc;
        optionsHtml += `
            <button onclick="updateDoctorAssignment(${day}, ${slotIndex}, ${index})" class="${btnClassBase} hover:bg-paper dark:hover:bg-night ${isCurrent} border-b border-rule dark:border-rule-dark last:border-0">
                ${esc(displayName)}
            </button>
        `;
    });

    const isShortage =
        currentDoc === SHORTAGE_MARKER
            ? 'bg-signal/10 dark:bg-signal-bright/10 text-signal dark:text-signal-bright font-medium border-l-2 border-signal'
            : 'text-signal dark:text-signal-bright font-medium';
    optionsHtml += `
        <div class="border-t border-rule dark:border-rule-dark my-1"></div>
        <button onclick="updateDoctorAssignment(${day}, ${slotIndex}, -1)" class="${btnClassBase} hover:bg-signal/5 ${isShortage} border-b border-rule dark:border-rule-dark">
            ⚠️ <span>${translations[currentLang].shortageSlot || 'ขาดคน'}</span>
        </button>
    `;

    const isNone =
        currentDoc === '-' || currentDoc === ''
            ? 'bg-paper dark:bg-night font-medium border-l-2 border-ink-2'
            : 'text-ink-2/70 dark:text-slate-500 font-medium';
    optionsHtml += `
        <button onclick="updateDoctorAssignment(${day}, ${slotIndex}, -2)" class="${btnClassBase} hover:bg-paper dark:hover:bg-night ${isNone}">
            <span>${translations[currentLang].emptySlot || '- ว่าง'}</span>
        </button>
    `;

    return optionsHtml;
}

window.closeMobileSheet = function () {
    const sheet = document.getElementById('mobileDoctorSheet');
    if (!sheet) return;
    sheet.classList.add('hidden');
    FocusTrap.deactivate(sheet.querySelector('[role="dialog"]'));
};

// Keep closeMobileModal in case it's called anywhere else by accident
window.closeMobileModal = function () {
    window.closeMobileSheet();
};

// Cell Dropdown Router Trigger
window.openCellDropdown = function (event, dropdownId) {
    event.stopPropagation();

    // Close other dropdown instances
    const dropdowns = document.querySelectorAll('[id^="dropdown-"]');
    dropdowns.forEach((d) => d.classList.add('hidden'));

    const cellDropdowns = document.querySelectorAll(
        '[id^="celldropdown-"], [id^="tablecelldropdown-"]'
    );
    cellDropdowns.forEach((d) => {
        if (d.id !== dropdownId) d.classList.add('hidden');
    });

    const isMobile = window.innerWidth < 768;

    if (isMobile) {
        const parts = dropdownId.split('-');
        const slotIndex = parseInt(parts.pop());
        const day = parseInt(parts.pop());

        const ctx = resultCtx();
        let currentDoc = '';
        if (ctx.schedule) {
            const row = ctx.schedule.find((r) => r.day === day);
            if (row && row.selectedDocs && row.selectedDocs[slotIndex]) {
                currentDoc = row.selectedDocs[slotIndex].name;
            }
        }

        const listContainer = document.getElementById('mobileDoctorList');
        if (!listContainer) return;

        let optionsHtml = '';
        const { doctorRoles } = ctx.config;
        const { doctors } = ctx;
        const T = translations[currentLang];

        const isOverridden = manualOverrides[day] && manualOverrides[day][slotIndex] !== undefined;
        if (isOverridden) {
            optionsHtml += `<button onclick="resetSlotToAuto(${day}, ${slotIndex}); closeMobileSheet();" class="w-full min-h-[48px] py-3 text-[15px] border-b border-rule dark:border-rule-dark text-left text-duty dark:text-duty-bright font-medium transition-colors">${T.resetCellBtn}</button>`;
        }

        doctors.forEach((doc, index) => {
            const isCurrent =
                doc === currentDoc
                    ? 'text-teal-600 dark:text-teal-400 font-bold'
                    : 'text-slate-700 dark:text-slate-300';
            const role = doctorRoles[doc] || 'Default';
            const displayName = role !== 'Default' ? `${doc} (${role})` : doc;
            optionsHtml += `<button onclick="updateDoctorAssignment(${day}, ${slotIndex}, ${index}); closeMobileSheet();" class="w-full min-h-[48px] py-3 text-[15px] border-b border-rule dark:border-rule-dark text-left ${isCurrent} transition-colors">${esc(displayName)}</button>`;
        });

        optionsHtml += `<button onclick="updateDoctorAssignment(${day}, ${slotIndex}, -1); closeMobileSheet();" class="w-full min-h-[48px] py-3 text-[15px] border-b border-rule dark:border-rule-dark text-left text-signal dark:text-signal-bright font-medium transition-colors">${T.shortageSlot}</button>`;
        optionsHtml += `<button onclick="updateDoctorAssignment(${day}, ${slotIndex}, -2); closeMobileSheet();" class="w-full min-h-[48px] py-3 text-[15px] border-b border-rule dark:border-rule-dark text-left text-ink-2/70 dark:text-slate-500 font-medium transition-colors">${T.emptySlot}</button>`;

        listContainer.innerHTML = optionsHtml;
        const sheet = document.getElementById('mobileDoctorSheet');
        sheet.classList.remove('hidden');
        FocusTrap.activate(
            sheet.querySelector('[role="dialog"]'),
            window.closeMobileSheet,
            event.currentTarget
        );
    } else {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            dropdown.classList.toggle('hidden');
        }
    }
};

// Clipboard Copy functions
// `dates` (a result's own dates) overrides the live scheduleDates/isCustomDateRange
function formatShortDate(dayIndex, month, year, lang, dates) {
    const list = dates !== undefined ? dates : isCustomDateRange && scheduleDates;
    if (list && list[dayIndex - 1]) {
        const dateObj = list[dayIndex - 1];
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const yyyy = lang === 'th' ? dateObj.getFullYear() + 543 : dateObj.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    }

    const dd = String(dayIndex).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    let y = parseInt(year);
    if (lang === 'th') {
        if (y < 2500) y += 543;
    } else {
        if (y > 2500) y -= 543;
    }
    return `${dd}/${mm}/${y}`;
}

function copyToClipboard(text, okMsg) {
    if (!navigator.clipboard) {
        showToast(translations[currentLang].clipboardUnavailable, true);
        return;
    }
    navigator.clipboard
        .writeText(text)
        .then(() => showToast(okMsg))
        .catch(() => {
            showToast(currentLang === 'th' ? 'เกิดข้อผิดพลาดในการคัดลอก' : 'Copy failed', true);
        });
}

// The displayed result's dates when it covers a custom range, else null
const resultDates = () =>
    globalResult && globalResult.isCustomDateRange && globalResult.dates.length > 0
        ? globalResult.dates
        : null;

// "Month 1/2026", or "Range 25/01/2026 - 05/02/2026" when a custom range is active
function periodLabel(lang) {
    const dates = resultDates();
    if (dates) {
        const from = formatShortDate(1, 0, 0, lang, dates);
        const to = formatShortDate(dates.length, 0, 0, lang, dates);
        return `${lang === 'th' ? 'ช่วง' : 'Range'} ${from} - ${to}`;
    }
    // globalResult.year is stale after a language toggle; show BE in th, AD in en like formatShortDate
    let y = parseInt(globalResult.year);
    if (lang === 'th' && y < 2500) y += 543;
    else if (lang !== 'th' && y > 2500) y -= 543;
    return `${lang === 'th' ? 'เดือน' : 'Month'} ${globalResult.month}/${y}`;
}

window.copyScheduleForExcel = function () {
    if (!globalResult || globalResult.schedule.length === 0) {
        showToast(
            currentLang === 'th' ? 'ยังไม่มีข้อมูลตารางเวร' : 'No schedule data available',
            true
        );
        return;
    }

    let tsvData = currentLang === 'th' ? 'วันที่\tวัน\t' : 'Date\tDay\t';
    const config = resultConfig();
    const isRoleBasedEnabled = config.roleBased;
    const isShiftBased = config.isShiftBased;
    const M = config.morningSlots || 0;
    const A = config.afternoonSlots || 0;
    const N = config.nightSlots || 0;

    for (let i = 1; i <= globalResult.maxSlots; i++) {
        let dutyHeader = currentLang === 'th' ? `เวรคนที่ ${i}` : `Duty ${i}`;
        if (isShiftBased) {
            const idx = i - 1;
            if (idx < M) {
                dutyHeader = translations[currentLang].shiftMorning;
            } else if (idx < M + A) {
                dutyHeader = translations[currentLang].shiftAfternoon;
            } else {
                dutyHeader = translations[currentLang].shiftNight;
            }
        } else if (isRoleBasedEnabled) {
            const role = getSlotRole(i - 1);
            if (role && role !== 'Default') {
                dutyHeader += ` (${role})`;
            }
        }
        tsvData += `${dutyHeader}\t`;
    }
    tsvData += currentLang === 'th' ? 'หมายเหตุ\n' : 'Notes\n';

    globalResult.schedule.forEach((row) => {
        const shortDate = formatShortDate(
            row.day,
            globalResult.month,
            globalResult.year,
            currentLang,
            resultDates()
        );
        tsvData += `${shortDate}\t${row.dayName}\t`;
        for (let i = 0; i < globalResult.maxSlots; i++) {
            let docObj = row.selectedDocs[i];
            let doc = docObj ? docObj.name : '';
            if (doc === SHORTAGE_MARKER) {
                doc = '';
            } else if (doc === '-' || doc === '') {
                doc = '';
            }
            tsvData += `${doc}\t`;
        }
        tsvData += `${row.note}\n`;
    });

    copyToClipboard(tsvData, translations[currentLang].copyExcelBtn + ' copy success!');
};

window.copySummary = function () {
    if (!globalResult) return;
    const config = resultConfig();
    const isShiftBased = config.isShiftBased;

    let text = '';
    if (isShiftBased) {
        text =
            currentLang === 'th'
                ? `📊 สรุปจำนวนเวร ${periodLabel('th')}\n---------------------------------------------------------------\nชื่อ      | เช้า(M) | บ่าย(A) | ดึก(N) | ทำการ | วันหยุด | รวม\n---------------------------------------------------------------\n`
                : `📊 On-call Summary ${periodLabel('en')}\n---------------------------------------------------------------\nName     | Morning | Afternoon | Night | Weekdays | Holidays | Total\n---------------------------------------------------------------\n`;
    } else {
        text =
            currentLang === 'th'
                ? `📊 สรุปจำนวนเวร ${periodLabel('th')}\n---------------------------------\nชื่อ      | ทำการ | วันหยุด | รวม\n---------------------------------\n`
                : `📊 On-call Summary ${periodLabel('en')}\n---------------------------------\nName     | Weekdays | Holidays | Total\n---------------------------------\n`;
    }

    let totalShifts = 0;
    globalResult.summary.forEach((s) => {
        let name = s.name.padEnd(8, ' ');
        let w = String(s.workdays).padStart(3, ' ');
        let h = String(s.holidays).padStart(3, ' ');
        let t = String(s.total).padStart(3, ' ');

        if (isShiftBased) {
            let m = String(s.morning || 0).padStart(3, ' ');
            let a = String(s.afternoon || 0).padStart(3, ' ');
            let n = String(s.night || 0).padStart(3, ' ');
            text += `${name} |  ${m}   |  ${a}   |  ${n}  | ${w}  |  ${h}  | ${t}\n`;
        } else {
            text += `${name} | ${w}  |  ${h}  | ${t}\n`;
        }
        totalShifts += s.total;
    });

    if (isShiftBased) {
        text += `---------------------------------------------------------------\n${currentLang === 'th' ? 'รวมทั้งหมด' : 'Total shifts'}: ${totalShifts} ${translations[currentLang].shiftsUnit}\n`;
    } else {
        text += `---------------------------------\n${currentLang === 'th' ? 'รวมทั้งหมด' : 'Total shifts'}: ${totalShifts} ${translations[currentLang].shiftsUnit}\n`;
    }

    copyToClipboard(text, translations[currentLang].copySummaryBtn + ' copy success!');
};

// Excel Export File function
window.exportToExcel = function () {
    if (!window.XLSX || !globalResult) return;
    try {
        const headers = [
            translations[currentLang].tableDateCol,
            translations[currentLang].tableDayCol,
        ];
        const config = resultConfig();
        const isRoleBasedEnabled = config.roleBased;
        const isShiftBased = config.isShiftBased;
        const M = config.morningSlots || 0;
        const A = config.afternoonSlots || 0;
        const N = config.nightSlots || 0;

        for (let i = 1; i <= globalResult.maxSlots; i++) {
            let headerText = `${translations[currentLang].tableDutyCol} ${i}`;
            if (isShiftBased) {
                const idx = i - 1;
                if (idx < M) {
                    headerText = translations[currentLang].shiftMorning;
                } else if (idx < M + A) {
                    headerText = translations[currentLang].shiftAfternoon;
                } else {
                    headerText = translations[currentLang].shiftNight;
                }
            } else if (isRoleBasedEnabled) {
                const role = getSlotRole(i - 1);
                if (role && role !== 'Default') {
                    headerText += ` (${role})`;
                }
            }
            headers.push(headerText);
        }
        headers.push(translations[currentLang].tableNoteCol);

        const data = [headers];
        globalResult.schedule.forEach((r) => {
            const shortDate = formatShortDate(
                r.day,
                globalResult.month,
                globalResult.year,
                currentLang,
                resultDates()
            );
            let rowData = [shortDate, r.dayName];
            for (let i = 0; i < globalResult.maxSlots; i++) {
                let docObj = r.selectedDocs[i];
                let doc = docObj ? docObj.name : '';
                if (doc === SHORTAGE_MARKER) {
                    doc = '';
                } else if (doc === '-' || doc === '') {
                    doc = '';
                }
                rowData.push(doc);
            }
            rowData.push(r.note);
            data.push(rowData);
        });

        const ws = window.XLSX.utils.aoa_to_sheet(data);
        const wb = window.XLSX.utils.book_new();
        const dates = resultDates();
        const range = !!dates;
        const iso = (dt) =>
            `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const sheetName = range
            ? `Schedule ${iso(dates[0])}`
            : `Schedule Month ${globalResult.month}`;
        window.XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // Add Individual Duty Summary to a second sheet
        let summaryHeaders = [];
        if (isShiftBased) {
            summaryHeaders =
                currentLang === 'th'
                    ? [
                          'ชื่อแพทย์',
                          'เวรเช้า (Morning)',
                          'เวรบ่าย (Afternoon)',
                          'เวรดึก (Night)',
                          'เวรวันทำการ (จ-ศ)',
                          'เวรวันหยุด (ส-อา, พิเศษ)',
                          'รวมทั้งหมด',
                      ]
                    : [
                          'Doctor Name',
                          'Morning',
                          'Afternoon',
                          'Night',
                          'Weekdays (Mon-Fri)',
                          'Holidays (Sat-Sun, Special)',
                          'Total Shifts',
                      ];
        } else {
            summaryHeaders =
                currentLang === 'th'
                    ? ['ชื่อแพทย์', 'เวรวันทำการ (จ-ศ)', 'เวรวันหยุด (ส-อา, พิเศษ)', 'รวมทั้งหมด']
                    : [
                          'Doctor Name',
                          'Weekdays (Mon-Fri)',
                          'Holidays (Sat-Sun, Special)',
                          'Total Shifts',
                      ];
        }
        const summaryData = [summaryHeaders];
        globalResult.summary.forEach((s) => {
            if (isShiftBased) {
                summaryData.push([
                    s.name,
                    s.morning || 0,
                    s.afternoon || 0,
                    s.night || 0,
                    s.workdays,
                    s.holidays,
                    s.total,
                ]);
            } else {
                summaryData.push([s.name, s.workdays, s.holidays, s.total]);
            }
        });
        const summaryWs = window.XLSX.utils.aoa_to_sheet(summaryData);
        window.XLSX.utils.book_append_sheet(
            wb,
            summaryWs,
            currentLang === 'th' ? 'สรุปจำนวนเวร' : 'Summary'
        );

        let displayYear = parseInt(globalResult.year);
        if (currentLang === 'th' && displayYear < 2500) displayYear += 543;
        if (currentLang === 'en' && displayYear > 2500) displayYear -= 543;

        window.XLSX.writeFile(
            wb,
            range
                ? `OnCall_${iso(dates[0])}_${iso(dates[dates.length - 1])}.xlsx`
                : `OnCall_Month_${globalResult.month}_Year_${displayYear}.xlsx`
        );
        showToast(
            currentLang === 'th'
                ? 'ดาวน์โหลดไฟล์ Excel สำเร็จ!'
                : 'Excel file downloaded successfully!'
        );
    } catch (e) {
        console.error(e);
        showToast(
            currentLang === 'th' ? 'เกิดข้อผิดพลาดในการสร้างไฟล์ Excel' : 'Error exporting Excel',
            true
        );
    }
};

// Calendar export (.ics): Apple Calendar opens the file directly; Google has no bulk-add URL,
// so we download the same file and open Google's Import page.
function renderCalendarScopeOptions(config) {
    const sel = document.getElementById('selectCalendarScope');
    if (!sel) return;
    const prev = sel.value;
    const t = translations[currentLang];
    const { groups, people } = listCalendarScopes(
        globalResult.doctors,
        config.doctorRoles,
        config.roleBased
    );
    const opt = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
    let html = opt('all', t.calendarScopeAll);
    if (groups.length) {
        html += `<optgroup label="${esc(t.calendarScopeGroup)}">${groups.map((g) => opt(`group:${g}`, g)).join('')}</optgroup>`;
    }
    html += `<optgroup label="${esc(t.calendarScopePerson)}">${people.map((p) => opt(`person:${p}`, p)).join('')}</optgroup>`;
    sel.innerHTML = html;
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

window.exportCalendar = function (target) {
    const t = translations[currentLang];
    if (!globalResult || globalResult.schedule.length === 0) {
        showToast(t.calendarNoData, true);
        return;
    }
    const config = resultConfig();
    const scope = parseCalendarScope(
        document.getElementById('selectCalendarScope')?.value || 'all'
    );
    const M = config.morningSlots || 0;
    const A = config.afternoonSlots || 0;
    const slotLabel = (i, docObj) => {
        if (config.isShiftBased) {
            return i < M ? t.shiftMorning : i < M + A ? t.shiftAfternoon : t.shiftNight;
        }
        return config.roleBased && docObj.role && docObj.role !== 'Default' ? docObj.role : '';
    };
    const events = collectDutyEvents(globalResult.schedule, globalResult.dates, scope, {
        doctorRoles: config.doctorRoles,
        slotLabel,
        titlePrefix: t.calendarEventPrefix,
        skipNames: [SHORTAGE_MARKER],
    });
    if (events.length === 0) {
        showToast(t.calendarNoEvents, true);
        return;
    }

    const scopeName =
        scope.type === 'all'
            ? t.calendarScopeAll
            : scope.type === 'group'
              ? scope.role
              : scope.name;
    const ics = buildICS(events, `${t.calendarName} – ${scopeName}`);
    // Blob URL, not data: URL. iOS Safari only offers "Add to Calendar" for a real text/calendar file.
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule-${scopeName.replace(/[\\/:*?"<>|\s]+/g, '_')}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000); // slow phones need the Blob for a while

    if (target === 'google') {
        // No 'noopener' feature string: it forces window.open to return null, which would hide a
        // blocked pop-up. Drop the opener by hand instead.
        const win = window.open('https://calendar.google.com/calendar/r/settings/export', '_blank');
        if (win) {
            win.opener = null;
            showToast(t.calendarGoogleHint);
        } else {
            showToast(t.calendarPopupBlocked, true, 10000);
        }
    } else {
        showToast(t.calendarAppleHint);
    }
};

window.handleCustomDateRangeChange = function () {
    if (!isCustomDateRange) return;
    const startStr = document.getElementById('inputStartDate').value;
    const endStr = document.getElementById('inputEndDate').value;
    if (startStr && endStr) {
        const sd = parseISODate(startStr);
        const ed = parseISODate(endStr);
        if (sd >= ed) {
            showToast(
                currentLang === 'th'
                    ? 'วันที่เริ่มต้นต้องน้อยกว่าวันที่สิ้นสุด'
                    : 'Start date must be before end date',
                true
            );
            return;
        }
        const diffDays = Math.round((ed - sd) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > 90) {
            showToast(
                currentLang === 'th'
                    ? 'ช่วงวันที่เกิน 90 วัน กรุณาตรวจสอบ'
                    : 'Range exceeds 90 days, please check',
                true
            );
            return;
        }

        return window.generateSchedule();
    }
};

// Explicitly attach all remaining entry points called by inline HTML to window object
window.addDoctor = addDoctor;
window.removeDoctor = removeDoctor;
window.addOffRow = addOffRow;
window.deleteOffRow = deleteOffRow;
window.updateOffRow = updateOffRow;
window.addExtraSlotRow = addExtraSlotRow;
window.deleteExtraSlot = deleteExtraSlot;
window.updateExtraSlot = updateExtraSlot;

// ====== FOCUS TRAP (Accessibility – Phase 3) ======
// Lightweight focus-trap utility (no external dependency needed for plain-script apps)
const FocusTrap = {
    _trap: null,
    _previouslyFocused: null,
    _focusableSelectors: [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(','),

    // One trap at a time. Escape and Tab are caught on the document so they work wherever focus is.
    // returnTo: element to refocus on close (Safari does not focus a button when it is clicked)
    activate(container, onClose, returnTo) {
        this.deactivate();
        this._previouslyFocused = returnTo || document.activeElement;
        this._trap = container;
        this._onClose = onClose;
        const focusable = container.querySelectorAll(this._focusableSelectors);
        if (focusable.length) focusable[0].focus();
        document.addEventListener('keydown', this._handleKeyDown);
    },

    // With a container, only releases that container's own trap
    deactivate(container) {
        if (container && container !== this._trap) return;
        document.removeEventListener('keydown', this._handleKeyDown);
        this._trap = null;
        this._onClose = null;
        if (this._previouslyFocused && this._previouslyFocused.focus) {
            this._previouslyFocused.focus();
        }
        this._previouslyFocused = null;
    },

    _handleKeyDown(e) {
        const trap = FocusTrap._trap;
        if (!trap) return;
        if (e.key === 'Escape') {
            if (FocusTrap._onClose) FocusTrap._onClose();
            return;
        }
        if (e.key !== 'Tab') return;
        const focusable = Array.from(trap.querySelectorAll(FocusTrap._focusableSelectors));
        if (!focusable.length) {
            e.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first || !trap.contains(document.activeElement)) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last || !trap.contains(document.activeElement)) {
                e.preventDefault();
                first.focus();
            }
        }
    },
};

window.openManualModal = function () {
    const modal = document.getElementById('manualModal');
    if (modal) {
        modal.removeAttribute('inert');
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100');
        const card = modal.querySelector('.relative');
        if (card) {
            card.classList.remove('scale-95');
            card.classList.add('scale-100');
        }
        // Activate focus trap
        const trapTarget = card || modal;
        FocusTrap.activate(trapTarget, window.closeManualModal);
    }
};

window.closeManualModal = function () {
    const modal = document.getElementById('manualModal');
    if (modal) {
        modal.setAttribute('inert', '');
        modal.classList.remove('opacity-100');
        modal.classList.add('opacity-0', 'pointer-events-none');
        const card = modal.querySelector('.relative');
        if (card) {
            card.classList.remove('scale-100');
            card.classList.add('scale-95');
        }
        // Deactivate focus trap and restore focus
        FocusTrap.deactivate(card || modal);
    }
};

// ====== CONFIG EXPORT & IMPORT ======
// The full saved-config object: data globals plus every input and checkbox.
function getCurrentConfig() {
    return {
        doctors: doctors,
        offData: offData,
        extraSlotsData: extraSlotsData,
        configVersion: 2,
        manualOverrides: manualOverrides,
        quota: quota,
        inputs: {
            inputMonth: document.getElementById('inputMonth')?.value || '',
            inputYear: document.getElementById('inputYear')?.value || '',
            inputStartDate: document.getElementById('inputStartDate')?.value || '',
            inputEndDate: document.getElementById('inputEndDate')?.value || '',
            inputDefaultSlots: document.getElementById('inputDefaultSlots')?.value || '',
            inputSpecialHols: document.getElementById('inputSpecialHols')?.value || '',
            inputNoDuty: document.getElementById('inputNoDuty')?.value || '',
            inputDoctorRoles: document.getElementById('inputDoctorRoles')?.value || '',
            inputDefaultRoleSlots: document.getElementById('inputDefaultRoleSlots')?.value || '',
            inputRoleQuotas: document.getElementById('inputRoleQuotas')?.value || '',
            inputSinglePoolQuota: document.getElementById('inputSinglePoolQuota')?.value || '',
            inputConflicts: document.getElementById('inputConflicts')?.value || '',
            inputSpecialDays: document.getElementById('inputSpecialDays')?.value || '',
            inputSpecialDocs: document.getElementById('inputSpecialDocs')?.value || '',
            inputSpecialStartDay: document.getElementById('inputSpecialStartDay')?.value || '1',
            inputOffDutyPeriod: document.getElementById('inputOffDutyPeriod')?.value || '1',
            inputMinNightShifts: document.getElementById('inputMinNightShifts')?.value || '0',
            lockConditionType: document.getElementById('lockConditionType')?.value || 'firstNDays',
            selectLockWeekday: document.getElementById('selectLockWeekday')?.value || '0',
            selectAlternateStrength:
                document.getElementById('selectAlternateStrength')?.value || 'medium',
            inputMorningSlots: document.getElementById('inputMorningSlots')?.value || '1',
            inputAfternoonSlots: document.getElementById('inputAfternoonSlots')?.value || '1',
            inputNightSlots: document.getElementById('inputNightSlots')?.value || '1',
        },
        checkboxes: {
            chkCustomDateRange: document.getElementById('chkCustomDateRange')?.checked || false,
            chkRoleBased: document.getElementById('chkRoleBased')?.checked || false,
            chkPreventLongGaps: document.getElementById('chkPreventLongGaps')?.checked || false,
            chkBalanceShifts: document.getElementById('chkBalanceShifts')?.checked || false,
            chkAllowBlankDays: document.getElementById('chkAllowBlankDays')?.checked || false,
            chkUseSpecialRule: document.getElementById('chkUseSpecialRule')?.checked || false,
            chkSoftAlternate: document.getElementById('chkSoftAlternate')?.checked ?? true,
            chkShiftBased: document.getElementById('chkShiftBased')?.checked || false,
            chkAllowExtraNightDoctor:
                document.getElementById('chkAllowExtraNightDoctor')?.checked ?? true,
        },
    };
}

window.exportConfigJSON = function () {
    const config = getCurrentConfig();

    const dataStr =
        'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(config, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute('href', dataStr);
    dlAnchorElem.setAttribute('download', 'schedule_config.json');
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();

    showToast(currentLang === 'th' ? 'ส่งออกการตั้งค่าสำเร็จ!' : 'Config exported successfully!');
};

// Validate and coerce an imported config. Pure: it never touches app state, so a bad file
// can be rejected before anything is assigned.
function sanitizeConfig(raw) {
    const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (!isObj(raw)) return { ok: false, error: 'config must be a JSON object' };
    for (const key of ['doctors', 'offData', 'extraSlotsData']) {
        if (raw[key] != null && !Array.isArray(raw[key]))
            return { ok: false, error: `${key} must be an array` };
    }
    for (const key of ['manualOverrides', 'inputs', 'checkboxes']) {
        if (raw[key] != null && !isObj(raw[key]))
            return { ok: false, error: `${key} must be an object` };
    }

    const scalar = (v) => (typeof v === 'string' || typeof v === 'number' ? v : '');
    // Keep integer ids, renumber missing or repeated ones
    const withIds = (rows) => {
        const clean = rows.filter(isObj);
        let next = 1 + clean.reduce((m, r) => (Number.isInteger(r.id) && r.id > m ? r.id : m), 0);
        const used = new Set();
        return clean.map((r) => {
            const id = Number.isInteger(r.id) && !used.has(r.id) ? r.id : next++;
            used.add(id);
            return { ...r, id };
        });
    };

    const config = { ...raw };
    // Only the keys getCurrentConfig emits (plus a legacy migration flag) may reach the DOM
    const emitted = getCurrentConfig();
    for (const [group, extra] of [
        ['inputs', []],
        ['checkboxes', ['chkPreventConsecutive']],
    ]) {
        if (raw[group] == null) continue;
        config[group] = {};
        [...Object.keys(emitted[group]), ...extra].forEach((k) => {
            if (!Object.hasOwn(raw[group], k)) return;
            const v = raw[group][k];
            if (group === 'checkboxes') config[group][k] = Boolean(v);
            else if (typeof v === 'string' || typeof v === 'number') config[group][k] = String(v);
        });
    }
    // Raw doctor name -> cleaned name, so every reference below can follow a rename
    const rename = new Map();
    if (raw.doctors != null) {
        config.doctors = [];
        raw.doctors.forEach((d) => {
            if (typeof d !== 'string' && typeof d !== 'number') return;
            const name = sanitizeName(d);
            if (!name) return;
            rename.set(String(d), name);
            if (!config.doctors.includes(name)) config.doctors.push(name);
        });
        if (raw.doctors.length > 0 && config.doctors.length === 0)
            return { ok: false, error: 'doctors list is empty' };
    }
    const known = (n) => raw.doctors == null || config.doctors.includes(n);
    if (raw.offData != null) {
        config.offData = withIds(raw.offData).map((r) => ({
            id: r.id,
            date: scalar(r.date),
            names:
                typeof r.names === 'string'
                    ? r.names
                          .split(',')
                          .map((n) => n.trim())
                          .map((n) => rename.get(n) ?? n)
                          .filter((n) => n && known(n))
                          .join(', ')
                    : '',
        }));
    }
    if (raw.extraSlotsData != null) {
        config.extraSlotsData = withIds(raw.extraSlotsData).map((r) => ({
            id: r.id,
            date: scalar(r.date),
            slots: scalar(r.slots),
        }));
    }
    if (raw.manualOverrides != null) {
        config.manualOverrides = {};
        Object.entries(raw.manualOverrides).forEach(([day, slots]) => {
            if (!/^\d+$/.test(day) || !isObj(slots)) return;
            const kept = {};
            Object.entries(slots).forEach(([slot, name]) => {
                if (!/^\d+$/.test(slot) || typeof name !== 'string') return;
                const cleaned = rename.get(name) ?? name;
                if (known(cleaned) || cleaned === SHORTAGE_MARKER || cleaned === '-')
                    kept[slot] = cleaned;
            });
            if (Object.keys(kept).length > 0) config.manualOverrides[day] = kept;
        });
    }
    for (const key of ['quota', 'roleQuota']) {
        if (raw[key] == null) continue;
        // Keys are role or doctor names; keep only finite numbers
        config[key] = {};
        if (isObj(raw[key])) {
            Object.entries(raw[key]).forEach(([k, v]) => {
                if (typeof v === 'number' && Number.isFinite(v))
                    config[key][rename.get(k) ?? k] = v;
            });
        }
    }
    // ponytail: the free-text inputs (inputDoctorRoles, inputConflicts, inputSpecialDocs) are not
    // rewritten on a rename; a name containing ':' is unparseable in their "A:R1" format anyway.
    return { ok: true, config };
}

// Write a (sanitized) config into state and the DOM. May throw part-way; callers restore.
function applyConfig(config) {
    if (config.doctors) doctors = config.doctors;
    if (config.offData) offData = config.offData;
    if (config.extraSlotsData) extraSlotsData = config.extraSlotsData;
    pendingOverrides = config.manualOverrides || {}; // adopted, with an undo reset, on commit

    if (config.quota) {
        quota = config.quota;
    } else if (config.roleQuota && !config.quota) {
        quota = config.roleQuota;
    } else {
        quota = {};
    }

    if (config.inputs) {
        Object.keys(config.inputs).forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = config.inputs[id];
        });
    }

    if (config.checkboxes) {
        Object.keys(config.checkboxes).forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.checked = config.checkboxes[id];
        });
    }

    // Set defaults for Lock Special Duty if missing
    const lockConditionEl = document.getElementById('lockConditionType');
    if (lockConditionEl && (!config.inputs || !Object.hasOwn(config.inputs, 'lockConditionType'))) {
        lockConditionEl.value = 'firstNDays';
    }
    const selectLockWeekdayEl = document.getElementById('selectLockWeekday');
    if (
        selectLockWeekdayEl &&
        (!config.inputs || !Object.hasOwn(config.inputs, 'selectLockWeekday'))
    ) {
        selectLockWeekdayEl.value = '0';
    }
    const specialStartDayEl = document.getElementById('inputSpecialStartDay');
    if (
        specialStartDayEl &&
        (!config.inputs || !Object.hasOwn(config.inputs, 'inputSpecialStartDay'))
    ) {
        specialStartDayEl.value = '1';
    }

    // Migration: old JSON with chkPreventConsecutive → inputOffDutyPeriod
    const offDutyPeriodEl = document.getElementById('inputOffDutyPeriod');
    if (
        offDutyPeriodEl &&
        (!config.inputs || !Object.hasOwn(config.inputs, 'inputOffDutyPeriod'))
    ) {
        if (config.checkboxes && Object.hasOwn(config.checkboxes, 'chkPreventConsecutive')) {
            offDutyPeriodEl.value = config.checkboxes.chkPreventConsecutive ? '1' : '0';
        } else {
            offDutyPeriodEl.value = '1';
        }
    }

    // Migrate old 1-based offDutyPeriod configs to the 0-based UI value
    const cfgVersion = Number(config.configVersion) || 1;
    if (
        cfgVersion < 2 &&
        offDutyPeriodEl &&
        config.inputs &&
        Object.hasOwn(config.inputs, 'inputOffDutyPeriod')
    ) {
        const oldVal = parseInt(config.inputs.inputOffDutyPeriod, 10);
        if (Number.isFinite(oldVal)) offDutyPeriodEl.value = String(Math.max(0, oldVal - 1));
    }

    const minShiftsEl = document.getElementById('inputMinNightShifts');
    if (minShiftsEl && (!config.inputs || !Object.hasOwn(config.inputs, 'inputMinNightShifts'))) {
        minShiftsEl.value = '0';
    }
    const allowExtraEl = document.getElementById('chkAllowExtraNightDoctor');
    if (
        allowExtraEl &&
        (!config.checkboxes || !Object.hasOwn(config.checkboxes, 'chkAllowExtraNightDoctor'))
    ) {
        allowExtraEl.checked = true;
    }

    // Set defaults for Soft Alternate if missing
    const chkSoftAlternateEl = document.getElementById('chkSoftAlternate');
    if (
        chkSoftAlternateEl &&
        (!config.checkboxes || !Object.hasOwn(config.checkboxes, 'chkSoftAlternate'))
    ) {
        chkSoftAlternateEl.checked = true;
    }
    const selectAlternateStrengthEl = document.getElementById('selectAlternateStrength');
    if (
        selectAlternateStrengthEl &&
        (!config.inputs || !Object.hasOwn(config.inputs, 'selectAlternateStrength'))
    ) {
        selectAlternateStrengthEl.value = 'medium';
    }
    // Sync visibility of Soft Alternate strength container
    const altStrengthContainer = document.getElementById('alternateStrengthContainer');
    if (altStrengthContainer && chkSoftAlternateEl) {
        if (chkSoftAlternateEl.checked) {
            altStrengthContainer.classList.remove('hidden');
        } else {
            altStrengthContainer.classList.add('hidden');
        }
    }

    // Set defaults for Shift-Based Mode if missing
    const chkShiftBasedEl = document.getElementById('chkShiftBased');
    if (
        chkShiftBasedEl &&
        (!config.checkboxes || !Object.hasOwn(config.checkboxes, 'chkShiftBased'))
    ) {
        chkShiftBasedEl.checked = false;
    }
    const inputMorningSlotsEl = document.getElementById('inputMorningSlots');
    if (
        inputMorningSlotsEl &&
        (!config.inputs || !Object.hasOwn(config.inputs, 'inputMorningSlots'))
    ) {
        inputMorningSlotsEl.value = '1';
    }
    const inputAfternoonSlotsEl = document.getElementById('inputAfternoonSlots');
    if (
        inputAfternoonSlotsEl &&
        (!config.inputs || !Object.hasOwn(config.inputs, 'inputAfternoonSlots'))
    ) {
        inputAfternoonSlotsEl.value = '1';
    }
    const inputNightSlotsEl = document.getElementById('inputNightSlots');
    if (inputNightSlotsEl && (!config.inputs || !Object.hasOwn(config.inputs, 'inputNightSlots'))) {
        inputNightSlotsEl.value = '1';
    }

    // Explicitly trigger the custom date range toggle logic
    const chkCustom = document.getElementById('chkCustomDateRange');
    if (chkCustom) {
        chkCustom.dispatchEvent(new Event('change'));
    }

    // Sync UI components
    syncDoctorsToInput();
    if (typeof syncDoctorRolesInput === 'function') syncDoctorRolesInput();
    renderDoctorTags();
    if (typeof initStructuredInputs === 'function') initStructuredInputs();
    renderOffRequests();
    renderExtraSlots();
    renderSpecialDocsCheckboxList();

    toggleRoleBasedUI();
    toggleShiftBasedUI();
    toggleSpecialRuleUI();
}

window.importConfigJSON = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const snapshot = JSON.parse(JSON.stringify(getCurrentConfig()));
        const savedPending = pendingOverrides;
        let applied = false;
        try {
            const checked = sanitizeConfig(JSON.parse(e.target.result));
            if (!checked.ok) {
                console.error('Invalid config:', checked.error);
                showToast(translations[currentLang].importInvalid, true);
                return;
            }
            const config = checked.config;

            try {
                applyConfig(config);
                applied = true;
            } catch (error) {
                // A half-imported app is worse than the old one: put everything back
                try {
                    applyConfig(snapshot);
                } catch (restoreError) {
                    console.error('Rollback failed:', restoreError);
                }
                pendingOverrides = savedPending; // applyConfig set it
                throw error;
            }

            showToast(
                currentLang === 'th' ? 'นำเข้าการตั้งค่าสำเร็จ!' : 'Config imported successfully!'
            );
        } catch (error) {
            console.error('Error parsing JSON:', error);
            showToast(
                currentLang === 'th'
                    ? 'เกิดข้อผิดพลาดในการอ่านไฟล์ JSON'
                    : 'Error reading JSON file',
                true
            );
        } finally {
            const importInput = document.getElementById('importConfigFile');
            if (importInput) importInput.value = ''; // Reset file input
        }
        if (applied && window.initialized) generateSchedule(); // Re-calculate
    };
    reader.readAsText(file);
};

// Escape closes an open cell/off-request dropdown and returns focus to its button
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = [
        ...document.querySelectorAll(
            '[id^="dropdown-"], [id^="celldropdown-"], [id^="tablecelldropdown-"]'
        ),
    ].filter((dd) => !dd.classList.contains('hidden'));
    open.forEach((dd) => dd.classList.add('hidden'));
    const btn = open[0] && open[0].previousElementSibling;
    if (btn && btn.focus) btn.focus();
});

// --- UI Utility: Drag and Drop & Undo Stack ---
const undoStack = [];

window.pushToUndoStack = function () {
    undoStack.push(JSON.parse(JSON.stringify(manualOverrides)));
    if (undoStack.length > 20) undoStack.shift();
    syncUndoBtn();
};

// Show the Undo button only while there is history
function syncUndoBtn() {
    const b = document.getElementById('btnUndo');
    if (!b) return;
    if (undoStack.length > 0) b.classList.remove('hidden');
    else b.classList.add('hidden');
}

window.undoLastAction = function () {
    if (undoStack.length > 0) {
        manualOverrides = undoStack.pop();
        // A doctor removed since the snapshot must not come back as a ghost
        pruneOverrides(resultCtx().doctors);
        const config = resultConfig();
        applyManualOverrides(config);
        renderTableView(config);
        renderCalendarView(config);

        if (typeof renderPersonCentricView === 'function') {
            renderPersonCentricView(config);
        }

        recalculateCounts(config);
        renderSummaryTable(config);
        updateStatsDashboard();
        showToast(currentLang === 'th' ? 'เลิกทำ (Undo) สำเร็จ' : 'Undo successful');
    } else {
        showToast(
            currentLang === 'th' ? 'ไม่มีการกระทำที่สามารถเลิกทำได้' : 'Nothing to undo',
            true
        );
    }
};

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        // Inside a text field Ctrl+Z belongs to the field's own undo
        const t = e.target;
        if (
            t &&
            t.closest &&
            t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
        )
            return;
        e.preventDefault();
        window.undoLastAction();
    }
});

window.handleDragStart = function (e, day, slotIndex, docIndex) {
    if (docIndex < 0) return;
    const docName = resultCtx().doctors[docIndex];
    if (!docName) return;
    e.dataTransfer.setData('text/plain', JSON.stringify({ day, slotIndex, docName }));
    e.dataTransfer.effectAllowed = 'move';
};

window.handleDragOver = function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

window.handleDrop = function (e, targetDay, targetSlotIndex, targetDocIndex) {
    e.preventDefault();
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (!data) return;
        const srcDay = data.day;
        const srcSlot = data.slotIndex;
        const srcDoc = data.docName;

        if (srcDay === targetDay && srcSlot === targetSlotIndex) return;

        window.pushToUndoStack();
        window.isDragAndDropOperation = true;

        const srcDocIdx = resultCtx().doctors.indexOf(srcDoc);
        let targetDocIdx = targetDocIndex;

        // Execute swap manually
        window.updateDoctorAssignment(srcDay, srcSlot, targetDocIdx);
        window.updateDoctorAssignment(targetDay, targetSlotIndex, srcDocIdx);

        window.isDragAndDropOperation = false;

        // Final refresh to ensure counts are fully up to date
        const config = resultConfig();
        renderTableView(config);
        renderCalendarView(config);

        showToast(
            currentLang === 'th' ? 'สลับเวรด้วยการลากวางสำเร็จ' : 'Drag & Drop swap successful'
        );
    } catch (err) {
        console.error('Drag and drop failed:', err);
    } finally {
        window.isDragAndDropOperation = false;
    }
};

window.handlePersonDrop = function (e, targetDay, targetDocIndex, targetSlotIndex = -1) {
    e.preventDefault();
    e.stopPropagation();
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (!data) return;
        const srcDay = data.day;
        const srcSlot = data.slotIndex;
        const srcDoc = data.docName;
        const { doctors } = resultCtx();
        const srcDocIdx = doctors.indexOf(srcDoc);

        if (srcDay === targetDay) {
            if (srcDocIdx === targetDocIndex) return; // Same doc

            window.pushToUndoStack();
            window.isDragAndDropOperation = true;

            if (targetSlotIndex !== -1 && targetSlotIndex !== srcSlot) {
                // Swap the two slots on the same day
                window.updateDoctorAssignment(srcDay, srcSlot, targetDocIndex);
                window.updateDoctorAssignment(srcDay, targetSlotIndex, srcDocIdx);
            } else {
                // Just reassign the source slot to the new doctor
                window.updateDoctorAssignment(srcDay, srcSlot, targetDocIndex);
            }

            window.isDragAndDropOperation = false;

            const config = resultConfig();
            renderTableView(config);
            renderCalendarView(config);
            if (typeof renderPersonCentricView === 'function') renderPersonCentricView(config);

            showToast(currentLang === 'th' ? 'เปลี่ยนผู้เข้าเวรสำเร็จ' : 'Reassignment successful');
        } else {
            // Across day swap
            if (targetSlotIndex === -1) {
                // Dropped on cell. If the doctor has a shift, swap with their first shift.
                const targetDayRow = globalResult.schedule[targetDay - 1];
                let foundSlot = -1;

                // 1. Try to swap with target doctor's shift
                for (let i = 0; i < targetDayRow.selectedDocs.length; i++) {
                    if (
                        targetDayRow.selectedDocs[i] &&
                        targetDayRow.selectedDocs[i].name === doctors[targetDocIndex]
                    ) {
                        foundSlot = i;
                        break;
                    }
                }

                // 2. Try to swap with a shortage slot
                if (foundSlot === -1) {
                    for (let i = 0; i < targetDayRow.selectedDocs.length; i++) {
                        if (
                            targetDayRow.selectedDocs[i] &&
                            targetDayRow.selectedDocs[i].name === SHORTAGE_MARKER
                        ) {
                            foundSlot = i;
                            break;
                        }
                    }
                }

                if (foundSlot !== -1) {
                    targetSlotIndex = foundSlot;
                } else {
                    showToast(
                        currentLang === 'th'
                            ? 'ไม่สามารถย้ายได้ เนื่องจากไม่มีเวรว่างให้สลับในวันเป้าหมาย'
                            : 'Cannot move shift. Target day has no empty slots to swap with.',
                        'error'
                    );
                    return;
                }
            }

            window.pushToUndoStack();
            window.isDragAndDropOperation = true;

            window.updateDoctorAssignment(srcDay, srcSlot, targetDocIndex);
            window.updateDoctorAssignment(targetDay, targetSlotIndex, srcDocIdx);

            window.isDragAndDropOperation = false;

            const config = resultConfig();
            renderTableView(config);
            renderCalendarView(config);
            if (typeof renderPersonCentricView === 'function') renderPersonCentricView(config);

            showToast(currentLang === 'th' ? 'สลับเวรข้ามวันสำเร็จ' : 'Cross-day swap successful');
        }
    } catch (err) {
        console.error('Person drag and drop failed:', err);
    } finally {
        window.isDragAndDropOperation = false;
    }
};

// Render Person-Centric View
function renderPersonCentricView(config) {
    const { doctors, dates, isCustomDateRange } = globalResult;
    const head = document.getElementById('personViewHeader');
    const body = document.getElementById('personViewBody');
    if (!head || !body) return;

    let headHtml = `<tr class="text-ink-2 dark:text-slate-400 text-[11px]"><th class="py-2 px-4 border-b border-r border-rule dark:border-rule-dark font-medium sticky left-0 bg-white dark:bg-sheet-dark z-10 min-w-[120px]">${translations[currentLang].tableHeaderDoctors || 'Doctor'}</th>`;
    for (let d = 1; d <= config.numDays; d++) {
        const dayRow = globalResult.schedule[d - 1];
        const dayName = dayRow ? dayRow.dayName.substring(0, 2) : '';
        const isHol = dayRow ? dayRow.isHoliday : false;
        let dayClass = isHol
            ? 'text-signal dark:text-signal-bright font-medium'
            : 'text-ink-2 dark:text-slate-400';

        let displayDateNum = d;
        let monthLabel = '';
        let borderClass = 'border-rule dark:border-rule-dark';

        if (isCustomDateRange && dates[d - 1]) {
            const dateObj = dates[d - 1];
            displayDateNum = dateObj.getDate();
            if (displayDateNum === 1 || d === 1) {
                monthLabel = ` ${monthName(dateObj)}`;
            }
            if (displayDateNum === 1 && d > 1) {
                borderClass = 'border-l-2 border-duty/50 dark:border-duty-bright/50 ' + borderClass;
            }
        }

        headHtml += `<th class="py-2 px-1 border-b ${borderClass} text-center w-8 min-w-[32px] ${dayClass}"><div class="text-[10px] font-medium">${dayName}</div><div class="text-[11px] font-semibold whitespace-nowrap">${displayDateNum}${monthLabel}</div></th>`;
    }
    headHtml += `</tr>`;
    head.innerHTML = headHtml;

    let bodyHtml = '';

    const displayDocs = [...doctors];
    if (
        globalResult.schedule.some((d) =>
            d.selectedDocs.some((s) => s && s.name === SHORTAGE_MARKER)
        )
    ) {
        displayDocs.push(SHORTAGE_MARKER);
    }

    displayDocs.forEach((doc, idx) => {
        let isShortage = doc === SHORTAGE_MARKER;
        let docName = isShortage ? translations[currentLang].shortageSlot || 'Shortage' : doc;

        let badgeHtml = '';
        if (config.roleBased && !isShortage) {
            const docRole = config.doctorRoles[doc] || 'Default';
            if (docRole !== 'Default') {
                const badgeColor = getRoleBadgeColorClass(docRole);
                badgeHtml = ` <span class="ml-1.5 px-1.5 py-0.5 text-[10px] rounded font-bold border ${badgeColor}">${esc(docRole)}</span>`;
            }
        }

        let rowClass = idx % 2 === 0 ? 'bg-white dark:bg-sheet-dark' : 'bg-paper dark:bg-night';
        bodyHtml += `<tr class="${rowClass} hover:bg-duty/5 dark:hover:bg-duty-bright/5 transition-colors">`;
        bodyHtml += `<td class="py-2 px-4 border-b border-r border-rule dark:border-rule-dark font-semibold sticky left-0 z-10 min-w-[120px] ${rowClass} ${isShortage ? 'text-signal dark:text-signal-bright' : 'text-ink dark:text-slate-200'}">${esc(docName)}${badgeHtml}</td>`;

        for (let d = 1; d <= config.numDays; d++) {
            const dayRow = globalResult.schedule[d - 1];

            let borderClass = 'border-rule dark:border-rule-dark';
            if (isCustomDateRange && dates[d - 1]) {
                if (dates[d - 1].getDate() === 1 && d > 1) {
                    borderClass =
                        'border-l-2 border-duty/50 dark:border-duty-bright/50 ' + borderClass;
                }
            }

            if (!dayRow || dayRow.isNoDuty) {
                bodyHtml += `<td class="border-b ${borderClass} bg-paper dark:bg-night"></td>`;
                continue;
            }

            let slotIndices = [];
            dayRow.selectedDocs.forEach((sd, sIdx) => {
                if (sd && sd.name === doc) slotIndices.push(sIdx + 1);
            });

            let docIndexToPass = isShortage ? -1 : doctors.indexOf(doc);

            if (slotIndices.length > 0) {
                let bgClass = 'bg-duty/10 dark:bg-duty-bright/15 text-duty dark:text-duty-bright';
                if (isShortage) {
                    bgClass =
                        'bg-signal/10 dark:bg-signal-bright/15 text-signal dark:text-signal-bright';
                }

                let badgesHtml = slotIndices
                    .map((sIdx) => {
                        let label = sIdx;
                        if (config.isShiftBased) {
                            const idx = sIdx - 1;
                            const M = config.morningSlots || 0;
                            const A = config.afternoonSlots || 0;
                            const N = config.nightSlots || 0;
                            if (idx < M) {
                                label = 'M';
                            } else if (idx < M + A) {
                                label = 'A';
                            } else {
                                label = 'N';
                            }
                        }
                        return `<div draggable="true" ondragstart="handleDragStart(event, ${d}, ${sIdx - 1}, ${docIndexToPass})" ondrop="handlePersonDrop(event, ${d}, ${docIndexToPass}, ${sIdx - 1})" class="rounded w-full text-[10px] font-bold flex items-center justify-center py-1 cursor-grab active:cursor-grabbing mb-0.5 last:mb-0 ${bgClass}">${label}</div>`;
                    })
                    .join('');

                bodyHtml += `<td class="border-b ${borderClass} p-0.5 text-center align-top" ondragover="handleDragOver(event)" ondrop="handlePersonDrop(event, ${d}, ${docIndexToPass})">${badgesHtml}</td>`;
            } else {
                bodyHtml += `<td class="border-b ${borderClass}" ondragover="handleDragOver(event)" ondrop="handlePersonDrop(event, ${d}, ${docIndexToPass})"></td>`;
            }
        }
        bodyHtml += `</tr>`;
    });
    body.innerHTML = bodyHtml;
}
