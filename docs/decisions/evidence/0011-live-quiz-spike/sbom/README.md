# CycloneDX evidence

The six CycloneDX JSON documents are gzip-compressed to keep repository diffs reviewable. Decompress one
without changing the checkout with:

```sh
gzip -dc claper-image.cdx.json.gz | jq '.metadata, (.components | length)'
```

Source SBOMs were generated from the exact candidate commits recorded in `../candidates.json`:

```sh
trivy fs --scanners license --format cyclonedx --output <candidate>-source.cdx.json <source-directory>
```

Application-image SBOMs were generated from the exact manifest-list digests in that inventory:

```sh
trivy image --scanners license --format cyclonedx --output <candidate>-image.cdx.json <image>@sha256:<digest>
```

Trivy 0.72.0 produced all files on 2026-08-03; `gzip -9` compressed them. The quiz test suite decompresses
the artifacts, checks source commits/image digests against the inventory, and asserts that the unresolved
license gaps remain visible. The license gate itself requires readable, identity-matched source and
application-image evidence for every candidate, and reconciles recorded total and missing-license counts
against each file. Application-image evidence also records the exact OCI revision and a computed
match/mismatch/unknown status against both candidate and runtime-component source commits. A candidate can
pass only with matching source provenance, a completely licensed source SBOM, and one completely licensed
image SBOM for every declared runtime component. Evidence paths are canonicalized beneath the evidence
directory and symlinks are rejected. Missing, corrupt, empty, identity-mismatched, or path-escaping evidence
is a structural failure even for a rejected candidate. These are evidence snapshots, not a continuously
current dependency report.
