import { pathToFileURL } from "node:url";
import {
  readK8sDeployments,
  readMeshServices,
  readNorthflankTemplateServices,
  readRailwayDeployHelperServices,
  readRailwayServices,
  readServiceCatalog,
} from "./service-audit-common.mjs";

function toSet(values) {
  return new Set((Array.isArray(values) ? values : []).map((value) => String(value).trim()).filter(Boolean));
}

function diffSet(source, target) {
  return [...source].filter((item) => !target.has(item)).sort();
}

function run() {
  const catalog = readServiceCatalog();
  const catalogServices = toSet([...catalog.byService.keys()]);

  const retained = new Set(
    catalog.services
      .filter((row) => String(row?.lifecycle ?? "active").toLowerCase() !== "retired")
      .map((row) => String(row.service ?? "").trim())
      .filter(Boolean),
  );
  const retired = new Set(
    catalog.services
      .filter((row) => String(row?.lifecycle ?? "active").toLowerCase() === "retired")
      .map((row) => String(row.service ?? "").trim())
      .filter(Boolean),
  );

  const mesh = new Set(readMeshServices().filter((service) => catalogServices.has(service)));
  const k8s = new Set(readK8sDeployments().filter((service) => catalogServices.has(service)));
  // Railway keeps retired services as health stubs during decommission.
  // Exclude them from parity comparison so the check passes while stubs
  // are still deployed. Only compare active (non-retired) Railway services.
  const railwayAll = new Set(readRailwayServices().filter((service) => catalogServices.has(service)));
  const railway = new Set([...railwayAll].filter((service) => !retired.has(service)));
  const railwayDeployHelper = new Set(
    readRailwayDeployHelperServices().filter((service) => catalogServices.has(service) && !retired.has(service)),
  );
  const northflankTemplate = new Set(
    readNorthflankTemplateServices().filter((service) => catalogServices.has(service)),
  );

  const violations = [];
  const environments = [
    ["mesh", mesh],
    ["k8s", k8s],
    ["railway", railway],
    ["railway-deploy-helper", railwayDeployHelper],
    ["northflank-template", northflankTemplate],
  ];

  // Log retired stubs for visibility but don't treat them as violations.
  const railwayRetiredStubs = [...railwayAll].filter((service) => retired.has(service)).sort();
  if (railwayRetiredStubs.length > 0) {
    process.stderr.write(`[topology-parity] note: Railway has ${railwayRetiredStubs.length} retired service stub(s): ${railwayRetiredStubs.join(", ")}\n`);
  }

  for (const [name, set] of environments) {
    const missingRetained = diffSet(retained, set);
    if (missingRetained.length > 0) {
      violations.push(`${name}: missing retained services -> ${missingRetained.join(", ")}`);
    }
  }

  for (let leftIndex = 0; leftIndex < environments.length; leftIndex += 1) {
    const [leftName, leftSet] = environments[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < environments.length; rightIndex += 1) {
      const [rightName, rightSet] = environments[rightIndex];
      const leftOnly = diffSet(leftSet, rightSet);
      const rightOnly = diffSet(rightSet, leftSet);
      if (leftOnly.length > 0 || rightOnly.length > 0) {
        violations.push(
          `${leftName} vs ${rightName} mismatch -> ${leftName}-only: [${leftOnly.join(", ")}], ${rightName}-only: [${rightOnly.join(", ")}]`,
        );
      }
    }
  }

  if (violations.length > 0) {
    process.stderr.write("[topology-parity] violations found:\n");
    for (const violation of violations) {
      process.stderr.write(`- ${violation}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(
    `[topology-parity] ok (retained=${retained.size}, retired=${retired.size}, mesh=${mesh.size}, k8s=${k8s.size}, railway=${railway.size}, railwayDeployHelper=${railwayDeployHelper.size}, northflankTemplate=${northflankTemplate.size})\n`,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run();
}
