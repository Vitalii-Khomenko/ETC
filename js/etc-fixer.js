const MAX_REPLACEMENTS = 10000;
const MAX_START_NUMBER_DIGITS = 32;
const MAX_NUMBER_STEP = 1000000;
const UNASSIGNED_MACHINE_KEY = "__unassigned__";
const UNASSIGNED_SECTION_KEY = "__unassigned_section__";

function parseAttributes(tag) {
    const attrs = {};
    const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
    let match;
    while ((match = attrRe.exec(tag)) !== null) {
        attrs[match[1]] = match[2];
    }
    return attrs;
}

function replaceAttribute(tag, attrName, value) {
    const escaped = attrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(\\b${escaped}\\s*=\\s*")([^"]*)(")`);
    if (!re.test(tag)) return tag;
    return tag.replace(re, `$1${value}$3`);
}

function incrementDigitString(startValue, offset, step = 1) {
    const raw = String(startValue || "").trim();
    if (!/^\d+$/.test(raw)) return null;
    const width = raw.length;
    const next = BigInt(raw) + BigInt(offset) * BigInt(step);
    if (next < 0n) return null;
    const text = next.toString();
    return text.length < width ? text.padStart(width, "0") : text;
}

function isAPlaceholder(value) {
    return String(value ?? "").trim().toLowerCase() === "a";
}

function hasAPlaceholder(attrs) {
    return isAPlaceholder(attrs.id) || isAPlaceholder(attrs.txt);
}

function parseStrictNonNegativeInteger(value) {
    const raw = String(value ?? "").trim();
    if (!/^\d+$/.test(raw)) return null;
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed)) return null;
    return parsed;
}

function parseStrictPositiveInteger(value) {
    const parsed = parseStrictNonNegativeInteger(value);
    if (parsed === null || parsed < 1) return null;
    return parsed;
}

function makeMachineKey(attrs, sequence) {
    if (!attrs) return UNASSIGNED_MACHINE_KEY;
    const id = attrs.id || "";
    const txt = attrs.txt || "";
    const dbno = attrs.dbno || "";
    return `${sequence}:${dbno}:${id}:${txt}`;
}

function makeMachineInfo(attrs, start, sequence = 0) {
    if (!attrs) {
        return {
            key: UNASSIGNED_MACHINE_KEY,
            dbno: "",
            id: "Unassigned",
            txt: "Equipment outside BUILDING",
            start: -1
        };
    }
    return {
        key: makeMachineKey(attrs, sequence),
        dbno: attrs.dbno || "",
        id: attrs.id || "",
        txt: attrs.txt || "",
        start
    };
}

function makeSectionKey(attrs, sequence, machine) {
    if (!attrs) return `${machine.key}:${UNASSIGNED_SECTION_KEY}`;
    const id = attrs.id || "";
    const txt = attrs.txt || "";
    const dbno = attrs.dbno || "";
    return `${machine.key}:${sequence}:${dbno}:${id}:${txt}`;
}

function makeSectionInfo(attrs, start, sequence, machine) {
    if (!attrs) {
        return {
            key: makeSectionKey(null, sequence, machine),
            dbno: "",
            id: "No CIRCUIT",
            txt: "Equipment outside CIRCUIT",
            start,
            machineKey: machine.key
        };
    }
    return {
        key: makeSectionKey(attrs, sequence, machine),
        dbno: attrs.dbno || "",
        id: attrs.id || "",
        txt: attrs.txt || "",
        start,
        machineKey: machine.key
    };
}

function getMachineTitle(machine) {
    if (!machine) return "Unassigned";
    const parts = [];
    if (machine.id) parts.push(machine.id);
    if (machine.txt && machine.txt !== machine.id) parts.push(machine.txt);
    if (machine.dbno) parts.push(`dbno ${machine.dbno}`);
    return parts.length > 0 ? parts.join(" | ") : "Unnamed BUILDING";
}

function getSectionTitle(section) {
    if (!section) return "No CIRCUIT";
    const parts = [];
    if (section.id) parts.push(section.id);
    if (section.txt && section.txt !== section.id) parts.push(section.txt);
    if (section.dbno) parts.push(`dbno ${section.dbno}`);
    return parts.length > 0 ? parts.join(" | ") : "Unnamed CIRCUIT";
}

function getMachineSectionTitle(machine, section) {
    return `${getMachineTitle(machine)} | ${getSectionTitle(section)}`;
}

function readSettings(rawSettings) {
    const mode = rawSettings.mode === "batch" ? "batch" : "single";
    const useDbnoStart = mode === "single" || rawSettings.useDbnoStart === true;
    const startDbno = useDbnoStart ? parseStrictNonNegativeInteger(rawSettings.startDbno) : null;
    const quantity = mode === "batch" ? parseStrictPositiveInteger(rawSettings.quantity) : 1;
    const numberStep = mode === "batch" ? parseStrictPositiveInteger(rawSettings.numberStep) : 1;
    const startNumber = String(rawSettings.startNumber || "").trim();

    const errors = [];
    if (useDbnoStart && startDbno === null) errors.push("dbno must be a non-negative whole number.");
    if (!/^\d+$/.test(startNumber)) errors.push("Start number must contain digits only.");
    if (startNumber.length > MAX_START_NUMBER_DIGITS) errors.push(`Start number must be at most ${MAX_START_NUMBER_DIGITS} digits.`);
    if (quantity === null) errors.push("Quantity must be a positive whole number.");
    if (quantity !== null && quantity > MAX_REPLACEMENTS) errors.push(`Quantity must not exceed ${MAX_REPLACEMENTS}.`);
    if (numberStep === null) errors.push("Number step must be a positive whole number.");
    if (numberStep !== null && numberStep > MAX_NUMBER_STEP) errors.push(`Number step must not exceed ${MAX_NUMBER_STEP}.`);

    return {
        mode,
        useDbnoStart,
        startDbno,
        startNumber,
        quantity,
        numberStep,
        onlyA: rawSettings.onlyA !== false,
        onlyMesspunkt: rawSettings.onlyMesspunkt !== false,
        errors
    };
}

function getEquipmentStats(text) {
    const tags = String(text || "").match(/<ELECTRICALEQUIPMENT\b[^>]*>/g) || [];
    let messpunkt = 0;
    let placeholders = 0;
    let messpunktPlaceholders = 0;
    for (const tag of tags) {
        const attrs = parseAttributes(tag);
        if (attrs.type === "Messpunkt") messpunkt++;
        if (hasAPlaceholder(attrs)) {
            placeholders++;
            if (attrs.type === "Messpunkt") messpunktPlaceholders++;
        }
    }
    return {
        total: tags.length,
        messpunkt,
        placeholders,
        messpunktPlaceholders
    };
}

function scanEquipment(text) {
    const items = [];
    const machineMap = new Map();
    const sectionMap = new Map();
    const machineStack = [];
    const sectionStack = [];
    const tokenRe = /<\/(?:BUILDING|CIRCUIT)\s*>|<(?:BUILDING|CIRCUIT)\b[^>]*>|<ELECTRICALEQUIPMENT\b[^>]*>/g;
    let machineSequence = 0;
    let sectionSequence = 0;
    let match;

    while ((match = tokenRe.exec(String(text || ""))) !== null) {
        const token = match[0];
        if (/^<BUILDING\b/.test(token)) {
            const machine = makeMachineInfo(parseAttributes(token), match.index, machineSequence);
            machineSequence++;
            machineStack.push(machine);
            if (!machineMap.has(machine.key)) {
                machineMap.set(machine.key, {
                    machine,
                    total: 0,
                    messpunkt: 0,
                    placeholders: 0,
                    messpunktPlaceholders: 0,
                    candidates: 0
                });
            }
            continue;
        }

        if (/^<CIRCUIT\b/.test(token)) {
            const machine = machineStack.length > 0 ? machineStack[machineStack.length - 1] : makeMachineInfo(null, -1);
            const section = makeSectionInfo(parseAttributes(token), match.index, sectionSequence, machine);
            sectionSequence++;
            if (!sectionMap.has(section.key)) {
                sectionMap.set(section.key, {
                    machine,
                    section,
                    total: 0,
                    messpunkt: 0,
                    placeholders: 0,
                    messpunktPlaceholders: 0,
                    candidates: 0
                });
            }
            if (!/\/\s*>$/.test(token)) sectionStack.push(section);
            continue;
        }

        if (/^<\/BUILDING/.test(token)) {
            const closedMachine = machineStack.pop();
            if (closedMachine) {
                while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].machineKey === closedMachine.key) {
                    sectionStack.pop();
                }
            }
            continue;
        }

        if (/^<\/CIRCUIT/.test(token)) {
            sectionStack.pop();
            continue;
        }

        const machine = machineStack.length > 0 ? machineStack[machineStack.length - 1] : makeMachineInfo(null, -1);
        const section = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1] : makeSectionInfo(null, machine.start, 0, machine);
        if (!machineMap.has(machine.key)) {
            machineMap.set(machine.key, {
                machine,
                total: 0,
                messpunkt: 0,
                placeholders: 0,
                messpunktPlaceholders: 0,
                candidates: 0
            });
        }
        if (!sectionMap.has(section.key)) {
            sectionMap.set(section.key, {
                machine,
                section,
                total: 0,
                messpunkt: 0,
                placeholders: 0,
                messpunktPlaceholders: 0,
                candidates: 0
            });
        }

        const attrs = parseAttributes(token);
        const machineSummary = machineMap.get(machine.key);
        const sectionSummary = sectionMap.get(section.key);
        machineSummary.total++;
        sectionSummary.total++;
        if (attrs.type === "Messpunkt") {
            machineSummary.messpunkt++;
            sectionSummary.messpunkt++;
        }
        if (hasAPlaceholder(attrs)) {
            machineSummary.placeholders++;
            sectionSummary.placeholders++;
            if (attrs.type === "Messpunkt") {
                machineSummary.messpunktPlaceholders++;
                sectionSummary.messpunktPlaceholders++;
            }
        }

        items.push({
            start: match.index,
            end: match.index + token.length,
            tag: token,
            attrs,
            machine,
            section
        });
    }

    return {
        items,
        machines: Array.from(machineMap.values()).sort((left, right) => left.machine.start - right.machine.start),
        sections: Array.from(sectionMap.values()).sort((left, right) => left.section.start - right.section.start)
    };
}

function getMachineSummaries(text, rawSettings = {}) {
    const settings = {
        mode: "batch",
        useDbnoStart: false,
        onlyA: rawSettings.onlyA !== false,
        onlyMesspunkt: rawSettings.onlyMesspunkt !== false
    };
    const scan = scanEquipment(text);
    const summaries = new Map(scan.machines.map(summary => [summary.machine.key, {
        ...summary,
        candidates: 0
    }]));

    for (const item of scan.items) {
        const candidate = shouldConsiderTag(item.attrs, settings);
        if (candidate.ok) {
            const summary = summaries.get(item.machine.key);
            if (summary) summary.candidates++;
        }
    }

    return Array.from(summaries.values());
}

function getMachineSectionSummaries(text, rawSettings = {}) {
    const settings = {
        mode: "batch",
        useDbnoStart: false,
        onlyA: rawSettings.onlyA !== false,
        onlyMesspunkt: rawSettings.onlyMesspunkt !== false
    };
    const scan = scanEquipment(text);
    const summaries = new Map(scan.sections.map(summary => [summary.section.key, {
        ...summary,
        candidates: 0
    }]));

    for (const item of scan.items) {
        const candidate = shouldConsiderTag(item.attrs, settings);
        if (candidate.ok) {
            const summary = summaries.get(item.section.key);
            if (summary) summary.candidates++;
        }
    }

    return Array.from(summaries.values());
}

function getEquipmentDisplayValue(attrs) {
    const id = attrs.id || "";
    const txt = attrs.txt || "";
    if (id && txt && id === txt) return id;
    if (id && txt) return `${id} / ${txt}`;
    return id || txt || "-";
}

function getMachineDiagramData(text, rawSettings = {}) {
    const onlyMesspunkt = rawSettings.onlyMesspunkt !== false;
    const settings = {
        mode: "batch",
        useDbnoStart: false,
        onlyA: rawSettings.onlyA !== false,
        onlyMesspunkt
    };
    const scan = scanEquipment(text);
    const groups = new Map(scan.machines.map(summary => [summary.machine.key, {
        machine: summary.machine,
        totalEquipment: summary.total,
        messpunkt: summary.messpunkt,
        placeholders: summary.placeholders,
        candidateCount: 0,
        sections: [],
        equipment: []
    }]));
    const sectionGroups = new Map();

    for (const sectionSummary of scan.sections) {
        const group = groups.get(sectionSummary.machine.key);
        if (!group) continue;
        const sectionGroup = {
            section: sectionSummary.section,
            totalEquipment: sectionSummary.total,
            messpunkt: sectionSummary.messpunkt,
            placeholders: sectionSummary.placeholders,
            candidateCount: 0,
            equipment: []
        };
        group.sections.push(sectionGroup);
        sectionGroups.set(sectionSummary.section.key, sectionGroup);
    }

    for (const item of scan.items) {
        if (onlyMesspunkt && item.attrs.type !== "Messpunkt") continue;
        const group = groups.get(item.machine.key);
        if (!group) continue;
        const sectionGroup = sectionGroups.get(item.section.key);
        const candidate = shouldConsiderTag(item.attrs, settings);
        const isCandidate = candidate.ok;
        const isPlaceholder = hasAPlaceholder(item.attrs);
        if (isCandidate) {
            group.candidateCount++;
            if (sectionGroup) sectionGroup.candidateCount++;
        }
        const equipment = {
            dbno: item.attrs.dbno || "",
            id: item.attrs.id || "",
            txt: item.attrs.txt || "",
            type: item.attrs.type || "",
            displayValue: getEquipmentDisplayValue(item.attrs),
            isPlaceholder,
            isCandidate
        };
        group.equipment.push(equipment);
        if (sectionGroup) sectionGroup.equipment.push(equipment);
    }

    const machines = Array.from(groups.values());
    return {
        machines,
        totals: {
            machines: machines.length,
            shownEquipment: machines.reduce((sum, group) => sum + group.equipment.length, 0),
            candidates: machines.reduce((sum, group) => sum + group.candidateCount, 0),
            placeholders: machines.reduce((sum, group) => sum + group.equipment.filter(item => item.isPlaceholder).length, 0)
        }
    };
}

function shouldConsiderTag(attrs, settings) {
    if (settings.onlyMesspunkt && attrs.type !== "Messpunkt") {
        return { ok: false, reason: "not Messpunkt" };
    }
    if (attrs.id === undefined || attrs.txt === undefined) {
        return { ok: false, reason: "missing id/txt" };
    }
    if (settings.onlyA && !hasAPlaceholder(attrs)) {
        return { ok: false, reason: "id/txt has no A placeholder" };
    }
    if (settings.useDbnoStart && attrs.dbno === undefined) {
        return { ok: false, reason: "missing dbno" };
    }

    const dbno = attrs.dbno === undefined ? null : parseStrictNonNegativeInteger(attrs.dbno);
    if (settings.useDbnoStart && dbno === null) {
        return { ok: false, reason: "dbno is not a whole number" };
    }

    if (settings.mode === "single" && dbno !== settings.startDbno) {
        return { ok: false, reason: "different dbno" };
    }
    if (settings.mode === "batch" && settings.useDbnoStart && dbno < settings.startDbno) {
        return { ok: false, reason: "before start" };
    }
    return { ok: true, dbno };
}

function buildPlan(text, rawSettings) {
    const settings = readSettings(rawSettings);
    if (settings.errors.length > 0) {
        return { settings, rows: [], replacements: [], warnings: [], errors: settings.errors };
    }

    const rows = [];
    const replacements = [];
    const warnings = [];
    const tagRe = /<ELECTRICALEQUIPMENT\b[^>]*>/g;
    let match;
    let accepted = 0;

    while ((match = tagRe.exec(String(text || ""))) !== null) {
        if (settings.mode === "batch" && accepted >= settings.quantity) break;

        const tag = match[0];
        const attrs = parseAttributes(tag);
        const candidate = shouldConsiderTag(attrs, settings);
        if (!candidate.ok) continue;

        const newValue = incrementDigitString(settings.startNumber, accepted, settings.numberStep);
        const row = {
            dbno: attrs.dbno || "",
            oldId: attrs.id || "",
            oldTxt: attrs.txt || "",
            newValue,
            status: "will be replaced",
            ok: true
        };
        rows.push(row);

        let nextTag = replaceAttribute(tag, "id", newValue);
        nextTag = replaceAttribute(nextTag, "txt", newValue);
        replacements.push({
            start: match.index,
            end: match.index + tag.length,
            oldTag: tag,
            newTag: nextTag,
            row
        });
        accepted++;
    }

    if (settings.mode === "batch" && replacements.length > 0 && replacements.length < settings.quantity) {
        warnings.push(`Only ${replacements.length} matching equipment tags were found for the requested quantity ${settings.quantity}.`);
    }

    if (rows.length === 0) {
        rows.push({
            dbno: "-",
            oldId: "-",
            oldTxt: "-",
            newValue: "-",
            status: "no matches",
            ok: false
        });
    }

    return { settings, rows, replacements, warnings, errors: [] };
}

function readMachineSettings(rawSettings = {}) {
    const onlyA = rawSettings.onlyA !== false;
    const onlyMesspunkt = rawSettings.onlyMesspunkt !== false;
    const ranges = Array.isArray(rawSettings.machineRanges) ? rawSettings.machineRanges : [];
    const errors = [];
    const machineRanges = [];

    for (const range of ranges) {
        if (!range || range.enabled === false) continue;
        const key = String(range.machineKey || "");
        const sectionKey = String(range.sectionKey || "");
        const startNumber = String(range.startNumber || "").trim();
        const numberStep = parseStrictPositiveInteger(range.numberStep);
        const limitText = range.limit === undefined || range.limit === null ? "" : String(range.limit).trim();
        const limit = limitText === "" ? null : parseStrictPositiveInteger(limitText);
        const rangeIndex = parseStrictNonNegativeInteger(range.rangeIndex);
        const machineLabel = String(range.machineLabel || key);
        const sectionLabel = String(range.sectionLabel || sectionKey || "All sections");
        const rangeLabel = String(range.rangeLabel || `Group ${rangeIndex === null ? machineRanges.length + 1 : rangeIndex + 1}`);

        if (!key) errors.push("Machine range is missing a machine key.");
        if (!/^\d+$/.test(startNumber)) errors.push(`Start number is required for ${cleanExportLogValue(sectionLabel)} ${cleanExportLogValue(rangeLabel)}.`);
        if (startNumber.length > MAX_START_NUMBER_DIGITS) errors.push(`Start number must be at most ${MAX_START_NUMBER_DIGITS} digits for ${cleanExportLogValue(sectionLabel)} ${cleanExportLogValue(rangeLabel)}.`);
        if (numberStep === null) errors.push(`Number step must be a positive whole number for ${cleanExportLogValue(sectionLabel)} ${cleanExportLogValue(rangeLabel)}.`);
        if (numberStep !== null && numberStep > MAX_NUMBER_STEP) errors.push(`Number step must not exceed ${MAX_NUMBER_STEP} for ${cleanExportLogValue(sectionLabel)} ${cleanExportLogValue(rangeLabel)}.`);
        if (limitText !== "" && limit === null) errors.push(`Count must be a positive whole number or blank for ${cleanExportLogValue(sectionLabel)} ${cleanExportLogValue(rangeLabel)}.`);
        if (limit !== null && limit > MAX_REPLACEMENTS) errors.push(`Count must not exceed ${MAX_REPLACEMENTS} for ${cleanExportLogValue(sectionLabel)} ${cleanExportLogValue(rangeLabel)}.`);

        machineRanges.push({
            machineKey: key,
            sectionKey,
            machineLabel,
            sectionLabel,
            rangeLabel,
            rangeIndex: rangeIndex === null ? machineRanges.length : rangeIndex,
            limit,
            startNumber,
            numberStep,
            enabled: true
        });
    }

    if (machineRanges.length === 0) {
        errors.push("Enable at least one machine range.");
    }

    return {
        mode: "machine",
        onlyA,
        onlyMesspunkt,
        machineRanges,
        errors
    };
}

function buildMachinePlan(text, rawSettings = {}) {
    const settings = readMachineSettings(rawSettings);
    if (settings.errors.length > 0) {
        return { settings, rows: [], replacements: [], warnings: [], errors: settings.errors };
    }

    const scan = scanEquipment(text);
    const rangesBySection = new Map();
    const fallbackRangesByMachine = new Map();
    for (const range of settings.machineRanges) {
        const map = range.sectionKey ? rangesBySection : fallbackRangesByMachine;
        const key = range.sectionKey ? `${range.machineKey}|${range.sectionKey}` : range.machineKey;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(range);
    }
    for (const ranges of [...rangesBySection.values(), ...fallbackRangesByMachine.values()]) {
        ranges.sort((left, right) => left.rangeIndex - right.rangeIndex);
    }
    const sectionCounters = new Map();
    const rangeCounters = new Map();
    const sectionCandidateTotals = new Map();
    const sectionReplacementTotals = new Map();
    const groupLabels = new Map();
    const rows = [];
    const replacements = [];
    const warnings = [];
    const candidateSettings = {
        onlyA: settings.onlyA,
        onlyMesspunkt: settings.onlyMesspunkt,
        mode: "batch",
        useDbnoStart: false
    };

    for (const item of scan.items) {
        const candidate = shouldConsiderTag(item.attrs, candidateSettings);
        if (!candidate.ok) continue;
        const sectionKey = `${item.machine.key}|${item.section.key}`;
        const hasSectionRanges = rangesBySection.has(sectionKey);
        const groupKey = hasSectionRanges ? sectionKey : item.machine.key;
        const ranges = hasSectionRanges ? rangesBySection.get(sectionKey) : fallbackRangesByMachine.get(item.machine.key) || [];
        if (ranges.length === 0) continue;

        const sectionOffset = sectionCounters.get(groupKey) || 0;
        sectionCandidateTotals.set(groupKey, (sectionCandidateTotals.get(groupKey) || 0) + 1);
        groupLabels.set(groupKey, hasSectionRanges ? getSectionTitle(item.section) : getMachineTitle(item.machine));
        const range = findRangeForOffset(ranges, sectionOffset);
        sectionCounters.set(groupKey, sectionOffset + 1);
        if (!range) continue;

        const rangeKey = `${groupKey}|${range.rangeIndex}`;
        const rangeOffset = rangeCounters.get(rangeKey) || 0;
        const newValue = incrementDigitString(range.startNumber, rangeOffset, range.numberStep);
        const machineTitle = getMachineTitle(item.machine);
        const sectionTitle = getSectionTitle(item.section);
        const row = {
            machineKey: item.machine.key,
            machine: machineTitle,
            sectionKey: item.section.key,
            section: sectionTitle,
            range: range.rangeLabel,
            dbno: item.attrs.dbno || "",
            oldId: item.attrs.id || "",
            oldTxt: item.attrs.txt || "",
            newValue,
            status: "will be replaced",
            ok: true
        };
        rows.push(row);

        let nextTag = replaceAttribute(item.tag, "id", newValue);
        nextTag = replaceAttribute(nextTag, "txt", newValue);
        replacements.push({
            start: item.start,
            end: item.end,
            oldTag: item.tag,
            newTag: nextTag,
            row
        });
        if (replacements.length > MAX_REPLACEMENTS) {
            return {
                settings,
                rows: [],
                replacements: [],
                warnings: [],
                errors: [`Machine range replacements must not exceed ${MAX_REPLACEMENTS}.`]
            };
        }
        rangeCounters.set(rangeKey, rangeOffset + 1);
        sectionReplacementTotals.set(groupKey, (sectionReplacementTotals.get(groupKey) || 0) + 1);
    }

    for (const range of settings.machineRanges) {
        const rangeGroupKey = range.sectionKey ? `${range.machineKey}|${range.sectionKey}` : range.machineKey;
        const rangeKey = `${rangeGroupKey}|${range.rangeIndex}`;
        const count = rangeCounters.get(rangeKey) || 0;
        if (count === 0) {
            warnings.push(`No matching A/a equipment was numbered for ${range.sectionLabel} ${range.rangeLabel}.`);
        }
    }
    for (const [sectionKey, candidateCount] of sectionCandidateTotals.entries()) {
        const replacedCount = sectionReplacementTotals.get(sectionKey) || 0;
        if (replacedCount < candidateCount) {
            warnings.push(`${candidateCount - replacedCount} matching A/a equipment item(s) were not numbered for ${groupLabels.get(sectionKey) || sectionKey}.`);
        }
    }

    if (rows.length === 0) {
        rows.push({
            machine: "-",
            dbno: "-",
            oldId: "-",
            oldTxt: "-",
            newValue: "-",
            status: "no matches",
            ok: false
        });
    }

    return { settings, rows, replacements, warnings, errors: [] };
}

function findRangeForOffset(ranges, offset) {
    let remainingOffset = offset;
    for (const range of ranges) {
        if (range.limit === null) return range;
        if (remainingOffset < range.limit) return range;
        remainingOffset -= range.limit;
    }
    return null;
}

function applyMachinePlan(text, rawSettings = {}) {
    const plan = buildMachinePlan(text, rawSettings);
    if (plan.errors.length > 0 || plan.replacements.length === 0) {
        return {
            content: text,
            modified: false,
            count: 0,
            plan
        };
    }

    let output = String(text || "");
    for (let i = plan.replacements.length - 1; i >= 0; i--) {
        const replacement = plan.replacements[i];
        output = output.slice(0, replacement.start) + replacement.newTag + output.slice(replacement.end);
    }

    return {
        content: output,
        modified: output !== text,
        count: plan.replacements.length,
        plan
    };
}

function applyPlan(text, rawSettings) {
    const plan = buildPlan(text, rawSettings);
    if (plan.errors.length > 0 || plan.replacements.length === 0) {
        return {
            content: text,
            modified: false,
            count: 0,
            plan
        };
    }

    let output = String(text || "");
    for (let i = plan.replacements.length - 1; i >= 0; i--) {
        const replacement = plan.replacements[i];
        output = output.slice(0, replacement.start) + replacement.newTag + output.slice(replacement.end);
    }

    return {
        content: output,
        modified: output !== text,
        count: plan.replacements.length,
        plan
    };
}

function cleanExportLogValue(value) {
    return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
}

function formatExportLogBoolean(value) {
    return value ? "yes" : "no";
}

function buildExportLog(details = {}) {
    const plan = details.plan || {};
    const settings = plan.settings || details.settings || {};
    const replacements = Array.isArray(plan.replacements) ? plan.replacements : [];
    const warnings = Array.isArray(plan.warnings) ? plan.warnings : [];
    const errors = Array.isArray(plan.errors) ? plan.errors : [];
    const exportedAt = cleanExportLogValue(details.exportedAt || new Date().toISOString());
    const sourceFileName = cleanExportLogValue(details.sourceFileName || "-");
    const outputFileName = cleanExportLogValue(details.outputFileName || "-");
    const startDbno = settings.useDbnoStart ? cleanExportLogValue(settings.startDbno) : "-";

    const lines = [
        "ETC Equipment ID Fixer Export Log",
        `Exported at: ${exportedAt}`,
        `Source file: ${sourceFileName || "-"}`,
        `Output file: ${outputFileName || "-"}`,
        "",
        "Settings",
        `Mode: ${cleanExportLogValue(settings.mode || "batch")}`,
        `Start number: ${cleanExportLogValue(settings.startNumber)}`,
        `Number step: ${cleanExportLogValue(settings.numberStep)}`,
        `Quantity requested: ${cleanExportLogValue(settings.quantity)}`,
        `Use dbno start filter: ${formatExportLogBoolean(settings.useDbnoStart)}`,
        `Start dbno: ${startDbno}`,
        `Only replace id/txt with A/a: ${formatExportLogBoolean(settings.onlyA)}`,
        `Only type = Messpunkt: ${formatExportLogBoolean(settings.onlyMesspunkt)}`,
        "",
        "Replacements",
        `Count: ${replacements.length}`
    ];

    if (replacements.length > 0) {
        lines.push("");
        lines.push(["#", "machine", "section", "range", "dbno", "old id", "old txt", "new id", "new txt"].join("\t"));
        replacements.forEach((replacement, index) => {
            const row = replacement.row || {};
            const newValue = cleanExportLogValue(row.newValue);
            lines.push([
                index + 1,
                cleanExportLogValue(row.machine),
                cleanExportLogValue(row.section),
                cleanExportLogValue(row.range),
                cleanExportLogValue(row.dbno),
                cleanExportLogValue(row.oldId),
                cleanExportLogValue(row.oldTxt),
                newValue,
                newValue
            ].join("\t"));
        });
    }

    if (warnings.length > 0) {
        lines.push("");
        lines.push("Warnings");
        warnings.forEach((warning, index) => {
            lines.push(`${index + 1}. ${cleanExportLogValue(warning)}`);
        });
    }

    if (errors.length > 0) {
        lines.push("");
        lines.push("Errors");
        errors.forEach((error, index) => {
            lines.push(`${index + 1}. ${cleanExportLogValue(error)}`);
        });
    }

    return `${lines.join("\n")}\n`;
}

if (typeof module !== "undefined") {
    module.exports = {
        parseAttributes,
        replaceAttribute,
        incrementDigitString,
        isAPlaceholder,
        hasAPlaceholder,
        parseStrictNonNegativeInteger,
        parseStrictPositiveInteger,
        readSettings,
        getEquipmentStats,
        getMachineSummaries,
        getMachineSectionSummaries,
        getMachineDiagramData,
        getMachineTitle,
        getSectionTitle,
        getMachineSectionTitle,
        buildPlan,
        applyPlan,
        buildMachinePlan,
        applyMachinePlan,
        buildExportLog
    };
}
