# Lab 07 — Service (S07)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S07 — Service *("linha vermelha" 3/5)* |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 30 min |

## Objective

Dar ao Deployment um **endereço estável** com um Service, alcançá-lo por DNS a partir de
outro Pod e ver como um Service encontra seus Pods através de **labels → EndpointSlices**.
Depois quebre o selector e conheça o bug de Service mais comum — e mais *silencioso* — de
todos. Passo **3 de 5** da red line: o `service.yaml` fica ao lado do Deployment do Lab 06 e
seleciona seus Pods.

## Prerequisites

- Lab 06 concluído; `deployment.yaml` aplicado e 3 Pods `Running`
  (`kubectl get deploy web` → `3/3`).
- `$NS` é seu namespace padrão.

## Files used

- `service.yaml` — um Service ClusterIP selecionando `app: web`, criado no Step 1.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./07-service.solution.md#guided-solutions)

### Step 1 — exponha o Deployment

O `selector` do Service é o **mesmo label** que o Deployment carimba em seus Pods
(`app: web`). Esse casamento de label é toda a fiação.

```bash
cat > service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: web
spec:
  selector:
    app: web            # seleciona todo Pod que carrega este label
  ports:
    - name: http
      port: 80          # a porta do Service — o que os clientes acessam
      targetPort: 8080  # a porta do container (containerPort no Pod)
EOF

kubectl apply -f service.yaml
kubectl get service web
```

---

### Step 2 — veja os endpoints que o selector produziu

```bash
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl get pods -l app=web -o wide
```

**Tarefa:** quantos endereços de endpoint existem, e de onde eles vêm?

---

### Step 3 — alcance-o por DNS a partir de um Pod descartável

O DNS do cluster dá um nome a cada Service. A partir de um Pod temporário, busque a página
de status da aplicação de demo pelo nome do Service `web`:

```bash
kubectl run tmp --restart=Never --image=busybox:1.36 -- sleep 3600
kubectl wait --for=condition=Ready pod/tmp --timeout=60s
kubectl exec tmp -- wget -qO- http://web
```

**Tarefa:** o que você recebeu de volta, e qual nome foi resolvido? Execute algumas vezes —
observe a linha `pod:`.

---

### Step 4 — quebre o selector (a falha silenciosa)

Mude o selector do Service para um label que **nenhum Pod tem**, depois tente de novo.
Observe com atenção: o objeto Service permanece perfeitamente saudável.

```bash
kubectl patch service web --type=merge -p '{"spec":{"selector":{"app":"web-oops"}}}'
kubectl get service web                                   # ainda está lá, ainda tem um ClusterIP
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl exec tmp -- wget -qO- --timeout=5 http://web ; echo "exit=$?"
```

**Tarefa:** o curl falha. Onde a falha fica visível — no Service, ou em outro lugar?

### Step 5 — conserte e verifique de novo

```bash
kubectl patch service web --type=merge -p '{"spec":{"selector":{"app":"web"}}}'
kubectl get endpointslices -l kubernetes.io/service-name=web
kubectl exec tmp -- wget -qO- http://web | head -1
```

## Observe

- O Service ganha um `ClusterIP` estável; sua EndpointSlice lista **um endereço por Pod**.
- `http://web` resolve via DNS do cluster e retorna o corpo de status da aplicação de demo —
  a linha `pod:` alterna entre os três Pods.
- Um selector errado deixa o Service com **aparência saudável, mas com zero endpoints**, e
  as requisições estouram o timeout — de forma idêntica nos dois ambientes.
- Consertar o selector repopula os endpoints e restaura o tráfego imediatamente.

## Challenge

Observe um endpoint sair do conjunto no momento em que seu Pod é deletado — o comportamento
sobre o qual o Lab 14 (probes) constrói.

**Difficulty:** Intermediate

**Success criteria:** Delete exatamente um Pod selecionado, identifique o endereço de
endpoint dele desaparecendo, observe o endereço substituto chegar e explique como a
readiness controla a participação na EndpointSlice.

**Hints:** Registre o nome e o IP do Pod escolhido antes da deleção; use o watch da
EndpointSlice e compare os endereços removido e substituto.

```bash
# Terminal A:
kubectl get endpointslices -l kubernetes.io/service-name=web -w
# Terminal B:
POD=$(kubectl get pods -n "$NS" -l app=web --field-selector=status.phase=Running \
  -o jsonpath='{.items[0].metadata.name}')
kubectl delete pod "$POD" -n "$NS"
```

[Spoiler: solução do challenge](./07-service.solution.md#challenge-solution)

## Verify

Verifique tanto a seleção de endpoints quanto o roteamento de requisições antes de remover o
Service.

```bash
kubectl rollout status deployment/web -n "$NS" --timeout=120s
kubectl get endpointslice -n "$NS" -l kubernetes.io/service-name=web
kubectl exec tmp -n "$NS" -- wget -qO- http://web | head -1
```

Esperado: a EndpointSlice tem endereços ready e a requisição imprime `workshop-web v1`.

## Cleanup / reset

```bash
kubectl delete -f service.yaml -n "$NS" --ignore-not-found
kubectl delete pod tmp -n "$NS" --ignore-not-found
# reset completo:
kubectl delete svc,deploy,rs,pod --all -n "$NS" --ignore-not-found
```

Guarde o `service.yaml` e o `deployment.yaml` para o Lab 08.
