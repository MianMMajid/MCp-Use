import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_INVENTORY_FILE,
  ROOT_DIR,
  nowIso,
  parseArgs,
  readK8sDeployments,
  readMeshServices,
  readRailwayServices,
  readServiceCatalog,
  writeJson,
} from "./service-audit-common.mjs";

export function buildServiceInventory() {
  const meshServices = new Set(readMeshServices());
  const k8sDeployments = new Set(readK8sDeployments());
  const railwayServices = new Set(readRailwayServices());
  const catalog = readServiceCatalog();

  const allServices = new Set([
    ...meshServices,
    ...k8sDeployments,
    ...railwayServices,
    ...catalog.byService.keys(),
  ]);

  const serviceRows = [...allServices]
    .sort((a, b) => a.localeCompare(b))
    .map((service) => {
      const catalogRow = catalog.byService.get(service) ?? null;
      return {
        service,
        owner: catalogRow?.owner ?? "unassigned",
        tier: catalogRow?.tier ?? "unknown",
        lifecycle: String(catalogRow?.lifecycle ?? "active"),
        archiveStatus: String(catalogRow?.archiveStatus ?? "active"),
        archivePath: String(catalogRow?.archivePath ?? ""),
        retired: String(catalogRow?.lifecycle ?? "").toLowerCase() === "retired",
        required: catalogRow?.required === true,
        criticalFlows: Array.isArray(catalogRow?.criticalFlows) ? catalogRow.criticalFlows : [],
        replacement: catalogRow?.replacement ?? "",
        decommissionAfter: catalogRow?.decommissionAfter ?? "",
        presentIn: {
          meshManifest: meshServices.has(service),
          k8sDeployment: k8sDeployments.has(service),
          railwayEntrypoint: railwayServices.has(service),
        },
      };
    });

  return {
    artifactSchemaVersion: 2,
    ok: true,
    generatedAt: nowIso(),
    sourcePrecedence: ["meshManifest", "k8sDeployment", "railwayEntrypoint"],
    counts: {
      totalServices: serviceRows.length,
      meshManifest: meshServices.size,
      k8sDeployment: k8sDeployments.size,
      railwayEntrypoint: railwayServices.size,
      catalog: catalog.byService.size,
    },
    services: serviceRows,
  };
}

export function runInventoryScript() {
  const args = parseArgs();
  const outputFile = args.get("output") ?? DEFAULT_INVENTORY_FILE;
  const inventory = buildServiceInventory();
  writeJson(resolve(ROOT_DIR, outputFile), inventory);
  process.stdout.write(
    `[service-inventory] wrote ${outputFile} (${inventory.counts.totalServices} services)\n`,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runInventoryScript();
}
