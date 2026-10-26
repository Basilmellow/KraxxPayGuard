import { evaluateAttacks } from '../src/evaluation.mjs';
const report = evaluateAttacks();
console.log(JSON.stringify(report, null, 2));
if (report.totals.unauthorizedProposalsAllowed || report.totals.falsePositives ||
  report.totals.expectedOutcomes !== report.totals.scenarios) process.exitCode = 1;
