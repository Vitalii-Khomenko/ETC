const MAX_INPUT_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(["etc", "xml", "txt"]);
const LOG_MAX_LINES = 300;
const SAFE_SUFFIX_PATTERN = /^[A-Za-z0-9._-]{0,40}$/;
const UNSAFE_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

function getFileExtension(fileName) {
    const parts = String(fileName || "").split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

function isSupportedFile(file) {
    return !!file && SUPPORTED_EXTENSIONS.has(getFileExtension(file.name));
}

function isSafeOutputSuffix(value) {
    return SAFE_SUFFIX_PATTERN.test(String(value || ""));
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => resolve(String(event.target.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Read failed"));
        reader.readAsText(file);
    });
}

function makeDownloadName(fileName, suffix) {
    const safeSuffix = isSafeOutputSuffix(suffix) ? String(suffix || "") : "_fixed";
    const name = sanitizeDownloadFileName(fileName || "output.etc");
    const dot = name.lastIndexOf(".");
    if (dot <= 0) return `${name}${safeSuffix}`;
    return `${name.slice(0, dot)}${safeSuffix}${name.slice(dot)}`;
}

function makeExportLogName(fileName, suffix) {
    const outputName = makeDownloadName(fileName, suffix);
    const dot = outputName.lastIndexOf(".");
    const baseName = dot <= 0 ? outputName : outputName.slice(0, dot);
    return `${baseName}_export-log.txt`;
}

function sanitizeDownloadFileName(fileName) {
    const sanitized = String(fileName || "output.etc")
        .replace(UNSAFE_FILENAME_CHARS, "_")
        .replace(/\s+/g, " ")
        .trim();
    return sanitized || "output.etc";
}

function createTextDownloadUrl(content) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    return URL.createObjectURL(blob);
}

function getLogElement() {
    return document.getElementById("log");
}

function enforceLogLimit(logEl) {
    if (!logEl) return;
    const maxNodes = LOG_MAX_LINES * 2 + 8;
    while (logEl.childNodes.length > maxNodes) {
        logEl.removeChild(logEl.firstChild);
    }
}

function appendLog(message, className = "") {
    const logEl = getLogElement();
    if (!logEl) return;
    const span = document.createElement("span");
    span.textContent = String(message);
    if (className) span.className = className;
    logEl.appendChild(span);
    logEl.appendChild(document.createTextNode("\n"));
    enforceLogLimit(logEl);
    logEl.scrollTop = logEl.scrollHeight;
}

function log(message) { appendLog(message); }
function logOk(message) { appendLog(message, "log-ok"); }
function logWarn(message) { appendLog(message, "log-warn"); }
function logError(message) { appendLog(message, "log-error"); }
function clearLog() {
    const logEl = getLogElement();
    if (logEl) logEl.textContent = "";
}

if (typeof module !== "undefined") {
    module.exports = {
        MAX_INPUT_FILE_SIZE_BYTES,
        SUPPORTED_EXTENSIONS,
        getFileExtension,
        formatBytes,
        isSupportedFile,
        isSafeOutputSuffix,
        sanitizeDownloadFileName,
        createTextDownloadUrl,
        makeDownloadName,
        makeExportLogName
    };
}
