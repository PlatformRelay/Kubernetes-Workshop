# Routing add-on profiles (US-GATEWAY-1)

Mutually exclusive Ingress / Gateway installers for the local kind lane.

| Profile | Script | Lab |
| --- | --- | --- |
| `gateway-envoy` (canonical) | `gateway-envoy.sh` | S09 |
| `ingress-contour` (optional) | `ingress-contour.sh` | S08 |

- `routing-preflight.sh` — detect + fail-closed conflict checks (namespaces, ownership
  markers, GatewayClass/IngressClass, host ports 80/443).
- `routing-profile.sh` — CLI used by `./workshop profile` and `make profile-*`.

Never install both Contour and Envoy Gateway on the same cluster. Use
`./workshop profile transition <target>` for an explicit switch. Versions come from
`infra/versions.env`.
