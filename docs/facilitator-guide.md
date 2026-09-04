# Guia do Facilitador — Kubernetes Practitioner Workshop

Tudo o que você precisa para **conduzir** este workshop: preparação da sala e do ambiente,
pacing em relação ao cronograma, quais labs precisam de add-ons cluster-wide (e o que
pré-instalar) e como provisionar um cluster compartilhado para que cada participante tenha
um namespace próprio.

Este é o ponto de entrada do facilitador. Ele é complementar aos documentos voltados ao
participante e à visão geral do projeto — saiba para onde cada um leva:

- [`../README.md`](../README.md) — **porta de entrada do projeto**: o que é o workshop,
  decks online, downloads em PDF, público e pré-requisitos. Mande os recém-chegados para cá.
- [`syllabus.md`](./syllabus.md) — o **cronograma público**: mapa de seções (S00–S27), tiers,
  tempos por seção (cada um com link para o seu lab), o corte canônico de 3 dias e o
  alinhamento com CKA/CKAD.
- [`../labs/README.md`](../labs/README.md) — o **ponto de entrada do participante**:
  pré-requisitos, os dois ambientes, como os labs funcionam e um índice direto de todos os
  labs escritos.
- [`decisions/`](./decisions/) — architecture decision records; em especial
  [`0006-workshop-environment-and-iac.md`](./decisions/0006-workshop-environment-and-iac.md)
  descreve o modelo de ambiente pretendido que este guia operacionaliza.

> **Orientação rápida.** *Só quer dar uma olhada?* → [README](../README.md) → os decks online.
> *Vai fazer os labs?* → [labs README](../labs/README.md) → [`00-setup`](../labs/day-1/00-setup.md).
> *Vai conduzir a sala?* → você está no lugar certo; use este guia junto com o
> [syllabus](./syllabus.md). *Vai contribuir com conteúdo?* → [`../AGENT.md`](../AGENT.md).

> **Honestidade logo de cara.** Da automação de ambiente descrita na ADR 0006, **a automação
> local de kind está entregue** — `./workshop up` / `make kind-up` (`infra/kind/cluster.sh`).
> **O provisionamento de namespaces em cluster compartilhado ainda é planejado** —
> `make ns-provision` / `infra/shared-cluster/` ainda não existe, então este guia documenta o
> **caminho manual que funciona hoje** (os comandos `kubectl` / `helm` em
> [Provisionamento de cluster compartilhado](#shared-cluster-provisioning-manual-today)) e
> marca essa conveniência futura explicitamente como *planejada*. Não conte com um setup de
> cluster compartilhado em um único comando na hora da entrega; provisione os namespaces dos
> participantes na mão.

## Quem conduz isto, e com o que você se compromete

Você vai conduzir um workshop de Kubernetes **iniciante-a-intermediário**, denso em código e
vendor-neutral. Ele é **~50% apresentação, ~50% prática**: todo bloco de conceito do deck é
imediatamente seguido de um lab autônomo em [`../labs/`](../labs/). Seu trabalho na sala é
ensinar o conceito e então levar todo mundo até o fim do lab — e, principalmente, ter o
**ambiente pronto antes de qualquer pessoa chegar**.

O workshop é escrito como um **content superset** (S00–S27) e **reduzido** a cada entrega. O
[corte canônico de 3 dias](./syllabus.md#the-canonical-3-day-cut) é o padrão que você entrega;
você compõe uma sala mais curta desligando seções `recommended` / `optional`. Decida o seu
corte **antes** do trabalho de ambiente abaixo — ele determina quais add-ons você precisa
pré-instalar.

### Escolha o deck antes da sala

A entrega ao vivo usa quatro entradas pequenas e construíveis de forma independente sobre as
mesmas fontes de seção: **Day 1**, **Day 2**, **Day 3** e **Optional / Appendix**. Inicie um
dia completo, uma seção ou um intervalo contíguo com o launcher:

```bash
pnpm deck -- --list
pnpm deck -- --day 1
pnpm deck -- --section S05
pnpm deck -- --range S05-S09
```

Adicione `--action build` ou `--action export` para renderizar uma seleção customizada em vez
de servi-la. `--dry-run` imprime os IDs resolvidos sem iniciar o Slidev. Se o
[`gum`](https://github.com/charmbracelet/gum) estiver instalado e o comando rodar em um TTY,
`pnpm deck` oferece as mesmas opções em um menu interativo. O gum é opcional: as flags e o
`--list` continuam determinísticos em CI, shells remotos e laptops gerenciados.

Uma invocação sem seletor falha de propósito quando não há menu interativo disponível; ela
nunca recorre ao content superset superdimensionado. As quatro entradas padrão também têm
scripts diretos: `pnpm dev:day1`, `dev:day2`, `dev:day3` e `dev:optional`. O `slides.md`
combinado (superset) continua disponível via `pnpm dev:superset` apenas por compatibilidade e
para inspeção do corpus inteiro.

## Timing and pacing

As [marcações de minutos por seção](./syllabus.md#per-section-outcomes-timings-and-labs) do
syllabus são **apoios de planejamento**, não um contrato de entrega. Ajuste o ritmo à sala: o
apresentador, a audiência e quais seções opcionais você mantém pesam mais do que bater uma
planilha.

Formato aproximado de um dia inteiro: cerca de metade slides / metade labs, com pausas e
almoço por cima. O corte canônico fica um pouco folgado nos Days 1–2 (margem para os
on-ramps) e pesado no Day 3 — corte o lab capstone S26 se precisar de folga no relógio.

> Confirme os add-ons do *seu* corte com um dry-run curto (veja
> [Dívida de ensaio](#rehearsal-debt-read-before-you-teach) e
> [limitações conhecidas](./beta-limitations.md)). Não trate totais de minutos não ensaiados
> como bloqueio de release ou de ensino.

**Táticas de pacing que sustentam o equilíbrio 50/50:**

- **Timebox nos labs, não na discussão.** Anuncie a janela do lab de antemão e mantenha um
  timer visível se isso ajudar a sala. Os Labs 01–08 do Day 1, os Labs 09–16 do Day 2 e os
  Labs 17–23 e 25–26 do Day 3 são totalmente copiáveis e linkam para o companion
  `NN-topic.solution.md` (S24 continua sendo um stub `deferred`), então quem travar está a um
  clique dos comandos exatos, do estado esperado e da orientação de recuperação — você
  raramente precisa parar a sala.
- **Use o passo break→fix como ponto natural de recuperação.** Quem termina rápido avança
  para o stretch goal; você circula pela sala enquanto os mais lentos chegam ao break
  deliberado.
- **Proteja a "linha vermelha" (red line).** As seções S05–S09 (`Pod → Deployment → Service →
  Ingress → Gateway API`) estendem *o mesmo* manifesto. Se você atrasar, corte uma seção de
  add-on posterior, não um passo da red line — esse fio condutor sustenta tudo o que vem
  depois.
- **Antecipe a decisão sobre o on-ramp.** S01/S02 (containers) rodam localmente, sem cluster.
  Se a sua sala precisa de fundamentos de container, rode essas seções como um bloco noturno
  opcional de "day 0" ou como pré-leitura, em vez de consumir tempo da red line do Day 1.

## Os dois ambientes de ensino

Todo lab de cluster suporta **dois ambientes**, e ambos são de primeira classe em todo o
material. Você escolhe qual a sala usa (ou deixa os participantes escolherem, dentro das
restrições abaixo). Os labs trazem um **badge de Environment** na tabela de cabeçalho, para
que o aluno sempre saiba quais caminhos aquele lab suporta.

| Ambiente | O que é | O que o participante recebe | O que você fornece |
| --- | --- | --- | --- |
| **Shared namespace** | Um namespace atribuído em um cluster que **você** roda e administra. | Um kubeconfig + um namespace (ex.: `student-07`), **sem cluster-admin**. | O cluster, os namespaces por participante e quaisquer add-ons cluster-wide (pré-instalados). |
| **`kind` local** | Um cluster descartável de nó único que cada participante cria no próprio laptop. | Admin total sobre o próprio cluster. | Nada em nível de cluster — os participantes instalam os add-ons por conta própria em cada lab. Verifique se os laptops atendem aos pré-requisitos. |

### Como os labs sinalizam essa divisão

A gramática dos badges (definida em
[`../labs/README.md`](../labs/README.md#your-environment)) diz o que um lab precisa:

- **`namespace ✓ / kind ✓`** — roda de forma idêntica nos dois. A maioria dos labs core.
- **`kind ✓` + `namespace: read-only`** — precisa de cluster-admin, CRDs ou acesso ao host,
  então o caminho completo é **só no kind**. Esses labs **também trazem uma alternativa
  read-only segura para namespace** (observar um componente que você pré-instalou), para que
  os alunos em cluster compartilhado acompanhem. É aqui que o seu trabalho de pré-instalação
  se concentra.
- **`kind-only`** — sem nenhum caminho em cluster compartilhado (ex.: o lab de pod escape,
  que executa um escape de container controlado e precisa rodar em um cluster descartável do
  próprio aluno).
- **`local — no cluster needed`** — os labs de container (S01/S02) rodam contra um container
  engine no laptop; nada de Kubernetes.

Os participantes definem uma variável de shell `$NS` uma única vez no
[lab de setup](../labs/day-1/00-setup.md) e a reutilizam em todo lugar (`export NS=student-07`
no compartilhado; `export NS=workshop` no kind).

### Escolhendo um ambiente para a sua sala

- **Cluster compartilhado** é mais tranquilo para uma sala grande ou de nível misto: sem
  variação de laptop, sem debug de container engine por máquina, e você controla os add-ons.
  Custo: você precisa subir e provisionar o cluster (veja
  [Provisionamento de cluster compartilhado](#shared-cluster-provisioning-manual-today)),
  e os labs `kind-only` viram **demos assistidas** (os alunos seguem o caminho read-only).
- **`kind` local** é melhor quando os participantes têm laptops capazes e você quer que eles
  vivenciem as instalações completas dos add-ons (ingress controller, Argo CD, cert-manager).
  Custo: os pré-requisitos de laptop precisam ser atendidos (container engine + `kind` + RAM
  suficiente) e o acesso de rede para pull de imagens de registries públicos precisa funcionar
  a partir da sala.
- **Misto** é suportado: alguns participantes no kind, outros em um namespace compartilhado.
  Todo lab core é idêntico nos dois, e o badge diz a cada aluno qual caminho seguir.

> **Recomendação.** Para uma primeira entrega, rode um **cluster compartilhado** para a red
> line core (menor risco de laptop) e deixe os participantes mais confiantes usarem **kind**
> nos labs do Day 3, mais pesados em add-ons, para que tenham a experiência completa de
> instalação. Seja qual for a escolha, verifique tudo de ponta a ponta **antes** de a sala
> chegar — o lab de setup existe exatamente para pegar um ambiente quebrado nos primeiros 15
> minutos.

## Add-ons: what to pre-install per lab

Alguns labs precisam de pré-requisitos **cluster-wide** (um controller, CRDs, um operator, um
CNI capaz de aplicar policy). Por design, isso nunca é um passo normal do aluno: qualquer
coisa cluster-scoped é um **add-on** que ou é auto-instalado no **kind** (o aluno é dono
daquele cluster) ou é **pré-instalado por você** no cluster compartilhado (os alunos então
seguem o caminho read-only). Veja a ADR 0006 para entender por que essa divisão existe.

A tabela abaixo é o seu checklist de pré-instalação. No **kind**, o próprio lab instala o
add-on em um passo inicial (os alunos rodam o comando). Em um **cluster compartilhado**,
**você instala uma vez, com antecedência**, e os alunos observam.

> **Verifique as versões na hora da entrega.** As versões fixadas abaixo são as que os labs
> trazem hoje; re-cheque o release atual de cada componente quando for entregar (o workshop
> deliberadamente não fixa uma versão de Kubernetes). A ADR 0007 cobre o pinning de versão em
> fonte única pretendido (planejado em `infra/versions.env`).

| Seção / lab | Add-on a pré-instalar | O que é / por quê | Instalação (como entregue) |
| --- | --- | --- | --- |
| **S08** Ingress ([lab](../labs/day-1/08-ingress.md)) | **Ingress controller** (Contour) — profile `ingress-contour` (ou o day composer `day-1`) | Nada serve um Ingress até existir um controller; o lab expõe a aplicação da red line no sentido norte-sul. **Mutuamente exclusivo** com `gateway-envoy` (nunca instale os dois). | Prefira `./workshop profile day-1` ou `./workshop profile ingress-contour` (ou `make profile-day-1` / `make profile-ingress-contour`). Manual: quickstart do Contour v1.33.5 fixado. O kind precisa dos port mappings 80/443 ingress-ready — a config de cluster kind do repositório já os tem. |
| **S09** Gateway API ([lab](../labs/day-2/09-gateway-api.md)) | **CRDs standard da Gateway API + Envoy Gateway** — profile `gateway-envoy` (canônico; também em `day-2`) | A Gateway API é baseada em CRDs; você precisa dos CRDs do standard channel **e** de um controller que seja dono de uma `GatewayClass`. **Mutuamente exclusivo** com o Contour. | Prefira `./workshop profile day-2` ou `./workshop profile gateway-envoy` (ou `make profile-day-2` / `make profile-gateway-envoy`). Manual: `standard-install.yaml` da Gateway API (v1.5.1) e depois o `install.yaml` do Envoy Gateway (v1.8.2). Fornece a GatewayClass `eg` — os labs precisam definir `gatewayClassName: eg` explicitamente. |
| **S16** Autoscaling / HPA ([lab](../labs/day-2/16-hpa.md)) | **metrics-server** (composto em `day-2`) | O HPA lê CPU da API `metrics.k8s.io`, servida pelo metrics-server. Sem metrics-server → `TARGETS <unknown>`. | Prefira `./workshop profile day-2` (instala metrics-server + Envoy). Manual: `kubectl apply -f` no `components.yaml` do metrics-server, na versão fixada em `infra/versions.env`. **O kind precisa do patch `--kubelet-insecure-tls`** (o kubelet do kind serve um certificado self-signed). |
| **S18** NetworkPolicy ([lab](../labs/day-3/18-networkpolicy.md)) | **Um CNI capaz de aplicar policy** (Calico, Cilium, Antrea ou kindnet moderno) | Uma NetworkPolicy é inerte se o CNI não a aplicar. O `kubectl apply` funciona em qualquer cluster, mas o pacote só é descartado se o CNI aplicar a policy. | No kind, o **kindnet** atual aplica (via kube-network-policies); o Step 2 do lab é um **autoteste de enforcement** com **fallback para Calico** caso o seu CNI não aplique. Em cluster compartilhado, confirme que o seu CNI aplica antes da sala. |
| **S21** GitOps / Argo CD ([lab](../labs/day-3/21-gitops.md)) | **Argo CD** (composto em `day-3`) | O agente GitOps in-cluster que reconcilia o cluster em direção ao Git; o lab entrega a ele um `Application` público do `guestbook`. | Prefira `./workshop profile day-3` (pesado). Manual: `kubectl create namespace argocd` e depois `kubectl apply -n argocd --server-side` do `install.yaml` do Argo CD fixado em `infra/versions.env`. |
| **S22** Operator pattern ([lab](../labs/day-3/22-operator-concept.md)) | **cert-manager** (composto em `day-3`) | Um operator de verdade = CRDs + um controller. O lab instala especificamente o **cert-manager** (v1.21.0) e inspeciona a API que ele adiciona. | Prefira `./workshop profile day-3`. Manual: `kubectl apply -f` no manifesto de release do cert-manager (v1.21.0). |
| **S23** Prometheus Operator ([lab](../labs/day-3/23-prometheus.md)) | **kube-prometheus-stack** (composto em `day-3`) | O Prometheus Operator gerencia o Prometheus via um CRD `ServiceMonitor`; o lab conecta a aplicação da red line nele. | Prefira `./workshop profile day-3` (avisa que é pesado). **Helm:** chart `kube-prometheus-stack` fixado em `infra/versions.env`, em um namespace `monitoring`. |
| **S25** Security & pod escape ([lab](../labs/day-3/25-pod-escape.md)) | **Nenhum** (kind-only, sem add-on) | O Pod Security Admission é embutido no API server (estável desde a v1.25). | Nada a instalar — mas este lab é **estritamente kind-only**: ele executa um escape controlado e **nunca deve tocar um cluster compartilhado/gerenciado/de produção**. |
| **S24** Operator dev / kubebuilder ([lab](../labs/day-3/24-kubebuilder.md)) | **toolchain kubebuilder** (Go, kubebuilder) — *aspiracional* | Fazer o scaffold e rodar um operator mínimo contra o kind. | **Este lab é atualmente um STUB** (kind-only, avançado, não escrito). Trate a toolchain como planejada; não o agende como hands-on completo enquanto não for escrito. |

**Labs que *não* precisam de nenhum add-on cluster-wide** (rodam em um namespace comum, com
no máximo a StorageClass padrão onde indicado): S00 setup, S03 cluster tour, S04 kubectl,
S05–S07 (Pod / Deployment / Service), S10 config, **S11 storage & S12 StatefulSet** (assumem
uma **StorageClass padrão** — presente no kind; confirme que existe uma no seu cluster
compartilhado), S13 resources, S14 probes, S15 jobs, S17 pod security, S19 RBAC, S20 Helm,
S26 capstone.

**Pré-requisitos fora do cluster para checar nos laptops** (a partir de
[`../labs/README.md`](../labs/README.md#prerequisites)):

- **Todo lab de cluster:** `kubectl` no `PATH`, dentro de uma minor version do API server.
- **Caminho kind:** [`kind`](https://kind.sigs.k8s.io) + um container engine (Docker ou Podman).
- **Labs de container (S01/S02):** um container engine (Docker / Podman / nerdctl). O **S02**
  também precisa de um scanner — [Trivy](https://trivy.dev) (Grype funciona) e, opcionalmente,
  [cosign](https://docs.sigstore.dev/) para o passo de assinatura (dispensável).
- **S20 Helm** e **S23** precisam do CLI [`helm`](https://helm.sh) (v3.8+).

## Shared-cluster provisioning (manual today)

Se você rodar um cluster compartilhado, cada participante precisa de um namespace próprio —
com o RBAC certo, um limite de recursos e (para o S17) os Pod Security Standards aplicados.
Como o modelo nunca pode conceder cluster-admin aos alunos, **tudo o que é cluster-scoped é
responsabilidade sua, configurada com antecedência.**

> **Automação planejada.** A ADR 0006 especifica um script `infra/shared-cluster/provision.sh`
> (exposto como `make ns-provision`) que cria um namespace por participante com o RBAC, a
> quota/limit e os labels de PSA abaixo. **Esse script ainda não existe** (veja
> [US-ENV-1](#rehearsal-debt-read-before-you-teach)). Até que exista, provisione os namespaces
> na mão — um loop curto sobre os quatro passos abaixo, por participante.

Por participante, o namespace precisa ter:

1. **O namespace em si**, definido como contexto padrão do participante para que ele possa
   omitir `-n $NS` (o [lab de setup](../labs/day-1/00-setup.md) manda ele rodar
   `kubectl config set-context --current --namespace=$NS`; o namespace já precisa existir).
2. **Um Role + RoleBinding de RBAC dentro do namespace** concedendo create/update/delete nos
   kinds de workload comuns (pods, deployments, services, configmaps, secrets, PVCs, jobs, …)
   **e nada cluster-scoped**. O Step 3 do lab de setup verifica isso — `kubectl auth can-i
   create pods` precisa retornar `yes` no namespace do participante, e escritas cluster-scoped
   precisam ser negadas. Os alunos constroem exatamente esse tipo de Role no **Lab 19 (RBAC)**.
3. **Uma ResourceQuota + LimitRange** para que nenhum participante consiga sufocar o cluster
   compartilhado. Os labs assumem que isso está presente — o S13 (resources & limits) depende
   explicitamente de uma quota/limit existindo no namespace do próprio participante. Um
   LimitRange também dá aos Pods requests/limits padrão sensatos.
4. **Labels de Pod Security Standards, pré-aplicados.** Como colocar label em um Namespace é
   uma escrita em um objeto cluster-scoped que o Role in-namespace não pode fazer, **você
   pré-marca cada namespace de participante como `restricted`** nos três modos de PSA:

   ```bash
   kubectl label --overwrite namespace "$NS" \
     pod-security.kubernetes.io/enforce=restricted \
     pod-security.kubernetes.io/warn=restricted \
     pod-security.kubernetes.io/audit=restricted
   ```

   O S17 (pod security) depende disso: o caminho de cluster compartilhado diz aos alunos que a
   régua `restricted` **já está no namespace deles** e que basta confirmar — eles nunca rodam
   o comando `label` (não podem). No **kind**, os alunos marcam o próprio namespace.

> **Conferência antes da sala.** Para um namespace de participante de amostra, rode o
> [lab de setup](../labs/day-1/00-setup.md) de ponta a ponta com aquela identidade:
> `kubectl auth can-i create pods` → `yes`, escritas cluster-scoped → `no`, e
> `kubectl get namespace $NS --show-labels` mostrando os três labels de PSA `restricted`. Se
> isso passar, todos os participantes estão no mesmo estado inicial verificado.

## Rehearsal debt (read before you teach)

Os manifestos dos labs estão validados (dry-run client/server) e vários foram confirmados
contra um cluster real — mas o workshop **ainda não passou por uma rodada completa de ensaio
em ambiente limpo**. Fique atento aos pontos abaixo, coerentes com os avisos de honestidade já
presentes no [syllabus](./syllabus.md#superset-vs-the-canonical-3-day-cut) e no
[labs README](../labs/README.md#how-to-start):

- **As marcações de minutos do syllabus são apoios de planejamento.** O ritmo da sala depende
  do apresentador e da audiência — ajuste no dia, em vez de perseguir um total fixo de minutos.
- **O S08 tem evidência recente de execução real.** Em 2026-08-03, o caminho kind completo
  passou em um laptop Ubuntu 26.04 x86_64 com Docker 29.6.2, kind v0.32.0 / Kubernetes v1.36.1
  e Contour v1.33.5: readiness do controller e do Envoy, ambas as rotas de host, rejeição de
  `pathType` obrigatório, perda de roteamento por classe errada, TLS/SNI, a Extensão 2 opcional
  (preview do `ingress2gateway`) e o cleanup. Isso valida comportamento, não pacing de sala. O
  cluster criado e o namespace de validação foram removidos.
- **As instalações de add-on restantes, exclusivas do `kind`, não foram todas rodadas de ponta
  a ponta** em um ambiente limpo. Faça dry-run dos **labs pesados em add-ons** restantes (S09,
  S16, S18, S21, S22, S23) em um cluster kind limpo antes da entrega, para conhecer as
  peculiaridades de instalação na *sua* rede.
- **A automação local de kind está entregue** (`./workshop up` / `make kind-up` →
  `infra/kind/cluster.sh`). **O provisionamento de namespaces em cluster compartilhado**
  (`make ns-provision` / `infra/shared-cluster/`) ainda é planejado — provisione os namespaces
  dos participantes na mão, como acima, até que isso chegue.
- **O esforço de-nginx (roadmap M8 / US-NGX) foi concluído.** O aposentado controller
  ingress-nginx foi substituído pelo **Contour** (S08), o NGINX Gateway Fabric pelo **Envoy
  Gateway** (S09) e toda imagem web de demo pela imagem feita sob medida
  `ghcr.io/platformrelay/workshop-web` (`:v1`/`:v2`/`:v3` — escuta na **8080**, non-root,
  distroless, limpa sob PSA `restricted`). A tabela de add-ons acima reflete a nova stack;
  re-cheque as versões fixadas contra os labs na hora da entrega.
- **O S24 (kubebuilder) é um stub `deferred`** e o **S25 (pod escape) é estritamente
  kind-only** — planeje esses dois de acordo.

## Postura de release estável (a partir da v0.4.0)

O banner de **controlled-beta** da porta de entrada foi removido na linha `v0.4.0` por decisão
do mantenedor (este branch / tip). Os itens restantes abaixo são um **backlog de qualidade**,
não um motivo para recolar um aviso de beta no README ou na landing da documentação.

| Status | Item | Story / nota |
| --- | --- | --- |
| Backlog | Ensaio completo em ambiente limpo | **US-BETA-6** — útil para facilitadores que querem uma execução gravada; os minutos do syllabus continuam apoios de planejamento, não contrato |
| Backlog | Matriz de validação → `kind-smoke` para os drivers de Day 2/3 | **US-ENV-4** drivers de Day 2/3 + evidência gravada; a linha da variante Flux do S21 já foi promovida |
| `deferred` com aceite | S24 kubebuilder | **US-S24** — veja [limitações conhecidas](./beta-limitations.md) |
| Feito | Descrição e topics do repositório | **US-BETA-2** |

**Não** trate marcações de minutos não ensaiadas como bloqueio de release — o pacing depende
do apresentador e da audiência. Prefira um dry-run curto dos add-ons que o *seu* corte precisa
a perseguir uma planilha de timing perfeita.

Tags de pré-release (`v*-beta.*`, `v*-rc.*`) ainda prefixam as
[limitações conhecidas](./beta-limitations.md) às release notes do GitHub; tags estáveis não.

## Checklist rápido de pré-entrega

1. **Escolha o seu corte** entre as [opções de 3 dias](./syllabus.md#the-canonical-3-day-cut);
   anote quais seções `recommended`/`optional` você mantém — isso fixa a sua lista de add-ons.
2. **Escolha o ambiente** (cluster compartilhado, kind ou misto).
3. **Cluster compartilhado:** suba o cluster; provisione um namespace por participante (RBAC +
   quota/LimitRange + labels de PSA `restricted`); **pré-instale** todos os add-ons que o seu
   corte precisa, a partir da [tabela de add-ons](#add-ons-what-to-pre-install-per-lab).
4. **kind:** verifique os pré-requisitos de laptop (container engine, `kind`, RAM, acesso de
   pull a registries); faça dry-run das instalações de add-on que o seu corte realmente usa.
5. **Distribua** os kubeconfigs (compartilhado) e os pré-requisitos do
   [`../labs/README.md`](../labs/README.md) (ambos) com antecedência.
6. **Verifique** rodando o [lab de setup](../labs/day-1/00-setup.md) como um participante de
   amostra.
7. **Ajuste o pacing no dia** — use o feedback do Day 1 para os Days 2–3, em vez de tratar as
   marcações de minutos do syllabus como dogma.
