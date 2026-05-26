let loadedFile = null;
let originalContent = "";
let currentContent = "";
let lastPlan = null;
let lastAppliedPlan = null;
let hasChanges = false;
let activeDownloadUrls = [];
let machineRangeRenderTimer = null;
let diagramExpansionState = new Map();
const DEFAULT_NUMBER_STEP = "1";
const MAX_RANGE_GROUPS = 20;

function byId(id) {
    return document.getElementById(id);
}

function setLayoutMode(mode) {
    const normalizedMode = mode === "laptop" ? "laptop" : "phone";
    document.body.dataset.layoutMode = normalizedMode;
    document.querySelectorAll('input[name="layoutMode"]').forEach(input => {
        input.checked = input.value === normalizedMode;
    });
}

function getDefaultLayoutMode() {
    return window.matchMedia("(min-width: 900px)").matches ? "laptop" : "phone";
}

function currentMode() {
    return byId("useMachineRanges").checked ? "machine" : "batch";
}

function getSuffix() {
    return byId("suffix").value;
}

function validateOutputSuffix() {
    if (!isSafeOutputSuffix(getSuffix())) {
        logError("File suffix may contain only letters, numbers, dots, underscores, and hyphens, up to 40 characters.");
        renderRunSummary("Check the file suffix.");
        return false;
    }
    return true;
}

function getSettings() {
    return {
        mode: currentMode(),
        startDbno: byId("startDbno").value,
        useDbnoStart: byId("useDbnoStart").checked,
        startNumber: byId("startNumber").value,
        quantity: byId("quantity").value,
        numberStep: byId("numberStep").value,
        onlyA: byId("onlyA").checked,
        onlyMesspunkt: byId("onlyMesspunkt").checked,
        machineRanges: getMachineRangeSettings()
    };
}

function setBusy(isBusy) {
    ["fileInput", "previewBtn", "applyBtn", "downloadBtn"].forEach(id => {
        const el = byId(id);
        if (el) el.disabled = isBusy || (id === "downloadBtn" && !hasChanges);
    });
}

function updateModeUi() {
    const useFilter = byId("useDbnoStart").checked;
    const useMachineRanges = byId("useMachineRanges").checked;
    byId("startDbno").disabled = !useFilter;
    const startDbnoGroup = byId("startDbnoGroup");
    if (startDbnoGroup) startDbnoGroup.classList.toggle("hidden", !useFilter);
    byId("machineRangesPanel").classList.toggle("hidden", !useMachineRanges);
}

function renderFileSummary() {
    const summary = byId("fileSummary");
    if (!loadedFile) {
        summary.textContent = "No file selected.";
        return;
    }
    const stats = getEquipmentStats(originalContent);
    const machines = getMachineSummaries(originalContent, getSettings());
    const sections = getMachineSectionSummaries(originalContent, getSettings()).filter(section => section.candidates > 0);
    summary.textContent = `${loadedFile.name} | ${formatBytes(loadedFile.size)} | Machines: ${machines.length} | Sections with A/a: ${sections.length} | ELECTRICALEQUIPMENT: ${stats.total} | Messpunkt: ${stats.messpunkt} | A/a placeholders: ${stats.placeholders} | Messpunkt A/a: ${stats.messpunktPlaceholders}`;
}

function renderRunSummary(text) {
    byId("runSummary").textContent = text;
}

function clearDownloadLinks() {
    for (const url of activeDownloadUrls) {
        URL.revokeObjectURL(url);
    }
    activeDownloadUrls = [];

    const links = byId("downloadLinks");
    if (links) links.textContent = "";

    const panel = byId("downloadLinksPanel");
    if (panel) panel.classList.add("hidden");
}

function renderDownloadLinks(items) {
    clearDownloadLinks();
    const panel = byId("downloadLinksPanel");
    const links = byId("downloadLinks");
    if (!panel || !links) return [];

    const renderedLinks = [];
    for (const item of items) {
        const url = createTextDownloadUrl(item.content);
        activeDownloadUrls.push(url);

        const link = document.createElement("a");
        link.className = "download-link";
        link.href = url;
        link.download = item.fileName;
        link.textContent = item.label;
        links.appendChild(link);
        renderedLinks.push(link);
    }

    panel.classList.remove("hidden");
    return renderedLinks;
}

function triggerDownloadLinks(links) {
    for (const link of links) {
        link.click();
    }
}

function setReviewTab(activePanelId) {
    const isDiagram = activePanelId === "diagramPanel";
    byId("diagramPanel").classList.toggle("hidden", !isDiagram);
    byId("previewPanel").classList.toggle("hidden", isDiagram);
    byId("diagramTab").classList.toggle("active", isDiagram);
    byId("previewTab").classList.toggle("active", !isDiagram);
    byId("diagramTab").setAttribute("aria-selected", String(isDiagram));
    byId("previewTab").setAttribute("aria-selected", String(!isDiagram));
}

function renderPreview(rows) {
    const body = byId("previewBody");
    body.textContent = "";
    for (const row of rows.slice(0, 80)) {
        const tr = document.createElement("tr");
        const statusClass = row.ok ? "status-ok" : "status-warn";
        [row.dbno, formatPreviewGroup(row), row.oldId, row.oldTxt, row.newValue, row.status].forEach((value, index) => {
            const td = document.createElement("td");
            td.textContent = value;
            if (index === 5) td.className = statusClass;
            tr.appendChild(td);
        });
        body.appendChild(tr);
    }
    if (rows.length > 80) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 6;
        td.textContent = `Showing 80 of ${rows.length}.`;
        tr.appendChild(td);
        body.appendChild(tr);
    }
}

function formatPreviewGroup(row) {
    return [row.machine, row.section, row.range].filter(Boolean).join(" | ") || "-";
}

function getAppliedReplacementLookup() {
    const lookup = {
        itemKeys: new Set(),
        globalKeys: new Set(),
        machineCounts: new Map()
    };
    const replacements = Array.isArray(lastAppliedPlan?.replacements) ? lastAppliedPlan.replacements : [];
    for (const replacement of replacements) {
        const row = replacement.row || {};
        const dbno = String(row.dbno || "");
        const newValue = String(row.newValue || "");
        if (!dbno || !newValue) continue;
        if (row.sectionKey) {
            lookup.itemKeys.add(`${row.sectionKey}|${dbno}|${newValue}`);
        } else {
            lookup.globalKeys.add(`${dbno}|${newValue}`);
        }
        if (row.machineKey) {
            lookup.machineCounts.set(row.machineKey, (lookup.machineCounts.get(row.machineKey) || 0) + 1);
        }
    }
    return lookup;
}

function wasEquipmentReplaced(lookup, sectionKey, equipment) {
    const dbno = String(equipment.dbno || "");
    if (!dbno) return false;
    const values = [equipment.id, equipment.txt].filter(Boolean).map(String);
    return values.some(value =>
        lookup.itemKeys.has(`${sectionKey}|${dbno}|${value}`) ||
        lookup.globalKeys.has(`${dbno}|${value}`)
    );
}

function createToggleButton(className, expanded, controlsId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-controls", controlsId);
    return button;
}

function appendCountStats(container, shownCount, matchCount, replacedCount) {
    container.textContent = "";
    [
        { text: `${shownCount} shown` },
        { text: `${matchCount} match`, className: matchCount > 0 ? "stat-match" : "" },
        { text: `${replacedCount} replaced` }
    ].forEach((part, index) => {
        if (index > 0) container.appendChild(document.createTextNode(" | "));
        const span = document.createElement("span");
        span.textContent = part.text;
        if (part.className) span.className = part.className;
        container.appendChild(span);
    });
}

function applyDisclosureState(button, body, storageKey, expanded) {
    button.setAttribute("aria-expanded", String(expanded));
    body.hidden = !expanded;
    diagramExpansionState.set(storageKey, expanded);
}

function renderMachineDiagram() {
    const summaryEl = byId("diagramSummary");
    const diagramEl = byId("machineDiagram");
    diagramEl.textContent = "";

    if (!currentContent || !loadedFile) {
        summaryEl.textContent = "No file selected.";
        const empty = document.createElement("div");
        empty.className = "empty-machine";
        empty.textContent = "No machine diagram data.";
        diagramEl.appendChild(empty);
        return;
    }

    const data = getMachineDiagramData(currentContent, {
        onlyA: byId("onlyA").checked,
        onlyMesspunkt: byId("onlyMesspunkt").checked
    });
    const sectionCount = data.machines.reduce((sum, group) => sum + group.sections.filter(section => section.equipment.length > 0).length, 0);
    const replacementLookup = getAppliedReplacementLookup();
    const replacedCount = Array.from(replacementLookup.machineCounts.values()).reduce((sum, count) => sum + count, 0) + replacementLookup.globalKeys.size;
    summaryEl.textContent = `Machines: ${data.totals.machines} | Sections: ${sectionCount} | Shown equipment: ${data.totals.shownEquipment} | A/a placeholders: ${data.totals.placeholders} | Replacement matches: ${data.totals.candidates} | Replaced: ${replacedCount}`;

    if (data.machines.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-machine";
        empty.textContent = "No BUILDING machines were found.";
        diagramEl.appendChild(empty);
        return;
    }

    data.machines.forEach((group, machineIndex) => {
        const machineReplacedCount = group.sections.reduce((sum, section) => (
            sum + section.equipment.filter(equipment => wasEquipmentReplaced(replacementLookup, section.section.key, equipment)).length
        ), 0);
        const machineHasActivity = group.candidateCount > 0 || machineReplacedCount > 0;
        const machineStorageKey = `machine:${group.machine.key}`;
        const machineExpanded = diagramExpansionState.has(machineStorageKey) ? diagramExpansionState.get(machineStorageKey) : machineHasActivity;
        const machineBodyId = `machine-body-${machineIndex}`;
        const block = document.createElement("article");
        block.className = "machine-block";
        block.classList.toggle("collapsed", !machineExpanded);

        const header = createToggleButton("machine-block-header diagram-toggle", machineExpanded, machineBodyId);

        const titleWrap = document.createElement("div");
        const title = document.createElement("div");
        title.className = "machine-title";
        title.textContent = group.machine.id || "Unnamed BUILDING";
        const meta = document.createElement("span");
        meta.className = "machine-meta";
        meta.textContent = [group.machine.txt && group.machine.txt !== group.machine.id ? group.machine.txt : "", group.machine.dbno ? `dbno ${group.machine.dbno}` : ""].filter(Boolean).join(" | ");
        titleWrap.appendChild(title);
        if (meta.textContent) titleWrap.appendChild(meta);

        const counts = document.createElement("div");
        counts.className = "machine-counts";
        appendCountStats(counts, group.equipment.length, group.candidateCount, machineReplacedCount);

        header.appendChild(titleWrap);
        header.appendChild(counts);
        block.appendChild(header);

        const machineBody = document.createElement("div");
        machineBody.id = machineBodyId;
        machineBody.className = "machine-body";
        machineBody.hidden = !machineExpanded;
        header.addEventListener("click", () => {
            const nextExpanded = header.getAttribute("aria-expanded") !== "true";
            block.classList.toggle("collapsed", !nextExpanded);
            applyDisclosureState(header, machineBody, machineStorageKey, nextExpanded);
        });

        const visibleSections = group.sections.filter(section => section.equipment.length > 0);
        if (visibleSections.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-machine";
            empty.textContent = "No equipment for the current filters.";
            machineBody.appendChild(empty);
        } else {
            visibleSections.forEach((section, sectionIndex) => {
                const sectionReplacedCount = section.equipment.filter(equipment => wasEquipmentReplaced(replacementLookup, section.section.key, equipment)).length;
                const sectionHasActivity = section.candidateCount > 0 || sectionReplacedCount > 0;
                const sectionStorageKey = `section:${section.section.key}`;
                const sectionExpanded = diagramExpansionState.has(sectionStorageKey) ? diagramExpansionState.get(sectionStorageKey) : sectionHasActivity;
                const sectionBodyId = `section-body-${machineIndex}-${sectionIndex}`;
                const sectionBlock = document.createElement("section");
                sectionBlock.className = "section-block";
                sectionBlock.classList.toggle("collapsed", !sectionExpanded);

                const sectionHeader = createToggleButton("section-header diagram-toggle", sectionExpanded, sectionBodyId);
                const sectionTitle = document.createElement("div");
                sectionTitle.className = "section-title";
                sectionTitle.textContent = getSectionTitle(section.section);
                const sectionCounts = document.createElement("div");
                sectionCounts.className = "section-counts";
                appendCountStats(sectionCounts, section.equipment.length, section.candidateCount, sectionReplacedCount);
                sectionHeader.appendChild(sectionTitle);
                sectionHeader.appendChild(sectionCounts);
                sectionBlock.appendChild(sectionHeader);

                const flow = document.createElement("div");
                flow.id = sectionBodyId;
                flow.className = "equipment-flow";
                flow.hidden = !sectionExpanded;
                sectionHeader.addEventListener("click", () => {
                    const nextExpanded = sectionHeader.getAttribute("aria-expanded") !== "true";
                    sectionBlock.classList.toggle("collapsed", !nextExpanded);
                    applyDisclosureState(sectionHeader, flow, sectionStorageKey, nextExpanded);
                });
                for (const equipment of section.equipment) {
                    const chip = document.createElement("span");
                    chip.className = "equipment-chip";
                    if (equipment.isPlaceholder) chip.classList.add("placeholder");
                    if (equipment.isCandidate) chip.classList.add("candidate");
                    if (wasEquipmentReplaced(replacementLookup, section.section.key, equipment)) chip.classList.add("replaced");

                    const dbno = document.createElement("span");
                    dbno.className = "chip-dbno";
                    dbno.textContent = equipment.dbno ? `#${equipment.dbno}` : "#-";
                    const value = document.createElement("span");
                    value.textContent = equipment.displayValue;
                    chip.title = `dbno ${equipment.dbno || "-"} | ${equipment.type || "-"}`;
                    chip.appendChild(dbno);
                    chip.appendChild(value);
                    flow.appendChild(chip);
                }
                sectionBlock.appendChild(flow);
                machineBody.appendChild(sectionBlock);
            });
        }

        block.appendChild(machineBody);
        diagramEl.appendChild(block);
    });
}

async function handleFileSelect(event) {
    const file = event.target.files && event.target.files[0];
    clearLog();
    lastPlan = null;
    lastAppliedPlan = null;
    hasChanges = false;
    currentContent = "";
    originalContent = "";
    loadedFile = null;
    clearDownloadLinks();
    diagramExpansionState.clear();
    byId("downloadBtn").disabled = true;

    if (!file) {
        renderFileSummary();
        renderRunSummary("No file selected.");
        return;
    }
    if (!isSupportedFile(file)) {
        logError(`Unsupported file extension: ${file.name}`);
        renderRunSummary("File rejected.");
        return;
    }
    if (file.size > MAX_INPUT_FILE_SIZE_BYTES) {
        logError(`File is too large: ${formatBytes(file.size)}.`);
        renderRunSummary("File rejected.");
        return;
    }

    setBusy(true);
    try {
        originalContent = await readFileAsText(file);
        currentContent = originalContent;
        loadedFile = file;
        renderMachineRanges();
        renderMachineDiagram();
        renderFileSummary();
        renderRunSummary("File loaded.");
        logOk(`Loaded ${file.name}`);
    } catch (error) {
        logError(`Read error: ${error.message || error}`);
        renderRunSummary("Read error.");
    } finally {
        setBusy(false);
    }
}

function getMachineRangeSettings() {
    const groups = Array.from(document.querySelectorAll("#machineBody .range-group[data-section-key][data-range-index]"));
    return groups.map(group => ({
        machineKey: group.dataset.machineKey,
        machineLabel: group.dataset.machineLabel,
        sectionKey: group.dataset.sectionKey,
        sectionLabel: group.dataset.sectionLabel,
        rangeIndex: group.dataset.rangeIndex,
        rangeLabel: group.dataset.rangeLabel,
        enabled: group.querySelector(".range-enabled")?.checked === true,
        limit: group.querySelector(".range-limit")?.value || "",
        startNumber: group.querySelector(".range-start")?.value || "",
        numberStep: group.querySelector(".range-step")?.value || DEFAULT_NUMBER_STEP
    }));
}

function parsePositiveIntegerInput(value) {
    const raw = String(value || "").trim();
    if (!/^\d+$/.test(raw)) return null;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function computeRangePreview(startNumber, count, step) {
    if (count < 1) return "-";
    const start = String(startNumber || "").trim();
    const parsedStep = Number(String(step || "").trim());
    if (!/^\d+$/.test(start) || !Number.isSafeInteger(parsedStep) || parsedStep < 1) return "-";
    const last = incrementDigitString(start, count - 1, parsedStep);
    return count === 1 ? start : `${start} - ${last}`;
}

function computeRangeCounts(totalCount, entries) {
    let remaining = totalCount;
    return entries.map(entry => {
        if (remaining < 1) return 0;
        const limit = parsePositiveIntegerInput(entry.limit);
        const count = limit === null ? remaining : Math.min(limit, remaining);
        remaining -= count;
        return count;
    });
}

function getExistingMachineRangeValues() {
    const values = new Map();
    for (const row of Array.from(document.querySelectorAll("#machineBody .machine-section-row[data-section-key]"))) {
        const sectionKey = row.dataset.sectionKey;
        if (!values.has(sectionKey)) {
            values.set(sectionKey, {
                groupCount: 1,
                ranges: new Map()
            });
        }
        const section = values.get(sectionKey);
        const groupCountInput = row.querySelector(".range-group-count");
        if (groupCountInput) {
            section.groupCount = parsePositiveIntegerInput(groupCountInput.value) || 1;
        }
    }
    for (const group of Array.from(document.querySelectorAll("#machineBody .range-group[data-section-key][data-range-index]"))) {
        const sectionKey = group.dataset.sectionKey;
        if (!values.has(sectionKey)) {
            values.set(sectionKey, {
                groupCount: 1,
                ranges: new Map()
            });
        }
        const section = values.get(sectionKey);
        const rangeIndex = Number(group.dataset.rangeIndex || "0");
        section.ranges.set(rangeIndex, {
            enabled: group.querySelector(".range-enabled")?.checked === true,
            limit: group.querySelector(".range-limit")?.value || "",
            startNumber: group.querySelector(".range-start")?.value || "",
            numberStep: group.querySelector(".range-step")?.value || DEFAULT_NUMBER_STEP
        });
    }
    return values;
}

function scheduleMachineRangeRender() {
    window.clearTimeout(machineRangeRenderTimer);
    machineRangeRenderTimer = window.setTimeout(() => {
        machineRangeRenderTimer = null;
        renderMachineRanges();
    }, 450);
}

function renderMachineRangesNow() {
    window.clearTimeout(machineRangeRenderTimer);
    machineRangeRenderTimer = null;
    renderMachineRanges();
}

function createRangeField(labelText, inputClassName, value, placeholder = "") {
    const field = document.createElement("label");
    field.className = "range-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.className = inputClassName;
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = placeholder;
    input.value = value || "";
    field.appendChild(label);
    field.appendChild(input);
    return { field, input };
}

function createRangeGroupElement(details) {
    const group = document.createElement("div");
    group.className = "range-group";
    group.dataset.machineKey = details.machine.key;
    group.dataset.machineLabel = getMachineTitle(details.machine);
    group.dataset.sectionKey = details.section.key;
    group.dataset.sectionLabel = getSectionTitle(details.section);
    group.dataset.rangeIndex = String(details.index);
    group.dataset.rangeLabel = details.rangeLabel;
    group.dataset.candidateCount = String(details.totalCount);

    const useField = document.createElement("label");
    useField.className = "range-use";
    const enabledInput = document.createElement("input");
    enabledInput.type = "checkbox";
    enabledInput.className = "range-enabled";
    enabledInput.checked = details.entry.enabled && details.rangeCount > 0;
    enabledInput.disabled = details.rangeCount === 0;
    useField.appendChild(enabledInput);
    group.appendChild(useField);

    const limit = createRangeField("Count", "range-limit", details.entry.limit, "remaining");
    limit.input.disabled = details.rangeCount === 0;
    group.appendChild(limit.field);

    const start = createRangeField("Start", "range-start", details.rangeCount > 0 ? details.entry.startNumber : "");
    start.input.disabled = details.rangeCount === 0;
    group.appendChild(start.field);

    const step = createRangeField("Step", "range-step", details.entry.numberStep || DEFAULT_NUMBER_STEP);
    step.input.disabled = details.rangeCount === 0;
    group.appendChild(step.field);

    const previewField = document.createElement("div");
    previewField.className = "range-field range-preview-field";
    const previewLabel = document.createElement("label");
    previewLabel.textContent = details.rangeLabel;
    const preview = document.createElement("div");
    preview.className = "machine-range-preview range-preview";
    previewField.appendChild(previewLabel);
    previewField.appendChild(preview);
    group.appendChild(previewField);

    return group;
}

function updateMachineRangeRows() {
    const rowsBySection = new Map();
    for (const group of Array.from(document.querySelectorAll("#machineBody .range-group[data-section-key][data-range-index]"))) {
        const sectionKey = group.dataset.sectionKey;
        if (!rowsBySection.has(sectionKey)) rowsBySection.set(sectionKey, []);
        rowsBySection.get(sectionKey).push(group);
    }

    for (const groups of rowsBySection.values()) {
        groups.sort((left, right) => Number(left.dataset.rangeIndex) - Number(right.dataset.rangeIndex));
        const totalCount = Number(groups[0]?.dataset.candidateCount || "0");
        const entries = groups.map(group => ({
            limit: group.querySelector(".range-limit")?.value || ""
        }));
        const counts = computeRangeCounts(totalCount, entries);
        groups.forEach((group, index) => {
            const count = counts[index] || 0;
            const start = group.querySelector(".range-start")?.value || "";
            const step = group.querySelector(".range-step")?.value || DEFAULT_NUMBER_STEP;
            const preview = group.querySelector(".machine-range-preview");
            if (preview) preview.textContent = computeRangePreview(start, count, step);

            const disabled = count === 0;
            const enabledInput = group.querySelector(".range-enabled");
            if (enabledInput) {
                const wasDisabled = enabledInput.disabled;
                enabledInput.disabled = disabled;
                if (disabled) enabledInput.checked = false;
                if (!disabled && wasDisabled) enabledInput.checked = true;
            }
            group.querySelectorAll(".range-limit, .range-start, .range-step").forEach(input => {
                input.disabled = disabled;
            });
        });
    }
}

function renderMachineRanges(options = {}) {
    const summaryEl = byId("machineSummary");
    const body = byId("machineBody");
    const existingValues = getExistingMachineRangeValues();
    body.textContent = "";

    if (!currentContent || !loadedFile) {
        summaryEl.textContent = "No file selected.";
        const empty = document.createElement("div");
        empty.className = "empty-machine";
        empty.textContent = "No machine data.";
        body.appendChild(empty);
        return;
    }

    const diagramData = getMachineDiagramData(currentContent, {
        onlyA: byId("onlyA").checked,
        onlyMesspunkt: byId("onlyMesspunkt").checked
    });
    const visibleMachines = diagramData.machines.filter(group => group.candidateCount > 0);
    const sectionCount = visibleMachines.reduce((sum, group) => sum + group.sections.filter(section => section.equipment.length > 0).length, 0);
    summaryEl.textContent = `Machines with matches: ${visibleMachines.length} | Sections shown: ${sectionCount} | Matches to replace: ${diagramData.totals.candidates}`;

    if (visibleMachines.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-machine";
        empty.textContent = "No machines with matching A/a equipment were found for the current filters.";
        body.appendChild(empty);
        return;
    }

    const globalStart = byId("startNumber").value.trim();
    const rawGlobalStep = byId("numberStep").value.trim();
    const canAutoFill = options.forceFill === true && /^\d+$/.test(globalStart) && /^\d+$/.test(rawGlobalStep);
    const globalStep = canAutoFill ? Number(rawGlobalStep) : null;
    let fillCursor = canAutoFill ? globalStart : "";

    const replacementLookup = getAppliedReplacementLookup();

    for (const group of visibleMachines) {
        const machine = group.machine;
        const visibleSections = group.sections.filter(section => section.equipment.length > 0);
        const machineReplacedCount = visibleSections.reduce((sum, section) => (
            sum + section.equipment.filter(equipment => wasEquipmentReplaced(replacementLookup, section.section.key, equipment)).length
        ), 0);

        const machineBlock = document.createElement("article");
        machineBlock.className = "machine-range-machine";

        const machineHeader = document.createElement("div");
        machineHeader.className = "machine-range-machine-header";
        const titleWrap = document.createElement("div");
        const name = document.createElement("div");
        name.className = "machine-name";
        name.textContent = machine.id || "Unnamed BUILDING";
        const meta = document.createElement("span");
        meta.className = "machine-meta";
        meta.textContent = [machine.txt && machine.txt !== machine.id ? machine.txt : "", machine.dbno ? `dbno ${machine.dbno}` : ""].filter(Boolean).join(" | ");
        titleWrap.appendChild(name);
        if (meta.textContent) titleWrap.appendChild(meta);
        const machineStats = document.createElement("div");
        machineStats.className = "machine-range-stats";
        appendCountStats(machineStats, group.equipment.length, group.candidateCount, machineReplacedCount);
        machineHeader.appendChild(titleWrap);
        machineHeader.appendChild(machineStats);
        machineBlock.appendChild(machineHeader);

        for (const sectionGroup of visibleSections) {
            const section = sectionGroup.section;
            const count = sectionGroup.candidateCount;
            const sectionReplacedCount = sectionGroup.equipment.filter(equipment => wasEquipmentReplaced(replacementLookup, section.key, equipment)).length;
            const existing = existingValues.get(section.key);
            const groupCount = Math.min(MAX_RANGE_GROUPS, Math.max(1, existing?.groupCount || 1));
            const entries = [];
            for (let index = 0; index < groupCount; index++) {
                const existingRange = existing?.ranges.get(index);
                entries.push({
                    enabled: count > 0 && existingRange?.enabled !== false,
                    limit: existingRange?.limit || "",
                    startNumber: existingRange?.startNumber || "",
                    numberStep: existingRange?.numberStep || byId("numberStep").value || DEFAULT_NUMBER_STEP
                });
            }
            const counts = computeRangeCounts(count, entries);
            if (canAutoFill) {
                for (let index = 0; index < entries.length; index++) {
                    if (counts[index] > 0) {
                        entries[index].startNumber = fillCursor;
                        fillCursor = incrementDigitString(fillCursor, counts[index], globalStep) || fillCursor;
                    }
                }
            }

            const sectionRow = document.createElement("section");
            sectionRow.className = "machine-section-row range-section-card";
            sectionRow.dataset.sectionKey = section.key;

            const sectionHeader = document.createElement("div");
            sectionHeader.className = "range-section-header";
            const sectionInfo = document.createElement("div");
            const sectionName = document.createElement("div");
            sectionName.className = "range-section-title";
            sectionName.textContent = getSectionTitle(section);
            const sectionStats = document.createElement("div");
            sectionStats.className = "range-section-stats";
            appendCountStats(sectionStats, sectionGroup.equipment.length, count, sectionReplacedCount);
            sectionInfo.appendChild(sectionName);
            sectionInfo.appendChild(sectionStats);

            const groupControl = document.createElement("label");
            groupControl.className = "range-group-control";
            const groupLabel = document.createElement("span");
            groupLabel.textContent = "Groups";
            const groupInput = document.createElement("input");
            groupInput.type = "text";
            groupInput.className = "range-group-count";
            groupInput.inputMode = "numeric";
            groupInput.autocomplete = "off";
            groupInput.spellcheck = false;
            groupInput.value = String(groupCount);
            groupInput.disabled = count === 0;
            groupControl.appendChild(groupLabel);
            groupControl.appendChild(groupInput);
            sectionHeader.appendChild(sectionInfo);
            sectionHeader.appendChild(groupControl);
            sectionRow.appendChild(sectionHeader);

            const groupsRow = document.createElement("div");
            groupsRow.className = "machine-groups-row";
            groupsRow.dataset.sectionKey = section.key;
            const groupWrap = document.createElement("div");
            groupWrap.className = "range-groups";

            for (let index = 0; index < entries.length; index++) {
                const entry = entries[index];
                const rangeCount = counts[index] || 0;
                const rangeLabel = `Group ${index + 1}`;
                groupWrap.appendChild(createRangeGroupElement({
                    machine,
                    section,
                    index,
                    rangeLabel,
                    totalCount: count,
                    rangeCount,
                    entry
                }));
            }
            groupsRow.appendChild(groupWrap);
            sectionRow.appendChild(groupsRow);
            machineBlock.appendChild(sectionRow);
        }

        body.appendChild(machineBlock);
    }

    body.querySelectorAll(".range-limit, .range-start, .range-step, .range-enabled").forEach(input => {
        input.addEventListener("input", updateMachineRangeRows);
        input.addEventListener("change", updateMachineRangeRows);
    });
    body.querySelectorAll(".range-group-count").forEach(input => {
        input.addEventListener("input", scheduleMachineRangeRender);
        input.addEventListener("change", renderMachineRangesNow);
    });
    updateMachineRangeRows();
}

function refreshGroupedViews(options = {}) {
    renderMachineRanges(options);
    renderMachineDiagram();
    renderFileSummary();
}

function getFreshSettingsForRun() {
    if (currentMode() === "machine" && currentContent && loadedFile) {
        renderMachineRangesNow();
    }
    return getSettings();
}

function previewChanges() {
    if (!loadedFile) {
        logWarn("Select a file first.");
        return;
    }
    if (!validateOutputSuffix()) return;

    const settings = getFreshSettingsForRun();
    const plan = settings.mode === "machine" ? buildMachinePlan(currentContent, settings) : buildPlan(currentContent, settings);
    lastPlan = plan;
    if (plan.errors.length > 0) {
        renderPreview(plan.errors.map(message => ({
            dbno: "-",
            oldId: "-",
            oldTxt: "-",
            newValue: "-",
            status: message,
            ok: false
        })));
        renderRunSummary("Check the fields.");
        plan.errors.forEach(logError);
        return;
    }

    renderPreview(plan.rows);
    renderRunSummary(`Replacements found: ${plan.replacements.length}.`);
    if (plan.replacements.length > 0) {
        logOk(`Preview: ${plan.replacements.length} replacements.`);
        plan.warnings.forEach(logWarn);
    } else {
        logWarn("Preview: no replacements.");
    }
}

function applyChanges() {
    if (!loadedFile) {
        logWarn("Select a file first.");
        return;
    }
    if (!validateOutputSuffix()) return;

    const settings = getFreshSettingsForRun();
    const result = settings.mode === "machine" ? applyMachinePlan(currentContent, settings) : applyPlan(currentContent, settings);
    lastPlan = result.plan;
    renderPreview(result.plan.rows);

    if (result.plan.errors.length > 0) {
        renderRunSummary("Check the fields.");
        result.plan.errors.forEach(logError);
        return;
    }

    if (!result.modified) {
        renderRunSummary("No changes.");
        logWarn("Replacement was not applied: no matches.");
        return;
    }

    currentContent = result.content;
    lastAppliedPlan = result.plan;
    hasChanges = true;
    clearDownloadLinks();
    diagramExpansionState.clear();
    byId("downloadBtn").disabled = false;
    refreshGroupedViews();
    renderRunSummary(`Done: ${result.count} replacements.`);
    logOk(`Replaced: ${result.count}`);
    result.plan.warnings.forEach(logWarn);
    for (const replacement of result.plan.replacements) {
        const groupLabel = formatPreviewGroup(replacement.row);
        const groupPrefix = groupLabel === "-" ? "" : `${groupLabel} | `;
        log(`${groupPrefix}dbno ${replacement.row.dbno}: ${replacement.row.oldId}/${replacement.row.oldTxt} -> ${replacement.row.newValue}`);
    }
}

function downloadCurrentFile() {
    if (!loadedFile || !currentContent) {
        logWarn("No file to download.");
        return;
    }
    if (!validateOutputSuffix()) return;

    const suffix = getSuffix();
    const outputName = makeDownloadName(loadedFile.name, suffix);
    const exportLogName = makeExportLogName(loadedFile.name, suffix);
    const exportLog = buildExportLog({
        exportedAt: new Date().toISOString(),
        sourceFileName: loadedFile.name,
        outputFileName: outputName,
        plan: lastAppliedPlan || lastPlan
    });

    const links = renderDownloadLinks([
        { label: `ETC file: ${outputName}`, fileName: outputName, content: currentContent },
        { label: `Export log: ${exportLogName}`, fileName: exportLogName, content: exportLog }
    ]);
    triggerDownloadLinks(links);
    logOk(`Download links ready: ${outputName}, ${exportLogName}`);
    logWarn("If the browser cancels or blocks a save dialog, use the ETC file and Export log links.");
}

document.addEventListener("DOMContentLoaded", () => {
    byId("fileInput").addEventListener("change", handleFileSelect);
    byId("previewBtn").addEventListener("click", previewChanges);
    byId("applyBtn").addEventListener("click", applyChanges);
    byId("downloadBtn").addEventListener("click", downloadCurrentFile);
    byId("diagramTab").addEventListener("click", () => setReviewTab("diagramPanel"));
    byId("previewTab").addEventListener("click", () => setReviewTab("previewPanel"));
    document.querySelectorAll('input[name="layoutMode"]').forEach(input => {
        input.addEventListener("change", () => setLayoutMode(input.value));
    });
    byId("onlyA").addEventListener("change", refreshGroupedViews);
    byId("onlyMesspunkt").addEventListener("change", () => {
        refreshGroupedViews();
    });
    byId("numberStep").addEventListener("change", () => refreshGroupedViews({ forceFill: true }));
    byId("startNumber").addEventListener("change", () => refreshGroupedViews({ forceFill: true }));
    byId("suffix").addEventListener("input", clearDownloadLinks);
    byId("useDbnoStart").addEventListener("change", updateModeUi);
    byId("useMachineRanges").addEventListener("change", updateModeUi);
    window.addEventListener("pagehide", clearDownloadLinks);
    setLayoutMode(getDefaultLayoutMode());
    updateModeUi();
    renderMachineRanges();
    renderMachineDiagram();
    renderFileSummary();
});
