let loadedFile = null;
let originalContent = "";
let currentContent = "";
let lastPlan = null;
let lastAppliedPlan = null;
let hasChanges = false;
let activeDownloadUrls = [];
const DEFAULT_NUMBER_STEP = "1";
const MAX_RANGE_GROUPS = 20;

function byId(id) {
    return document.getElementById(id);
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
    byId("startDbnoGroup").classList.toggle("hidden", !useFilter);
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
    summaryEl.textContent = `Machines: ${data.totals.machines} | Sections: ${sectionCount} | Shown equipment: ${data.totals.shownEquipment} | A/a placeholders: ${data.totals.placeholders} | Replacement matches: ${data.totals.candidates}`;

    if (data.machines.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-machine";
        empty.textContent = "No BUILDING machines were found.";
        diagramEl.appendChild(empty);
        return;
    }

    for (const group of data.machines) {
        const block = document.createElement("article");
        block.className = "machine-block";

        const header = document.createElement("div");
        header.className = "machine-block-header";

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
        counts.textContent = `${group.equipment.length} shown | ${group.candidateCount} match`;

        header.appendChild(titleWrap);
        header.appendChild(counts);
        block.appendChild(header);

        const visibleSections = group.sections.filter(section => section.equipment.length > 0);
        if (visibleSections.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-machine";
            empty.textContent = "No equipment for the current filters.";
            block.appendChild(empty);
        } else {
            for (const section of visibleSections) {
                const sectionBlock = document.createElement("section");
                sectionBlock.className = "section-block";

                const sectionHeader = document.createElement("div");
                sectionHeader.className = "section-header";
                const sectionTitle = document.createElement("div");
                sectionTitle.className = "section-title";
                sectionTitle.textContent = getSectionTitle(section.section);
                const sectionCounts = document.createElement("div");
                sectionCounts.className = "section-counts";
                sectionCounts.textContent = `${section.equipment.length} shown | ${section.candidateCount} match`;
                sectionHeader.appendChild(sectionTitle);
                sectionHeader.appendChild(sectionCounts);
                sectionBlock.appendChild(sectionHeader);

                const flow = document.createElement("div");
                flow.className = "equipment-flow";
                for (const equipment of section.equipment) {
                    const chip = document.createElement("span");
                    chip.className = "equipment-chip";
                    if (equipment.isPlaceholder) chip.classList.add("placeholder");
                    if (equipment.isCandidate) chip.classList.add("candidate");

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
                block.appendChild(sectionBlock);
            }
        }

        diagramEl.appendChild(block);
    }
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
    const rows = Array.from(document.querySelectorAll("#machineBody tr[data-section-key][data-range-index]"));
    return rows.map(row => ({
        machineKey: row.dataset.machineKey,
        machineLabel: row.dataset.machineLabel,
        sectionKey: row.dataset.sectionKey,
        sectionLabel: row.dataset.sectionLabel,
        rangeIndex: row.dataset.rangeIndex,
        rangeLabel: row.dataset.rangeLabel,
        enabled: row.querySelector(".range-enabled")?.checked === true,
        limit: row.querySelector(".range-limit")?.value || "",
        startNumber: row.querySelector(".range-start")?.value || "",
        numberStep: row.querySelector(".range-step")?.value || DEFAULT_NUMBER_STEP
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
    for (const row of Array.from(document.querySelectorAll("#machineBody tr[data-section-key][data-range-index]"))) {
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
        const rangeIndex = Number(row.dataset.rangeIndex || "0");
        section.ranges.set(rangeIndex, {
            enabled: row.querySelector(".range-enabled")?.checked === true,
            limit: row.querySelector(".range-limit")?.value || "",
            startNumber: row.querySelector(".range-start")?.value || "",
            numberStep: row.querySelector(".range-step")?.value || DEFAULT_NUMBER_STEP
        });
    }
    return values;
}

function updateMachineRangeRows() {
    const rowsBySection = new Map();
    for (const row of Array.from(document.querySelectorAll("#machineBody tr[data-section-key][data-range-index]"))) {
        const sectionKey = row.dataset.sectionKey;
        if (!rowsBySection.has(sectionKey)) rowsBySection.set(sectionKey, []);
        rowsBySection.get(sectionKey).push(row);
    }

    for (const rows of rowsBySection.values()) {
        rows.sort((left, right) => Number(left.dataset.rangeIndex) - Number(right.dataset.rangeIndex));
        const totalCount = Number(rows[0]?.dataset.candidateCount || "0");
        const entries = rows.map(row => ({
            limit: row.querySelector(".range-limit")?.value || ""
        }));
        const counts = computeRangeCounts(totalCount, entries);
        rows.forEach((row, index) => {
            const count = counts[index] || 0;
            const start = row.querySelector(".range-start")?.value || "";
            const step = row.querySelector(".range-step")?.value || DEFAULT_NUMBER_STEP;
            const preview = row.querySelector(".machine-range-preview");
            if (preview) preview.textContent = computeRangePreview(start, count, step);

            const disabled = count === 0;
            const enabledInput = row.querySelector(".range-enabled");
            if (enabledInput) {
                const wasDisabled = enabledInput.disabled;
                enabledInput.disabled = disabled;
                if (disabled) enabledInput.checked = false;
                if (!disabled && wasDisabled) enabledInput.checked = true;
            }
            row.querySelectorAll(".range-limit, .range-start, .range-step").forEach(input => {
                input.disabled = disabled;
            });
        });
    }
}

function renderMachineRanges(options = {}) {
    const summaryEl = byId("machineSummary");
    const body = byId("machineBody");
    body.textContent = "";

    if (!currentContent || !loadedFile) {
        summaryEl.textContent = "No file selected.";
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 8;
        td.textContent = "No machine data.";
        tr.appendChild(td);
        body.appendChild(tr);
        return;
    }

    const existingValues = getExistingMachineRangeValues();
    const allSummaries = getMachineSectionSummaries(currentContent, {
        onlyA: byId("onlyA").checked,
        onlyMesspunkt: byId("onlyMesspunkt").checked,
        numberStep: byId("numberStep").value
    });
    const summaries = allSummaries.filter(summary => summary.candidates > 0);
    const machineCount = new Set(allSummaries.map(summary => summary.machine.key)).size;
    const totalCandidates = summaries.reduce((sum, summary) => sum + summary.candidates, 0);
    summaryEl.textContent = `Machines: ${machineCount} | Sections with matches: ${summaries.length} | Matches to replace: ${totalCandidates}`;

    if (summaries.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 8;
        td.textContent = "No matching A/a equipment was found in CIRCUIT sections.";
        tr.appendChild(td);
        body.appendChild(tr);
        return;
    }

    const globalStart = byId("startNumber").value.trim();
    const rawGlobalStep = byId("numberStep").value.trim();
    const canAutoFill = options.forceFill === true && /^\d+$/.test(globalStart) && /^\d+$/.test(rawGlobalStep);
    const globalStep = canAutoFill ? Number(rawGlobalStep) : null;
    let fillCursor = canAutoFill ? globalStart : "";

    for (const summary of summaries) {
        const machine = summary.machine;
        const section = summary.section;
        const count = summary.candidates;
        const existing = existingValues.get(section.key);
        const groupCount = Math.min(MAX_RANGE_GROUPS, Math.max(1, existing?.groupCount || 1));
        const entries = [];
        for (let index = 0; index < groupCount; index++) {
            const existingRange = existing?.ranges.get(index);
            entries.push({
                enabled: existingRange?.enabled !== false,
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

        for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            const rangeCount = counts[index] || 0;
            const rangeLabel = `Group ${index + 1}`;
            const tr = document.createElement("tr");
            tr.dataset.machineKey = machine.key;
            tr.dataset.machineLabel = getMachineTitle(machine);
            tr.dataset.sectionKey = section.key;
            tr.dataset.sectionLabel = getSectionTitle(section);
            tr.dataset.rangeIndex = String(index);
            tr.dataset.rangeLabel = rangeLabel;
            tr.dataset.candidateCount = String(count);

            const enabledTd = document.createElement("td");
            const enabledInput = document.createElement("input");
            enabledInput.type = "checkbox";
            enabledInput.className = "range-enabled";
            enabledInput.checked = entry.enabled && rangeCount > 0;
            enabledInput.disabled = rangeCount === 0;
            enabledTd.appendChild(enabledInput);
            tr.appendChild(enabledTd);

            const machineTd = document.createElement("td");
            const name = document.createElement("span");
            name.className = "machine-name";
            name.textContent = machine.id || "Unnamed BUILDING";
            const meta = document.createElement("span");
            meta.className = "machine-meta";
            meta.textContent = [machine.txt && machine.txt !== machine.id ? machine.txt : "", machine.dbno ? `dbno ${machine.dbno}` : "", getSectionTitle(section)].filter(Boolean).join(" | ");
            machineTd.appendChild(name);
            if (meta.textContent) machineTd.appendChild(meta);
            tr.appendChild(machineTd);

            const countTd = document.createElement("td");
            countTd.textContent = String(count);
            tr.appendChild(countTd);

            const groupsTd = document.createElement("td");
            if (index === 0) {
                const groupInput = document.createElement("input");
                groupInput.type = "number";
                groupInput.className = "range-group-count";
                groupInput.min = "1";
                groupInput.max = String(MAX_RANGE_GROUPS);
                groupInput.inputMode = "numeric";
                groupInput.value = String(groupCount);
                groupsTd.appendChild(groupInput);
            } else {
                groupsTd.textContent = `${index + 1} of ${groupCount}`;
            }
            tr.appendChild(groupsTd);

            const limitTd = document.createElement("td");
            const limitInput = document.createElement("input");
            limitInput.type = "number";
            limitInput.className = "range-limit";
            limitInput.min = "1";
            limitInput.inputMode = "numeric";
            limitInput.placeholder = "remaining";
            limitInput.value = entry.limit;
            limitInput.disabled = rangeCount === 0;
            limitTd.appendChild(limitInput);
            tr.appendChild(limitTd);

            const startTd = document.createElement("td");
            const startInput = document.createElement("input");
            startInput.type = "text";
            startInput.className = "range-start";
            startInput.inputMode = "numeric";
            startInput.autocomplete = "off";
            startInput.spellcheck = false;
            startInput.value = rangeCount > 0 ? entry.startNumber : "";
            startInput.disabled = rangeCount === 0;
            startTd.appendChild(startInput);
            tr.appendChild(startTd);

            const stepTd = document.createElement("td");
            const stepInput = document.createElement("input");
            stepInput.type = "number";
            stepInput.className = "range-step";
            stepInput.min = "1";
            stepInput.inputMode = "numeric";
            stepInput.value = entry.numberStep || DEFAULT_NUMBER_STEP;
            stepInput.disabled = rangeCount === 0;
            stepTd.appendChild(stepInput);
            tr.appendChild(stepTd);

            const rangeTd = document.createElement("td");
            rangeTd.className = "machine-range-preview";
            tr.appendChild(rangeTd);

            body.appendChild(tr);
        }
    }

    body.querySelectorAll(".range-limit, .range-start, .range-step, .range-enabled").forEach(input => {
        input.addEventListener("input", updateMachineRangeRows);
        input.addEventListener("change", updateMachineRangeRows);
    });
    body.querySelectorAll(".range-group-count").forEach(input => {
        input.addEventListener("change", () => renderMachineRanges());
    });
    updateMachineRangeRows();
}

function refreshGroupedViews(options = {}) {
    renderMachineRanges(options);
    renderMachineDiagram();
    renderFileSummary();
}

function fillMachineRangesFromGlobal() {
    if (!/^\d+$/.test(byId("startNumber").value.trim()) || !/^\d+$/.test(byId("numberStep").value.trim())) {
        logWarn("Enter a global start number and number step before filling machine ranges.");
        renderMachineRanges({ forceFill: true });
        return;
    }
    renderMachineRanges({ forceFill: true });
    logOk("Machine ranges filled from the global start number.");
}

function previewChanges() {
    if (!loadedFile) {
        logWarn("Select a file first.");
        return;
    }
    if (!validateOutputSuffix()) return;

    const settings = getSettings();
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

    const settings = getSettings();
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
    byId("fillMachineRangesBtn").addEventListener("click", fillMachineRangesFromGlobal);
    byId("diagramTab").addEventListener("click", () => setReviewTab("diagramPanel"));
    byId("previewTab").addEventListener("click", () => setReviewTab("previewPanel"));
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
    updateModeUi();
    renderMachineRanges();
    renderMachineDiagram();
    renderFileSummary();
});
