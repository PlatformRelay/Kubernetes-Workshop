# Lab 04 — kubectl (S04) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 1 — a caça ao tesouro (descubra, não crie)

Responda cada pergunta usando **apenas** `get`, `describe` e `explain`. Toda pergunta tem
um spoiler — tente primeiro, depois confira.

**Q1.** Qual é o `restartPolicy` **padrão** de um Pod?

<details><summary>Resposta</summary>

```console
$ kubectl explain pod.spec.restartPolicy
KIND:       Pod
VERSION:    v1
FIELD: restartPolicy <string>
DESCRIPTION:
    ... One of Always, OnFailure, Never. Default to Always.
```

**`Always`.** O schema é a autoridade — não precisa adivinhar nem pesquisar.
</details>

**Q2.** Seu namespace parece vazio (`kubectl get all` diz isso). Mas liste os ConfigMaps —
já existe um. Qual é, e quem o criou?

<details><summary>Resposta</summary>

```console
$ kubectl get configmap
NAME               DATA   AGE
kube-root-ca.crt   1      3h
```

O `kube-root-ca.crt` é injetado em **todo** namespace pelo cluster (ele guarda o bundle de
CA que os Pods usam para confiar no API server). Você não o criou — um controller criou.
`kubectl get all` não mostra ConfigMaps, e é por isso que o namespace *parecia* vazio.
</details>

**Q3.** Um `Deployment` está no mesmo API group que um `Pod`? Use `api-resources`.

<details><summary>Resposta</summary>

```console
$ kubectl api-resources | grep -E '^(pods|deployments) '
pods           po       v1        true    Pod
deployments    deploy   apps/v1   true    Deployment
```

Não — um **Pod** é do core `v1`; um **Deployment** é `apps/v1`. É por isso que um manifesto
de Deployment precisa de `apiVersion: apps/v1`, mas um Pod usa `apiVersion: v1`. Você vai
digitar os dois na S05/S06.
</details>

**Q4.** De acordo com o schema, `containers` é **obrigatório** na spec de um Pod?

<details><summary>Resposta</summary>

```console
$ kubectl explain pod.spec.containers | head -3
KIND:       Pod
VERSION:    v1
FIELD: containers <[]Container> -required-
```

Sim — `-required-`. Um Pod sem containers é inválido. O server o rejeitaria;
o `explain` te avisa antes mesmo de você tentar.
</details>

---

### Step 2 — gere YAML sem aplicá-lo

O caminho mais rápido para um manifesto correto é deixar o `kubectl` escrevê-lo para você, depois editar.
O `--dry-run=client` constrói o objeto **localmente** e o imprime — nada é criado.

```bash
kubectl run web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml
kubectl create deployment web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml
```

**Tarefa:** execute os dois. Confirme que você recebe um manifesto completo no stdout e que
`kubectl get pods` / `kubectl get deploy` continuam mostrando **nada** — você não criou nada.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl run web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    run: web
  name: web
spec:
  containers:
    - image: ghcr.io/platformrelay/workshop-web:v1
      name: web
      resources: {}
  ...
status: {}

$ kubectl get pods
No resources found in student-07 namespace.
```

O `run` gera o scaffold de um **Pod**; o `create deployment` gera o de um **Deployment** (note o
`apps/v1`, `replicas`, `selector` e o wrapper `template` — o formato da S06). Redirecione para
um arquivo para guardá-lo: `kubectl create deployment web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml > web.yaml`.
</details>

**Pergunta:** por que os manifestos impressos incluem `resources: {}` e
`status: {}` vazios que você nunca pediu?

<details><summary>Resposta</summary>

O `kubectl` imprime o **objeto tipado inteiro**, incluindo campos com valor zero. `status: {}`
é a metade observada (vazia porque nada está rodando ainda — veja a S03). Você pode apagar
o ruído (`creationTimestamp`, `status`, `resources` vazio) antes de salvar; é só um
ponto de partida, não um manifesto finalizado.
</details>

---

### Step 3 — extraia valores exatos com jsonpath e labels

Tabelas são para os olhos; `-o jsonpath` serve para extrair um valor (scripts, checagens rápidas).

```bash
# o nome de um node, sem grep/awk:
kubectl get nodes -o jsonpath='{.items[0].metadata.name}{"\n"}'

# filtre por label — os Pods do kube-system carregam labels component/tier (kind):
kubectl get pods -n kube-system -l tier=control-plane
```

**Tarefa:** obtenha um único nome de node com `jsonpath`. Depois, no **kind**, liste os
Pods do control plane com um selector de label. Em um cluster **compartilhado** (sem acesso
ao `kube-system`), filtre seu próprio namespace — ex.: `kubectl get configmap -l foo=bar`
(espere uma lista vazia, provando que o filtro funciona).

> **Cluster compartilhado:** `get nodes` é cluster-scoped e pode retornar
> `Error ... "nodes" is forbidden` para sua role com escopo de namespace (igual ao Lab 03).
> Se isso acontecer, pratique `jsonpath` em um objeto namespaced que você *pode* ler:
> `kubectl get configmap kube-root-ca.crt -o jsonpath='{.metadata.name}{"\n"}'`.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get nodes -o jsonpath='{.items[0].metadata.name}{"\n"}'
workshop-control-plane

$ kubectl get pods -n kube-system -l tier=control-plane
NAME                                    READY   STATUS    RESTARTS   AGE
etcd-workshop-control-plane             1/1     Running   0          3h
kube-apiserver-workshop-control-plane   1/1     Running   0          3h
kube-controller-manager-...             1/1     Running   0          3h
kube-scheduler-workshop-control-plane   1/1     Running   0          3h
```

`{.items[0].metadata.name}` percorre a mesma árvore de objetos que o `explain` descreve. O
selector `-l` é a *mesma linguagem de consulta* que um Service usa para encontrar seus Pods (S07).
O `{"\n"}` só adiciona uma quebra de linha para o seu prompt cair na linha seguinte.
</details>

**Pergunta:** em que `-l app=web` é diferente de dar grep com `kubectl get pods | grep web`?

<details><summary>Resposta</summary>

`-l app=web` é avaliado **server-side** contra os `labels` do objeto — preciso, e não
casa nada por acidente. `grep web` é um casamento de **texto** na tabela impressa, então
também pega um Pod chamado `webhook-xyz` ou uma coluna não relacionada contendo "web". Labels
são uma consulta de verdade; grep é uma coincidência.
</details>

---

### Step 4 — quebre de propósito: o client diz sim, o server diz não

O `--dry-run=client` só renderiza localmente. O `--dry-run=server` percorre o caminho
**completo** do server (validação + admission) e pode rejeitar coisas que o client não enxerga.
Prove isso com o exemplo mais limpo: um namespace que não existe.

```bash
kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 --namespace=no-such-namespace --dry-run=client -o yaml >/dev/null; echo "client exit: $?"
kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 --namespace=no-such-namespace --dry-run=server -o yaml >/dev/null; echo "server exit: $?"
```

**Tarefa:** execute os dois. A linha do **client** deve ter sucesso; a linha do **server** deve falhar.
Leia o erro do server — o texto exato depende do seu ambiente.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 --namespace=no-such-namespace --dry-run=client -o yaml >/dev/null; echo "client exit: $?"
client exit: 0

$ kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 --namespace=no-such-namespace --dry-run=server -o yaml >/dev/null; echo "server exit: $?"
# kind (você é dono do cluster):
Error from server (NotFound): namespaces "no-such-namespace" not found
# cluster compartilhado (role com escopo de namespace):
Error from server (Forbidden): pods is forbidden: User "..." cannot create
resource "pods" in ... the namespace "no-such-namespace"
server exit: 1
```

O **resultado é idêntico** — o client passa (`0`), o server falha (`1`) — mas a
**mensagem difere**, e essa diferença é, por si só, a lição:

- No **kind**, a requisição passa pela autorização e é rejeitada depois, na admission,
  pelo namespace inexistente → `NotFound`.
- Em um cluster **compartilhado**, a autorização roda **primeiro** e sua role não pode escrever
  em `no-such-namespace` de forma alguma → `Forbidden`, antes mesmo de a checagem de
  namespace ser alcançada.

De qualquer forma, o ponto se mantém: **o `--dry-run=server` avaliou a requisição contra o
estado vivo do cluster — identidade, permissões, existência — e o client nunca poderia.** Duas
perguntas bem diferentes:

- `--dry-run=client` → *"isso renderiza em um objeto de aparência válida?"*
- `--dry-run=server` → *"o cluster realmente aceitaria isso vindo de mim, agora?"*

**Conserto:** aponte para o seu namespace real — agora os dois passam:

```console
$ kubectl run probe --image=ghcr.io/platformrelay/workshop-web:v1 -n "$NS" --dry-run=server -o yaml >/dev/null; echo "exit: $?"
exit: 0
```

</details>

**Pergunta:** você está prestes a fazer `apply` de um manifesto importante. Qual dry-run você
roda primeiro, e por quê?

<details><summary>Resposta</summary>

**`--dry-run=server`** — é o único que roda validação de schema, defaulting e
admission (quota, webhooks, referências ausentes) *sem* escrever. O `--dry-run=client`
não consegue pegar nada que dependa do estado vivo do cluster. Combine-o com `kubectl diff -f`
para ver exatamente o que mudaria antes de se comprometer.
</details>

---

## Expected state / output

- O `explain` responde perguntas de schema (padrões, campos obrigatórios, API group)
  com autoridade — sem precisar de busca na web.
- `--dry-run=client -o yaml` gera um manifesto completo e não cria **nada**.
- `-o jsonpath` extrai um único valor; `-l` filtra server-side por label.
- O **mesmo** manifesto pode passar no `--dry-run=client` e falhar no `--dry-run=server` — o
  dry-run de server é o que diz se o cluster realmente aceitaria.
- Depois deste lab, `kubectl get all` no seu namespace continua vazio.

---

## Explanation

O dry-run de client renderiza localmente, enquanto o dry-run de server exercita a validação e a
admission da API sem persistência — a causa de o mesmo manifesto poder passar em um e falhar no
outro. JSONPath e selectors de label consultam dados estruturados da API diretamente, e o
`kubectl diff` pré-visualiza o delta renderizado pelo server sem aplicá-lo.

## Troubleshooting and recovery

Se o dry-run de server retornar Forbidden, recupere-se com o preview local
`kubectl create deployment web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml`
e mostre o erro de admission ao facilitador. Delete apenas o arquivo local com
`rm -f web.yaml`; o lab intencionalmente não cria objeto no cluster.

## Challenge solution

### Commands / manifest

```bash
kubectl create deployment web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml > web.yaml
kubectl diff -f web.yaml || test $? -eq 1
sed -i.bak 's/replicas: 1/replicas: 3/' web.yaml && rm -f web.yaml.bak
kubectl diff -f web.yaml || test $? -eq 1
kubectl get deployment web --ignore-not-found
rm -f web.yaml
```

### Expected state / output

Os dois comandos de diff mostram adições para um Deployment ainda não criado, e o segundo mostra
`replicas: 3`. O `get` final não imprime nada, provando que nenhum objeto foi persistido.

### Explanation

O `kubectl diff` pede ao API server para renderizar o objeto proposto, mas não o grava. O código
de saída 1 significa que existem diferenças, e é essa a causa de o guard tratar esse resultado
diagnóstico esperado como sucesso.

### Hints

O `kubectl diff` sai com código 1 quando existem diferenças; leia a saída dele e
depois use `kubectl get deployment web --ignore-not-found` para confirmar.
