let loadedFile = null;
let originalContent = "";
let currentContent = "";
let lastPlan = null;
let lastAppliedPlan = null;
let hasChanges = false;

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
    summary.textContent = `${loadedFile.name} | ${formatBytes(loadedFile.size)} | Machines: ${machines.length} | ELECTRICALEQUIPMENT: ${stats.total} | Messpunkt: ${stats.messpunkt} | A/a placeholders: ${stats.placeholders} | Messpunkt A/a: ${stats.messpunktPlaceholders}`;
}

function renderRunSummary(text) {
    byId("runSummary").textContent = text;
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
        [row.dbno, row.machine || "-", row.oldId, row.oldTxt, row.newValue, row.status].forEach((value, index) => {
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
    summaryEl.textContent = `Machines: ${data.totals.machines} | Shown equipment: ${data.totals.shownEquipment} | A/a placeholders: ${data.totals.placeholders} | Replacement matches: ${data.totals.candidates}`;

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

        if (group.equipment.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-machine";
            empty.textContent = "No equipment for the current filters.";
            block.appendChild(empty);
        } else {
            const flow = document.createElement("div");
            flow.className = "equipment-flow";
            for (const equipment of group.equipment) {
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
            block.appendChild(flow);
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
        syncQuantityWithDetectedPlaceholders();
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

function syncQuantityWithDetectedPlaceholders() {
    if (!currentContent) return;
    const stats = getEquipmentStats(currentContent);
    const detected = byId("onlyMesspunkt").checked ? stats.messpunktPlaceholders : stats.placeholders;
    if (detected > 0) byId("quantity").value = String(detected);
}

function getMachineRangeSettings() {
    const rows = Array.from(document.querySelectorAll("#machineBody tr[data-machine-key]"));
    return rows.map(row => ({
        machineKey: row.dataset.machineKey,
        machineLabel: row.dataset.machineLabel,
        enabled: row.querySelector(".machine-enabled")?.checked === true,
        startNumber: row.querySelector(".machine-start")?.value || "",
        numberStep: row.querySelector(".machine-step")?.value || "1"
    }));
}

function computeRangePreview(startNumber, count, step) {
    if (count < 1) return "-";
    const start = String(startNumber || "").trim();
    const parsedStep = Number(String(step || "").trim());
    if (!/^\d+$/.test(start) || !Number.isSafeInteger(parsedStep) || parsedStep < 1) return "-";
    const last = incrementDigitString(start, count - 1, parsedStep);
    return count === 1 ? start : `${start} - ${last}`;
}

function getExistingMachineRangeValues() {
    const values = new Map();
    for (const row of Array.from(document.querySelectorAll("#machineBody tr[data-machine-key]"))) {
        values.set(row.dataset.machineKey, {
            enabled: row.querySelector(".machine-enabled")?.checked === true,
            startNumber: row.querySelector(".machine-start")?.value || "",
            numberStep: row.querySelector(".machine-step")?.value || "1"
        });
    }
    return values;
}

function nextMachineStartNumbers(summaries, existingValues, forceFill = false) {
    const starts = new Map();
    const globalStart = byId("startNumber").value;
    const globalStep = Number(byId("numberStep").value || "1");
    let cursor = /^\d+$/.test(globalStart) ? globalStart : "";

    for (const summary of summaries) {
        const count = summary.candidates;
        const existing = existingValues.get(summary.machine.key);
        const canKeepExisting = !forceFill && existing && existing.startNumber;
        const startNumber = canKeepExisting ? existing.startNumber : cursor;
        starts.set(summary.machine.key, startNumber);
        if (cursor && count > 0 && Number.isSafeInteger(globalStep) && globalStep > 0) {
            cursor = incrementDigitString(cursor, count, globalStep) || cursor;
        }
    }

    return starts;
}

function updateMachineRangeRows() {
    for (const row of Array.from(document.querySelectorAll("#machineBody tr[data-machine-key]"))) {
        const count = Number(row.dataset.candidateCount || "0");
        const start = row.querySelector(".machine-start")?.value || "";
        const step = row.querySelector(".machine-step")?.value || "1";
        const preview = row.querySelector(".machine-range-preview");
        if (preview) preview.textContent = computeRangePreview(start, count, step);
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
        td.colSpan = 6;
        td.textContent = "No machine data.";
        tr.appendChild(td);
        body.appendChild(tr);
        return;
    }

    const existingValues = getExistingMachineRangeValues();
    const summaries = getMachineSummaries(currentContent, {
        onlyA: byId("onlyA").checked,
        onlyMesspunkt: byId("onlyMesspunkt").checked,
        numberStep: byId("numberStep").value
    });
    const starts = nextMachineStartNumbers(summaries, existingValues, options.forceFill === true);
    const activeCount = summaries.filter(summary => summary.candidates > 0).length;
    const totalCandidates = summaries.reduce((sum, summary) => sum + summary.candidates, 0);
    summaryEl.textContent = `Machines: ${summaries.length} | Machines with matches: ${activeCount} | Matches to replace: ${totalCandidates}`;

    if (summaries.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 6;
        td.textContent = "No BUILDING machines were found.";
        tr.appendChild(td);
        body.appendChild(tr);
        return;
    }

    for (const summary of summaries) {
        const machine = summary.machine;
        const count = summary.candidates;
        const existing = existingValues.get(machine.key);
        const enabled = count > 0 && (options.forceFill === true || existing?.enabled !== false);
        const step = existing?.numberStep || byId("numberStep").value || "1";
        const startNumber = starts.get(machine.key) || "";
        const tr = document.createElement("tr");
        tr.dataset.machineKey = machine.key;
        tr.dataset.machineLabel = getMachineTitle(machine);
        tr.dataset.candidateCount = String(count);

        const enabledTd = document.createElement("td");
        const enabledInput = document.createElement("input");
        enabledInput.type = "checkbox";
        enabledInput.className = "machine-enabled";
        enabledInput.checked = enabled;
        enabledInput.disabled = count === 0;
        enabledTd.appendChild(enabledInput);
        tr.appendChild(enabledTd);

        const machineTd = document.createElement("td");
        const name = document.createElement("span");
        name.className = "machine-name";
        name.textContent = machine.id || "Unnamed BUILDING";
        const meta = document.createElement("span");
        meta.className = "machine-meta";
        meta.textContent = [machine.txt && machine.txt !== machine.id ? machine.txt : "", machine.dbno ? `dbno ${machine.dbno}` : ""].filter(Boolean).join(" | ");
        machineTd.appendChild(name);
        if (meta.textContent) machineTd.appendChild(meta);
        tr.appendChild(machineTd);

        const countTd = document.createElement("td");
        countTd.textContent = String(count);
        tr.appendChild(countTd);

        const startTd = document.createElement("td");
        const startInput = document.createElement("input");
        startInput.type = "text";
        startInput.className = "machine-start";
        startInput.inputMode = "numeric";
        startInput.autocomplete = "off";
        startInput.spellcheck = false;
        startInput.value = count > 0 ? startNumber : "";
        startInput.disabled = count === 0;
        startTd.appendChild(startInput);
        tr.appendChild(startTd);

        const stepTd = document.createElement("td");
        const stepInput = document.createElement("input");
        stepInput.type = "number";
        stepInput.className = "machine-step";
        stepInput.min = "1";
        stepInput.inputMode = "numeric";
        stepInput.value = step;
        stepInput.disabled = count === 0;
        stepTd.appendChild(stepInput);
        tr.appendChild(stepTd);

        const rangeTd = document.createElement("td");
        rangeTd.className = "machine-range-preview";
        tr.appendChild(rangeTd);

        body.appendChild(tr);
    }

    body.querySelectorAll("input").forEach(input => {
        input.addEventListener("input", updateMachineRangeRows);
        input.addEventListener("change", updateMachineRangeRows);
    });
    updateMachineRangeRows();
}

function refreshGroupedViews(options = {}) {
    renderMachineRanges(options);
    renderMachineDiagram();
    renderFileSummary();
}

function fillMachineRangesFromGlobal() {
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
    byId("downloadBtn").disabled = false;
    refreshGroupedViews();
    renderRunSummary(`Done: ${result.count} replacements.`);
    logOk(`Replaced: ${result.count}`);
    result.plan.warnings.forEach(logWarn);
    for (const replacement of result.plan.replacements) {
        const machinePrefix = replacement.row.machine ? `${replacement.row.machine} | ` : "";
        log(`${machinePrefix}dbno ${replacement.row.dbno}: ${replacement.row.oldId}/${replacement.row.oldTxt} -> ${replacement.row.newValue}`);
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

    downloadText(currentContent, outputName);
    downloadText(exportLog, exportLogName);
    logOk(`File and export log downloads started: ${outputName}, ${exportLogName}`);
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
        syncQuantityWithDetectedPlaceholders();
        refreshGroupedViews();
    });
    byId("numberStep").addEventListener("change", () => refreshGroupedViews({ forceFill: true }));
    byId("startNumber").addEventListener("change", () => refreshGroupedViews({ forceFill: true }));
    byId("useDbnoStart").addEventListener("change", updateModeUi);
    byId("useMachineRanges").addEventListener("change", updateModeUi);
    updateModeUi();
    renderMachineRanges();
    renderMachineDiagram();
    renderFileSummary();
});
