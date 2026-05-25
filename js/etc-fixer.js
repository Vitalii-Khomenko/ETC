const MAX_REPLACEMENTS = 10000;
const MAX_START_NUMBER_DIGITS = 32;
const MAX_NUMBER_STEP = 1000000;

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

function readSettings(rawSettings) {
    const mode = rawSettings.mode === "batch" ? "batch" : "single";
    const useDbnoStart = mode === "single" || rawSettings.useDbnoStart === true;
    const startDbno = useDbnoStart ? parseStrictNonNegativeInteger(rawSettings.startDbno) : null;
    const quantity = mode === "batch" ? parseStrictPositiveInteger(rawSettings.quantity) : 1;
    const numberStep = mode === "batch" ? parseStrictPositiveInteger(rawSettings.numberStep ?? 1) : 1;
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
        lines.push(["#", "dbno", "old id", "old txt", "new id", "new txt"].join("\t"));
        replacements.forEach((replacement, index) => {
            const row = replacement.row || {};
            const newValue = cleanExportLogValue(row.newValue);
            lines.push([
                index + 1,
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
        buildPlan,
        applyPlan,
        buildExportLog
    };
}
