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
    return "batch";
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
        mode: "batch",
        startDbno: byId("startDbno").value,
        useDbnoStart: byId("useDbnoStart").checked,
        startNumber: byId("startNumber").value,
        quantity: byId("quantity").value,
        numberStep: byId("numberStep").value,
        onlyA: byId("onlyA").checked,
        onlyMesspunkt: byId("onlyMesspunkt").checked
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
    byId("startDbno").disabled = !useFilter;
    byId("startDbnoGroup").classList.toggle("hidden", !useFilter);
}

function renderFileSummary() {
    const summary = byId("fileSummary");
    if (!loadedFile) {
        summary.textContent = "No file selected.";
        return;
    }
    const stats = getEquipmentStats(originalContent);
    summary.textContent = `${loadedFile.name} | ${formatBytes(loadedFile.size)} | ELECTRICALEQUIPMENT: ${stats.total} | Messpunkt: ${stats.messpunkt} | A/a placeholders: ${stats.placeholders} | Messpunkt A/a: ${stats.messpunktPlaceholders}`;
}

function renderRunSummary(text) {
    byId("runSummary").textContent = text;
}

function renderPreview(rows) {
    const body = byId("previewBody");
    body.textContent = "";
    for (const row of rows.slice(0, 80)) {
        const tr = document.createElement("tr");
        const statusClass = row.ok ? "status-ok" : "status-warn";
        [row.dbno, row.oldId, row.oldTxt, row.newValue, row.status].forEach((value, index) => {
            const td = document.createElement("td");
            td.textContent = value;
            if (index === 4) td.className = statusClass;
            tr.appendChild(td);
        });
        body.appendChild(tr);
    }
    if (rows.length > 80) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.textContent = `Showing 80 of ${rows.length}.`;
        tr.appendChild(td);
        body.appendChild(tr);
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

function previewChanges() {
    if (!loadedFile) {
        logWarn("Select a file first.");
        return;
    }
    if (!validateOutputSuffix()) return;

    const plan = buildPlan(currentContent, getSettings());
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

    const result = applyPlan(currentContent, getSettings());
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
    renderRunSummary(`Done: ${result.count} replacements.`);
    logOk(`Replaced: ${result.count}`);
    result.plan.warnings.forEach(logWarn);
    for (const replacement of result.plan.replacements) {
        log(`dbno ${replacement.row.dbno}: ${replacement.row.oldId}/${replacement.row.oldTxt} -> ${replacement.row.newValue}`);
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
    byId("onlyMesspunkt").addEventListener("change", syncQuantityWithDetectedPlaceholders);
    byId("useDbnoStart").addEventListener("change", updateModeUi);
    updateModeUi();
    renderFileSummary();
});
