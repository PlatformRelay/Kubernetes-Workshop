# Lab 05 — Pod (S05)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S05 — Pod *("linha vermelha" 1/5)* |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 25 min |

## Objective

Escrever, executar, inspecionar e deletar um **Pod** — a menor unidade implantável — e observar
seu ciclo de vida. O manifesto que você constrói aqui (`pod.yaml`) é a **base canônica** que os
labs de Deployment (Lab 06), Service (Lab 07) e Ingress (Lab 08) estendem. Este é o passo
**1 de 5** da red line.

## Prerequisites

- Lab 00 concluído: `$NS` está definido e é seu namespace padrão
  (`kubectl config view --minify | grep namespace:` o exibe).
- Seu namespace está vazio (`kubectl get all` → *No resources found*).

## Files used

- `pod.yaml` — o manifesto canônico do Pod, criado inline no Step 1. **Guarde este arquivo** —
  o Lab 06 parte dele.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./05-pod.solution.md#guided-solutions)

### Step 1 — escreva o manifesto canônico do Pod

Construa o `pod.yaml`. Nos slides você o viu crescer campo a campo; aqui está a base finalizada.

```bash
cat > pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web            # este label é como o Service do Lab 07 vai encontrar o Pod
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      resources:        # um pequeno "stub de resources" — o Lab 13 expande isso em QoS
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          cpu: 250m
          memory: 128Mi
EOF
```

**Tarefa:** valide o manifesto **sem** criar nada, depois aplique-o.

```bash
kubectl apply --dry-run=server -f pod.yaml     # o server valida; nenhum objeto é criado
kubectl apply -f pod.yaml
```

---

### Step 2 — observe-o ganhar vida

```bash
kubectl get pod web -w        # -w = watch; Ctrl-C para parar quando estiver Running
```

**Tarefa:** observe as transições de fase. Por quais fases o Pod passa antes de
`Running`?

---

### Step 3 — inspecione: describe, logs, debug

Três comandos que você vai usar em toda sessão de debugging pelo resto do workshop.

```bash
kubectl describe pod web        # events, image, node, conditions
kubectl logs web                # o stdout/stderr do container
kubectl exec -it web -- sh      # tente — este FALHA de propósito
```

**Tarefa:** `kubectl exec … sh` falha. Leia o erro e explique por quê — depois obtenha um shell
mesmo assim com `kubectl debug`:

```bash
kubectl debug -it web --image=busybox:1.37 --target=web -- sh
```

Dentro do shell de debug, confirme que você está no contexto do container (não no seu host)
verificando a lista de processos — o servidor de demo deve ser o PID 1. Digite `exit` para sair.

**Pergunta:** você nunca instalou um shell no Pod — onde o shell do `debug` roda?

---

### Step 4 — quebre: uma image ruim (ImagePullBackOff)

A falha de Pod mais comum de todas. Aplique um Pod cuja tag de image não existe (imagine uma
tag digitada errado):

```bash
kubectl run web-typo --image=ghcr.io/platformrelay/workshop-web:v9.99-nope --restart=Never -n "$NS"
kubectl get pod web-typo          # repita algumas vezes, ou adicione -w
```

**Tarefa:** o Pod nunca chega a `Running`. Leia o `describe` e nomeie a razão exata.

### Step 5 — conserte, e conheça a punchline

Não há forma limpa de "editar" a image de um Pod avulso, então delete o quebrado e (pela
punchline) delete o bom também:

```bash
kubectl delete pod web-typo
kubectl delete pod web
kubectl get pods            # o que sobrou?
```

**Tarefa:** depois de deletar o `web`, ele é recriado?

## Observe

- O `web` vai de `Pending → ContainerCreating → Running` e reporta `READY 1/1`.
- `describe` e `logs` funcionam contra o Pod em execução; `exec … sh` falha (distroless — sem
  shell) e o `kubectl debug --target` te dá um shell ao lado da aplicação.
- A image com a tag ruim fica em **`ImagePullBackOff`**, e seus `Events` nomeiam a tag
  inexistente — de forma idêntica no kind e no cluster compartilhado.
- Deletar o Pod **não** o traz de volta — nenhum controller é dono dele.

## Challenge

Um Pod avulso consegue reiniciar seu *container* sem um controller. Prove isso: execute um
container que sai de propósito e observe o contador `RESTARTS`, dado o
`restartPolicy: Always` padrão.

**Difficulty:** Intermediate

**Success criteria:** Observe pelo menos um restart, prove que o UID do Pod permanece
inalterado, depois delete-o e explique por que o container reiniciou mas o Pod não é recriado.

**Hints:** Capture o `metadata.uid` antes e depois do restart; um controller altera objetos
Pod, enquanto o kubelet reinicia containers dentro de um mesmo Pod.

```bash
kubectl run crash --image=busybox:1.37 -- sh -c 'sleep 10; exit 1'
kubectl get pod crash -w          # observe RESTARTS subir; o Pod permanece
```

[Spoiler: solução do challenge](./05-pod.solution.md#challenge-solution)

## Verify

Verifique a punchline do lab antes do cleanup: o Pod avulso deletado continua deletado.

```bash
kubectl get pod web web-typo -n "$NS" --ignore-not-found
```

Esperado: nenhuma saída. Um Pod `web` reaparecendo significaria que um controller é dono dele.

## Cleanup / reset

```bash
kubectl delete pod web web-typo crash -n "$NS" --ignore-not-found
# ou o reset de pânico seguro por namespace, do Lab 00:
kubectl delete pod --all -n "$NS" --ignore-not-found
```

Deixe o `pod.yaml` no disco para o Lab 06.
