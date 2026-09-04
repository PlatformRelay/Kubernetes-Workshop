# Lab 06 — Deployment (S06)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S06 — Deployment *("linha vermelha" 2/5)* |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 30 min |

## Objective

Transformar o Pod avulso do Lab 05 em um **Deployment**, depois escalá-lo, fazer o rollout de
uma nova image, observar os ReplicaSets se alternarem e fazer o rollback. Você vai ver *por
que* raramente se criam Pods avulsos. Este é o passo **2 de 5** da red line — o
`deployment.yaml` **estende** o `pod.yaml`.

## Prerequisites

- Lab 05 concluído; `pod.yaml` ainda no disco. `$NS` é seu namespace padrão.
- Namespace vazio (`kubectl get all` → *No resources found*). Execute o reset de pânico do
  Lab 00 se não estiver.

## Files used

- `deployment.yaml` — o Deployment, construído no Step 1 embrulhando o Pod do `pod.yaml`
  como o `template` do Deployment. **Guarde-o** — o Lab 07 adiciona um Service ao lado dele.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./06-deployment.solution.md#guided-solutions)

### Step 1 — estenda o Pod em um Deployment

Um Deployment carrega o **mesmo Pod** dentro de `spec.template`, mais três coisas novas:
`replicas`, um `selector` e metadata sobre o template. Compare com o seu `pod.yaml` —
tudo sob `template:` é o Pod do Lab 05, indentado.

```bash
cat > deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web          # deve casar com template.metadata.labels abaixo
  template:
    metadata:
      labels:
        app: web        # os labels do Pod — o Service do Lab 07 seleciona estes
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 128Mi
EOF

kubectl apply -f deployment.yaml
kubectl get deploy,rs,pods -l app=web
```

**Tarefa:** quantos Pods aparecem, e o que é dono deles?

**Pergunta:** delete um Pod — o que acontece, e como isso é diferente do Lab 05?

---

### Step 2 — escale

```bash
kubectl scale deployment web --replicas=5
kubectl get pods -l app=web -w        # Ctrl-C quando os 5 estiverem Running
kubectl scale deployment web --replicas=3
```

---

### Step 3 — faça o rollout de uma nova image, observe os ReplicaSets se alternarem

Em um terminal, comece a observar os ReplicaSets; em outro, troque a image.

```bash
# Terminal A — deixe este rodando:
kubectl get rs -l app=web -w

# Terminal B:
kubectl set image deployment/web web=ghcr.io/platformrelay/workshop-web:v2
kubectl rollout status deployment/web
```

**Tarefa:** no Terminal A, descreva o que acontece com o número de ReplicaSets.

---

### Step 4 — histórico e rollback

```bash
kubectl rollout history deployment/web
kubectl rollout undo deployment/web
kubectl rollout status deployment/web
```

**Tarefa:** verifique que a image realmente reverteu para
`ghcr.io/platformrelay/workshop-web:v1`.

---

### Step 5 — quebre/conserte: um rollout que trava

Faça o rollout de uma tag de image que não existe e observe o rollout **travar** em vez de
derrubar a aplicação em execução.

```bash
kubectl set image deployment/web web=ghcr.io/platformrelay/workshop-web:v9.99-nope
kubectl rollout status deployment/web --timeout=30s ; echo "exit=$?"
kubectl get pods -l app=web
```

**Tarefa:** a aplicação em execução nunca caiu — por quê, e como você se recupera?

## Observe

- `Deployment → ReplicaSet → Pods`; deletar um Pod dispara a recriação imediata.
- Uma nova image gera um **segundo ReplicaSet**; o novo escala para cima enquanto o antigo
  escala para baixo, sem indisponibilidade.
- `rollout undo` restaura a image anterior (verificado por jsonpath).
- Um rollout com image ruim **trava** com o Pod novo em `ImagePullBackOff` enquanto os Pods
  antigos continuam servindo — recuperado com `rollout undo`.

## Challenge

Torne o rollout visivelmente gradual ampliando o surge, depois faça o rollout de uma nova
image e observe as contagens de Pods.

**Difficulty:** Intermediate

**Success criteria:** Registre a contagem mínima de Ready e a contagem máxima total de Pods
durante o rollout, compare-as com `maxUnavailable: 0` e `maxSurge: 2`, e explique o
trade-off de recursos.

**Hints:** Mantenha `kubectl get pods -w` em um terminal e use os comandos de
patch/image em outro; conte os Pods Running mais ContainerCreating no pico.

```bash
kubectl patch deployment web --type=merge \
  -p '{"spec":{"strategy":{"rollingUpdate":{"maxSurge":2,"maxUnavailable":0}}}}'
kubectl set image deployment/web web=ghcr.io/platformrelay/workshop-web:v2
kubectl get pods -l app=web -w
```

[Spoiler: solução do challenge](./06-deployment.solution.md#challenge-solution)

## Verify

Verifique a recuperação do rollout deliberadamente ruim antes de deletar o Deployment.

```bash
kubectl rollout status deployment/web -n "$NS" --timeout=120s
kubectl get deployment web -n "$NS" \
  -o jsonpath='{.status.availableReplicas}{" ready; image="}{.spec.template.spec.containers[0].image}{"\n"}'
```

Esperado: `3 ready` e uma tag real da image workshop-web, não `v9.99-nope`.

## Cleanup / reset

```bash
kubectl delete -f deployment.yaml -n "$NS" --ignore-not-found
# ou o reset de pânico do Lab 00:
kubectl delete deploy,rs,pod --all -n "$NS" --ignore-not-found
```

Guarde o `deployment.yaml` e o `pod.yaml` para o Lab 07.
