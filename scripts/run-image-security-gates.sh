#!/usr/bin/env bash

set -euo pipefail

readonly repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly image_tag="${POOTOWN_IMAGE_TAG:-verification}"
readonly scanner_image='ghcr.io/aquasecurity/trivy@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c'
readonly report_path="${POOTOWN_IMAGE_SECURITY_REPORT_PATH:-${repository_root}/plans/260811-0313-nestjs-colyseus-monorepo-refactor/reports/phase-08-image-security-results.json}"
readonly temporary_directory="$(mktemp -d -t pootown-image-security-XXXXXX)"
readonly scanner_user="$(id -u):$(id -g)"
readonly docker_socket_group="$(stat -c %g /var/run/docker.sock)"

cleanup() {
  rm -rf "${temporary_directory}"
}
trap cleanup EXIT

mkdir -p "$(dirname "${report_path}")"
mkdir -p "${temporary_directory}/cache" "${temporary_directory}/tmp"

for app in api game-server web; do
  image_reference="pootown-${app}:${image_tag}"
  docker image inspect "${image_reference}" --format '{{.Id}}' \
    >"${temporary_directory}/${app}.image-id"
  docker run --rm \
    --user "${scanner_user}" --group-add "${docker_socket_group}" \
    -e TMPDIR=/work/tmp \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "${temporary_directory}:/work" \
    "${scanner_image}" image --quiet --cache-dir /work/cache \
    --format spdx-json --output "/work/${app}.spdx.json" "${image_reference}"
  docker run --rm \
    --user "${scanner_user}" --group-add "${docker_socket_group}" \
    -e TMPDIR=/work/tmp \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "${temporary_directory}:/work" \
    "${scanner_image}" image --quiet --cache-dir /work/cache \
    --scanners vuln --severity HIGH,CRITICAL --format json \
    --output "/work/${app}.vulnerabilities.json" "${image_reference}"
done

node - "${temporary_directory}" "${report_path}" "${scanner_image}" "${image_tag}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [temporaryDirectory, reportPath, scannerImage, imageTag] = process.argv.slice(2);
const images = ["api", "game-server", "web"].map((app) => {
  const sbom = JSON.parse(
    fs.readFileSync(path.join(temporaryDirectory, `${app}.spdx.json`), "utf8")
  );
  const scan = JSON.parse(
    fs.readFileSync(
      path.join(temporaryDirectory, `${app}.vulnerabilities.json`),
      "utf8"
    )
  );
  const findings = (scan.Results ?? []).flatMap(
    (result) => result.Vulnerabilities ?? []
  );
  return {
    image: `pootown-${app}:${imageTag}`,
    imageId: fs
      .readFileSync(path.join(temporaryDirectory, `${app}.image-id`), "utf8")
      .trim(),
    sbomPackages: (sbom.packages ?? []).length,
    high: findings.filter((finding) => finding.Severity === "HIGH").length,
    critical: findings.filter((finding) => finding.Severity === "CRITICAL").length,
    findings: findings.map((finding) => ({
      id: finding.VulnerabilityID,
      package: finding.PkgName,
      installedVersion: finding.InstalledVersion,
      fixedVersion: finding.FixedVersion,
      severity: finding.Severity,
      path: finding.PkgPath,
    })),
  };
});
const failed = images.some((image) => image.high > 0 || image.critical > 0);
const report = {
  generatedAt: new Date().toISOString(),
  scannerImage,
  severityGate: ["HIGH", "CRITICAL"],
  status: failed ? "fail" : "pass",
  images,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
console.log(JSON.stringify(report, null, 2));
if (failed) process.exitCode = 1;
NODE
