# Lab 14 — Health probes (S14) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pods -l app=s14
NAME                   READY   STATUS    RESTARTS   AGE
web-7d9c8b6c5-4kk2p    1/1     Running   0          40s
web-7d9c8b6c5-9m7xq    1/1     Running   0          40s
web-7d9c8b6c5-pv6tn    1/1     Running   0          40s

$ kubectl get endpointslices -l kubernetes.io/service-name=web \
    -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
10.244.0.7 10.244.0.8 10.244.0.9
```

`READY 1/1` significa que a probe de **readiness** passou — o app de demo serve seu próprio
endpoint `/ready`, e ele responde 200. Três Pods Ready → três endereços na EndpointSlice → o
Service faz load balancing entre os três.
</details>

**Pergunta:** o container estava `Running` um segundo depois de iniciar, mas só chegou a
`READY 1/1` um momento depois. O que ficou entre "Running" e "Ready"?

<details><summary>Resposta</summary>

A **readiness probe**. `Running` significa que o processo do servidor iniciou; `Ready` significa
que a readiness probe já retornou sucesso pelo menos uma vez. Até lá o Pod fica `Running` mas
`0/1` e é **mantido fora da EndpointSlice** — que é exatamente o motivo de um rolling update
nunca mandar tráfego para uma réplica pela metade. (A probe de **startup** também controla
isto: a readiness nem começa antes de a startup passar.)
</details>

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

> O app de demo foi construído exatamente para isto: `POST /fail` faz seu endpoint `/ready`
> responder **503** (o processo em si continua servindo normalmente); `POST /recover` o vira de
> volta. Miramos o **IP do Pod**, não o Service, então só este Pod é afetado.

**Tarefa:** confirme que o Pod quebrado continua `Running`, mas **saiu** da EndpointSlice, e que
seu contador de `RESTARTS` não mudou.

```bash
kubectl get pod "$POD"
kubectl get endpointslices -l kubernetes.io/service-name=web \
  -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pod "$POD"
NAME                  READY   STATUS    RESTARTS   AGE
web-7d9c8b6c5-4kk2p   0/1     Running   0          5m

$ kubectl get endpointslices -l kubernetes.io/service-name=web \
    -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
10.244.0.8 10.244.0.9
```

`READY 0/1`, `STATUS Running`, `RESTARTS 0` — o Pod está vivo e intocado, ele só falhou a
readiness (seu `/ready` agora responde **503**), então o endpoint controller **removeu o IP dele**
da slice. Sobram dois endereços. O `describe pod "$POD"` mostra o event
`Readiness probe failed: HTTP probe failed with statuscode: 503`.
</details>

**Tarefa:** prove o **zero downtime** — martele o Service enquanto um Pod está drenado e confirme
que toda request ainda recebe `200`.

```bash
kubectl run curl-s14 --rm -i --restart=Never --image=curlimages/curl -- \
  sh -c 'for i in $(seq 1 12); do
           curl -s -o /dev/null -w "%{http_code} " http://web.'"$NS"'.svc.cluster.local; sleep 1;
         done; echo'
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl run curl-s14 --rm -i --restart=Never --image=curlimages/curl -- sh -c '...'
200 200 200 200 200 200 200 200 200 200 200 200
pod "curl-s14" deleted
```

Toda request retorna `200`. O ClusterIP só roteia para endpoints que estão na slice, e os dois
Pods Ready absorvem tudo. Esse é o contrato da readiness: um Pod que não está ready é
**invisível para o Service**, então drená-lo não custa nada ao usuário. (Se uma request de alguma
forma chegasse ao Pod drenado em `/`, ela ainda seria servida — o processo está no ar e sua página
de status continua respondendo 200 com `ready: false` no corpo; apenas o *endpoint* de readiness
reporta 503.)
</details>

**Tarefa:** conserte — `POST /recover` e observe o Pod voltar à slice.

```bash
kubectl run curl-flip --rm -i --restart=Never --image=curlimages/curl -- \
  curl -s -X POST "http://$POD_IP:8080/recover"
kubectl get pod "$POD" -w        # Ctrl-C quando voltar a 1/1
kubectl get endpointslices -l kubernetes.io/service-name=web \
  -o jsonpath='{.items[*].endpoints[*].addresses[0]}{"\n"}'
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pod "$POD"
NAME                  READY   STATUS    RESTARTS   AGE
web-7d9c8b6c5-4kk2p   1/1     Running   0          7m

# a EndpointSlice está de volta com três endereços
10.244.0.7 10.244.0.8 10.244.0.9
```

A readiness passa de novo → o Pod volta à slice, ainda com `RESTARTS 0`. A readiness é
**totalmente reversível**: ela nunca toca no processo, só na participação do Pod no Service.
</details>

**Pergunta:** a readiness falhou, e mesmo assim o app **nunca reiniciou**. Por que não — e qual
probe *teria* reiniciado?

<details><summary>Resposta</summary>

Porque **readiness e liveness são checagens separadas com trabalhos separados**. A readiness só
decide *"mandar tráfego para este Pod?"* — uma falha o remove dos endpoints e nada mais. O
container continua rodando intocado (`RESTARTS 0`). Só a probe de **liveness** reinicia um
container, e neste manifesto a liveness testa `/healthz` — que o app responde com `200` enquanto
o processo estiver servindo — então ela ficou satisfeita o tempo todo. Essa separação é
deliberada (e o app a garante em código: `/fail` vira apenas o `/ready`, nunca o `/healthz`):
você nunca quer que um estado de "ainda não pronto" dispare um restart. O próximo passo quebra a
liveness para ver o outro desfecho.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pods -l app=s14
NAME                   READY   STATUS             RESTARTS      AGE
web-6c4f9b7d8-2xq4l    0/1     CrashLoopBackOff   3 (18s ago)   90s
web-6c4f9b7d8-7bkdp    0/1     Running            2 (25s ago)   90s
web-6c4f9b7d8-lm9rt    0/1     CrashLoopBackOff   3 (11s ago)   90s

$ kubectl describe pod "$POD"
    Liveness:  http-get http://:9999/healthz delay=0s timeout=1s period=10s #success=1 #failure=3
...
Events:
  Warning  Unhealthy  ...  Liveness probe failed: Get "http://10.244.0.11:9999/healthz": connect: connection refused
  Normal   Killing    ...  Container web failed liveness probe, will be restarted
```

O rolling update substituiu os Pods; a liveness probe de cada novo Pod bate na porta `9999`,
recebe `connection refused`, falha 3× (≈30s), e o kubelet **mata e reinicia** o container. Cada
restart repete o ciclo → `RESTARTS` sobe → **CrashLoopBackOff** (o kubelet recua
exponencialmente entre os restarts). Note que a fase continua `Running`/`CrashLoopBackOff`, nunca
`Deleted` — a liveness reinicia o *container*, ela nunca recria o Pod.
</details>

**Tarefa:** conserte — reaplique o manifesto correto (liveness de volta na porta 8080) e confirme
que os restarts param.

```bash
kubectl apply -f deployment-probes.yaml
kubectl rollout status deployment/web
kubectl get pods -l app=s14
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pods -l app=s14
NAME                   READY   STATUS    RESTARTS   AGE
web-7d9c8b6c5-c8n2v    1/1     Running   0          30s
web-7d9c8b6c5-h4rqd    1/1     Running   0          28s
web-7d9c8b6c5-tz9wp    1/1     Running   0          26s
```

A liveness em `/healthz` (porta 8080) retorna `200`, então nada é reiniciado — `RESTARTS 0`, todos
`1/1`. O conserto de um incidente real de liveness instável tem a mesma forma: corrija o alvo,
afrouxe o timing, ou mova a tolerância de boot lento para uma probe de **startup** (próximo passo)
— nunca simplesmente delete a liveness probe, o que joga fora seu self-healing.
</details>

**Pergunta:** durante a quebra, `RESTARTS` subiu, mas os objetos Pod nunca foram recriados nem
`Deleted`. Qual componente fez a matança, e por que um novo Pod não apareceu a cada vez?

<details><summary>Resposta</summary>

O **kubelet** (no node) matou e reiniciou o **container dentro do Pod existente**, conforme o
`restartPolicy: Always` padrão do Pod. Isso é um restart de container *no lugar* — o `RESTARTS`
conta, mas o objeto Pod, seu nome e seu IP continuam os mesmos. Um novo Pod só aparece se o
**controller de Deployment/ReplicaSet** o substituir (por exemplo, o rollout que você disparou),
o que é um mecanismo diferente. Liveness = reinicia o container; ela nunca deleta nem recria o
Pod.
</details>

---

### Step 3 — startup probe: proteja um app lento para iniciar

Um container que leva 20s para dar boot será **morto pela liveness** muito antes de ficar pronto —
a menos que uma probe de **startup** segure a liveness até o app subir. Mostre as duas metades. (O
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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pod -l role=slow
NAME                    READY   STATUS             RESTARTS      AGE
slow-5f7b9c6d4-kk8wp    0/1     CrashLoopBackOff   3 (20s ago)   2m
```

A liveness começa a testar em `initialDelaySeconds: 3`; o container ainda está no seu `sleep 20`,
então `/` recebe `connection refused`. Três falhas (≈12s) e o kubelet o mata — **no meio do
boot**. Ele nunca chega à marca dos 20s, então nunca consegue subir. É exatamente por isso que
parafusar `initialDelaySeconds` na liveness é frágil: você está adivinhando o tempo de boot, e um
palpite ruim é um CrashLoop permanente.
</details>

Agora o conserto — adicione uma probe de **startup** que suspende a liveness até o app subir:

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pod -l role=slow
NAME                    READY   STATUS    RESTARTS   AGE
slow-6d8c7f5b9-p2mtq    1/1     Running   0          35s
```

Enquanto a probe de **startup** está falhando (durante o sleep de 20s), a probe de **liveness**
fica *suspensa* — ela nem roda, então não pode matar o container. Por volta de 20–21s o
pequeno servidor web sobe, a startup passa uma vez, e só então a liveness assume. Resultado: um
boot limpo, `RESTARTS 0`.
Mesmo container lento, desfecho oposto — a startup probe é a diferença. (Este Pod não tem
readiness probe, então `1/1` aqui significa apenas que o container está no ar; o controle por
readiness é a história dos Steps 0–1.)
</details>

**Pergunta:** com o mesmo `httpGet /` nas probes de startup e de liveness, por que a startup tem
sucesso onde uma liveness probe pura falhou?

<details><summary>Resposta</summary>

Por causa de **quando** cada uma roda e de **quão tolerante** ela é. A startup probe roda
*primeiro* e tem um orçamento generoso (`failureThreshold 30 × periodSeconds 3 = 90s`), então
espera com paciência os 20s de boot. E o ponto crucial: **a liveness fica inteiramente suspensa
até a startup passar** — então o threshold apertado da liveness nunca vê o app que ainda não está
escutando. Depois que a startup passa, a liveness começa com uma contagem zerada contra um app já
no ar. A startup responde "ele *já* deu boot?"; a liveness responde "ele *ainda* está vivo?" — e
separar essas duas perguntas é todo o propósito da startup probe.
</details>

---

### Stretch (opcional) — um rollout que trava na readiness

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

<details><summary>Solução / o que você está vendo</summary>

```console
$ kubectl rollout status deployment/web --timeout=40s
Waiting for deployment "web" rollout to finish: 1 out of 3 new replicas have been updated...
error: timed out waiting for the condition

$ kubectl get pods -l app=s14
NAME                   READY   STATUS    RESTARTS   AGE
web-6b9f7c8d5-r4k9x    0/1     Running   0          45s   # novo ReplicaSet, nunca Ready
web-7d9c8b6c5-c8n2v    1/1     Running   0          8m    # Pod antigo, ainda servindo
web-7d9c8b6c5-h4rqd    1/1     Running   0          8m
```

Os novos Pods estão `Running` mas nunca `1/1` — o `FAIL_READY=1` faz o app iniciar com seu
endpoint `/ready` respondendo 503, e nada nunca o vira de volta — então eles nunca entram na
EndpointSlice e o rollout **trava**; por padrão o `maxUnavailable` mantém vivos Pods antigos e
Ready em número suficiente para que o Service nunca perca capacidade. Essa é a proteção: uma
readiness probe quebrada **impede a versão ruim de receber tráfego** em vez de causar uma queda.
(Você *poderia* resgatar um único Pod travado com `POST /recover`, mas o conserto honesto para um
template ruim é rolar para frente.) Conserte rolando para frente com o manifesto bom:

```console
$ kubectl apply -f deployment-probes.yaml && kubectl rollout status deployment/web
deployment.apps/web configured
deployment "web" successfully rolled out
```

</details>

## Cleanup / panic reset

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

## Expected state / output

- `READY 1/1` exige que a probe de **readiness** passe; até lá, um Pod `Running` fica `0/1` e
  permanece fora da EndpointSlice do Service.
- **readiness ✗** em um Pod → ele continua `Running` com `RESTARTS 0`, sai da EndpointSlice,
  e o Service serve pelas outras réplicas com **zero downtime**; conserto → ele volta.
- **liveness ✗** → o kubelet reinicia o container no lugar (`RESTARTS ↑`) → **CrashLoopBackOff**
  se continuar quebrado; o objeto Pod nunca é recriado nem deletado.
- Uma probe de **startup** suspende readiness e liveness até o app dar boot, então um iniciador
  lento que uma liveness probe sozinha mataria no meio do boot sobe limpo.
- Os Events do `kubectl describe pod` são o diagnóstico: `Readiness probe failed…` /
  `Liveness probe failed…` é o primeiro lugar para olhar quando `Running` não está servindo.

Status representativos incluem Pods Running/Complete/Failed, PVCs Bound, conditions
Accepted de Gateway ou TARGETS numéricos de HPA — compare o significado, não nomes efêmeros.

## Explanation

A readiness controla se o Pod é um backend do Service; a liveness pede ao kubelet que
reinicie um processo travado. Tratar um problema de drenagem de tráfego como se fosse
liveness causa restarts inúteis, enquanto ignorar a liveness deixa um processo morto
servindo caso a readiness continue passando.

Os passos guiados acima provam o comportamento do control plane desta seção; leia os Events e
os campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Se o tráfego parar enquanto os Pods continuam Running, observe
`kubectl get endpointslices -n "$NS" -l kubernetes.io/service-name=web` — uma readiness probe
que falhou remove o endereço sem reiniciar nada. Contadores de restart subindo pertencem à
liveness; leia-os com `kubectl describe pod -n "$NS" -l app=s14`. Restaure as probes que
funcionam via `kubectl apply -f deployment-probes.yaml -n "$NS"` (ou o patch de probes do lab),
depois `kubectl rollout status deploy/web -n "$NS"`. Não trate falhas de readiness como motivo
para deletar o Pod.

## Challenge solution

### Commands / manifest

```bash
kubectl get pods -n "$NS" -o wide
kubectl get endpointslices -n "$NS"
kubectl describe pod -n "$NS" | sed -n '/Events:/,$p' | head -n 40
kubectl apply -f deployment-probes.yaml -n "$NS"
kubectl rollout status deploy/web -n "$NS"
```

### Expected state / output

Uma falha de readiness remove o endereço do Pod dos endpoints do Service enquanto deixa o
processo Running; uma falha de liveness incrementa os Restarts rumo ao CrashLoopBackOff. Após
o restore, os endpoints incluem os Pods Ready e os contadores de restart param de subir.

### Explanation

A readiness controla se o Pod é um backend do Service; a liveness pede ao kubelet que
reinicie um processo travado. Tratar um problema de drenagem de tráfego como se fosse
liveness causa restarts inúteis, enquanto ignorar a liveness deixa um processo morto
servindo caso a readiness continue passando.

### Hints

Observe kubectl get endpointslices enquanto alterna a readiness; use kubectl describe pod
para os Events de restart da liveness.
