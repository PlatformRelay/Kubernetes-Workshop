# Lab 00 — Boas-vindas & setup (S00)

| | |
| --- | --- |
| **Section** | S00 — Boas-vindas & setup |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 15 min |

## Objective

Prove que seu ferramental funciona **antes** de qualquer conteúdo real: confirme que o `kubectl`
fala com um cluster, que você está apontando para o contexto e o namespace certos, e que você
consegue criar workloads ali. Ao final, todo mundo — seja no cluster compartilhado ou em um
cluster kind local — está no **mesmo estado inicial verificado**.

## Prerequisites

- **Um** dos dois ambientes:
  - **Cluster compartilhado:** um kubeconfig do seu facilitador e um **namespace atribuído**
    (ex.: `student-07`), além do `kubectl` no seu `PATH`. Você **não** precisa de cluster-admin.
  - **Cluster kind local:** um **container engine** (Docker ou Podman) e este repositório clonado.
    Você executa **um comando** (`./workshop up`) — ele instala as ferramentas fixadas (kubectl, kind,
    …) e cria seu cluster. Veja [`../../docs/setup.md`](../../docs/setup.md) para a escolha do engine
    (incl. a nota de licenciamento do Docker Desktop) e o caminho Windows/WSL2.
- Um terminal em que você consiga copiar e colar. Nenhum lab anterior é necessário.

## Files used

- **Nenhum.** No caminho kind, a configuração do cluster vive em `infra/kind/cluster.yaml` e é
  gerenciada para você pelo `./workshop`; você não cria nenhum arquivo neste lab.

---

## Step 0 — primeira tarefa: confirme que sua máquina está pronta para o lab

Todo lab posterior tem um spoiler; este também tem. **Chegue a um estado inicial verificado antes
de qualquer conteúdo.** Faça a tarefa que corresponde ao seu ambiente.

### Caminho kind — um comando

A partir da raiz do repositório, suba (ou verifique de novo) seu cluster local:

```bash
./workshop up          # preflight → ferramentas fixadas → cluster kind → doctor
```

O `up` termina executando `./workshop doctor`, que checa o engine, as versões das ferramentas, o
cluster, seus nodes e um Pod de smoke descartável. Um resumo verde significa que você está pronto.
Se o mise foi instalado pela primeira vez, siga a dica final de `mise activate` antes de
copiar os próximos comandos `kubectl` no mesmo terminal; não é preciso reiniciar o shell.

<details><summary>Solução / saída esperada — caminho kind</summary>

```console
$ ./workshop up
workshop up — bring up a local, lab-ready kind cluster
[ OK ] container engine reachable: docker
[ OK ] toolchain installed and verified against mise.lock
[ OK ] kind cluster 'workshop' ready

Running doctor to confirm the environment is lab-ready…
[PASS] container engine reachable (docker)
[PASS] kind v0.32.0 matches pin (v0.32.0)
[PASS] kubectl v1.36.1 matches pin (v1.36.1)
[PASS] kind cluster 'workshop' exists
[PASS] cluster answers the API (context kind-workshop)
[PASS] all nodes Ready (1/1)
[PASS] smoke Pod ran to completion and was cleaned up

doctor: 7 passed, 0 warnings, 0 failed
[ OK ] environment is ready — start with labs/day-1/00-setup.md
```

Execute `./workshop doctor` de novo a qualquer momento para reverificar. Um `[WARN]` (ex.: um
desvio de versão) é aceitável; um `[FAIL]` imprime uma dica de correção direcionada — a mais
comum é "run: make kind-up", que o `./workshop up` executa para você.
</details>

### Caminho do cluster compartilhado — alcance seu cluster

O `./workshop doctor` é só para o cluster kind local, então em um cluster compartilhado sua
primeira tarefa é, em vez disso, confirmar que o `kubectl` alcança o cluster que seu facilitador
te deu. Isso é exatamente o Step 1 abaixo — comece por lá.

---

## Step 1 — confirme o kubectl e alcance um cluster

Defina agora uma variável de shell para seu namespace de trabalho; **todo comando posterior
reutiliza `$NS`.** No cluster compartilhado, use o namespace que seu facilitador atribuiu. No
kind, seu cluster subiu no Step 0 — criamos um namespace `workshop` no Step 2; use `workshop` lá.

```bash
export NS=<your-namespace>        # ex.: student-07  (usuários de kind: export NS=workshop)
kubectl version                   # versões de client + server
kubectl config current-context    # para qual cluster estou apontando?
```

**Tarefa:** execute os três comandos. Confirme que `kubectl version` imprime **tanto** uma *Client
Version* quanto uma *Server Version* (uma saída só de client significa que você não está
alcançando um cluster).

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl version
Client Version: v1.3x.y
Kustomize Version: v5.x.y
Server Version: v1.3x.z

$ kubectl config current-context
workshop-shared          # ou "kind-workshop" em um cluster local
```

Se você só vê `Client Version:` e depois um erro de conexão, seu kubeconfig não está carregado
ou o cluster está inalcançável — resolva isso com seu facilitador (compartilhado) ou terminando
o Step 2 (kind) antes de continuar.
</details>

**Pergunta:** suas versões de client e server diferem — isso é um problema?

<details><summary>Resposta</summary>

Normalmente não. O Kubernetes suporta um `kubectl` que esteja **a até uma minor version** do API
server (ex.: um client v1.34 contra um server v1.33 ou v1.35). Um desvio maior pode produzir
campos ausentes ou erros estranhos — se você vir comportamento esquisito mais tarde, cheque isto
primeiro com `kubectl version`.
</details>

---

## Step 2 — obtenha um namespace que seja seu, e torne-o seu padrão

Escolha o caminho que corresponde ao seu ambiente. **Os dois caminhos terminam de forma
idêntica:** `$NS` existe, está vazio, e é seu namespace padrão para que você possa omitir
`-n $NS` dos comandos seguintes.

### Ambiente de namespace (cluster compartilhado)

Seu namespace já existe. Confirme-o e defina-o como o padrão do seu contexto:

```bash
kubectl get namespace "$NS"
kubectl config set-context --current --namespace="$NS"
kubectl config view --minify | grep namespace:
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get namespace student-07
NAME         STATUS   AGE
student-07   Active   3h

$ kubectl config set-context --current --namespace=student-07
Context "workshop-shared" modified.

$ kubectl config view --minify | grep namespace:
    namespace: student-07
```

`--minify` reduz o kubeconfig apenas ao contexto atual, então a linha `namespace:` é a que
será usada por padrão daqui em diante.
</details>

### Ambiente kind (cluster local)

Seu cluster já existe — o `./workshop up` o criou no Step 0 e mudou seu contexto do kubectl para
`kind-workshop`. Agora apenas crie um namespace `workshop` e torne-o seu padrão:

```bash
kubectl create namespace workshop
kubectl config set-context --current --namespace=workshop
kubectl config view --minify | grep namespace:
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl create namespace workshop
namespace/workshop created

$ kubectl config set-context --current --namespace=workshop
Context "kind-workshop" modified.

$ kubectl config view --minify | grep namespace:
    namespace: workshop
```

O `./workshop up` já apontou o kubectl para `kind-workshop`, então o `set-context` aqui só muda
o **namespace padrão** dentro daquele contexto. (Se você algum dia precisar recriar o cluster do
zero, `./workshop down && ./workshop up` é o reset completo.)
</details>

---

## Step 3 — confirme que você realmente consegue criar workloads

Ler não basta — o primeiro lab de verdade cria um Pod. Cheque a permissão diretamente com
`kubectl auth can-i` (isso pergunta ao API server, então a resposta é autoritativa para a sua
identidade **neste** namespace).

```bash
kubectl auth can-i create pods -n "$NS"
kubectl auth can-i delete pods -n "$NS"
```

**Tarefa:** os dois devem responder `yes`. Se algum disser `no` no cluster compartilhado, pare e
avise seu facilitador — você está com o namespace errado ou com um binding somente leitura.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl auth can-i create pods -n student-07
yes
$ kubectl auth can-i delete pods -n student-07
yes
```

No kind você é dono do cluster, então toda resposta é `yes`. No cluster compartilhado você deve
conseguir criar/deletar workloads **dentro do seu namespace**, mas não objetos de escopo de
cluster — isso é esperado e correto (privilégio mínimo). Testamos RBAC de verdade no Lab 19.
</details>

---

## Step 4 — quebre de propósito: um contexto errado

Todo lab deste workshop tem um passo deliberado de **break→fix** — falhar em segurança
agora significa reconhecer a falha depois. Aqui é a mais comum de todas: `kubectl` **sem contexto
selecionado**. Salve seu contexto atual, desfaça a seleção para o `kubectl` não ter com quem
falar, veja-o falhar, e depois volte.

```bash
CURRENT=$(kubectl config current-context)   # lembre seu contexto real
kubectl config unset current-context        # quebre: nenhum contexto está selecionado agora
kubectl get pods                            # isto agora falha — leia o erro
```

**Tarefa:** execute os três. O último comando deve **falhar**. Leia o texto do erro antes de
consertar — você restaura o contexto no próximo bloco.

<details><summary>Solução / saída esperada</summary>

```console
$ CURRENT=$(kubectl config current-context)
$ kubectl config unset current-context
Property "current-context" unset.
$ kubectl get pods
error: current-context must exist in order to minify
```

Sem `current-context`, o `kubectl` não sabe **com qual cluster** falar, então ele se recusa
antes mesmo de tocar a rede. Um primo próximo que você vai encontrar no mundo real é um contexto
que *está* definido mas aponta para lugar nenhum alcançável:

```console
The connection to the server localhost:8080 was refused - did you specify the right host or port?
```

Mesma lição, camada diferente: **sem contexto** → conserte o *contexto*; **connection refused** →
o contexto está bem, mas o *cluster/rede* não está.
</details>

**Tarefa:** volte para seu contexto real e confirme que o `kubectl` funciona de novo.

```bash
kubectl config use-context "$CURRENT"       # restaure o que você salvou acima
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl config use-context "$CURRENT"
Switched to context "workshop-shared".        # ou "kind-workshop"
```

Se `$CURRENT` estiver vazio (ex.: um terminal novo), passe o nome diretamente:
`kubectl config use-context workshop-shared` (compartilhado) ou `kind-workshop` (kind).
</details>

**Tarefa (confirme que você realmente voltou):** prove que o cluster está alcançável de novo. A
checagem varia um pouco por ambiente.

<details><summary>Solução / saída esperada — caminho do namespace</summary>

Confirme o escopo de leitura no seu namespace:

```console
$ kubectl get pods
No resources found in student-07 namespace.
```

Uma lista vazia (e não um erro) significa que você está conectado e com o escopo correto.
</details>

<details><summary>Solução / saída esperada — caminho kind</summary>

Confirme que o cluster existe e que o control plane responde:

```console
$ kind get clusters
workshop

$ kubectl cluster-info
Kubernetes control plane is running at https://127.0.0.1:PORT
CoreDNS is running at https://127.0.0.1:PORT/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy
```

O `cluster-info` imprimindo endpoints (e não um erro de conexão) confirma que você voltou a um
cluster vivo.
</details>

---

## Step 5 — chegue ao estado "pronto" compartilhado

Todo mundo deve estar agora com um namespace de trabalho **vazio**. Confirme que nada está
rodando:

```bash
kubectl get all -n "$NS"
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get all -n student-07
No resources found in student-07 namespace.
```

`No resources found` é o estado pronto correto e compartilhado para os dois ambientes. Se você
vir objetos sobrando em um namespace compartilhado, execute o reset de pânico do próximo passo.
</details>

## Expected observations

- `kubectl version` mostra uma versão de client **e** uma de server.
- `kubectl config view --minify` mostra seu namespace (`$NS`) como o padrão.
- `kubectl auth can-i create pods` retorna `yes` no seu namespace.
- Apontar para um contexto ruim **falha ruidosamente**, e você consegue ler o erro e se recuperar dele.
- `kubectl get all` reporta **nenhum recurso** — você está no estado inicial limpo.

---

## Cleanup / panic reset

Você não criou nada para limpar neste lab, mas aprenda o **reset de pânico agora** — todo lab
posterior aponta de volta para cá. Ele deleta os objetos de workload comuns com escopo de
namespace **limitados ao seu namespace**, devolvendo-o ao estado vazio sem tocar em ninguém mais:

```bash
# Reset de pânico seguro por namespace — deleta APENAS os workloads do SEU namespace.
kubectl delete deploy,rs,sts,ds,job,cronjob,pod,svc,ingress,configmap,secret,pvc \
  --all -n "$NS" \
  --ignore-not-found \
  --field-selector metadata.name!=kube-root-ca.crt   # mantém o configmap de CA injetado automaticamente
```

<details><summary>Quando o cluster compartilhado não basta — apenas kind</summary>

No kind, o reset mais rápido possível é jogar o cluster fora e reconstruí-lo (≈30 s):

```console
$ ./workshop down && ./workshop up   # depois refaça os comandos de namespace do Step 2
```

O `./workshop down` deleta o cluster (ele pede confirmação; adicione `--yes` para pular o
prompt) e o `./workshop up` o recria a partir da mesma configuração fixada. Nunca faça isso em
um cluster compartilhado — você deletaria o trabalho de todo mundo. Lá, o
`kubectl delete ... -n $NS` com escopo acima é o reset correto.
</details>

## Stretch (optional)

Veja o conjunto **completo** de ações que a sua identidade pode executar no seu namespace:

```bash
kubectl auth can-i --list -n "$NS"
```

<details><summary>Solução / o que você está vendo</summary>

```console
$ kubectl auth can-i --list -n student-07
Resources          Non-Resource URLs   Resource Names   Verbs
pods               []                  []               [get list watch create update patch delete]
deployments.apps   []                  []               [get list watch create update patch delete]
...
selfsubjectreviews []                  []               [create]
```

Cada linha é uma regra que se aplica a você aqui. No kind você verá uma linha curinga `*.*`
(cluster-admin). No cluster compartilhado a lista é deliberadamente mais estreita — isso é o
RBAC fazendo seu trabalho, que você mesmo vai construir no Lab 19.
</details>
