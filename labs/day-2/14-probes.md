# Lab 14 — Health probes (S14)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S14 — Health probes |
| **Environment** | namespace ✓ / kind ✓ *(sem cluster-admin; tudo roda no seu próprio namespace)* |
| **Estimated time** | 30 min |

## Objective

Tornar *física* a diferença entre as três probes. Você vai adicionar probes de **readiness**,
**liveness** e **startup** ao Deployment `web` da linha condutora, depois quebrar cada uma de
propósito e observar os desfechos divergirem:

- **readiness ✗** → o Pod continua `Running`, mas sai da **EndpointSlice** do seu Service, então
  não recebe tráfego — e, como as outras réplicas continuam servindo, os usuários veem **zero downtime**.
- **liveness ✗** → o kubelet **reinicia** o container (`RESTARTS ↑`) e, se continuar
  quebrado, o derruba em **CrashLoopBackOff**.
- **startup** → conduz um container deliberadamente lento para iniciar através de uma liveness
  probe que, de outra forma, o mataria no meio do boot.

O contraste para levar daqui: **readiness drena tráfego, liveness reinicia o container** —
falhas de aparência igual, respostas opostas.

> **Defina seu namespace uma vez.** Tudo roda no seu namespace atribuído (ou em um cluster kind).
> Defina uma variável de shell para que todo comando seja copiável e colável:
>
> ```bash
> export NS=<your-assigned-namespace>          # usuários de kind: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Conceitos dos Labs 05–07 (Pod, Deployment, Service/EndpointSlice). Este lab **cria seus
  próprios** objetos e não depende de sobras de labs anteriores.
- `kubectl` apontando para seu namespace atribuído **ou** um cluster kind local. Sem direitos de admin.
- Acesso de pull à internet para `ghcr.io/platformrelay/workshop-web:v1`, `curlimages/curl` e
  `busybox:1.37` (o substituto de app lento para iniciar).
- Uma forma de enviar HTTP de dentro do cluster — os passos usam um Pod `curl` descartável;
  nenhum LoadBalancer externo ou Ingress é necessário (apenas ClusterIP).

## Files used

- `deployment-probes.yaml` — o Deployment `web` (3 réplicas) com **as três** probes; seu bloco
  de container/probe espelha o frame final do magic-move do slide.
- `service.yaml` — um Service `web` do tipo ClusterIP selecionando `app: s14`.
- `broken/deployment-broken-liveness.yaml` — liveness apontada para uma **porta morta** →
  restarts constantes.
- `broken/deployment-broken-readiness.yaml` — todos os Pods iniciados com `FAIL_READY=1`, então
  a readiness **falha desde o boot** para o Deployment inteiro → um rollout que trava (stretch).
- `slowstart-noguard.yaml` / `slowstart.yaml` — um container de boot lento **sem** e
  **com** uma startup probe.

Tudo é rotulado com `app: s14`, então o cleanup é um único label selector.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./14-probes.solution.md#guided-solutions)

### Step 0 — um Deployment que reporta a própria saúde

Aplique o Deployment `web` com as três probes mais seu Service e confirme que todos os Pods
chegam a `READY 1/1` e entram na EndpointSlice.

```bash
cat > deployment-probes.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s14 }
spec:
  replicas: 3
  selector:
    matchLabels: { app: s14 }
  template:
    metadata:
      labels: { app: s14 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 10
            failureThreshold: 3
          startupProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 3
            failureThreshold: 30          # até 90s para o boot antes de a liveness assumir
EOF

cat > service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
  labels: { app: s14 }
spec:
  selector: { app: s14 }
  ports:
    - port: 80
      targetPort: 8080
EOF

kubectl apply -f deployment-probes.yaml -f service.yaml
kubectl rollout status deployment/web
```

**Tarefa:** confirme que os três Pods estão `Ready` e que seus IPs estão na EndpointSlice.

```bash
kubectl get pods -l app=s14 -o wide
kubectl get endpointslices -l kubernetes.io/service-name=web \
  -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
```

**Pergunta:** o container estava `Running` um segundo depois de iniciar, mas só chegou a
`READY 1/1` um momento depois. O que ficou entre "Running" e "Ready"?

---

### Step 1 — break→fix a readiness em um Pod (zero downtime)

A readiness controla **apenas o tráfego**. Quebre-a em um *único* Pod e observe esse Pod sair da
EndpointSlice enquanto o Service continua servindo pelos outros dois — sem restart, sem erro para
quem chama.

```bash
# escolha um Pod e vire seu endpoint /ready para falha — sem exec, sem restart, só um HTTP POST
POD=$(kubectl get pod -l app=s14 -o jsonpath='{.items[0].metadata.name}')
POD_IP=$(kubectl get pod "$POD" -o jsonpath='{.status.podIP}')
kubectl run curl-flip --rm -i --restart=Never --image=curlimages/curl -- \
  curl -s -X POST "http://$POD_IP:8080/fail"

# em ~15s (periodSeconds 5 × failureThreshold 3) ele vira NotReady
kubectl get pod "$POD" -w        # Ctrl-C quando READY mostrar 0/1
```

> O app de demo foi construído exatamente para isto: `POST /fail` faz seu endpoint `/ready` responder
> **503** (o processo em si continua servindo normalmente); `POST /recover` o vira de volta.
> Miramos o **IP do Pod**, não o Service, então só este Pod é afetado.

**Tarefa:** confirme que o Pod quebrado continua `Running`, mas **saiu** da EndpointSlice, e que
seu contador de `RESTARTS` não mudou.

```bash
kubectl get pod "$POD"
kubectl get endpointslices -l kubernetes.io/service-name=web \
  -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
```

**Tarefa:** prove o **zero downtime** — martele o Service enquanto um Pod está drenado e confirme
que toda request ainda recebe `200`.

```bash
kubectl run curl-s14 --rm -i --restart=Never --image=curlimages/curl -- \
  sh -c 'for i in $(seq 1 12); do
           curl -s -o /dev/null -w "%{http_code} " http://web.'"$NS"'.svc.cluster.local; sleep 1;
         done; echo'
```

**Tarefa:** conserte — `POST /recover` e observe o Pod voltar à slice.

```bash
kubectl run curl-flip --rm -i --restart=Never --image=curlimages/curl -- \
  curl -s -X POST "http://$POD_IP:8080/recover"
kubectl get pod "$POD" -w        # Ctrl-C quando voltar a 1/1
kubectl get endpointslices -l kubernetes.io/service-name=web \
  -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
```

**Pergunta:** a readiness falhou, e mesmo assim o app **nunca reiniciou**. Por que não — e qual
probe *teria* reiniciado?

---

### Step 2 — break→fix a liveness (restarts → CrashLoopBackOff)

A liveness controla **a vida do container**. Aponte-a para uma porta em que nada está escutando e
o kubelet vai concluir que o container travou e reiniciá-lo — de novo e de novo.

```bash
mkdir -p broken
cat > broken/deployment-broken-liveness.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s14 }
spec:
  replicas: 3
  selector:
    matchLabels: { app: s14 }
  template:
    metadata:
      labels: { app: s14 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
            periodSeconds: 5
            failureThreshold: 3
          livenessProbe:
            httpGet: { path: /healthz, port: 9999 }   # nada escuta na 9999 → sempre falha
            periodSeconds: 10
            failureThreshold: 3
          startupProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 3
            failureThreshold: 30
EOF

kubectl apply -f broken/deployment-broken-liveness.yaml
kubectl get pods -l app=s14 -w     # Ctrl-C depois de RESTARTS subir algumas vezes
```

**Tarefa:** leia `RESTARTS` e confirme pelo `describe` que a **liveness** é a causa.

```bash
kubectl get pods -l app=s14
POD=$(kubectl get pod -l app=s14 -o jsonpath='{.items[0].metadata.name}')
kubectl describe pod "$POD" | sed -n '/Liveness:/p;/Events:/,$p'
```

**Tarefa:** conserte — reaplique o manifesto correto (liveness de volta na porta 8080) e confirme
que os restarts param.

```bash
kubectl apply -f deployment-probes.yaml
kubectl rollout status deployment/web
kubectl get pods -l app=s14
```

**Pergunta:** durante a quebra, `RESTARTS` subiu, mas os objetos Pod nunca foram recriados nem
`Deleted`. Qual componente fez a matança, e por que um novo Pod não apareceu a cada vez?

---

### Step 3 — startup probe: proteja um app lento para iniciar

Um container que leva 20s para dar boot será **morto pela liveness** muito antes de ficar pronto —
a menos que uma **startup** probe segure a liveness até o app subir. Mostre as duas metades. (O
app de demo dá boot em milissegundos, então não pode fazer o papel de vítima aqui — em vez disso,
simulamos um iniciador lento com busybox: 20 segundos de `sleep` antes de seu pequeno `httpd`
começar a servir.)

Primeiro, a armadilha — um iniciador lento com liveness mas **sem** startup probe:

```bash
cat > slowstart-noguard.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: slow
  labels: { app: s14 }
spec:
  replicas: 1
  selector:
    matchLabels: { app: s14-slow, role: slow }
  template:
    metadata:
      labels: { app: s14-slow, role: slow }
    spec:
      containers:
        - name: web
          image: busybox:1.37
          command: ["sh", "-c", "sleep 20 && echo up > /tmp/index.html && exec httpd -f -p 8080 -h /tmp"]
          ports: [{ containerPort: 8080 }]     # 20s de sleep antes de servir
          livenessProbe:
            httpGet: { path: /, port: 8080 }
            initialDelaySeconds: 3
            periodSeconds: 3
            failureThreshold: 3           # aos ~12s, a liveness desiste — no meio do boot
EOF

kubectl apply -f slowstart-noguard.yaml
kubectl get pod -l role=slow -w        # Ctrl-C depois de ver RESTARTS subindo
```

**Tarefa:** confirme que o container é morto *antes mesmo de terminar o boot*.

Agora o conserto — adicione uma **startup** probe que suspende a liveness até o app subir:

```bash
cat > slowstart.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: slow
  labels: { app: s14 }
spec:
  replicas: 1
  selector:
    matchLabels: { app: s14-slow, role: slow }
  template:
    metadata:
      labels: { app: s14-slow, role: slow }
    spec:
      containers:
        - name: web
          image: busybox:1.37
          command: ["sh", "-c", "sleep 20 && echo up > /tmp/index.html && exec httpd -f -p 8080 -h /tmp"]
          ports: [{ containerPort: 8080 }]
          startupProbe:
            httpGet: { path: /, port: 8080 }
            periodSeconds: 3
            failureThreshold: 30          # até 90s para o boot — folgadamente além dos 20s
          livenessProbe:
            httpGet: { path: /, port: 8080 }
            periodSeconds: 3
            failureThreshold: 3           # só começa a contar DEPOIS que a startup passa
EOF

kubectl apply -f slowstart.yaml
kubectl get pod -l role=slow -w        # Ctrl-C quando chegar a 1/1 (~25s), RESTARTS 0
```

**Pergunta:** com o mesmo `httpGet /` nas probes de startup e de liveness, por que a startup tem
sucesso onde uma liveness probe pura falhou?

---

## Observe

- `READY 1/1` exige que a probe de **readiness** passe; até lá, um Pod `Running` fica `0/1` e
  permanece fora da EndpointSlice do Service.
- **readiness ✗** em um Pod → ele continua `Running` com `RESTARTS 0`, sai da EndpointSlice,
  e o Service serve pelas outras réplicas com **zero downtime**; conserto → ele volta.
- **liveness ✗** → o kubelet reinicia o container no lugar (`RESTARTS ↑`) → **CrashLoopBackOff**
  se continuar quebrado; o objeto Pod nunca é recriado nem deletado.
- Uma **startup** probe suspende readiness e liveness até o app dar boot, então um iniciador lento
  que uma liveness probe sozinha mataria no meio do boot sobe limpo.
- Os Events do `kubectl describe pod` são o diagnóstico: `Readiness probe failed…` /
  `Liveness probe failed…` é o primeiro lugar para olhar quando `Running` não está servindo.

## Challenge

O tráfego para de chegar a um Pod enquanto outro Pod reinicia em loop. Diagnostique qual
sintoma é readiness e qual é liveness, restaure os endpoints do Service sem restarts
desnecessários e explique por que falhas de readiness não devem matar o container.

**Difficulty:** Intermediate

**Success criteria:** Comprove um endpoint removido por uma readiness probe que falhou e um contador de restarts
subindo por falha de liveness, restaure as duas probes e explique a consequência de tráfego
versus processo de cada uma.

**Hints:** Observe kubectl get endpointslices enquanto alterna a readiness; use kubectl describe pod
para os Events de restart da liveness.

[Spoiler: solução do challenge](./14-probes.solution.md#challenge-solution)

## Verify

Confirme as evidências das probes antes do cleanup.

```bash
kubectl get deploy,pods,svc -n "$NS" -l app=s14
kubectl get endpointslices -n "$NS"
```

Esperado: o Deployment das probes ainda existe e os EndpointSlices refletem os Pods Ready
(ou o estado not-ready deliberado que você ainda não consertou).

## Cleanup / reset

Execute isto por último — remove tudo que o lab criou (o Deployment `slow` carrega
`app: s14` no próprio objeto, então o label selector o pega também).

```bash
# cleanup com escopo — tudo que este lab criou é rotulado app=s14
kubectl delete deployment,svc -l app=s14 -n "$NS" --ignore-not-found
rm -f deployment-probes.yaml service.yaml slowstart.yaml slowstart-noguard.yaml
rm -rf broken

# reset de pânico (namespace): remove também qualquer outra coisa deixada no seu namespace
# kubectl delete deployment,svc,pod --all -n "$NS" --ignore-not-found
# reset de pânico (kind): make kind-down && make kind-up   # ou: kind delete cluster
```

## Stretch (opcional) — um rollout que trava na readiness

A readiness também trava o próprio rollout. Quebre a readiness do Deployment **inteiro** e
observe o rollout se recusar a terminar — enquanto os Pods antigos continuam servindo.

```bash
mkdir -p broken
cat > broken/deployment-broken-readiness.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels: { app: s14 }
spec:
  replicas: 3
  selector:
    matchLabels: { app: s14 }
  template:
    metadata:
      labels: { app: s14 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          env:
            - name: FAIL_READY
              value: "1"                  # o app dá boot com /ready respondendo 503 → nunca Ready
          ports: [{ containerPort: 8080 }]
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
            periodSeconds: 5
            failureThreshold: 3
EOF

kubectl apply -f broken/deployment-broken-readiness.yaml
kubectl rollout status deployment/web --timeout=40s   # vai reportar que NÃO terminou o rollout
kubectl get pods -l app=s14
```
