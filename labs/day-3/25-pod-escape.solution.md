# Lab 25 — Security & pod escape (S25) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ ./context-check.sh --claim
Resolved Kubernetes target:
  context: kind-escape-lab
  cluster: kind-escape-lab
  server: https://127.0.0.1:54321
  namespace: default
Ownership marker created for disposable cluster 'escape-lab'.
OK: disposable workshop kind cluster identity verified — safe to proceed.
```

A porta é atribuída dinamicamente, então a sua será diferente. Um nome começando com `kind-` não
basta: o guard também verifica o cluster e o namespace exatos do kubeconfig, o API server vindo do
próprio kubeconfig do kind, o inventário local de clusters/nodes do kind, o provider ID do node e o
marcador de propriedade. Qualquer evidência ausente ou ambígua imprime `REFUSING…` e sai com 1. O
caminho normal `./context-check.sh` nunca cria nem altera nada.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get namespace "$NS" -o jsonpath='{.metadata.labels}' | tr ',' '\n' | grep pod-security
"pod-security.kubernetes.io/enforce":"privileged"
```

`enforce: privileged` é o Pod Security Standard **mais frouxo** — ele impõe **nenhuma** restrição,
então um Pod com `privileged` + `hostPath` é admitido. Nós o rotulamos explicitamente (em vez de nos
apoiarmos no padrão) para que o contraste com o `restricted` no Step 3 seja inconfundível: **mesmo
namespace, um label alterado.**
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
== container image OS ==
NAME="Alpine Linux"
PRETTY_NAME="Alpine Linux v3.20"

== NODE OS (via the hostPath mount) ==
NAME="Debian GNU/Linux"
PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"

== node's kubernetes dir is right there (listing only — we read nothing sensitive) ==
admin.conf
controller-manager.conf
kubelet.conf
manifests
pki
scheduler.conf
```

O SO do próprio container é **Alpine** (a image dele), mas o `/host/etc/os-release` reporta
**Debian** — o SO do **node** kind. São dois sistemas operacionais diferentes: a segunda leitura veio
do filesystem raiz real do node, montado por `hostPath: /`. O `ls` mostra que o diretório
`/etc/kubernetes` do node (kubeconfigs, o diretório de certificados `pki`, o diretório `manifests` de
static Pods) está bem ali — **listamos apenas para provar o alcance e paramos; não abrimos nada disso.**
</details>

> **⚠️ Por que aqui está o jogo inteiro.** Com `/host` = o `/` do node, esse mesmo acesso *de leitura
> e escrita* alcança, em um cluster real: o **certificado de cliente do kubelet e a CA do cluster**
> (`/host/etc/kubernetes/pki`), **os tokens de ServiceAccount projetados e os Secrets de todos os Pods**
> em `/host/var/lib/kubelet/pods/…` e o **diretório de static Pods** `/host/etc/kubernetes/manifests`
> — escreva um manifesto ali e o kubelet o executa **como root no node**. O `privileged` ainda soma
> acesso a devices e um perfil seccomp relaxado. Demonstramos o *acesso* com uma leitura inofensiva
> e paramos; **não** leia tokens nem escreva nada. O ponto está feito — agora vamos bloqueá-lo.

**Pergunta:** só executamos `sleep` e um `cat`. Qual **configuração isolada** mais viabilizou esse escape?

<details><summary>Resposta</summary>

**`hostPath: { path: / }`** é o que de fato expôs o filesystem do node — é a porta por onde a leitura
passou. `privileged: true` é a alavanca de *capability* maior no geral (acesso a devices, seccomp
relaxado, quase todas as caps, e é o que se precisa para *escrever* livremente pelo host), mas para
*esta leitura específica* o mount de hostPath é o viabilizador: sem ele não existe `/host` para ler.
Na prática, os dois andam juntos e — crucialmente — **o `restricted` proíbe ambos.** É por isso que
uma única policy fecha a classe inteira de porta, que é exatamente o Step 3.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply -f pod-escape.yaml
Error from server (Forbidden): error when creating "pod-escape.yaml": pods "escape" is forbidden:
violates PodSecurity "restricted:latest": privileged (container "shell" must not set
securityContext.privileged=true), allowPrivilegeEscalation != false (container "shell" must set
securityContext.allowPrivilegeEscalation=false), unrestricted capabilities (container "shell" must
set securityContext.capabilities.drop=["ALL"]), restricted volume types (volume "host" uses
restricted volume type "hostPath"), runAsNonRoot != true (pod or container "shell" must set
securityContext.runAsNonRoot=true), seccompProfile (pod or container "shell" must set
securityContext.seccompProfile.type to "RuntimeDefault" or "Localhost")

$ kubectl get pod escape
Error from server (NotFound): pods "escape" not found
```

O **mesmo manifesto, exatamente igual**, que rodou no Step 2 agora é recusado. A mensagem nomeia as
duas alavancas de escape diretamente — **`privileged`** e **`restricted volume types … "hostPath"`** —
ao lado dos quatro gates de menor privilégio do S17. Isso é enforcement de **admission**: o API
server rejeitou a requisição, então o Pod **nunca foi criado** (`NotFound`). Um único label de
namespace fechou a porta.
</details>

> **⚠️ Por que deletar-depois-rotular (e não rotular primeiro).** O PSA é um controller de
> **admission** — ele só roda quando um objeto é **criado ou atualizado**, nunca sobre objetos já
> armazenados. Se você rotular o namespace como `restricted` enquanto o Pod de escape está rodando,
> o Pod **continua rodando** — a policy não o mata retroativamente. Essa é uma pegadinha operacional
> real: aplicar o `restricted` protege você de Pods violadores *novos*, mas não remedia os existentes.
> Por isso deletamos primeiro e só então provamos que o gate bloqueia a recriação.

**Pergunta:** o Pod de escape declarou **`privileged`** e **`hostPath`**, mas o erro *também* lista
`runAsNonRoot`, `allowPrivilegeEscalation`, `capabilities` e `seccompProfile`. Por que as seis?

<details><summary>Resposta</summary>

O `restricted` é um **superset** do `baseline`. O **`baseline`** bloqueia as configurações
obviamente perigosas voltadas ao host — é daí que vêm **`privileged`** e **`hostPath`** (“restricted
volume types”). O **`restricted`** então *acrescenta* os quatro requisitos de menor privilégio do S17
(`runAsNonRoot`, `allowPrivilegeEscalation: false`, drop `ALL`, `seccompProfile`). O Pod de escape
não define nenhum dos quatro, então ele tropeça nas **seis** regras de uma vez. Bloquear o escape e
exigir menor privilégio são a mesma policy — e é por isso que o `restricted` é o controle isolado de
maior alavancagem.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply -f pod-hardened.yaml
pod/hardened created

$ kubectl get pod hardened
NAME       READY   STATUS    RESTARTS   AGE
hardened   1/1     Running   0          8s

$ kubectl exec hardened -- id
uid=1000 gid=0 groups=0

$ kubectl exec hardened -- ls /host
ls: /host: No such file or directory
command terminated with exit code 1
```

O mesmo gate que **rejeitou** o Pod de escape **admite** este aqui — as seis regras passam:
`privileged` não definido, nenhum volume `hostPath`, UID non-root **1000**, sem priv-esc, todas as
caps removidas, seccomp `RuntimeDefault`. O `id` mostra **uid=1000** (não 0), e **não existe
`/host`** — o filesystem do host sumiu. Mesmo namespace, mesma policy; foi o **manifesto** que
atingiu o padrão.
</details>

> **⚠️ Por que `runAsUser: 1000` aqui.** `runAsNonRoot: true` é uma *promessa que a image precisa
> cumprir* (a mina terrestre do S17): o admission só checa o campo, mas o **kubelet** se recusa a
> iniciar um container cuja image resolve para o UID 0. Uma image que só roda como root seria
> admitida e depois entraria em **CrashLoop** com
> `container has runAsNonRoot and image will run as root`. O `alpine` roda com **qualquer** UID,
> então fixar `runAsUser: 1000` garante um usuário non-root que a image realmente suporta.

**Pergunta:** no lab inteiro — qual **defesa isolada** teve a maior alavancagem?

<details><summary>Resposta</summary>

**Aplicar o Pod Security Standard `restricted` no namespace** — um label. É o controle de maior
alavancagem porque bloqueia a classe *inteira* de escape no **admission**, antes que um Pod violador
possa existir: ele proíbe `privileged`, `hostPath` e os host namespaces (via `baseline`) **e** exige
menor privilégio (os quatro campos do `restricted`). Nenhuma mudança de image, nenhuma mudança de
código, nenhum agent de runtime — um único label de namespace rejeitou exatamente o Pod que acabara
de ler o node. Combine isso com higiene de image (S02), NetworkPolicy (S18) e scanning/detecção para
defesa em profundidade, mas se você fizer **uma** coisa só, rotule seus namespaces como `restricted`.
</details>

> **⚠️ Por que “maior alavancagem” é o ponto.** A detecção em runtime pega um escape *depois* que ele
> acontece; o scanning de image pega uma CVE *conhecida*. O admission (`restricted`) é a única camada
> que impede o Pod perigoso de **sequer existir** — é proativo, não precisa de agent e cobre Pods que
> você nem escreveu ainda. É por isso que ele é a primeira coisa a ligar, não a última.

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

<details><summary>O que você está vendo</summary>

```console
$ kubectl apply -n s25-warn -f pod-escape.yaml
Warning: would violate PodSecurity "restricted:latest": privileged (container "shell" must not set
securityContext.privileged=true), ... restricted volume types (volume "host" uses restricted volume
type "hostPath"), ... seccompProfile (...)
pod/escape created

$ kubectl get pod escape -n s25-warn
NAME     READY   STATUS    RESTARTS   AGE
escape   1/1     Running   0          6s
```

Sob **`warn`**, o API server devolve a *mesma* lista de seis violações como um **`Warning:`** — mas
**cria o Pod mesmo assim** (lá está o escape rodando de novo). O `warn` é descoberta, não bloqueio;
só o **`enforce`** rejeita. Essa é a jogada real de migração: `warn` (e `audit`) para encontrar os
infratores em um namespace, corrigi-los e **só então** `enforce`. Como este namespace só emite
`warn`, o Pod de escape roda — então derrube tudo: deletar Namespace é proibido aqui; use
`kind delete cluster` (descartável) ou remova o Namespace por fora.
</details>

> **⚠️ Por que o stretch também continua kind-only.** O `warn` **cria** o Pod — então este namespace
> de rascunho roda por um instante um Pod privileged que monta o host, exatamente como no Step 2.
> Isso está ok no seu cluster kind descartável e em lugar nenhum além dele. Delete o namespace quando
> terminar, ou simplesmente rode `kind delete cluster`.

## Expected state / output

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

Os status representativos incluem Pods Ready/Running, timeouts de NetworkPolicy, Forbidden de RBAC,
histórico de revisões do Helm, Application Synced/Healthy, Certificate Ready ou targets do
Prometheus — compare o significado, não nomes efêmeros.

## Explanation

O Pod Security Admission avalia CREATE/UPDATE, não Pods já existentes — é essa a causa de o enforce
não ser um kill switch de runtime. A ordem segura de remediação é deletar o workload perigoso e então
contar com o restricted para impedir que ele volte — e é por isso que o lab é kind-only e descartável.

Os passos guiados acima provam o comportamento do control plane desta seção; leia os Events e os
campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Reaplique os manifestos nomeados do lab com `kubectl apply -f <file> -n "$NS"` depois de corrigir o
campo quebrado, ou delete apenas os objetos rotulados do Cleanup / reset e recomece o guided
task. Prefira os Events do `kubectl describe` a ficar chutando. Não execute deletes amplos no cluster.

## Challenge solution

### Commands / manifest

```bash
./context-check.sh
kubectl get pod -n "$NS" -l app=s25
kubectl label --overwrite namespace "$NS" pod-security.kubernetes.io/enforce=restricted
kubectl get pod -n "$NS" -l app=s25   # ainda Running — o admission não despeja
kubectl delete pod -n "$NS" -l app=s25
kubectl apply -f pod-escape.yaml      # espere REJEITADO
kubectl apply -f pod-hardened.yaml    # espere admitido
```

### Expected state / output

O Pod de escape em execução (`Running`) sobrevive à mudança de label. Depois do delete, o
pod-escape.yaml é rejeitado nomeando as regras de privileged/hostPath (e relacionadas); o
pod-hardened.yaml é criado e roda sem mounts do host.

### Explanation

O Pod Security Admission avalia CREATE/UPDATE, não Pods já existentes — é essa a causa de o enforce
não ser um kill switch de runtime. A ordem segura de remediação é deletar o workload perigoso e então
contar com o restricted para impedir que ele volte — e é por isso que o lab é kind-only e descartável.

### Hints

Permaneça dentro do guard context-check.sh; use kubectl get pod -w em torno da mudança de
label; compare a lista de violações do restricted com privileged e hostPath.
