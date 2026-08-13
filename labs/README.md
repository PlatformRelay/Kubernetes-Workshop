# Labs — guia do participante

Labs hands-on do Kubernetes Practitioner Workshop. Eles são a metade **prática (50%)**
do workshop: todo bloco de conceito do deck é seguido por um lab que você executa
contra o seu próprio ambiente.

Cada lab é um **arquivo Markdown independente** que você pode ler de cima a baixo e
percorrer copiando e colando. Você não precisa dos slides para executá-los.

> **Chegou agora? Comece pelo [`day-1/00-setup.md`](./day-1/00-setup.md).** Ele verifica seu
> tooling, seu context e seu namespace antes de qualquer conteúdo de verdade — e ensina o
> panic reset que você reutiliza em todo lugar. Depois percorra os labs em ordem (cada um
> estende o anterior).

- **Cronograma e mapa de seções:** [`../docs/syllabus.md`](../docs/syllabus.md)
- **Conduzindo o workshop (facilitadores):** [`../docs/facilitator-guide.md`](../docs/facilitator-guide.md)
- **Visão geral do projeto e preview:** [`../README.md`](../README.md)

## Prerequisites

Você precisa de um shell com o qual se sinta confortável, mais as ferramentas abaixo. **As
versões não estão fixadas rigidamente** — use releases atuais e mantenha o `kubectl` dentro de
uma minor version do API server do seu cluster.

**Core (todo lab de cluster):**

- `kubectl` no seu `PATH`, falando com um cluster (veja [Your environment](#your-environment)).
- Um ambiente de lab: um **namespace atribuído** em um cluster compartilhado **ou** um cluster
  **kind** local.

**Para o caminho kind local:**

- [`kind`](https://kind.sigs.k8s.io) e um **container engine** (Docker ou Podman).
- Você tem admin total sobre o seu próprio cluster, então os labs kind-only (instalação de
  add-ons) funcionam.
- **Um comando prepara tudo:** [`../docs/setup.md`](../docs/setup.md) leva você de um laptop
  zerado a um cluster kind pronto para os labs com `./workshop up` (escolha do engine, incluindo
  a nota de licenciamento do Docker Desktop, a toolchain fixada e o caminho Windows/WSL2).

**Para os labs de container (S01/S02) — sem precisar de cluster:**

- Um **container engine**: Docker, Podman ou nerdctl (os labs usam uma variável `$ENGINE`,
  então qualquer um dos três serve). O daemon/a máquina dele precisa estar rodando.
- **Só no S02:** um scanner de vulnerabilidades — [Trivy](https://trivy.dev) (Grype também
  funciona); opcionalmente [cosign](https://docs.sigstore.dev/) para o passo de assinatura
  (pode ser pulado).

**Para labs específicos do Day 3:**

- [`helm`](https://helm.sh) v3.8+ para o lab de Helm (S20) e o lab de Prometheus (S23).
- Alguns labs instalam add-ons cluster-wide (metrics-server, um controller de Ingress/Gateway,
  uma CNI com suporte a policy, Argo CD, uma stack de monitoring). Eles são **kind-only** e
  autoinstalados pelo próprio lab, ou já disponibilizados para você em um cluster compartilhado.
  Veja [How the labs work](#how-the-labs-work) e os prerequisites de cada lab.

O lab de setup, [`day-1/00-setup.md`](./day-1/00-setup.md), verifica seu tooling antes de
qualquer conteúdo de verdade — comece por ele.

## Your environment

Todo lab de cluster roda em **um de dois ambientes**, e os dois são suportados do início ao
fim:

| Ambiente | O que é | O que você ganha |
| --- | --- | --- |
| **Namespace** | Um namespace atribuído em um cluster compartilhado que seu facilitador administra. | Um kubeconfig + um namespace (ex.: `student-07`). **Sem cluster-admin.** |
| **kind** | Um cluster local de um node só que você mesmo cria. | Admin total sobre o seu cluster descartável. |

Cada lab carrega um **badge de Environment** dizendo quais caminhos ele suporta:

- **`namespace ✓ / kind ✓`** — funciona nos dois, de forma idêntica. A maioria dos labs core.
- **`kind ✓` + `namespace: read-only`** — o caminho hands-on completo precisa de cluster-admin,
  CRDs ou acesso ao host, então ele roda só no seu próprio cluster kind, **mas** esses labs
  também trazem uma alternativa read-only segura para namespace (observar um componente
  pré-instalado), para que quem está em cluster compartilhado consiga acompanhar.
  (S16, S18, S21, S23.)
- **`kind-only`** — sem nenhum caminho em cluster compartilhado: o lab precisa rodar em um
  cluster kind descartável que seja seu (ex.: S25 pod-escape, um container escape controlado).
- **`local — no cluster needed`** — os labs de container (S01/S02) rodam inteiramente na sua
  máquina contra um container engine; nada de Kubernetes.

Os labs usam a variável de shell `$NS` para o seu namespace de trabalho o tempo todo. Defina-a
uma vez no lab de setup (`export NS=<your-namespace>`; quem usa kind usa `export NS=workshop`).

## How the labs work

O workshop ensina um ritmo repetível: **explique → execute → observe → quebre → conserte →
recapitule**. Os labs são a parte "execute / observe / quebre / conserte". Day 1 Labs 01–08,
Day 2 Labs 09–16 e Day 3 Labs 17–23, 25–26 são as fatias garantidas pelo
`pnpm test:labs` (o S24 kubebuilder continua deferred); eles seguem este formato:

1. **Title & metadata** — o ID da seção correspondente, um tempo estimado e o
   badge de Environment.
2. **Objective** — uma ou duas frases sobre o que você vai provar.
3. **Prerequisites** — labs anteriores, quaisquer add-ons/ferramentas necessários.
4. **Guided task** — comandos explícitos, ordenados, prontos para copiar e colar. Nada de
   "se vira".
5. **Observe** — leia e explique o estado resultante.
6. **Challenge** — transfira a habilidade para um cenário de diagnóstico ou modificado.
7. **Verify** — prove o estado esperado antes de apagar as evidências.
8. **Cleanup / reset** — remova os recursos do lab por nome/label ou resete apenas o namespace
   atribuído.

### Soluções e hints

Os labs contratados do participante continuam legíveis porque as respostas ficam em um irmão
`NN-topic.solution.md`. Cada lab aponta para os dois anchors obrigatórios:

```md
[Spoiler: guided solutions](./NN-topic.solution.md#guided-solutions)
[Spoiler: challenge solution](./NN-topic.solution.md#challenge-solution)
```

Tente cada passo **antes** de abrir o companion. Ele contém os comandos/manifestos exatos, o
estado esperado representativo, por que o resultado está certo, a recuperação das falhas mais
prováveis e a resposta do challenge.
Day 1 Labs 01–08, Day 2 Labs 09–16 e Day 3 Labs 17–23, 25–26 usam essa convenção de irmão.
**S24** (`24-kubebuilder.md`) é um stub **deferred** fora
do inventário — nada de solução irmã inventada em Go/kubebuilder até o lab de toolchain sair.

## Completion matrix

Status do contrato para o inventário do `pnpm test:labs` (o irmão `NN-topic.solution.md` é
obrigatório):

| Lab | Solução irmã | Notas |
| --- | --- | --- |
| Day 1 · [`01`](./day-1/01-containers.md)–[`08`](./day-1/08-ingress.md) | sim | Obrigatório |
| Day 2 · [`09`](./day-2/09-gateway-api.md)–[`16`](./day-2/16-hpa.md) | sim | Obrigatório |
| Day 3 · [`17`](./day-3/17-pod-security.md)–[`23`](./day-3/23-prometheus.md), [`25`](./day-3/25-pod-escape.md)–[`26`](./day-3/26-capstone.md) | sim | Obrigatório |
| Day 3 · [`24`](./day-3/24-kubebuilder.md) | deferred | Stub do S24 — exceção revisada; sem irmão até o lab de toolchain sair |

### Break → fix

Todo lab inclui pelo menos uma **quebra deliberada**: uma tag de image ruim, um selector que
não casa, uma probe falhando, um resource request faltando, um Pod rejeitado. Você roda o
estado quebrado, lê o erro real (do `describe`, dos `logs` ou dos events) e então conserta.
Esse é o ponto todo — você aprende a reconhecer falhas em um lugar seguro para reconhecê-las
de verdade depois.

### Segurança de reset e cleanup

Todo lab termina com um **Cleanup / panic reset** que devolve seu ambiente a um estado limpo:

- Em um **namespace compartilhado**, o cleanup é sempre **restrito ao seu namespace**
  (`-n $NS`), então você nunca encosta no trabalho de ninguém. O panic reset canônico deleta os
  objetos de workload comuns apenas no seu namespace.
- No **kind**, o reset mais rápido é jogar o cluster fora e recriá-lo (`kind delete cluster` e
  então criar de novo — ~30 s). **Nunca** faça o reset descartável em um cluster compartilhado.

O lab de setup define o panic reset reutilizável; os labs seguintes apontam de volta para ele.

## Estrutura

Os labs são agrupados pelo dia sugerido no manifesto de seções. O
[3-day cut canônico](../docs/syllabus.md#the-canonical-3-day-cut) é um subconjunto menor; os
labs adicionais continuam aqui para que facilitadores possam compor uma entrega mais longa.
O prefixo numérico é o ID da seção (Lab `NN` ↔ seção `SNN`). Todo lab escrito abaixo é um link
direto — clique direto em qualquer um:

### Day 1 — Fundamentos, containers, a red line central

- [`00-setup`](./day-1/00-setup.md) — verifique tooling, context e namespace *(comece aqui)*
- [`01-containers`](./day-1/01-containers.md) · [`02-container-security`](./day-1/02-container-security.md) *(local, sem cluster)*
- [`03-cluster-tour`](./day-1/03-cluster-tour.md) · [`04-kubectl`](./day-1/04-kubectl.md)
- [`05-pod`](./day-1/05-pod.md) · [`06-deployment`](./day-1/06-deployment.md) · [`07-service`](./day-1/07-service.md) · [`08-ingress`](./day-1/08-ingress.md)

### Day 2 — Routing moderno, rodando workloads bem

- [`09-gateway-api`](./day-2/09-gateway-api.md) · [`10-config`](./day-2/10-config.md) · [`11-storage`](./day-2/11-storage.md) · [`12-statefulset`](./day-2/12-statefulset.md)
- [`13-resources`](./day-2/13-resources.md) · [`14-probes`](./day-2/14-probes.md) · [`15-jobs`](./day-2/15-jobs.md) · [`16-hpa`](./day-2/16-hpa.md)

### Day 3 — Segurança, entrega, operators, boas práticas

- [`17-pod-security`](./day-3/17-pod-security.md) · [`18-networkpolicy`](./day-3/18-networkpolicy.md) · [`19-rbac`](./day-3/19-rbac.md)
- [`20-helm`](./day-3/20-helm.md) · [`21-gitops`](./day-3/21-gitops.md) · [`22-operator-concept`](./day-3/22-operator-concept.md) · [`23-prometheus`](./day-3/23-prometheus.md)
- [`24-kubebuilder`](./day-3/24-kubebuilder.md) *(stub deferred)* · [`25-pod-escape`](./day-3/25-pod-escape.md) · [`26-capstone`](./day-3/26-capstone.md)

Como o deck é um **superset** (mais seções do que cabem em três dias), alguns labs ficam fora
do 3-day cut padrão (ex.: Jobs, HPA, RBAC). Eles estão totalmente escritos e executáveis mesmo
assim — veja o [syllabus](../docs/syllabus.md) para saber quais seções uma dada entrega inclui.
Uma seção opcional, **S24 (kubebuilder)**, é um stub **deferred** — ela precisa de uma toolchain
Go e está planejada para um milestone posterior; veja o
[guia do facilitador](../docs/facilitator-guide.md).

## How to start

1. Confirme seus [prerequisites](#prerequisites) e decida seu
   [environment](#your-environment) (namespace ou kind).
2. Execute o [`day-1/00-setup.md`](./day-1/00-setup.md) de ponta a ponta. Ele verifica o
   `kubectl`, seu context e namespace e sua permissão para criar workloads — e ensina o panic
   reset que você vai reutilizar em todo lugar.
3. Percorra os labs em ordem. Cada um estende a mesma aplicação em execução (a
   [red line](../docs/syllabus.md#the-red-line): Pod → Deployment → Service → Ingress →
   Gateway API), então os labs posteriores assumem que você completou os anteriores.

> **Nota sobre o ensaio em kind.** Os manifestos dos labs estão validados, mas nem todo lab foi
> executado de ponta a ponta em um ambiente limpo — algumas instalações de add-on kind-only
> (timings, comportamento exato de controller/CRD) ainda dependem de uma rodada de ensaio. Se o
> timing de um passo ou a saída representativa da solução divergir, capture o estado real em vez
> de copiar um valor efêmero. Facilitadores: veja o
> [guia do facilitador](../docs/facilitator-guide.md).
