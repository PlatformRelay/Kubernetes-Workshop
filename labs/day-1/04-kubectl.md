# Lab 04 — kubectl (S04)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S04 — kubectl |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 25 min |

## Objective

Ganhar **fluência** com a ferramenta que você vai usar para todo o resto: descobrir objetos com
`get`/`describe`/`explain`, extrair valores exatos com `-o jsonpath`, gerar manifestos
imperativamente com `--dry-run=client -o yaml` e *sentir* a diferença entre o dry-run de
**client** e o de **server**. Este lab é **read-only** — você gera YAML mas
nunca faz `apply`, então é seguro em qualquer namespace.

## Prerequisites

- **Lab 00** concluído — o `kubectl` alcança um cluster e `$NS` é seu namespace
  padrão.
- O **Lab 03** ajuda (você conheceu `explain`, `api-resources` e spec/status), mas não é
  obrigatório.
- Os dois ambientes seguem os mesmos passos (apenas leitura + dry-run) e chegam aos mesmos
  resultados de pass/fail. Um ou outro comando imprime uma **mensagem de erro diferente** em um
  cluster compartilhado e no kind — cada um é sinalizado onde acontece. Sem cluster-admin.

```bash
export NS=<your-namespace>        # mesmo valor do Lab 00 (usuários kind: workshop)
```

## Files used

- `web.yaml` — gerado durante o challenge para um `kubectl diff` não mutante, depois removido no
  cleanup. Os passos guiados não criam arquivos persistentes nem objetos no cluster.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./04-kubectl.solution.md#guided-solutions)

### Step 1 — a caça ao tesouro (descubra, não crie)

Responda cada pergunta usando **apenas** `get`, `describe` e `explain`. Toda pergunta tem
um spoiler — tente primeiro, depois confira.

**Q1.** Qual é o `restartPolicy` **padrão** de um Pod?

**Q2.** Seu namespace parece vazio (`kubectl get all` diz isso). Mas liste os ConfigMaps —
já existe um. Qual é, e quem o criou?

**Q3.** Um `Deployment` está no mesmo API group que um `Pod`? Use `api-resources`.

**Q4.** De acordo com o schema, `containers` é **obrigatório** na spec de um Pod?

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

**Pergunta:** por que os manifestos impressos incluem `resources: {}` e
`status: {}` vazios que você nunca pediu?

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

**Pergunta:** em que `-l app=web` é diferente de dar grep com `kubectl get pods | grep web`?

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

**Pergunta:** você está prestes a fazer `apply` de um manifesto importante. Qual dry-run você
roda primeiro, e por quê?

---

## Observe

- O `explain` responde perguntas de schema (padrões, campos obrigatórios, API group)
  com autoridade — sem precisar de busca na web.
- `--dry-run=client -o yaml` gera um manifesto completo e não cria **nada**.
- `-o jsonpath` extrai um único valor; `-l` filtra server-side por label.
- O **mesmo** manifesto pode passar no `--dry-run=client` e falhar no `--dry-run=server` — o
  dry-run de server é o que diz se o cluster realmente aceitaria.
- Depois deste lab, `kubectl get all` no seu namespace continua vazio.

---

## Challenge

O `kubectl diff` pré-visualiza uma mudança contra o cluster vivo sem aplicá-la. Gere um
manifesto, ajuste-o e faça o diff — tudo sem criar nada permanente.

**Difficulty:** Intermediate

**Success criteria:** Mostre o diff inicial de criação, mude replicas de um para três,
mostre o diff alterado e prove que nenhum Deployment `web` foi persistido.

**Hints:** O `kubectl diff` sai com código 1 quando existem diferenças; leia a saída dele e
depois use `kubectl get deployment web --ignore-not-found` para confirmar.

```bash
kubectl create deployment web --image=ghcr.io/platformrelay/workshop-web:v1 --dry-run=client -o yaml > web.yaml
kubectl diff -f web.yaml            # mostra que ele seria CRIADO (todas as linhas novas)
```

[Spoiler: solução do challenge](./04-kubectl.solution.md#challenge-solution)

## Verify

Prove que a geração e a validação continuam não mutantes.

```bash
kubectl create deployment contract-check \
  --image=ghcr.io/platformrelay/workshop-web:v1 \
  --dry-run=client -o yaml | kubectl apply --dry-run=server -f -
kubectl get deployment contract-check -n "$NS" --ignore-not-found
```

Esperado: o dry-run de server reporta `created (server dry run)`; o segundo comando não
imprime nada porque nenhum Deployment foi persistido.

## Cleanup / reset

Você **não aplicou nada**, então não há nada no cluster para deletar. Se você redirecionou
algum manifesto gerado para arquivos, eles são locais — remova-os se quiser:

```bash
rm -f web.yaml            # ou o que você tiver salvado
```
