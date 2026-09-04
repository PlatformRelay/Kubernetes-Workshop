# Lab 03 — Modelo mental do Kubernetes (S03)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S03 — Modelo mental do Kubernetes |
| **Environment** | namespace ✓ (alternativa read-only) / kind ✓ |
| **Estimated time** | 20 min |

## Objective

Fazer um tour por um cluster **real** com `kubectl` e mapear o que você encontrar no modelo
mental dos slides: o **control plane** (onde vive o estado desejado), o **node**
(onde os containers rodam) e a ideia de **reconciliação** concretizada como
**spec** (desejado) vs **status** (observado). Nada aqui cria ou altera
objetos — este lab é **read-only** e seguro para rodar em qualquer lugar onde você tenha acesso.

## Prerequisites

- Você concluiu o **Lab 00** — o `kubectl` alcança um cluster e `$NS` é seu namespace
  padrão.
- **Um** dos ambientes:
  - **Cluster compartilhado:** seu namespace atribuído. Alguns comandos aqui são
    *cluster-scoped* (nodes, Pods do control plane); se sua role não puder lê-los você
    vai receber um erro `Forbidden` — isso é esperado, e cada passo desses tem uma
    **alternativa segura por namespace**.
  - **Cluster kind local:** você é dono dele, então todo comando funciona.
- Nenhum cluster-admin necessário. Nenhum arquivo para criar.

```bash
export NS=<your-namespace>        # mesmo valor do Lab 00 (usuários kind: workshop)
```

## Files used

- Nenhum. Este lab read-only consulta recursos vivos da API com comandos `kubectl` inline e
  não cria manifestos locais.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./03-cluster-tour.solution.md#guided-solutions)

### Step 1 — os nodes: onde seus containers realmente rodam

Todo Pod roda em um node. Pergunte ao cluster como são seus nodes.

```bash
kubectl get nodes -o wide
```

**Tarefa:** execute e leia uma linha inteira até as colunas **OS-IMAGE**, **KERNEL-VERSION** e
**CONTAINER-RUNTIME**. Essa última coluna é a mesma pilha de runtime que você conheceu na
S01.

---

### Step 2 — a API é autodocumentada

Você nunca precisa memorizar campos. O cluster traz seu próprio schema.

```bash
kubectl api-resources | head -20      # todo kind que o cluster entende
kubectl explain pod.spec              # o schema por trás da spec de um Pod
```

**Tarefa:** execute os dois. No `api-resources`, encontre as colunas `SHORTNAMES`, `APIVERSION` e
`NAMESPACED`. No `explain`, leia os primeiros campos de `pod.spec`.

**Pergunta:** o que `kubectl explain pod.spec.restartPolicy` diz que é o padrão?

---

### Step 3 — encontre o control plane (ou seu namespace)

Os componentes do control plane dos slides — API server, etcd, scheduler,
controller-manager — rodam como Pods no namespace `kube-system` em um
cluster self-hosted/kind.

#### Caminho kind (você é dono do cluster)

```bash
kubectl get pods -n kube-system
```

#### Caminho do namespace (cluster compartilhado, alternativa read-only)

O `kube-system` não é seu para ler em um cluster compartilhado. Explore o que **é** — seu
próprio namespace:

```bash
kubectl describe namespace "$NS"
kubectl get all -n "$NS"
```

---

### Step 4 — quebre de propósito: um `explain` com typo

Todo lab tem um **break→fix** deliberado. Aqui é o deslize mais comum do `kubectl`:
um path de campo digitado errado. Veja-o falhar, leia o erro, depois conserte.

```bash
kubectl explain pod.spce      # typo: "spce" em vez de "spec"
```

**Tarefa:** execute. Ele deve **falhar**. Leia o erro, depois execute o comando corrigido.

**Pergunta:** por que um typo no `explain` é inofensivo, mas um typo em um manifesto que
você `apply` pode não ser?

---

### Step 5 — veja a reconciliação: spec vs status em um objeto vivo

Os slides disseram que a reconciliação leva o **status** (observado) em direção à **spec** (desejado).
Todo objeto carrega as duas metades — leia-as em algo que já está rodando.

Escolha qualquer objeto existente. No **kind**, um Pod do `kube-system` funciona; em um cluster
**compartilhado** onde seu namespace está vazio, todo objeto Namespace também tem `spec`/`status`,
então use isso como fallback.

```bash
# kind (ou qualquer lugar onde você possa ler um Pod):
kubectl get pods -n kube-system \
  -l component=kube-apiserver -o yaml | head -40

# compartilhado, fallback só de namespace — todo objeto tem spec/status:
kubectl get namespace "$NS" -o yaml
```

**Tarefa:** no YAML, encontre o bloco `spec:` de nível superior e o bloco `status:`
de nível superior. Note que você não *escreveu* nada em `status` — o sistema escreveu.

**Pergunta:** qual componente *escreve* o `status` de um Pod, e qual componente
decidiu *em qual node* a `spec` do Pod roda?

---

## Observe

- `kubectl get nodes -o wide` mostra um `CONTAINER-RUNTIME` `containerd`/`cri-o` —
  a pilha CRI da S01 (ou um `Forbidden` que você sabe explicar, em um cluster
  compartilhado restrito).
- `kubectl api-resources` distingue kinds namespaced de kinds cluster-scoped.
- `kubectl explain` responde perguntas de schema com autoridade e **rejeita** um path de
  campo com typo em vez de adivinhar.
- No kind, o control plane fica visível como Pods no `kube-system`; em um cluster compartilhado,
  ele não é seu para ler — e isso está correto.
- Todo objeto vivo tem uma `spec` (desejado, você escreve) e um `status` (observado, o
  sistema escreve) — a reconciliação é o loop entre eles.

---

## Challenge

O `explain` tem um modo `--recursive` que imprime a árvore inteira de um kind — útil para
descobrir campos que você não sabia que existiam.

**Difficulty:** Beginner

**Success criteria:** Localize os campos de readiness e liveness probe sem usar busca na
web, nomeie seus paths de campo completos e mostre com `kubectl explain` onde eles ficam
abaixo de `pod.spec`.

**Hints:** Encaminhe a saída recursiva por `grep -i -E 'readiness|liveness'`, depois confirme
cada resultado com um comando `kubectl explain` focado.

```bash
kubectl explain pod.spec --recursive | head -40
```

[Spoiler: solução do challenge](./03-cluster-tour.solution.md#challenge-solution)

## Verify

Repita as duas observações que funcionam nos dois ambientes suportados.

```bash
kubectl api-resources --namespaced=true | head
kubectl get pods -n "$NS" -o custom-columns=NAME:.metadata.name,DESIRED:.spec.containers[*].name,PHASE:.status.phase
```

Esperado: o primeiro comando lista kinds de API namespaced; o segundo imprime campos
desejados e observados de todo Pod que você pode ler. Uma lista de Pods vazia também é um
estado válido.

## Cleanup / reset

Este lab é **read-only** — você não criou nada, então não há nada para deletar. O único
"reset" é reconfirmar que você está apontando para o lugar certo antes do próximo lab, que
*cria* objetos de verdade:

```bash
kubectl config view --minify | grep namespace:    # ainda o seu $NS?
kubectl config current-context                     # ainda o seu cluster?
```
