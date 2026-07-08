# Icons

Curated copies of official project artwork, used unmodified.

## Brand logos (this directory)

- `kubernetes-*` — Kubernetes logo, © The Linux Foundation, from the CNCF artwork
  repository (<https://github.com/cncf/artwork>). Usage per the
  [Linux Foundation trademark usage guidelines](https://www.linuxfoundation.org/legal/trademark-usage).
- `cncf-*` — Cloud Native Computing Foundation logo, © The Linux Foundation, same
  source and terms.

Reference via `<K8sIcon name="kubernetes-icon-color" />`.

## Resource glyphs (`resources/`)

The official **Kubernetes icon set** for architecture diagrams — blue-hexagon
glyphs per resource / component. Source:
[`kubernetes/community` `icons/`](https://github.com/kubernetes/community/tree/master/icons),
licensed **Apache-2.0**. Used unmodified.

- `resources/labeled/<slug>.svg` — hexagon glyph with the resource-type text.
- `resources/unlabeled/<slug>.svg` — bare hexagon glyph (control-plane
  components ship labeled-only upstream, so a few slugs exist under `labeled/`
  only).

Slugs follow the upstream `kubectl` short-name convention: `pod`, `deploy`,
`rs`, `ds`, `sts`, `job`, `cronjob`, `hpa`, `svc`, `ep`, `ing`, `netpol`, `cm`,
`secret`, `pv`, `pvc`, `quota`, `ns`, `sa`, `crd`, `api`, `c-m`, `c-c-m`,
`sched`, `kubelet`, `k-proxy`, `node`, `etcd`, `control-plane`.

Reference via `<K8sIcon kind="deploy" />` (or `variant="unlabeled"`). A live
gallery + diagram sample is in `slides-templates.md` (Iconography section).

## Adding icons

Do not modify these files. Add brand logos only from the CNCF artwork
repository, and resource glyphs only from the `kubernetes/community` icon set;
keep this attribution note current.
