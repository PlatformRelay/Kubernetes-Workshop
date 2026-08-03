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
against each file. A candidate can pass only with a completely licensed source SBOM plus one completely
licensed image SBOM for every declared runtime component. Missing, corrupt, empty, or identity-mismatched
evidence is a structural failure even for a rejected candidate. These are evidence snapshots, not a
continuously current dependency report.
