# Matriz de validação dos labs em ambiente limpo

Uma única tabela versionada que mapeia **cada** lab (`labs/day-{1,2,3}/NN-*.md`) para o(s)
ambiente(s) que ele suporta, os add-ons cluster-wide de que precisa, as versões de
ferramenta/image que fixa e o seu **estado honesto de validação atual**. Ela é a **fonte da
verdade humana** dos metadados de validação dos labs;
[`infra/lab-inventory.json`](../infra/lab-inventory.json) é a visão gerada e legível por
máquina (US-ENV-4A — regenere com `node scripts/lab-inventory.mjs --write`; o CI `--check`
rejeita drift). O smoke em cluster descartável vive em `infra/lab-smoke.sh` +
`.github/workflows/lab-smoke.yml`. Esta matriz também serve de acompanhamento do ensaio
manual em ambiente limpo (**US-BETA-6**).

Fontes da verdade desta matriz: os próprios labs, [`infra/versions.env`](../infra/versions.env)
(o arquivo canônico de pins, ADR 0007), [`docs/syllabus.md`](./syllabus.md) (mapa de seções) e
[`docs/facilitator-guide.md`](./facilitator-guide.md) (checklist de pré-instalação de add-ons).
Nada aqui é inventado — cada versão/URL é citada do repositório tal como ele é entregue hoje.

## Como ler esta matriz

- **Environment** usa a própria gramática de badges dos labs (veja
  [`labs/README.md`](../labs/README.md#your-environment)): `namespace ✓ / kind ✓` (roda nos
  dois), `kind ✓ / namespace: read-only` (o caminho completo exige cluster-admin; existe uma
  alternativa read-only para o namespace), `kind-only` (sem caminho em cluster compartilhado)
  e `local — no cluster` (labs de container, sem Kubernetes).
- **Add-ons** são os pré-requisitos cluster-wide que um lab instala (no kind) ou que um
  facilitador pré-instala (em um cluster compartilhado). "Nenhum" significa que o lab roda em
  um namespace comum, apenas com a StorageClass padrão onde indicado.
- **Versões / URLs fixadas** lista os pins críticos para reprodutibilidade que o lab
  referencia. Onde um lab puxa uma referência **flutuante** (`…/latest/…`, uma branch `stable`
  ou um `helm install` sem versão), isso é registrado honestamente como *unpinned* — é um
  achado, não um espaço em branco.

### Legenda dos estados de validação

| Estado | Significado |
| --- | --- |
| `server-dry-run` | Os manifestos aplicáveis do lab estão documentados como **server-dry-run-clean** contra um cluster real, conforme as notas de status do repositório (progresso M4/M5 do roadmap + AR-05). **Não** revalidados em um ensaio limpo aqui, e **nenhuma** instalação de add-on ou comportamento/tempo foi executado. |
| `kind-smoke` | O lab rodou de ponta a ponta em um cluster kind limpo e uma pessoa mantenedora registrou esse resultado. O smoke automatizado (US-ENV-4A) pode gerar evidências em [`docs/validation-evidence/`](./validation-evidence/), mas **não pode** promover linhas aqui automaticamente. Primeira linha: variante Flux do S21 ([recibo](./validation-evidence/us-gitops-choice-c-flux-live-smoke.md)). |
| `unrun` | Nenhum apply em dry-run (labs locais/read-only sem passo de apply), **ou** a parte aplicável existe, mas a instalação do add-on cluster-wide / o comportamento completo não foi executado de ponta a ponta em um ambiente limpo. |
| `deferred` | A seção está fora de agenda porque os seus slides e lab pareados não atenderam ao contrato de autoria. |

> **Regra de honestidade (US-BETA-3 / AR-05).** Nenhum lab é marcado como `validated`. Quase
> todos os labs escritos seguem em `server-dry-run` ou `unrun` — builds e dry-runs provam
> **sintaxe**, não comportamento. A variante Flux do S21 é a exceção, com uma passagem em
> cluster descartável registrada por mantenedor (`kind-smoke`; veja
> [`us-gitops-choice-c-flux-live-smoke.md`](./validation-evidence/us-gitops-choice-c-flux-live-smoke.md)).
> Conforme o
> [débito de ensaio do M7](./facilitator-guide.md#rehearsal-debt-read-before-you-teach),
> o workshop **não** passou por um ensaio pedagógico completo em ambiente limpo
> (US-BETA-6). O stub não escrito do S24 é `deferred`.

**Rastreabilidade (N1).** A atribuição de estado de validação de cada linha é auditável contra
uma fonte nomeada: as linhas `server-dry-run` remetem às notas de progresso por seção do
roadmap M4/M5 (que registram a versão exata do cluster contra a qual cada manifesto foi
dry-run) mais o AR-05; as linhas `unrun` e `kind-smoke` remetem à regra de honestidade acima.

## Validação dos hosts dos participantes

Suporte a host é uma afirmação separada da validação de manifestos ou de labs.
`contract-tested` significa que testes automatizados de detecção/mensagem passaram com stubs;
`live-smoke` significa que o checklist registrado em host real passou. Só `live-smoke`
permite uma afirmação oficial de suporte.

| Caminho de host | Cobertura automatizada | Procedimento de validação real | Estado |
| --- | --- | --- | --- |
| macOS / Linux + engine suportada | Suítes Bats de bootstrap e doctor | `./workshop up` e `./workshop doctor` em host novo | `unrun` |
| Windows 11 23H2+ + WSL 2.1.5+ + Ubuntu 24.04 + Docker Desktop 4.44+ | Distinção de kernel WSL1/WSL2, rejeição de shell nativo, orientação de engine ausente, `/mnt/c`, CRLF em helper carregado via source, bit de execução e testes de não regressão em Linux comum | [Checklist de aceitação WSL2](./windows-wsl2.md#reproducible-validation-checklist): Lab 00, networking, storage, um add-on, cleanup | `contract-tested` / `live-smoke pending` — **PARCIAL**, sem afirmação oficial de suporte |
| Dispositivo gerenciado + namespace atribuído na nuvem | Apenas contrato de documentação | Kubeconfig emitido pelo facilitador, ensaio do caminho de namespace sem Docker/kind | `unrun` |

PowerShell nativo e WSL1 são explicitamente não suportados. Participação apenas pelo
navegador segue como trabalho futuro (US-ENV-6), não como ambiente validado.

## Pins canônicos de versão (`infra/versions.env`)

Estas são as únicas versões que o repositório fixa centralmente (ADR 0007). Todo lab de
cluster roda contra esta release do Kubernetes; as versões dos add-ons mais abaixo são fixadas
**inline nos labs**, não aqui.

| Chave | Valor |
| --- | --- |
| `KIND_VERSION` | `v0.32.0` |
| `KIND_NODE_IMAGE` | `kindest/node:v1.36.1@sha256:3489c7674813ba5d8b1a9977baea8a6e553784dab7b84759d1014dbd78f7ebd5` (Kubernetes v1.36.1) |
| `KUBECTL_VERSION` | `v1.36.1` |
| `WORKSHOP_SMOKE_IMAGE` | `registry.k8s.io/e2e-test-images/agnhost:2.66.0@sha256:e518c9d629672720031c601b9aaa83e218ecf5821aff5cc16ac972e109096540` |

## A matriz

| Lab | Section | Environment | Add-ons | Versões / URLs fixadas | Estado |
| --- | --- | --- | --- | --- | --- |
| [`day-1/00-setup.md`](../labs/day-1/00-setup.md) | S00 Welcome & setup | namespace ✓ / kind ✓ | Nenhum | kind/kubectl conforme `versions.env` | `unrun` |
| [`day-1/01-containers.md`](../labs/day-1/01-containers.md) | S01 Containers | local — no cluster | Nenhum | build local de `demo:1` a partir de `golang:1.24` / `alpine:3.20` | `unrun` |
| [`day-1/02-container-security.md`](../labs/day-1/02-container-security.md) | S02 Container security | local — no cluster | Nenhum (scanner no laptop: Trivy; cosign opcional) | Trivy / cosign (ferramentas de laptop, unpinned) | `unrun` |
| [`day-1/03-cluster-tour.md`](../labs/day-1/03-cluster-tour.md) | S03 Mental model | namespace ✓ (read-only alt) / kind ✓ | Nenhum | nenhuma (tour read-only) | `unrun` |
| [`day-1/04-kubectl.md`](../labs/day-1/04-kubectl.md) | S04 kubectl | namespace ✓ / kind ✓ | Nenhum | nenhuma (gera YAML, nunca aplica) | `unrun` |
| [`day-1/05-pod.md`](../labs/day-1/05-pod.md) | S05 Pod *(red line 1/5)* | namespace ✓ / kind ✓ | Nenhum | images `ghcr.io/platformrelay/workshop-web:v1`, `busybox:1.37` (debug/stretch) | `unrun` |
| [`day-1/06-deployment.md`](../labs/day-1/06-deployment.md) | S06 Deployment *(red line 2/5)* | namespace ✓ / kind ✓ | Nenhum | images `ghcr.io/platformrelay/workshop-web:v1` / `:v2` (`:v9.99-nope` para o travamento) | `unrun` |
| [`day-1/07-service.md`](../labs/day-1/07-service.md) | S07 Service *(red line 3/5)* | namespace ✓ / kind ✓ | Nenhum | images `ghcr.io/platformrelay/workshop-web:v1`, `busybox:1.36` (cliente DNS) | `unrun` |
| [`day-1/08-ingress.md`](../labs/day-1/08-ingress.md) | S08 Ingress *(red line 4/5)* | namespace ✓ / kind ✓ *(controller required; install step kind-only)* | **Ingress controller (Contour)** | Contour [`contour.yaml` v1.33.5](https://raw.githubusercontent.com/projectcontour/contour/v1.33.5/examples/render/contour.yaml); image `ghcr.io/platformrelay/workshop-web:v1` — **defeito D1 resolved-by-US-NGX** | `unrun` |
| [`day-2/09-gateway-api.md`](../labs/day-2/09-gateway-api.md) | S09 Gateway API *(red line 5/5)* | namespace ✓ / kind ✓ *(CRDs + controller required; install kind-only)* | **Gateway API standard CRDs + Envoy Gateway** | Gateway API [`standard-install.yaml` v1.5.1](https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml); Envoy Gateway [`install.yaml` v1.8.2](https://github.com/envoyproxy/gateway/releases/download/v1.8.2/install.yaml) (GatewayClass `eg`); image `ghcr.io/platformrelay/workshop-web:v1` | `unrun` |
| [`day-2/10-config.md`](../labs/day-2/10-config.md) | S10 ConfigMap & Secret | namespace ✓ / kind ✓ | Nenhum | images `ghcr.io/platformrelay/workshop-web:v1`, `busybox:1.37` (toolbox/fetch) | `unrun` |
| [`day-2/11-storage.md`](../labs/day-2/11-storage.md) | S11 Storage | namespace ✓ / kind ✓ *(default StorageClass assumed)* | Nenhum (StorageClass padrão) | images `ghcr.io/platformrelay/workshop-web:v1`, `busybox:1.37` (toolbox) | `unrun` |
| [`day-2/12-statefulset.md`](../labs/day-2/12-statefulset.md) | S12 StatefulSet | namespace ✓ / kind ✓ *(default StorageClass assumed)* | Nenhum (StorageClass padrão) | images `ghcr.io/platformrelay/workshop-web:v1`, `busybox:1.37` (toolbox) — novo dry-run devido após o US-NGX | `server-dry-run` |
| [`day-2/13-resources.md`](../labs/day-2/13-resources.md) | S13 Resources & limits | namespace ✓ / kind ✓ *(ResourceQuota/LimitRange in own NS)* | Nenhum | image `polinux/stress` (demo de OOM) | `server-dry-run` |
| [`day-2/14-probes.md`](../labs/day-2/14-probes.md) | S14 Health probes | namespace ✓ / kind ✓ | Nenhum | images `ghcr.io/platformrelay/workshop-web:v1` (probes nativas `/ready`+`/healthz`+`POST /fail`), `curlimages/curl`, `busybox:1.37` (slow starter) | `unrun` |
| [`day-2/15-jobs.md`](../labs/day-2/15-jobs.md) | S15 Jobs & CronJobs | namespace ✓ / kind ✓ | Nenhum | images da classe busybox (payloads de Job) | `server-dry-run` |
| [`day-2/16-hpa.md`](../labs/day-2/16-hpa.md) | S16 Autoscaling (HPA) | kind ✓ (installs metrics-server) / namespace: read-only alt | **metrics-server** (+ patch `--kubelet-insecure-tls` do kind) | metrics-server [`components.yaml` — **unpinned (`/latest/`)**](https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml); image `registry.k8s.io/hpa-example` (tag unpinned) — **veja o defeito D2** | `unrun` |
| [`day-3/17-pod-security.md`](../labs/day-3/17-pod-security.md) | S17 Pod security | namespace ✓ / kind ✓ *(`restricted` label pre-applied on NS path)* | Nenhum (PSA é embutido no API server) | images `ghcr.io/platformrelay/workshop-web:v1` (restricted-clean), `busybox:1.37` (quebra do writer) | `unrun` |
| [`day-3/18-networkpolicy.md`](../labs/day-3/18-networkpolicy.md) | S18 NetworkPolicy | kind ✓ (enforcement self-test) / namespace: read-only | **CNI com suporte a policy** (o kindnet aplica; **Calico como fallback**) | Calico [`calico.yaml` v3.28.2](https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/calico.yaml) (apenas fallback); images `curlimages/curl`, `ghcr.io/platformrelay/workshop-web:v1` | `unrun` |
| [`day-3/19-rbac.md`](../labs/day-3/19-rbac.md) | S19 RBAC | namespace ✓ / kind ✓ | Nenhum | image `ghcr.io/platformrelay/workshop-web:v1` (workload alvo do reader) | `unrun` |
| [`day-3/20-helm.md`](../labs/day-3/20-helm.md) | S20 Helm | namespace ✓ / kind ✓ | Nenhum (Helm CLI v3.8+ no laptop) | Helm CLI ≥ v3.8 (ferramenta de laptop); o chart renderiza a aplicação `web` do Day 1 | `server-dry-run` |
| [`day-3/21-gitops.md`](../labs/day-3/21-gitops.md) | S21 GitOps (Argo CD) | kind ✓ (installs Argo CD) / shared NS: read-only | **Argo CD** | Argo CD [`install.yaml` — **unpinned (branch `stable`)**](https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml); repositório da aplicação [`argoproj/argocd-example-apps` guestbook](https://github.com/argoproj/argocd-example-apps.git) — **veja o defeito D3** | `unrun` |
| [`day-3/21-gitops-flux.md`](../labs/day-3/21-gitops-flux.md) | GitOps — variante Flux | kind ✓ (installs Flux) / shared NS: read-only | **Flux** | Flux [`install.yaml` — **unpinned (release `latest`)**](https://github.com/fluxcd/flux2/releases/latest/download/install.yaml) (o smoke real viu **v2.9.3**); repositório da aplicação [`argoproj/argocd-example-apps` guestbook](https://github.com/argoproj/argocd-example-apps.git) — mesma fonte sem host da variante Argo; evidência [`us-gitops-choice-c-flux-live-smoke.md`](./validation-evidence/us-gitops-choice-c-flux-live-smoke.md) | `kind-smoke` |
| [`day-3/22-operator-concept.md`](../labs/day-3/22-operator-concept.md) | S22 Operator pattern | kind ✓ (self-install) / namespace: read-only | **cert-manager** | cert-manager [`cert-manager.yaml` v1.21.0](https://github.com/cert-manager/cert-manager/releases/download/v1.21.0/cert-manager.yaml); images `quay.io/jetstack/*` | `unrun` |
| [`day-3/23-prometheus.md`](../labs/day-3/23-prometheus.md) | S23 Prometheus Operator | kind ✓ (self-install stack) / namespace: read-only | **kube-prometheus-stack** (Prometheus Operator + Prometheus + Grafana) | [repositório Helm `prometheus-community`](https://prometheus-community.github.io/helm-charts); **versão do chart unpinned** (`helm install`, sem `--version`); image da aplicação `quay.io/brancz/prometheus-example-app:v0.6.0` — **veja o defeito D4** | `unrun` |
| [`day-3/24-kubebuilder.md`](../labs/day-3/24-kubebuilder.md) | S24 Operator dev (kubebuilder) † | kind-only · advanced | **toolchain kubebuilder** (Go + kubebuilder) — *aspiracional* | nada fixado (**stub deferred**, não escrito) | `deferred` |
| [`day-3/25-pod-escape.md`](../labs/day-3/25-pod-escape.md) | S25 Security & pod escape | **kind-only · strictly defensive** (no shared path) | **Nenhum** — cluster kind descartável + guarda `context-check.sh` | nada fixado (usa ferramentas de dentro do cluster) | `unrun` |
| [`day-3/26-capstone.md`](../labs/day-3/26-capstone.md) | S26 Best practices (capstone) | namespace ✓ / kind ✓ | Nenhum | image fixada por digest (correção do checklist); reaproveita os manifestos do `web` | `unrun` |

† **S24 é um stub deferred** (roadmap: dependente de milestone, precisa de uma toolchain
Go + kubebuilder). Ele reserva o ID do lab e ainda não pode entrar na agenda como lab prático.

## Labs pesados em add-ons: instalação canônica no kind + falha/diagnóstico esperado

Os sete labs pesados em add-ons citados no US-BETA-3 (**S08, S09, S16, S18, S21, S23, S25**)
listam cada um a instalação canônica do add-on no kind e o momento de quebrar→consertar /
diagnóstico que alimenta o ensaio. O **S22 (cert-manager)** também entra — é igualmente pesado
em add-ons e segue o mesmo formato.

| Lab | Instalação canônica do add-on no kind | Falha / momento de diagnóstico esperado |
| --- | --- | --- |
| **S08** Ingress | `kubectl apply -f` do quickstart fixado do Contour **v1.33.5** (`…/projectcontour/contour/v1.33.5/examples/render/contour.yaml`); o kind precisa dos port mappings 80/443 ingress-ready que a config de cluster do repositório já tem. | Um `Ingress` **sem controller** não faz nada — o roteamento só funciona depois que os Pods do controller estão `Running`; um `Host`/path errado devolve 404 do controller (provando que quem roteia é ele, não a aplicação). |
| **S09** Gateway API | `kubectl apply -f` do `standard-install.yaml` **v1.5.1** da Gateway API e depois do `install.yaml` **v1.8.2** do Envoy Gateway (que fornece a GatewayClass `eg`). | Quebre o `gatewayClassName` → leia `status.conditions`: `Accepted` vira **False** (nenhum controller é dono daquela class). Adicione um header match para provar o roteamento com separação de papéis. |
| **S16** Autoscaling (HPA) | `kubectl apply -f` do `components.yaml` do metrics-server **+ patch `--kubelet-insecure-tls` do kind** (o kubelet do kind serve um certificado autoassinado). | Remova o `requests.cpu` do Pod → o `TARGETS` do HPA vira **`<unknown>`** e as réplicas congelam. Distinga isso de **metrics-server fora do ar** (também `<unknown>`, causa raiz diferente). |
| **S18** NetworkPolicy | No kind, o **kindnet** atual aplica policies (kube-network-policies); o **passo 2 é um self-test de enforcement** com **fallback para o Calico v3.28.2** se a CNI não aplicar. | Um ingress `default-deny` faz o tráfego **travar e dar timeout** (`curl` sai com **28**), *não* "connection refused" — e DNS/egress continuam de pé (exit 28 ≠ exit 6), provando o escopo só de ingress. |
| **S21** GitOps (Argo CD) | `kubectl create namespace argocd` e depois `kubectl apply -n argocd --server-side -f` do `install.yaml` `stable` do Argo CD; aplique o `Application` público `guestbook`. | Escale um recurso gerenciado na mão (drift) → o Argo CD **se autocorrige** de volta para o Git. Coloque `selfHeal: false` → a aplicação fica **OutOfSync**, provando que detecção ≠ correção. |
| **S21** GitOps (Flux) | `kubectl apply --server-side -f` do `install.yaml` `latest` do Flux; aplique o `GitRepository` + `Kustomization` do guestbook público. | Escale um recurso gerenciado na mão (drift) → o Flux **reconcilia** de volta para o Git. Coloque `spec.suspend: true` → o drift **permanece** (análogo do `selfHeal: false`). |
| **S22** Operator pattern | `kubectl apply -f` do `cert-manager.yaml` **v1.21.0** do cert-manager (CRDs + controller + webhook). | Declare um `Certificate` → o controller o reconcilia em um `Secret`; **delete esse Secret** → o controller **o recoloca** (o loop de reconciliação sobre um CRD que ele mesmo inventou). |
| **S23** Prometheus Operator | `helm repo add prometheus-community …` e depois `helm install monitoring prometheus-community/kube-prometheus-stack` em um namespace `monitoring`. | Quebre o `ServiceMonitor` com um **label selector incompatível** → o target nunca aparece em `/targets` do Prometheus; conserte o selector → o target fica **UP**; termine com uma query PromQL. |
| **S25** Security & pod escape | **Nenhum add-on de cluster.** O caminho canônico é um cluster **kind** descartável de quem aprende; todo passo ofensivo é protegido pelo **`context-check.sh`** (sai com código diferente de zero a menos que o contexto seja `kind-…`). | Um Pod privilegiado/com hostPath faz uma única **leitura inofensiva** (`cat /host/etc/os-release`) para provar acesso ao filesystem do host — o "escape" — e então o lab endurece o Pod até que a mesma leitura falhe. |

## Linhas de defeito (spot-check de URL/versão fixada)

Spot-check de melhor esforço das URLs/versões fixadas que cada lab referencia, feito no
momento da autoria desta matriz (2026-07-13) com um fetch de cada fonte. Uma fonte quebrada ou
**arquivada/aposentada** é registrada aqui como defeito, **não** passada em silêncio.

| ID | Lab | Referência | Achado | Ação recomendada |
| --- | --- | --- | --- | --- |
| **D1** | S08 Ingress | manifesto de deploy do ingress-nginx `controller-v1.11.2` para kind + o repositório `kubernetes/ingress-nginx` | **Repositório-fonte arquivado (read-only) em 2026-03-24 e em processo de aposentadoria** — a manutenção de melhor esforço acabou, sem novas releases/bugfixes/correções de segurança; o upstream orienta que novos usuários adotem uma implementação de Gateway API. A URL do manifesto raw fixado ainda devolvia HTTP 200 no spot-check, mas o lab dependia de uma fonte **aposentada e sem manutenção**. | **Resolved-by-US-NGX** (roadmap M8 / AR-02): o S08 agora instala o **Contour v1.33.5** e ensina a aposentadoria do ingress-nginx como um momento de história; a image de demo passou a ser a `workshop-web`. Linha mantida como histórico. |
| **D2** | S16 HPA | metrics-server `.../releases/latest/download/components.yaml` | **Não fixado** — resolve para qualquer que seja a release *mais recente* do metrics-server no momento do fetch. A URL está viva e não arquivada, mas a reprodutibilidade não é garantida (uma release futura pode mudar comportamento/flags). | Fixe o metrics-server em uma tag de release específica (e, de preferência, adicione-a ao `infra/versions.env`) antes do ensaio (US-BETA-6). |
| **D3** | S21 GitOps | Argo CD `.../argo-cd/stable/manifests/install.yaml` | **Não fixado** — a branch `stable` flutua. A URL está viva e não arquivada, mas a versão instalada do Argo CD é a que o `stable` apontar naquele dia. | Fixe o Argo CD em uma tag de release antes do ensaio; registre a tag na matriz. |
| **D4** | S23 Prometheus | `kube-prometheus-stack` via `helm install` sem `--version` | **Versão do chart não fixada** — o `helm install` pega o chart mais novo do índice do repositório. A URL do repositório está viva e não arquivada. | Fixe a versão do chart (`--version`) antes do ensaio, para que as versões do operator/Prometheus sejam reprodutíveis. |

**Verificados vivos e não arquivados** no spot-check original (sem defeito): cert-manager
v1.21.0, Calico v3.28.2 e o repositório Helm `prometheus-community`. As images
`ghcr.io/platformrelay/workshop-web:v1` (multi-arch; irmãs `:v2`/`:v3`) /
`quay.io/brancz/prometheus-example-app:v0.6.0` / `quay.io/jetstack/*` são as versões que os
labs entregam; a disponibilidade nos registries não foi puxada exaustivamente aqui. Os pins
pós-US-NGX (Contour v1.33.5, Gateway API v1.5.1, Envoy Gateway v1.8.2) entram no escopo de
ensaio abaixo.

## Uma nota sobre a troca de controllers (US-NGX) — concluída

O US-BETA-3 lista os add-ons obrigatórios como *"Ingress-**Contour**, Gateway/**Envoy**, …"*.
Esse alvo **foi atingido** (roadmap M8 / **US-NGX**): o S08 instala o **Contour v1.33.5**
(ensinando a aposentadoria do ingress-nginx como história), o S09 instala **Gateway API v1.5.1
+ Envoy Gateway v1.8.2** (GatewayClass `eg`), e toda image web de demo é a
`ghcr.io/platformrelay/workshop-web`, feita sob medida (`:v1`/`:v2`/`:v3`, porta **8080**,
non-root, distroless, restricted-clean para a PSA, com endpoints nativos de probe `/healthz`,
`/ready`, `POST /fail|/recover`). As linhas de S08/S09 acima refletem a nova stack; o defeito
**D1** é mantido como histórico resolvido. Essas duas linhas seguem `unrun` até que o ensaio
do US-BETA-6 / o smoke do US-ENV-4 as rode de novo contra a nova stack. No resto da matriz,
exatamente uma linha é promovida além da faixa `unrun`/`server-dry-run` — o `kind-smoke` da
variante Flux do S21, registrado por mantenedor, conforme a regra de honestidade acima — e
todas as demais linhas seguem `unrun`/`server-dry-run`, com exceção do stub não escrito do
S24, que permanece `deferred`.

## O que esta matriz alimenta

- **US-ENV-4A** — smoke em kind descartável (`infra/lab-smoke.sh`) + JSON de inventário. O
  caminho de PR cobre os labs de kind do Day 1; os Days 2–3 são shards de schedule/
  `workflow_dispatch`. A automação escreve evidências em `docs/validation-evidence/`; promover
  uma linha da matriz para `kind-smoke` segue sendo uma edição deliberada de mantenedor após
  uma execução real registrada.
- **US-BETA-6** — o ensaio manual completo em ambiente limpo, que afere tempos e comportamento
  reais. Esta matriz é o checklist dele; preencher os estados pedagógicos/`kind-smoke` é
  trabalho daquela passagem humana, não algo declarado por automação.
