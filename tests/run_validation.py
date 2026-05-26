from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ETC_PATH = ROOT / "3.etc"
SOURCE_MACHINE_ETC_PATH = ROOT / "5.etc"
TEMPLATE_PATH = ROOT / "templates" / "3-template-all-a.etc"


def run_ui_defaults_case() -> dict:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    main_js = (ROOT / "js" / "main.js").read_text(encoding="utf-8")
    empty_fields = ["startNumber", "quantity", "startDbno"]
    result = {
        f"{field}HasNoDefaultValue": re.search(rf'id="{field}"[^>]*\bvalue=', html) is None
        for field in empty_fields
    }
    result["numberStepDefaultIsOne"] = re.search(r'id="numberStep"[^>]*\bvalue="1"', html) is not None
    result["htmlHasNoNumberInputs"] = 'type="number"' not in html
    result["scriptCreatesNoNumberInputs"] = 'input.type = "number"' not in main_js
    result["machineRangeTableIsCompact"] = "<th>Count</th>" not in html and "<th>Start number</th>" not in html
    result["groupCountRendersBelowSection"] = "function createRangeGroupElement" in main_js and "machine-groups-row" in main_js
    result["runFlushesGroupEdits"] = "function getFreshSettingsForRun" in main_js and "renderMachineRangesNow();" in main_js
    return result


def run_download_retry_ui_case() -> dict:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
    utils = (ROOT / "js" / "utils.js").read_text(encoding="utf-8")
    main_js = (ROOT / "js" / "main.js").read_text(encoding="utf-8")
    return {
        "panelExists": 'id="downloadLinksPanel"' in html and 'id="downloadLinks"' in html,
        "linksAreStyled": ".download-links-panel" in css and ".download-link" in css,
        "urlFactoryExists": "function createTextDownloadUrl" in utils,
        "linkRendererExists": "function renderDownloadLinks" in main_js,
        "downloadClickUsesVisibleLinks": "triggerDownloadLinks(links)" in main_js,
        "doesNotClaimStarted": "downloads started" not in main_js.lower()
    }


def run_diagram_ui_case() -> dict:
    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")
    main_js = (ROOT / "js" / "main.js").read_text(encoding="utf-8")
    return {
        "hasDisclosureButtons": "function createToggleButton" in main_js and "aria-expanded" in main_js,
        "defaultsUseActivity": "machineHasActivity" in main_js and "sectionHasActivity" in main_js,
        "tracksExpansionState": "diagramExpansionState" in main_js and "applyDisclosureState" in main_js,
        "clearsExpansionAfterReplace": "lastAppliedPlan = result.plan" in main_js and "diagramExpansionState.clear();" in main_js,
        "hasReplacedLookup": "function getAppliedReplacementLookup" in main_js and "function wasEquipmentReplaced" in main_js,
        "hasGreenReplacedStyle": ".equipment-chip.replaced" in css and "#e6f7ec" in css
    }


def run_node_case() -> dict:
    script = r"""
const fixer = require('./js/etc-fixer.js');
const utils = require('./js/utils.js');
const text = [
  '<ROOT>',
  '  <ELECTRICALEQUIPMENT dbno="6" id="A" txt="A" type="Messpunkt" />',
  '  <ELECTRICALEQUIPMENT dbno="7" id="A" txt="A" type="Messpunkt" />',
  '  <ELECTRICALEQUIPMENT dbno="8" id="3313617" txt="3313617" type="Messpunkt" />',
  '</ROOT>'
].join('\n');
const earlierA = [
  '<ROOT>',
  '  <ELECTRICALEQUIPMENT dbno="1" id="A" txt="A" type="Messpunkt" />',
  '  <ELECTRICALEQUIPMENT dbno="6" id="A" txt="A" type="Messpunkt" />',
  '</ROOT>'
].join('\n');
const mixedCaseAndSingleSide = [
  '<ROOT>',
  '  <ELECTRICALEQUIPMENT dbno="1" id="a" txt="a" type="Messpunkt" />',
  '  <ELECTRICALEQUIPMENT dbno="2" id="A" txt="3313616" type="Messpunkt" />',
  '  <ELECTRICALEQUIPMENT dbno="3" id="3313617" txt="a" type="Messpunkt" />',
  '  <ELECTRICALEQUIPMENT dbno="4" id="3313618" txt="3313618" type="Messpunkt" />',
  '</ROOT>'
].join('\n');
const machineText = [
  '<ROOT>',
  '  <BUILDING dbno="1" id="MA100" txt="Machine One">',
  '    <DISTRIBUTIONCABINET dbno="1" id="MA100" txt="Machine One">',
  '      <ELECTRICALEQUIPMENT dbno="1" id="A" txt="A" type="Messpunkt" />',
  '      <ELECTRICALEQUIPMENT dbno="2" id="A" txt="A" type="Messpunkt" />',
  '    </DISTRIBUTIONCABINET>',
  '  </BUILDING>',
  '  <BUILDING dbno="2" id="MA200" txt="Machine Two">',
  '    <DISTRIBUTIONCABINET dbno="2" id="MA200" txt="Machine Two">',
  '      <ELECTRICALEQUIPMENT dbno="3" id="a" txt="a" type="Messpunkt" />',
  '      <ELECTRICALEQUIPMENT dbno="4" id="A" txt="3313616" type="Messpunkt" />',
  '    </DISTRIBUTIONCABINET>',
  '  </BUILDING>',
  '</ROOT>'
].join('\n');
const circuitText = [
  '<ROOT>',
  '  <BUILDING dbno="1" id="MA300" txt="Machine Three">',
  '    <CIRCUIT dbno="10" id="RLO Anlage" txt="RLO Anlage" typeofconduction="H07V-K">',
  '      <ELECTRICALEQUIPMENT dbno="1" id="A" txt="A" type="Messpunkt" />',
  '      <ELECTRICALEQUIPMENT dbno="2" id="A" txt="A" type="Messpunkt" />',
  '      <ELECTRICALEQUIPMENT dbno="3" id="A" txt="A" type="Messpunkt" />',
  '      <ELECTRICALEQUIPMENT dbno="4" id="A" txt="A" type="Messpunkt" />',
  '      <ELECTRICALEQUIPMENT dbno="5" id="A" txt="A" type="Messpunkt" />',
  '    </CIRCUIT>',
  '    <CIRCUIT dbno="11" id="RLO Cabinet" txt="RLO Cabinet" typeofconduction="H07V-K">',
  '      <ELECTRICALEQUIPMENT dbno="6" id="a" txt="a" type="Messpunkt" />',
  '      <ELECTRICALEQUIPMENT dbno="7" id="A" txt="3313616" type="Messpunkt" />',
  '    </CIRCUIT>',
  '  </BUILDING>',
  '</ROOT>'
].join('\n');
const hundredRows = ['<ROOT>'];
for (let i = 0; i < 105; i++) {
  hundredRows.push(`  <ELECTRICALEQUIPMENT dbno="${6 + i}" id="A" txt="A" type="Messpunkt" />`);
}
hundredRows.push('</ROOT>');
const single = fixer.applyPlan(text, {
  mode: 'single',
  startDbno: '6',
  startNumber: '3313615',
  quantity: '1',
  onlyA: true,
  onlyMesspunkt: true
});
const batch = fixer.applyPlan(text, {
  mode: 'batch',
  startDbno: '',
  useDbnoStart: false,
  startNumber: '3313615',
  quantity: '2',
  numberStep: '1',
  onlyA: true,
  onlyMesspunkt: true
});
const hundred = fixer.applyPlan(hundredRows.join('\n'), {
  mode: 'batch',
  startDbno: '',
  useDbnoStart: false,
  startNumber: '55667788',
  quantity: '100',
  numberStep: '1',
  onlyA: true,
  onlyMesspunkt: false
});
const stepTwo = fixer.applyPlan(hundredRows.join('\n'), {
  mode: 'batch',
  startDbno: '',
  useDbnoStart: false,
  startNumber: '55667788',
  quantity: '3',
  numberStep: '2',
  onlyA: true,
  onlyMesspunkt: false
});
const defaultFirstA = fixer.applyPlan(earlierA, {
  mode: 'batch',
  startDbno: '6',
  useDbnoStart: false,
  startNumber: '55667788',
  quantity: '2',
  numberStep: '1',
  onlyA: true,
  onlyMesspunkt: false
});
const filteredFirstA = fixer.applyPlan(earlierA, {
  mode: 'batch',
  startDbno: '6',
  useDbnoStart: true,
  startNumber: '55667788',
  quantity: '2',
  numberStep: '1',
  onlyA: true,
  onlyMesspunkt: false
});
const mixed = fixer.applyPlan(mixedCaseAndSingleSide, {
  mode: 'batch',
  startDbno: '',
  useDbnoStart: false,
  startNumber: '55667788',
  quantity: '4',
  numberStep: '1',
  onlyA: true,
  onlyMesspunkt: false
});
const mixedStats = fixer.getEquipmentStats(mixedCaseAndSingleSide);
const machineSummaries = fixer.getMachineSummaries(machineText, {
  onlyA: true,
  onlyMesspunkt: true
});
const machineOne = machineSummaries.find(summary => summary.machine.id === 'MA100');
const machineTwo = machineSummaries.find(summary => summary.machine.id === 'MA200');
const machineRun = fixer.applyMachinePlan(machineText, {
  onlyA: true,
  onlyMesspunkt: true,
  machineRanges: [
    {
      enabled: true,
      machineKey: machineOne.machine.key,
      machineLabel: 'MA100 | Machine One | dbno 1',
      startNumber: '1000',
      numberStep: '1'
    },
    {
      enabled: true,
      machineKey: machineTwo.machine.key,
      machineLabel: 'MA200 | Machine Two | dbno 2',
      startNumber: '2000',
      numberStep: '10'
    }
  ]
});
const diagram = fixer.getMachineDiagramData(machineText, {
  onlyA: true,
  onlyMesspunkt: true
});
const diagramMachineTwo = diagram.machines.find(group => group.machine.id === 'MA200');
const circuitSections = fixer.getMachineSectionSummaries(circuitText, {
  onlyA: true,
  onlyMesspunkt: true
});
const rloAnlage = circuitSections.find(summary => summary.section.id === 'RLO Anlage');
const rloCabinet = circuitSections.find(summary => summary.section.id === 'RLO Cabinet');
const splitRun = fixer.applyMachinePlan(circuitText, {
  onlyA: true,
  onlyMesspunkt: true,
  machineRanges: [
    {
      enabled: true,
      machineKey: rloAnlage.machine.key,
      machineLabel: 'MA300 | Machine Three | dbno 1',
      sectionKey: rloAnlage.section.key,
      sectionLabel: 'RLO Anlage | dbno 10',
      rangeIndex: '0',
      rangeLabel: 'Group 1',
      limit: '2',
      startNumber: '1000',
      numberStep: '1'
    },
    {
      enabled: true,
      machineKey: rloAnlage.machine.key,
      machineLabel: 'MA300 | Machine Three | dbno 1',
      sectionKey: rloAnlage.section.key,
      sectionLabel: 'RLO Anlage | dbno 10',
      rangeIndex: '1',
      rangeLabel: 'Group 2',
      limit: '2',
      startNumber: '2000',
      numberStep: '10'
    },
    {
      enabled: true,
      machineKey: rloAnlage.machine.key,
      machineLabel: 'MA300 | Machine Three | dbno 1',
      sectionKey: rloAnlage.section.key,
      sectionLabel: 'RLO Anlage | dbno 10',
      rangeIndex: '2',
      rangeLabel: 'Group 3',
      limit: '',
      startNumber: '3000',
      numberStep: '1'
    },
    {
      enabled: true,
      machineKey: rloCabinet.machine.key,
      machineLabel: 'MA300 | Machine Three | dbno 1',
      sectionKey: rloCabinet.section.key,
      sectionLabel: 'RLO Cabinet | dbno 11',
      rangeIndex: '0',
      rangeLabel: 'Group 1',
      limit: '',
      startNumber: '5000',
      numberStep: '1'
    }
  ]
});
const circuitDiagram = fixer.getMachineDiagramData(circuitText, {
  onlyA: true,
  onlyMesspunkt: true
});
const splitExportLog = fixer.buildExportLog({
  exportedAt: '2026-05-24T12:34:56.000Z',
  sourceFileName: 'circuit.etc',
  outputFileName: 'circuit_fixed.etc',
  plan: splitRun.plan
});
const exportLogName = utils.makeExportLogName('3-template-all-a.etc', '_fixed');
const exportLog = fixer.buildExportLog({
  exportedAt: '2026-05-24T12:34:56.000Z',
  sourceFileName: '3-template-all-a.etc',
  outputFileName: utils.makeDownloadName('3-template-all-a.etc', '_fixed'),
  plan: mixed.plan
});
console.log(JSON.stringify({
  singleCount: single.count,
  singleHas6: single.content.includes('dbno="6" id="3313615" txt="3313615"'),
  singleLeaves7: single.content.includes('dbno="7" id="A" txt="A"'),
  batchCount: batch.count,
  batchHas6: batch.content.includes('dbno="6" id="3313615" txt="3313615"'),
  batchHas7: batch.content.includes('dbno="7" id="3313616" txt="3313616"'),
  batchLeaves8: batch.content.includes('dbno="8" id="3313617" txt="3313617"'),
  hundredCount: hundred.count,
  hundredFirst: hundred.content.includes('dbno="6" id="55667788" txt="55667788"'),
  hundredLast: hundred.content.includes('dbno="105" id="55667887" txt="55667887"'),
  hundredLimit: hundred.content.includes('dbno="106" id="A" txt="A"'),
  stepTwoMiddle: stepTwo.content.includes('dbno="7" id="55667790" txt="55667790"'),
  stepTwoLast: stepTwo.content.includes('dbno="8" id="55667792" txt="55667792"'),
  defaultStartsAtFirstA: defaultFirstA.content.includes('dbno="1" id="55667788" txt="55667788"'),
  filterStartsAtDbno: filteredFirstA.content.includes('dbno="1" id="A" txt="A"') && filteredFirstA.content.includes('dbno="6" id="55667788" txt="55667788"'),
  mixedCount: mixed.count,
  mixedStatsPlaceholders: mixedStats.placeholders,
  mixedLowercase: mixed.content.includes('dbno="1" id="55667788" txt="55667788"'),
  mixedIdOnly: mixed.content.includes('dbno="2" id="55667789" txt="55667789"'),
  mixedTxtOnly: mixed.content.includes('dbno="3" id="55667790" txt="55667790"'),
  mixedKeepsNumeric: mixed.content.includes('dbno="4" id="3313618" txt="3313618"'),
  exportLogName,
  exportLogHasHeader: exportLog.includes('ETC Equipment ID Fixer Export Log'),
  exportLogHasDate: exportLog.includes('Exported at: 2026-05-24T12:34:56.000Z'),
  exportLogHasSource: exportLog.includes('Source file: 3-template-all-a.etc'),
  exportLogHasOutput: exportLog.includes('Output file: 3-template-all-a_fixed.etc'),
  exportLogHasCount: exportLog.includes('Count: 3'),
  exportLogHasOneSidedChange: exportLog.includes('2\t\t\t\t2\tA\t3313616\t55667789\t55667789'),
  machineCount: machineSummaries.length,
  machineOneCandidates: machineOne.candidates,
  machineTwoCandidates: machineTwo.candidates,
  machineRunCount: machineRun.count,
  machineOneFirst: machineRun.content.includes('dbno="1" id="1000" txt="1000"'),
  machineOneSecond: machineRun.content.includes('dbno="2" id="1001" txt="1001"'),
  machineTwoFirst: machineRun.content.includes('dbno="3" id="2000" txt="2000"'),
  machineTwoSecond: machineRun.content.includes('dbno="4" id="2010" txt="2010"'),
  machinePreviewHasMachine: machineRun.plan.rows.some(row => row.machine === 'MA200 | Machine Two | dbno 2' && row.newValue === '2010'),
  diagramMachineCount: diagram.totals.machines,
  diagramShownEquipment: diagram.totals.shownEquipment,
  diagramPlaceholderCount: diagram.totals.placeholders,
  diagramCandidateCount: diagram.totals.candidates,
  diagramShowsOneSidedValue: diagramMachineTwo.equipment.some(item => item.dbno === '4' && item.displayValue === 'A / 3313616' && item.isPlaceholder),
  circuitSectionCount: circuitSections.length,
  rloAnlageCandidates: rloAnlage.candidates,
  rloCabinetCandidates: rloCabinet.candidates,
  splitRunCount: splitRun.count,
  splitFirstGroup: splitRun.content.includes('dbno="1" id="1000" txt="1000"') && splitRun.content.includes('dbno="2" id="1001" txt="1001"'),
  splitSecondGroup: splitRun.content.includes('dbno="3" id="2000" txt="2000"') && splitRun.content.includes('dbno="4" id="2010" txt="2010"'),
  splitRemainingGroup: splitRun.content.includes('dbno="5" id="3000" txt="3000"'),
  splitSecondSection: splitRun.content.includes('dbno="6" id="5000" txt="5000"') && splitRun.content.includes('dbno="7" id="5001" txt="5001"'),
  splitPreviewHasSection: splitRun.plan.rows.some(row => row.section === 'RLO Anlage | dbno 10' && row.range === 'Group 2' && row.newValue === '2010'),
  circuitDiagramSections: circuitDiagram.machines[0].sections.filter(section => section.equipment.length > 0).length,
  splitExportLogHasSection: splitExportLog.includes('RLO Anlage | dbno 10') && splitExportLog.includes('Group 3')
}));
"""
    completed = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(completed.stdout)


def run_template_case() -> dict:
    if not SOURCE_ETC_PATH.exists():
        return {"skipped": True}

    subprocess.run([sys.executable, "scripts/create_template_from_3.py"], cwd=ROOT, check=True)
    script = r"""
const fs = require('fs');
const fixer = require('./js/etc-fixer.js');
const templatePath = process.argv[1];
const outputPath = './tests/generated/3-template-all-a-fixed.etc';
const text = fs.readFileSync(templatePath, 'utf8');
const statsBefore = fixer.getEquipmentStats(text);
const result = fixer.applyPlan(text, {
  mode: 'batch',
  startDbno: '',
  useDbnoStart: false,
  startNumber: '55667788',
  quantity: '100',
  numberStep: '1',
  onlyA: true,
  onlyMesspunkt: false
});
fs.mkdirSync('./tests/generated', { recursive: true });
fs.writeFileSync(outputPath, result.content, 'utf8');
const statsAfter = fixer.getEquipmentStats(result.content);
console.log(JSON.stringify({
  exists: fs.existsSync(templatePath),
  outputExists: fs.existsSync(outputPath),
  beforeTotal: statsBefore.total,
  beforeMesspunkt: statsBefore.messpunkt,
  beforePlaceholders: statsBefore.placeholders,
  replacementCount: result.count,
  warningCount: result.plan.warnings.length,
  firstUpdated: result.content.includes('dbno="6" id="55667788" txt="55667788"'),
  lastUpdated: result.content.includes('dbno="58" id="55667840" txt="55667840"'),
  afterPlaceholders: statsAfter.placeholders
}));
"""
    completed = subprocess.run(
        ["node", "-e", script, str(TEMPLATE_PATH)],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(completed.stdout)


def run_machine_sample_case() -> dict:
    if not SOURCE_MACHINE_ETC_PATH.exists():
        return {"skipped": True}

    script = r"""
const fs = require('fs');
const fixer = require('./js/etc-fixer.js');
const samplePath = process.argv[1];
const text = fs.readFileSync(samplePath, 'utf8');
const data = fixer.getMachineDiagramData(text, {
  onlyA: true,
  onlyMesspunkt: true
});
const machinesWithPlaceholders = data.machines.filter(group =>
  group.equipment.some(item => item.isPlaceholder)
);
console.log(JSON.stringify({
  skipped: false,
  machineCount: data.totals.machines,
  shownEquipment: data.totals.shownEquipment,
  placeholders: data.totals.placeholders,
  candidates: data.totals.candidates,
  machinesWithPlaceholders: machinesWithPlaceholders.length,
  machinesWithSections: data.machines.filter(group => group.sections.some(section => section.equipment.length > 0)).length,
  sectionsWithPlaceholders: data.machines.reduce((sum, group) => sum + group.sections.filter(section =>
    section.equipment.some(item => item.isPlaceholder)
  ).length, 0),
  hasMachineIds: data.machines.some(group => String(group.machine.id || '').startsWith('MA'))
}));
"""
    completed = subprocess.run(
        ["node", "-e", script, str(SOURCE_MACHINE_ETC_PATH)],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(completed.stdout)


def run_security_case() -> dict:
    script = r"""
const fixer = require('./js/etc-fixer.js');
const utils = require('./js/utils.js');
const malformed = [
  '<ROOT>',
  '  <ELECTRICALEQUIPMENT dbno="6abc" id="A" txt="A" type="Messpunkt" />',
  '  <ELECTRICALEQUIPMENT dbno="7" id="A" type="Messpunkt" />',
  '</ROOT>'
].join('\n');
const missingTxtOnly = [
  '<ROOT>',
  '  <ELECTRICALEQUIPMENT dbno="7" id="A" type="Messpunkt" />',
  '</ROOT>'
].join('\n');
const tooManyMachineRows = ['<ROOT>', '<BUILDING dbno="1" id="MA100" txt="Machine One">'];
for (let i = 0; i < 10001; i++) {
  tooManyMachineRows.push(`  <ELECTRICALEQUIPMENT dbno="${i}" id="A" txt="A" type="Messpunkt" />`);
}
tooManyMachineRows.push('</BUILDING>', '</ROOT>');
const badDbno = fixer.buildPlan(malformed, {
  mode: 'single',
  startDbno: '6abc',
  startNumber: '55667788',
  quantity: '1',
  onlyA: true,
  onlyMesspunkt: true
});
const tooMany = fixer.buildPlan(malformed, {
  mode: 'batch',
  startDbno: '',
  useDbnoStart: false,
  startNumber: '55667788',
  quantity: '10001',
  numberStep: '1',
  onlyA: true,
  onlyMesspunkt: true
});
const missingTxt = fixer.applyPlan(missingTxtOnly, {
  mode: 'batch',
  startDbno: '',
  useDbnoStart: false,
  startNumber: '55667788',
  quantity: '10',
  numberStep: '1',
  onlyA: false,
  onlyMesspunkt: true
});
const tooManyMachineText = tooManyMachineRows.join('\n');
const tooManyMachine = fixer.getMachineSummaries(tooManyMachineText, {
  onlyA: true,
  onlyMesspunkt: true
})[0];
console.log(JSON.stringify({
  badDbnoRejected: badDbno.errors.length > 0,
  tooManyRejected: tooMany.errors.length > 0,
  badStepRejected: fixer.buildPlan(malformed, {
    mode: 'batch',
    startDbno: '',
    useDbnoStart: false,
    startNumber: '55667788',
    quantity: '10',
    numberStep: '0',
    onlyA: true,
    onlyMesspunkt: true
  }).errors.length > 0,
  missingStepRejected: fixer.buildPlan(malformed, {
    mode: 'batch',
    startDbno: '',
    useDbnoStart: false,
    startNumber: '55667788',
    quantity: '10',
    onlyA: true,
    onlyMesspunkt: true
  }).errors.length > 0,
  missingTxtNotChanged: missingTxt.count === 0,
  tooManyMachineRejected: fixer.buildMachinePlan(tooManyMachineText, {
    onlyA: true,
    onlyMesspunkt: true,
    machineRanges: [{
      enabled: true,
      machineKey: tooManyMachine.machine.key,
      machineLabel: 'MA100',
      startNumber: '1000',
      numberStep: '1'
    }]
  }).errors.length > 0,
  missingMachineStepRejected: fixer.buildMachinePlan(tooManyMachineText, {
    onlyA: true,
    onlyMesspunkt: true,
    machineRanges: [{
      enabled: true,
      machineKey: tooManyMachine.machine.key,
      machineLabel: 'MA100',
      startNumber: '1000'
    }]
  }).errors.length > 0,
  unsafeSuffixRejected: !utils.isSafeOutputSuffix('../bad'),
  safeSuffixAccepted: utils.isSafeOutputSuffix('_fixed-01'),
  sanitizedName: utils.sanitizeDownloadFileName('..\\\\bad:name.etc')
}));
"""
    completed = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(completed.stdout)


def assert_true(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def main() -> None:
    ui_defaults = run_ui_defaults_case()
    assert_true(ui_defaults["startNumberHasNoDefaultValue"], "start number input should be empty by default")
    assert_true(ui_defaults["numberStepDefaultIsOne"], "number step input should default to 1")
    assert_true(ui_defaults["quantityHasNoDefaultValue"], "quantity input should be empty by default")
    assert_true(ui_defaults["startDbnoHasNoDefaultValue"], "start dbno input should be empty by default")
    assert_true(ui_defaults["htmlHasNoNumberInputs"], "HTML numeric inputs should use text inputs with numeric keyboard hints")
    assert_true(ui_defaults["scriptCreatesNoNumberInputs"], "dynamic numeric inputs should not use browser spinner controls")
    assert_true(ui_defaults["machineRangeTableIsCompact"], "machine range table should keep group fields below the section row")
    assert_true(ui_defaults["groupCountRendersBelowSection"], "group count should render compact group fields below each section")
    assert_true(ui_defaults["runFlushesGroupEdits"], "preview and replace should apply pending group count edits before reading settings")

    download_retry_ui = run_download_retry_ui_case()
    assert_true(download_retry_ui["panelExists"], "download retry links panel should exist")
    assert_true(download_retry_ui["linksAreStyled"], "download retry links should be styled")
    assert_true(download_retry_ui["urlFactoryExists"], "download URLs should be created through a reusable helper")
    assert_true(download_retry_ui["linkRendererExists"], "download retry links should be rendered after export")
    assert_true(download_retry_ui["downloadClickUsesVisibleLinks"], "download action should click the rendered retry links")
    assert_true(download_retry_ui["doesNotClaimStarted"], "download log should not claim that browser downloads definitely started")

    diagram_ui = run_diagram_ui_case()
    assert_true(diagram_ui["hasDisclosureButtons"], "machine diagram should render collapsible disclosure buttons")
    assert_true(diagram_ui["defaultsUseActivity"], "machine diagram collapsed defaults should depend on matches or replacements")
    assert_true(diagram_ui["tracksExpansionState"], "machine diagram should keep manual expansion state while rerendering")
    assert_true(diagram_ui["clearsExpansionAfterReplace"], "machine diagram should reset expansion defaults after replacements")
    assert_true(diagram_ui["hasReplacedLookup"], "machine diagram should detect equipment changed by the last replacement plan")
    assert_true(diagram_ui["hasGreenReplacedStyle"], "machine diagram should style replaced equipment chips in green")

    result = run_node_case()
    assert_true(result["singleCount"] == 1, "single mode should replace one tag")
    assert_true(result["singleHas6"], "single mode should update dbno 6")
    assert_true(result["singleLeaves7"], "single mode should leave dbno 7")
    assert_true(result["batchCount"] == 2, "batch mode should replace two tags")
    assert_true(result["batchHas6"], "batch mode should update first tag")
    assert_true(result["batchHas7"], "batch mode should increment second tag")
    assert_true(result["batchLeaves8"], "batch mode should not overwrite existing numeric id when onlyA is enabled")
    assert_true(result["hundredCount"] == 100, "range mode should replace exactly 100 tags")
    assert_true(result["hundredFirst"], "replacement should start at 55667788")
    assert_true(result["hundredLast"], "replacement should end at 55667887 for 100 replacements")
    assert_true(result["hundredLimit"], "range mode should leave the 101st matching tag unchanged")
    assert_true(result["stepTwoMiddle"], "number step should control the second generated number")
    assert_true(result["stepTwoLast"], "number step should control the third generated number")
    assert_true(result["defaultStartsAtFirstA"], "range mode should start at the first matching A by default")
    assert_true(result["filterStartsAtDbno"], "dbno filtering should only apply when explicitly enabled")
    assert_true(result["mixedCount"] == 3, "placeholder detection should accept lowercase and one-sided A values")
    assert_true(result["mixedStatsPlaceholders"] == 3, "stats should count lowercase and one-sided A placeholders")
    assert_true(result["mixedLowercase"], "lowercase a/a should be replaced")
    assert_true(result["mixedIdOnly"], "id-only A should still rewrite id and txt")
    assert_true(result["mixedTxtOnly"], "txt-only a should still rewrite id and txt")
    assert_true(result["mixedKeepsNumeric"], "fully numeric id/txt should remain unchanged")
    assert_true(result["exportLogName"] == "3-template-all-a_fixed_export-log.txt", "export log file name should match the exported ETC name")
    assert_true(result["exportLogHasHeader"], "export log should include a stable header")
    assert_true(result["exportLogHasDate"], "export log should include the export timestamp")
    assert_true(result["exportLogHasSource"], "export log should include the source file name")
    assert_true(result["exportLogHasOutput"], "export log should include the output file name")
    assert_true(result["exportLogHasCount"], "export log should include the replacement count")
    assert_true(result["exportLogHasOneSidedChange"], "export log should include old and new id/txt values")
    assert_true(result["machineCount"] == 2, "machine detection should find two BUILDING groups")
    assert_true(result["machineOneCandidates"] == 2, "first machine should have two replacement candidates")
    assert_true(result["machineTwoCandidates"] == 2, "second machine should have two replacement candidates")
    assert_true(result["machineRunCount"] == 4, "machine mode should replace all enabled machine candidates")
    assert_true(result["machineOneFirst"], "first machine should start from its own range")
    assert_true(result["machineOneSecond"], "first machine should increment within its own range")
    assert_true(result["machineTwoFirst"], "second machine should start from its own range")
    assert_true(result["machineTwoSecond"], "second machine should use its own number step")
    assert_true(result["machinePreviewHasMachine"], "machine mode preview rows should include machine labels")
    assert_true(result["diagramMachineCount"] == 2, "machine diagram should include machine groups")
    assert_true(result["diagramShownEquipment"] == 4, "machine diagram should show filtered equipment")
    assert_true(result["diagramPlaceholderCount"] == 4, "machine diagram should count placeholders")
    assert_true(result["diagramCandidateCount"] == 4, "machine diagram should count replacement matches")
    assert_true(result["diagramShowsOneSidedValue"], "machine diagram should display one-sided placeholder values")
    assert_true(result["circuitSectionCount"] == 2, "CIRCUIT sections should be detected inside machines")
    assert_true(result["rloAnlageCandidates"] == 5, "first CIRCUIT section should count its own replacement candidates")
    assert_true(result["rloCabinetCandidates"] == 2, "second CIRCUIT section should count its own replacement candidates")
    assert_true(result["splitRunCount"] == 7, "split section ranges should replace all covered candidates")
    assert_true(result["splitFirstGroup"], "first split group should use its own start and step")
    assert_true(result["splitSecondGroup"], "second split group should use its own start and step")
    assert_true(result["splitRemainingGroup"], "blank split count should cover the remaining section candidates")
    assert_true(result["splitSecondSection"], "second CIRCUIT section should use its independent range")
    assert_true(result["splitPreviewHasSection"], "split preview rows should include section and group labels")
    assert_true(result["circuitDiagramSections"] == 2, "machine diagram should group equipment under CIRCUIT sections")
    assert_true(result["splitExportLogHasSection"], "export log should include section and group labels")

    security = run_security_case()
    assert_true(security["badDbnoRejected"], "strict dbno parsing should reject mixed input")
    assert_true(security["tooManyRejected"], "quantity limit should reject oversized runs")
    assert_true(security["badStepRejected"], "number step validation should reject non-positive values")
    assert_true(security["missingStepRejected"], "number step validation should reject missing values")
    assert_true(security["missingTxtNotChanged"], "tags without both id and txt should not be partially changed")
    assert_true(security["tooManyMachineRejected"], "machine range mode should reject oversized runs")
    assert_true(security["missingMachineStepRejected"], "machine range mode should reject missing number steps")
    assert_true(security["unsafeSuffixRejected"], "unsafe suffixes should be rejected")
    assert_true(security["safeSuffixAccepted"], "safe suffixes should be accepted")
    assert_true("\\" not in security["sanitizedName"], "download file names should be sanitized")

    template = run_template_case()
    if template.get("skipped"):
        print("Skipped local 3.etc template validation because 3.etc is not present")
    else:
        assert_true(template["exists"], "template file should be generated")
        assert_true(template["outputExists"], "template output file should be generated")
        assert_true(template["beforeTotal"] == 58, "template should preserve the equipment tag count")
        assert_true(template["beforeMesspunkt"] == 53, "template should preserve the Messpunkt tag count")
        assert_true(template["beforePlaceholders"] == 53, "template should set all Messpunkt ids to A")
        assert_true(template["replacementCount"] == 53, "real template run should replace all available Messpunkt placeholders")
        assert_true(template["warningCount"] == 1, "real template run should warn when requested quantity exceeds available tags")
        assert_true(template["firstUpdated"], "real template run should update dbno 6 to the start number")
        assert_true(template["lastUpdated"], "real template run should increment through dbno 58")
        assert_true(template["afterPlaceholders"] == 0, "real template run should remove all Messpunkt placeholders")

    machine_sample = run_machine_sample_case()
    if machine_sample.get("skipped"):
        print("Skipped local 5.etc machine diagram validation because 5.etc is not present")
    else:
        assert_true(machine_sample["machineCount"] > 1, "local machine sample should contain multiple machines")
        assert_true(machine_sample["shownEquipment"] > 0, "local machine sample should expose grouped equipment")
        assert_true(machine_sample["placeholders"] > 0, "local machine sample should contain placeholders")
        assert_true(machine_sample["candidates"] == machine_sample["placeholders"], "local machine sample candidates should match placeholders with default safety filters")
        assert_true(machine_sample["machinesWithPlaceholders"] > 0, "local machine sample should group placeholders under machines")
        assert_true(machine_sample["machinesWithSections"] > 0, "local machine sample should expose CIRCUIT sections")
        assert_true(machine_sample["sectionsWithPlaceholders"] > 0, "local machine sample should group placeholders under CIRCUIT sections")
        assert_true(machine_sample["hasMachineIds"], "local machine sample should expose machine IDs")

    subprocess.run([sys.executable, "scripts/build_singlefile_dist.py"], cwd=ROOT, check=True)
    output = ROOT / "dist" / "ETC-Equipment-ID-Fixer.html"
    assert_true(output.exists(), "single-file build should exist")
    html = output.read_text(encoding="utf-8")
    assert_true("<script src=" not in html, "single-file build should inline scripts")
    assert_true("<link rel=\"stylesheet\"" not in html, "single-file build should inline CSS")
    subprocess.run([sys.executable, "scripts/run_privacy_gate.py"], cwd=ROOT, check=True)
    print("Validation passed")


if __name__ == "__main__":
    main()
