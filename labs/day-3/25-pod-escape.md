# Lab 25 — Security & pod escape (S25)

<!-- lab-contract:v1 -->

> ## ⛔ ESTRITAMENTE DEFENSIVO · SOMENTE KIND
>
> Este lab executa um **container escape controlado** para ensinar você a **bloqueá-lo**. Ele roda
> **apenas** em um cluster **kind** descartável **que é seu e que você vai deletar**.
>
> - **NÃO execute nenhum passo contra um cluster compartilhado, gerenciado ou de produção.** O Pod
>   de escape lê o filesystem do node — em um cluster real, isso é um comprometimento de verdade.
> - Todo passo ofensivo é protegido pelo **`context-check.sh`**, que verifica o cluster kind local
>   exato, os metadados do provider e um marcador de propriedade do workshop. Execute-o antes de qualquer coisa ofensiva.
> - O “ataque” é uma única **leitura benigna** (`cat /host/etc/os-release`) para *provar* o acesso ao host.
>   **Nunca** despejamos Secrets ou credenciais e **nunca** escrevemos no host. O perigo de
>   fazer isso é explicado em palavras, não executado.

| | |
| --- | --- |
| **Section** | S25 — Security & pod escape |
| **Environment** | **kind-only · estritamente defensivo** (sem caminho de cluster compartilhado) |
| **Estimated time** | 30 min |

## Objective

Veja — do jeito mais seguro possível — como dois campos do Pod (`privileged` + `hostPath: /`)
permitem que um container **escape para o seu node**, e depois **bloqueie exatamente esse Pod** com
o Pod Security Standard `restricted` do S17. Você vai:

1. Provar que está em um cluster kind com um **guard script** antes de tocar em qualquer coisa ofensiva.
2. Em um namespace **permissivo**, executar o Pod de escape e ler **um único arquivo benigno do node**
   para provar que está lendo o filesystem do **node** — e não o da image do container.
3. **Deletar** o Pod, rotular o namespace com **`enforce=restricted`** e **reaplicar o mesmo Pod**
   → ver o **Pod Security Admission rejeitá-lo no CREATE**, pelas violações de privileged/hostPath.
4. Aplicar o manifesto **hardened** e confirmar que o mesmo gate o **admite**.

O lab gira em torno de um contraste: as configurações que tornam um escape possível são **exatamente**
as que o `restricted` proíbe — e o admission as bloqueia **antes que o Pod chegue a existir**.

## Prerequisites

- **Docker + `kind` + `kubectl`**, e permissão para criar um cluster local. Você vai criar um
  cluster descartável chamado `escape-lab` e deletá-lo no final.
- **Não existe caminho de cluster compartilhado para este lab.** O passo ofensivo lê o filesystem do
  node; isso só é aceitável em um cluster que é seu. Se você não puder rodar o kind, **acompanhe pela
  leitura** — cada passo tem um spoiler com a saída exata.
- Acesso à internet para fazer pull de `alpine:3.20` (uma image minúscula com shell — usada *tanto* no
  Pod de escape quanto no Pod hardened, então a única coisa que muda são as configurações de segurança).
- O Pod Security Admission é **embutido no API server** (estável desde a v1.25) — nada a instalar.

## Files used

- `context-check.sh` — recusa prosseguir a menos que o alvo atual seja exatamente o cluster kind
  descartável, local e seu. Este é
  o guard de segurança compartilhado do workshop, mantido byte a byte idêntico ao canônico já testado
  [`infra/context-guard.sh`](../../infra/context-guard.sh).
- `pod-escape.yaml` — o Pod com `privileged` + `hostPath: /`. **Perigoso por design.**
- `pod-hardened.yaml` — o mesmo workload, hardened para satisfazer o `restricted` → admitido.

Tudo que o lab cria recebe o label `app: s25`, então o cleanup é um único selector — e, de qualquer
forma, o cluster inteiro é descartável.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./25-pod-escape.solution.md#guided-solutions)

### Step 0 — um cluster descartável e o guard que controla tudo

```bash
export WORKSHOP_CLUSTER_NAME=escape-lab
kind create cluster --name "$WORKSHOP_CLUSTER_NAME"
```

Agora escreva o guard. Seu modo `--claim` pode estabelecer o marcador de propriedade em um cluster
descartável existente, mas somente **depois** que o context exato, o endpoint loopback da API, o
provider kind local e os metadados do node tiverem todos passado. O endpoint precisa ser igual ao
server do kubeconfig que o próprio kind gera. Todo passo ofensivo posterior roda a checagem
read-only mais estrita no namespace `escape`.

```bash
cat > context-check.sh <<'EOF'
#!/usr/bin/env sh
# Fail closed unless this is the exact, locally owned disposable kind cluster.

set -eu

marker_name="platformrelay-workshop-ownership"
claim_marker=false

refuse() {
  echo "REFUSING: $*" >&2
  echo "This lab performs a container escape and must run ONLY in a disposable kind cluster you own." >&2
  exit 1
}

case "${1:-}" in
  "") ;;
  --claim) claim_marker=true ;;
  *) refuse "unknown option '$1'" ;;
esac
[ "$#" -le 1 ] || refuse "too many arguments"

expected_cluster="${WORKSHOP_CLUSTER_NAME:-workshop}"
printf '%s\n' "$expected_cluster" | LC_ALL=C grep -Eq '^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$' || \
  refuse "WORKSHOP_CLUSTER_NAME is not a safe kind cluster name"
expected_context="kind-${expected_cluster}"
expected_node="${expected_cluster}-control-plane"
expected_namespace="${WORKSHOP_LAB_NAMESPACE:-escape}"
printf '%s\n' "$expected_namespace" | LC_ALL=C grep -Eq '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' || \
  refuse "WORKSHOP_LAB_NAMESPACE is not a safe Kubernetes namespace name"

if ! context="$(kubectl config current-context 2>/dev/null)" || [ -z "$context" ]; then
  refuse "kubectl has no readable current context"
fi
if ! cluster="$(kubectl config view --minify -o 'jsonpath={.contexts[0].context.cluster}' 2>/dev/null)" || [ -z "$cluster" ]; then
  refuse "kubectl cannot resolve the current kubeconfig cluster"
fi
if ! server="$(kubectl config view --minify -o 'jsonpath={.clusters[0].cluster.server}' 2>/dev/null)" || [ -z "$server" ]; then
  refuse "kubectl cannot resolve the current cluster server"
fi
if ! namespace="$(kubectl config view --minify -o 'jsonpath={.contexts[0].context.namespace}' 2>/dev/null)"; then
  refuse "kubectl cannot resolve the current namespace"
fi
namespace="${namespace:-default}"

[ "$context" = "$expected_context" ] || \
  refuse "context must be exactly '$expected_context'"
[ "$cluster" = "$expected_context" ] || \
  refuse "kubeconfig cluster must be exactly '$expected_context'"
printf '%s\n' "$server" | LC_ALL=C grep -Eq '^https://(127\.0\.0\.1|localhost|\[::1\]):[0-9]+$' || \
  refuse "API server is not a loopback kind endpoint"
printf '%s\n' "$namespace" | LC_ALL=C grep -Eq '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' || \
  refuse "current namespace is not a safe Kubernetes namespace name"
if [ "$claim_marker" = true ]; then
  [ "$namespace" = default ] || \
    refuse "marker claim must start in the 'default' namespace"
else
  [ "$namespace" = "$expected_namespace" ] || \
    refuse "current namespace must be exactly '$expected_namespace'"
fi

echo "Resolved Kubernetes target:"
echo "  context: $context"
echo "  cluster: $cluster"
echo "  server: $server"
echo "  namespace: $namespace"

if ! local_clusters="$(kind get clusters 2>/dev/null)"; then
  refuse "kind cannot enumerate local clusters"
fi
printf '%s\n' "$local_clusters" | grep -Fxq "$expected_cluster" || \
  refuse "'$expected_cluster' is not a cluster owned by the local kind provider"

if ! kind_kubeconfig="$(kind get kubeconfig --name "$expected_cluster" 2>/dev/null)"; then
  refuse "kind cannot read the canonical kubeconfig for '$expected_cluster'"
fi
kind_server="$(printf '%s\n' "$kind_kubeconfig" | awk '$1 == "server:" { print $2; exit }')"
[ -n "$kind_server" ] || refuse "kind kubeconfig has no API server"
[ "$server" = "$kind_server" ] || \
  refuse "current API server does not match kind's '$expected_cluster' kubeconfig"

if ! kind_nodes="$(kind get nodes --name "$expected_cluster" 2>/dev/null)"; then
  refuse "kind cannot resolve nodes for '$expected_cluster'"
fi
printf '%s\n' "$kind_nodes" | grep -Fxq "$expected_node" || \
  refuse "kind does not report the expected control-plane node '$expected_node'"

if ! node_identity="$(kubectl get node "$expected_node" -o 'jsonpath={.metadata.labels.kubernetes\.io/hostname}|{.spec.providerID}' 2>/dev/null)"; then
  refuse "kubectl cannot read the expected kind node identity"
fi
case "$node_identity" in
  "$expected_node|kind://"*"/$expected_cluster/$expected_node") ;;
  *) refuse "node metadata does not identify the expected kind provider/cluster" ;;
esac

if ownership_cluster="$(kubectl --namespace kube-system get configmap "$marker_name" -o 'jsonpath={.data.cluster}' 2>&1)"; then
  [ "$ownership_cluster" = "$expected_cluster" ] || \
    refuse "ownership marker belongs to '$ownership_cluster', not '$expected_cluster'"
else
  expected_not_found="Error from server (NotFound): configmaps \"$marker_name\" not found"
  [ "$ownership_cluster" = "$expected_not_found" ] || \
    refuse "ownership marker lookup failed without the exact NotFound response"
  [ "$claim_marker" = true ] || \
    refuse "workshop ownership marker is missing; recreate the cluster or run this guard once with --claim"
  kubectl create configmap "$marker_name" \
    --namespace kube-system \
    --from-literal="cluster=$expected_cluster" >/dev/null || \
    refuse "could not create the workshop ownership marker"
  echo "Ownership marker created for disposable cluster '$expected_cluster'."
fi

echo "OK: disposable workshop kind cluster identity verified — safe to proceed."
EOF
chmod +x context-check.sh

./context-check.sh --claim

export NS=escape
kubectl create namespace "$NS"
kubectl config set-context --current --namespace="$NS"
kubectl get nodes

./context-check.sh
```

**Tarefa:** confirme que o guard passa no seu cluster kind — e entenda que em qualquer outro lugar
ele **falharia fechado** (fail closed).

> **⚠️ Por que este guard importa.** O próximo passo lê deliberadamente o filesystem do node. Isso é
> um recurso didático em um cluster que você vai jogar fora; em um cluster compartilhado, é um
> **incidente de segurança**. O context check é o único trilho de segurança que mantém o passo
> ofensivo onde ele deve ficar. Nunca o remova e nunca o alargue para casar com o nome de context de
> um cluster real.

---

### Step 1 — o namespace permissivo (a porta está aberta)

O `restricted` é opt-in. Para *mostrar* o escape primeiro, marcamos explicitamente este namespace com
o standard mais frouxo, `privileged` — assim o API server não barra o Pod perigoso.

```bash
./context-check.sh || { echo "guard failed — stopping"; exit 1; }

kubectl label --overwrite namespace "$NS" \
  pod-security.kubernetes.io/enforce=privileged
kubectl get namespace "$NS" -o jsonpath='{.metadata.labels}' | tr ',' '\n' | grep pod-security
```

**Tarefa:** confirme que o namespace aplica (enforce) o standard `privileged` (ou seja, nenhuma restrição).

> **⚠️ Por que isso é perigoso no mundo real.** Um namespace **sem** nenhum Pod Security Standard
> aplicado é o padrão em muitos clusters. Significa que *qualquer* Pod que alguém consiga criar —
> inclusive um com `privileged` + `hostPath` — é aceito. O primeiro passo de hardening em qualquer
> cluster é parar de deixar namespaces sem label.

---

### Step 2 — o escape: ler o filesystem do node a partir de um Pod

Execute o guard e depois aplique o Pod de escape.

```bash
./context-check.sh || { echo "guard failed — stopping"; exit 1; }

cat > pod-escape.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: escape
  labels: { app: s25 }
spec:
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      securityContext:
        privileged: true                 # poder quase total sobre o node
      volumeMounts:
        - name: host
          mountPath: /host               # o / do node agora fica visível em /host
  volumes:
    - name: host
      hostPath:
        path: /                          # monta a raiz INTEIRA do host
EOF

kubectl apply -f pod-escape.yaml
kubectl wait --for=condition=Ready pod/escape --timeout=60s
```

**Tarefa:** prove que você está lendo o filesystem do **node** — e não o da image alpine — com **uma
única leitura benigna**. Compare o `/etc/os-release` do próprio container com o do node em `/host/etc/os-release`.

```bash
./context-check.sh || { echo "guard failed — stopping"; exit 1; }

echo "== container image OS =="
kubectl exec escape -- cat /etc/os-release | grep -E '^(NAME|PRETTY_NAME)='

echo "== NODE OS (via the hostPath mount) =="
kubectl exec escape -- cat /host/etc/os-release | grep -E '^(NAME|PRETTY_NAME)='

echo "== node's kubernetes dir is right there (listing only — we read nothing sensitive) =="
kubectl exec escape -- ls /host/etc/kubernetes 2>/dev/null || \
  kubectl exec escape -- ls /host/etc | head
```

> **⚠️ Por que aqui está o jogo inteiro.** Com `/host` = o `/` do node, esse mesmo acesso *de leitura
> e escrita* alcança, em um cluster real: o **certificado de cliente do kubelet e a CA do cluster**
> (`/host/etc/kubernetes/pki`), **os tokens de ServiceAccount projetados e os Secrets de todos os Pods**
> em `/host/var/lib/kubelet/pods/…` e o **diretório de static Pods** `/host/etc/kubernetes/manifests`
> — escreva um manifesto ali e o kubelet o executa **como root no node**. O `privileged` ainda soma
> acesso a devices e um perfil seccomp relaxado. Demonstramos o *acesso* com uma leitura inofensiva
> e paramos; **não** leia tokens nem escreva nada. O ponto está feito — agora vamos bloqueá-lo.

**Pergunta:** só executamos `sleep` e um `cat`. Qual **configuração isolada** mais viabilizou esse escape?

> **⚠️ Por que isso é perigoso.** Uma única linha de `hostPath` de aparência inofensiva — sem
> precisar de `privileged` — pode entregar silenciosamente ao Pod o disco inteiro do node. É por isso
> que o `hostPath` é tratado como violação de `baseline`/`restricted` por si só: o tipo de volume *é*
> o risco, independentemente do que o container faça com ele.

---

### Step 3 — o fix: delete primeiro, depois deixe o `restricted` rejeitar o mesmo Pod

**A ordem importa.** O Pod Security Admission barra Pods apenas no momento do **CREATE**. Rotular o
namespace como `restricted` **não** despeja o Pod de escape que já está rodando — então **deletamos
ele primeiro**, depois apertamos o namespace, e então tentamos recriar o Pod *idêntico* e observamos
o admission recusá-lo.

```bash
./context-check.sh || { echo "guard failed — stopping"; exit 1; }

# 1) remova o Pod de escape em execução (o admission não toca no que já existe)
kubectl delete -f pod-escape.yaml

# 2) aperte o MESMO namespace para o standard restricted
kubectl label --overwrite namespace "$NS" \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted

# 3) reaplique EXATAMENTE O MESMO manifesto de escape
kubectl apply -f pod-escape.yaml
```

**Tarefa:** o reapply é **rejeitado**. Leia o erro — o Pod chega a ser criado e quais configurações
perigosas são nomeadas?

```bash
kubectl get pod escape        # ele está lá?
```

> **⚠️ Por que deletar-depois-rotular (e não rotular primeiro).** O PSA é um controller de
> **admission** — ele só roda quando um objeto é **criado ou atualizado**, nunca sobre objetos já
> armazenados. Se você rotular o namespace como `restricted` enquanto o Pod de escape está rodando,
> o Pod **continua rodando** — a policy não o mata retroativamente. Essa é uma pegadinha operacional
> real: aplicar o `restricted` protege você de Pods violadores *novos*, mas não remedia os existentes.
> Por isso deletamos primeiro e só então provamos que o gate bloqueia a recriação.

**Pergunta:** o Pod de escape declarou **`privileged`** e **`hostPath`**, mas o erro *também* lista
`runAsNonRoot`, `allowPrivilegeEscalation`, `capabilities` e `seccompProfile`. Por que as seis?

> **⚠️ Por que isso importa para a defesa.** As configurações de escape (`privileged`, `hostPath`) e
> as de menor privilégio são aplicadas pelo **mesmo** label de namespace. Você não escolhe entre
> “bloquear escapes” e “least privilege” — o `restricted` te dá os dois, e um Pod que pula os campos
> de menor privilégio é tratado como tão suspeito quanto um que monta o host.

---

### Step 4 — o Pod hardened que o gate admite

O mesmo workload (alpine rodando `sleep`), sem as alavancas de escape e endurecido para satisfazer o
`restricted`. O `alpine` roda tranquilo com **qualquer** UID, então `runAsUser: 1000` não vai
CrashLoopar como faria uma image que só roda como root (a mina terrestre do S17).

```bash
./context-check.sh || { echo "guard failed — stopping"; exit 1; }

cat > pod-hardened.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: hardened
  labels: { app: s25 }
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000                      # UID non-root explícito (o alpine roda com qualquer UID)
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
      # sem privileged, sem hostPath — as alavancas de escape sumiram
EOF

kubectl apply -f pod-hardened.yaml
kubectl get pod hardened -w        # Ctrl-C assim que estiver Running
```

**Tarefa:** confirme que o Pod hardened é **admitido e fica Running**, e que ele é genuinamente
non-root, sem visão nenhuma do host.

```bash
kubectl exec hardened -- id
kubectl exec hardened -- ls /host 2>&1 || true
```

> **⚠️ Por que `runAsUser: 1000` aqui.** `runAsNonRoot: true` é uma *promessa que a image precisa
> cumprir* (a mina terrestre do S17): o admission só checa o campo, mas o **kubelet** se recusa a
> iniciar um container cuja image resolve para o UID 0. Uma image que só roda como root seria
> admitida e depois entraria em **CrashLoop** com
> `container has runAsNonRoot and image will run as root`. O `alpine` roda com **qualquer** UID,
> então fixar `runAsUser: 1000` garante um usuário non-root que a image realmente suporta.

**Pergunta:** no lab inteiro — qual **defesa isolada** teve a maior alavancagem?

> **⚠️ Por que “maior alavancagem” é o ponto.** A detecção em runtime pega um escape *depois* que ele
> acontece; o scanning de image pega uma CVE *conhecida*. O admission (`restricted`) é a única camada
> que impede o Pod perigoso de **sequer existir** — é proativo, não precisa de agent e cobre Pods que
> você nem escreveu ainda. É por isso que ele é a primeira coisa a ligar, não a última.

## Observe

- Um container é um **processo no kernel do node**: `hostPath: /` entregou ao Pod o filesystem do
  **node** (provado pelo diff de `os-release` Debian-versus-Alpine), e `privileged` lhe deu poder
  quase total. O escape **não precisou de exploit** — apenas dois campos suportados do Pod.
- **O admission barra o CREATE, não Pods existentes:** rotular com `restricted` não despejou o Pod de
  escape em execução — você teve que **deletar primeiro**, e é exatamente por isso que a ordem do fix
  é deletar → rotular → reaplicar.
- O **mesmo manifesto, exatamente igual**, que rodou sob `enforce: privileged` é **rejeitado** sob
  `enforce: restricted` — o erro nomeia **`privileged`** e **`hostPath`** mais os quatro gates de
  menor privilégio do S17 (seis regras), e o Pod **nunca é criado**.
- O Pod **hardened** — mesmo workload, alavancas de escape removidas, em conformidade com o
  `restricted` — é **admitido** e roda como **uid 1000**, sem `/host`.
- **Defesa de maior alavancagem:** `enforce: restricted` no namespace, no admission. Todo o resto é
  defesa em profundidade em volta disso.

## Challenge

Somente no cluster kind descartável, prove que rotular um namespace como restricted não
despeja um Pod privileged com hostPath que já está rodando. Capture a ordem delete → enforce →
reapply e mostre que o mesmo manifesto de escape é rejeitado depois disso.

**Difficulty:** Advanced

**Success criteria:** Mostre que o status do Pod de escape permanece Running depois que enforce=restricted é
aplicado, delete esse Pod, reaplique o manifesto de escape e prove que o admission o rejeita (a saída
de erro nomeia privileged/hostPath) enquanto um Pod hardened chega a Running.

**Hints:** Permaneça dentro do guard context-check.sh; use kubectl get pod -w em torno da mudança de
label; compare a lista de violações do restricted com privileged e hostPath.

[Spoiler: solução do challenge](./25-pod-escape.solution.md#challenge-solution)

## Verify

Confirme as evidências do lab de escape kind-only antes do cleanup.

```bash
./context-check.sh
kubectl get pod -n "$NS" -l app=s25
kubectl get namespace "$NS" --show-labels | tr ',' '\n' | grep pod-security || true
```

Esperado: as evidências do Pod hardened e/ou o contexto da rejeição pelo admission permanecem até
você queimar o cluster descartável.

## Cleanup / reset

```bash
# cleanup com escopo — tudo que este lab criou tem o label app=s25
./context-check.sh || { echo "guard failed — stopping"; exit 1; }
kubectl delete pod -l app=s25 -n "$NS" --ignore-not-found

./context-check.sh || { echo "guard failed — stopping"; exit 1; }
# reset de pânico: remova o Namespace do lab pela UI do seu cluster / queime o kind — não use aqui um ns delete sem qualificação

# RESET DE PÂNICO (recomendado) — o cluster era descartável; jogue tudo fora:
./context-check.sh || { echo "guard failed — stopping"; exit 1; }
kind delete cluster --name "$WORKSHOP_CLUSTER_NAME"

# Remova o guard apenas depois que todo comando destrutivo que ele protege tiver terminado.
rm -f context-check.sh pod-escape.yaml pod-hardened.yaml
```

> **Opção de pânico: delete o cluster.** Como o Pod de escape tinha a raiz do host montada em leitura
> e escrita, a garantia mais limpa de que nada ficou para trás é **destruir o cluster kind por
> inteiro** — `kind delete cluster --name escape-lab`. Ele era descartável por design. Esse é o reset
> a que recorrer se alguma coisa parecer estranha, e é por isso que este lab é kind-only: você sempre
> pode queimar tudo.

## Stretch (opcional) — soft-launch com `warn` antes do `enforce`

Em um cluster real você não vira o `enforce=restricted` às cegas em um namespace movimentado — você
liga o **`warn`** primeiro para descobrir o que *quebraria*, corrige e só então aplica o enforce.
Prove a diferença contra o Pod de escape em um namespace de rascunho novo.

```bash
./context-check.sh || { echo "guard failed — stopping"; exit 1; }
kubectl create namespace s25-warn
kubectl label namespace s25-warn pod-security.kubernetes.io/warn=restricted
kubectl apply -n s25-warn -f pod-escape.yaml
kubectl get pod escape -n s25-warn
```

> **⚠️ Por que o stretch também continua kind-only.** O `warn` **cria** o Pod — então este namespace
> de rascunho roda por um instante um Pod privileged que monta o host, exatamente como no Step 2.
> Isso está ok no seu cluster kind descartável e em lugar nenhum além dele. Delete o namespace quando
> terminar, ou simplesmente rode `kind delete cluster`.
