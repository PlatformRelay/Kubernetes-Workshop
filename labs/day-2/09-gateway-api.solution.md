# Lab 09 — Gateway API (S09) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 1 (apenas kind) — instale os CRDs, o controller e uma GatewayClass

Os tipos do Gateway API **não** vêm embutidos no Kubernetes. Instale os CRDs do standard
channel e, em seguida, um controller conformante (**Envoy Gateway**). O manifesto de instalação
dele **não** cria uma `GatewayClass` — você mesmo a declara, exatamente como o momento da
`IngressClass` no Lab 08.

```bash
# garanta que você está no cluster / namespace do workshop
kubectl create namespace workshop --dry-run=client -o yaml | kubectl apply -f -
kubectl config set-context --current --namespace=workshop
export NS=workshop

# 1a. CRDs do standard channel do Gateway API v1.5.1 (GatewayClass, Gateway, HTTPRoute — todos GA).
#     Server-side apply: os CRDs são grandes demais para a annotation client-side.
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml

# 1b. Envoy Gateway v1.8.2 — o controller (instala no namespace `envoy-gateway-system`).
kubectl apply --server-side -f https://github.com/envoyproxy/gateway/releases/download/v1.8.2/install.yaml
kubectl wait --timeout=5m -n envoy-gateway-system deployment/envoy-gateway --for=condition=Available

# 1c. A GatewayClass — a declaração única da infra de quem implementa a API.
cat > gatewayclass.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: eg
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
EOF
kubectl apply -f gatewayclass.yaml

# Confirme que o controller reivindicou sua class:
kubectl get gatewayclass
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get gatewayclass
NAME   CONTROLLER                                      ACCEPTED   AGE
eg     gateway.envoyproxy.io/gatewayclass-controller   True       10s
```

`ACCEPTED=True` significa que um controller em execução é dono da class `eg` — é esse o nome que
seu `Gateway` vai referenciar. Se `ACCEPTED` continuar `Unknown`, o controller ainda não está
pronto (`kubectl -n envoy-gateway-system get pods`) ou o `controllerName` não bate com o
que o controller anuncia.
</details>

<details><summary>Caminho do cluster compartilhado — faça isto em vez do Step 1</summary>

**Não** instale nada. Confirme que os CRDs e um controller já existem, e anote o
nome da class:

```console
$ kubectl get gatewayclass
NAME   CONTROLLER                                      ACCEPTED   AGE
eg     gateway.envoyproxy.io/gatewayclass-controller   True       40d
```

Use esse nome de class no `gateway.yaml` (substitua `eg` se a class do seu cluster for diferente) e
execute tudo no seu namespace atribuído `$NS`. Pule todos os comandos específicos de `kind` abaixo.
</details>

---

### Step 2 — implante dois backends distinguíveis

Os mesmos backends do Lab 08 — o Gateway fica na frente de Services idênticos, provando a red
line. O `workshop-web` responde toda request com o nome do seu pod e a versão (`v1`/`v2`),
então você sempre sabe qual backend respondeu.

```bash
cat > backends.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: web } }
spec:
  replicas: 2
  selector: { matchLabels: { app: web } }
  template:
    metadata: { labels: { app: web } }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [ { containerPort: 8080 } ]
---
apiVersion: v1
kind: Service
metadata: { name: web, labels: { app: web } }
spec:
  selector: { app: web }
  ports: [ { name: http, port: 80, targetPort: 8080 } ]
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: web2, labels: { app: web2 } }
spec:
  replicas: 2
  selector: { matchLabels: { app: web2 } }
  template:
    metadata: { labels: { app: web2 } }
    spec:
      containers:
        - name: web2
          image: ghcr.io/platformrelay/workshop-web:v2
          ports: [ { containerPort: 8080 } ]
---
apiVersion: v1
kind: Service
metadata: { name: web2, labels: { app: web2 } }
spec:
  selector: { app: web2 }
  ports: [ { name: http, port: 80, targetPort: 8080 } ]
EOF

kubectl apply -f backends.yaml
kubectl rollout status deploy/web && kubectl rollout status deploy/web2
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply -f backends.yaml
deployment.apps/web created
service/web created
deployment.apps/web2 created
service/web2 created
$ kubectl rollout status deploy/web && kubectl rollout status deploy/web2
deployment "web" successfully rolled out
deployment "web2" successfully rolled out
```

Cada Service escuta na porta **80** e aponta para a **8080** do container — o `web` serve
`workshop-web v1`, o `web2` serve `v2`, então toda resposta nomeia o backend que respondeu.
</details>

---

### Step 3 — aplique o Gateway (o ponto de entrada)

O `Gateway` é a porta de propriedade da infra: um listener HTTP na porta 80. Por padrão, um listener
admite `HTTPRoutes` do **mesmo namespace**, então nenhum `allowedRoutes` extra é necessário aqui.

```bash
cat > gateway.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web
spec:
  gatewayClassName: eg             # deve bater com `kubectl get gatewayclass`
  listeners:
    - name: http
      port: 80
      protocol: HTTP
EOF

kubectl apply -f gateway.yaml
kubectl get gateway web
kubectl get gateway web -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
```

**Tarefa:** o que as conditions `Accepted` e `Programmed` dizem, e por que isso é
honesto no kind?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get gateway web
NAME   CLASS   ADDRESS   PROGRAMMED   AGE
web    eg                False        15s

$ kubectl get gateway web -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
Accepted=True (Accepted) The Gateway has been scheduled by Envoy Gateway
Programmed=False (AddressNotAssigned) No addresses have been assigned to the Gateway
```

`Accepted=True` — o controller reivindicou seu Gateway e provisionou um data plane para
ele: olhe no namespace do controller e você vai encontrar um Service (e Deployment) de proxy
dedicado do qual este Gateway agora é dono:

```console
$ kubectl get svc -n envoy-gateway-system
NAME                        TYPE           CLUSTER-IP     EXTERNAL-IP   PORT(S)        AGE
envoy-gateway               ClusterIP      10.96.24.13    <none>        18000/TCP,…    5m
envoy-workshop-web-5c866941 LoadBalancer   10.96.101.87   <pending>     80:31627/TCP   20s
```

`Programmed=False (AddressNotAssigned)` é o kind sendo honesto: o Service provisionado é do
tipo `LoadBalancer`, e um cluster kind não tem controller de load balancer para entregar um
IP externo — o `EXTERNAL-IP` fica em `<pending>`, então o Gateway nunca ganha um endereço.
O proxy continua rodando e configurado; você vai alcançá-lo com `port-forward` no
Step 4. **Esta já é a vitória de observabilidade:** em vez do `ADDRESS` silenciosamente vazio
de um Ingress, você recebe uma condition tipada com um reason que diz exatamente o que falta.
Em um cluster cloud ou compartilhado o LB atribui um endereço e o `PROGRAMMED` vira `True`.
</details>

---

### Step 4 — aplique o HTTPRoute e roteie por path

O `HTTPRoute` são as regras de propriedade da aplicação. Ele **se anexa** ao Gateway com `parentRefs` e
envia `/` para o Service `web`.

```bash
cat > route.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web                    # anexa ao Gateway chamado "web"
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - { name: web, port: 80 }  # o MESMO Service do Lab 07
EOF

kubectl apply -f route.yaml
kubectl get httproute web -o jsonpath='{range .status.parents[0].conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'

# Alcance o Gateway: sem LoadBalancer no kind, então faça port-forward do Service Envoy dele
# (o caminho documentado upstream). O Service é rotulado com o Gateway que o possui:
export ENVOY_SERVICE=$(kubectl get svc -n envoy-gateway-system \
  --selector=gateway.envoyproxy.io/owning-gateway-namespace=$NS,gateway.envoyproxy.io/owning-gateway-name=web \
  -o jsonpath='{.items[0].metadata.name}')
kubectl -n envoy-gateway-system port-forward service/$ENVOY_SERVICE 8888:80 >/tmp/pf.log 2>&1 &
sleep 2
curl -H 'Host: web.example.com' http://localhost:8888/
```

**Tarefa:** qual backend responde, e o que as conditions do HTTPRoute mostram?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get httproute web -o jsonpath='{range .status.parents[0].conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
Accepted=True (Accepted) Route is accepted
ResolvedRefs=True (ResolvedRefs) Resolved all the Object references for the Route

$ curl -H 'Host: web.example.com' http://localhost:8888/
workshop-web v1
pod: web-6f7c9b7f4d-x2m4q
requests served: 1
ready: true
```

O `/` roteia para o Service `web` — o mesmo backend que o Ingress servia, agora atrás de um
Gateway + HTTPRoute, e o corpo da resposta confirma: `workshop-web v1` mais o pod que te
atendeu. `Accepted=True` significa que um Gateway admitiu a route; `ResolvedRefs=True` confirma
que todo `backendRef` apontava para um Service e uma porta reais. (O `port-forward` roda em
background; pare-o depois com `kill %1` ou pela seção de cleanup.)

> Se você usa um **cluster compartilhado**, substitua a linha do `port-forward` pelo endereço que
> seu facilitador te deu: `curl http://web.example.com/` (o DNS real fornece o `Host`), ou
> `curl --resolve web.example.com:80:<gateway-address> http://web.example.com/`.
</details>

**Pergunta:** o HTTPRoute lista `hostnames: [web.example.com]`. O que acontece com uma request
cujo header `Host` é outra coisa?

<details><summary>Resposta</summary>

```console
$ curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: nope.example.com' http://localhost:8888/
404
```

O listener admite a request, mas nenhum hostname de `HTTPRoute` casa, então nada é roteado —
você recebe um `404`. O `hostnames` na route restringe a quais hosts as regras dela se aplicam,
do mesmo jeito que o `host` de uma regra de Ingress fazia.
</details>

---

### Step 5 — adicione um header match tipado

No Ingress, qualquer coisa além de host/path exigia annotations específicas do controller. Aqui é
um **campo tipado**: adicione uma regra que casa com o header `x-env: canary` e envia essas
requests para `web2`. A regra header+path é **mais específica**, então ela vence a regra simples
de `/` independentemente da ordem.

```bash
cat > route-header.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
          headers:
            - { name: x-env, value: canary }   # match tipado — sem annotation
      backendRefs:
        - { name: web2, port: 80 }
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:
        - { name: web, port: 80 }
EOF

kubectl apply -f route-header.yaml

curl -sH 'Host: web.example.com' http://localhost:8888/ | head -1                       # sem header
curl -sH 'Host: web.example.com' -H 'x-env: canary' http://localhost:8888/ | head -1    # com header
```

**Tarefa:** qual backend responde a cada request?

<details><summary>Solução / saída esperada</summary>

```console
$ curl -sH 'Host: web.example.com' http://localhost:8888/ | head -1
workshop-web v1
$ curl -sH 'Host: web.example.com' -H 'x-env: canary' http://localhost:8888/ | head -1
workshop-web v2
```

Mesmo path `/`, dois desfechos — a request que carrega `x-env: canary` casa com a regra mais
específica e cai no `web2` (que responde `workshop-web v2`); todo o resto escorre para o `web`.
Essa divisão baseada em header é um campo de primeira classe e validado.
No Ingress teria sido uma annotation de controller sem tipo — se é que o seu controller
suportava isso.
</details>

---

### Step 6 — quebre: um `gatewayClassName` que ninguém possui

Como um Ingress com a class errada, um Gateway apontando para uma class que nenhum controller
possui simplesmente fica parado. Prove isso com um Gateway novo.

```bash
cat > gateway-broken.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web-broken
spec:
  gatewayClassName: eg-typo        # nenhum controller possui esta class
  listeners:
    - name: http
      port: 80
      protocol: HTTP
EOF

kubectl apply -f gateway-broken.yaml
kubectl get gateway web-broken
kubectl get gateway web-broken -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
```

**Tarefa:** o apply funciona? Qual é o status do Gateway, e quem o escreveu?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply -f gateway-broken.yaml
gateway.gateway.networking.k8s.io/web-broken created
$ kubectl get gateway web-broken
NAME         CLASS     ADDRESS   PROGRAMMED   AGE
web-broken   eg-typo             Unknown      10s

$ kubectl get gateway web-broken -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
Accepted=Unknown (Pending) Waiting for controller
Programmed=Unknown (Pending) Waiting for controller

$ kubectl get gatewayclass
NAME   CONTROLLER                                      ACCEPTED   AGE
eg     gateway.envoyproxy.io/gatewayclass-controller   True       9m
# não existe GatewayClass "eg-typo" — então nada é dono deste Gateway
```

O manifesto aplica sem problemas — ele é válido pelo schema —, mas a class `eg-typo` não existe,
então **nenhum controller reconcilia o Gateway**. Aquelas conditions `Unknown (Pending) Waiting
for controller` são **defaults embutidos no próprio CRD** — nenhum controller jamais tocou neste
objeto. Compare com o Step 3: lá o controller as *substituiu* por `Accepted=True`. Essa é a
versão Gateway API do `ADDRESS` silenciosamente vazio do Ingress, exceto que aqui o status nomeia
o problema, e a pista é o `kubectl get gatewayclass`: a class que você nomeou não está lá.
</details>

**Conserte:** aponte o Gateway quebrado para a class real e observe o controller reivindicá-lo.

```bash
kubectl patch gateway web-broken --type=merge -p '{"spec":{"gatewayClassName":"eg"}}'
kubectl get gateway web-broken -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}){"\n"}{end}'

# agora ele também tem seu próprio data plane — depois remova-o, uma porta de entrada basta:
kubectl delete gateway web-broken
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl patch gateway web-broken --type=merge -p '{"spec":{"gatewayClassName":"eg"}}'
gateway.gateway.networking.k8s.io/web-broken patched
$ kubectl get gateway web-broken -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}){"\n"}{end}'
Accepted=True (Accepted)
Programmed=False (AddressNotAssigned)
$ kubectl delete gateway web-broken
gateway.gateway.networking.k8s.io/web-broken deleted
```

No instante em que um nome de class real aparece, o controller aceita o Gateway e provisiona
um data plane para ele — `Waiting for controller` vira `Accepted=True` em segundos
(o `Programmed` reporta de novo o motivo honesto do kind: sem load balancer, sem endereço). Seu
Gateway `web` original e a route dele nunca foram afetados.
</details>

**Pergunta:** antes, seu HTTPRoute mostrou `ResolvedRefs=True`. O que o tornaria
`ResolvedRefs=False`, e por que essa é uma condition da *route*, e não do *Gateway*?

<details><summary>Resposta</summary>

```console
# aponte um backendRef para um Service que não existe:
$ kubectl patch httproute web --type=json \
  -p='[{"op":"replace","path":"/spec/rules/1/backendRefs/0/name","value":"web-oops"}]'
$ kubectl get httproute web -o jsonpath='{range .status.parents[0].conditions[*]}{.type}={.status} ({.reason}) {.message}{"\n"}{end}'
Accepted=True (Accepted) Route is accepted
ResolvedRefs=False (BackendNotFound) service workshop/web-oops not found
```

O `ResolvedRefs` diz respeito a se os **`backendRefs` da route** resolvem para Services/portas reais,
o que é assunto do **time de aplicação** — por isso ele vive no HTTPRoute, e não no Gateway. O
`Accepted` (um controller é dono da class? o listener é válido?) é assunto de **infra** e vive no
Gateway. Duas conditions, dois donos — a mesma divisão de papéis de que trata a seção inteira.
Desfaça com `kubectl apply -f route-header.yaml`.
</details>

### Stretch (opcional) — um canary ponderado

Divida um path entre dois backends por **weight** — a substituição tipada de um canary baseado
em annotation. Envie `/` para `web` e `web2` em 90/10 e conte as versões nos corpos de
resposta.

```bash
cat > route-canary.yaml <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web
spec:
  parentRefs:
    - name: web
  hostnames:
    - web.example.com
  rules:
    - matches:
        - path: { type: PathPrefix, value: / }
      backendRefs:                     # divisão ponderada tipada — sem annotation
        - { name: web,  port: 80, weight: 90 }
        - { name: web2, port: 80, weight: 10 }
EOF

kubectl apply -f route-canary.yaml

for i in $(seq 1 20); do curl -s -H 'Host: web.example.com' http://localhost:8888/; done \
  | grep '^workshop-web' | sort | uniq -c
```

<details><summary>Solução / o que você está vendo</summary>

```console
$ for i in $(seq 1 20); do curl -s -H 'Host: web.example.com' http://localhost:8888/; done \
    | grep '^workshop-web' | sort | uniq -c
  18 workshop-web v1
   2 workshop-web v2
```

Aproximadamente 90/10 em 20 requests (amostras pequenas variam) — a divisão é legível direto
na linha de versão que cada backend imprime. O `weight` é um campo inteiro validado em cada
`backendRef`, então a divisão de tráfego é portável e checada pelo schema — sem annotation de
controller, sem adivinhar o formato. Desfaça com `kubectl apply -f route-header.yaml`.
</details>

## Expected state / output

- `kubectl get gatewayclass` mostra um controller com `ACCEPTED=True` — e a class só
  existe porque alguém a **declarou**; a instalação do controller não cria uma.
- Um Gateway válido chega a `Accepted=True`; no kind, `Programmed` permanece
  `False (AddressNotAssigned)` porque nenhum load balancer distribui um endereço — o proxy
  ainda serve via `port-forward`. Um `gatewayClassName` que nenhum controller possui deixa os
  defaults do CRD no lugar: `Unknown (Pending) Waiting for controller`.
- `/` responde `workshop-web v1`; `/` **com** `x-env: canary` responde `workshop-web v2` —
  um header match tipado, sem annotations.
- Um nome de Service errado no `backendRef` vira o `ResolvedRefs` do **HTTPRoute** para `False`
  (condition da route), enquanto problemas de class aparecem no `Accepted` do **Gateway**
  (condition de infra).

Status representativos incluem Pods Running/Complete/Failed, PVCs Bound, conditions Accepted de
Gateway ou TARGETS numéricos de HPA — compare o significado, não nomes efêmeros.

## Explanation

O Gateway API separa a propriedade da infra (GatewayClass / listeners do Gateway) da
propriedade da aplicação (parentRefs e backendRefs do HTTPRoute). O tráfego falha fechado até o
controller aceitar o attachment e resolver os backends, então ler os `status.conditions` aponta a
causa e identifica a faixa antes de você reescrever as regras de roteamento.

Os passos guiados acima provam o comportamento do control plane desta seção; leia os Events e os
campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Se o Gateway continuar unprogrammed ou o HTTPRoute nunca chegar a Accepted, leia
`kubectl describe gateway -n "$NS"` e `kubectl describe httproute -n "$NS"` em busca da condition
que falhou (Accepted, Programmed ou ResolvedRefs). Restabeleça um attachment sabidamente bom com
`kubectl apply -f route.yaml -n "$NS"` depois de corrigir `parentRefs` / `gatewayClassName`, e então
tente de novo `curl -fsS -H "Host: web.local" "http://${GATEWAY_IP:-127.0.0.1}/"`. Apague apenas os
objetos de lab nomeados em Cleanup / reset — não execute deleções `--all` ao vivo no namespace.

## Challenge solution

### Commands / manifest

```bash
kubectl get gatewayclass
kubectl get gateway -n "$NS" -o yaml | sed -n '/status:/,$p'
kubectl get httproute -n "$NS" -o yaml | sed -n '/status:/,$p'
kubectl apply -f route.yaml -n "$NS"
curl -fsS -H "Host: web.local" "http://${GATEWAY_IP:-127.0.0.1}/web" || \
  kubectl -n "$NS" port-forward svc/web 8080:8080
```

### Expected state / output

O HTTPRoute reporta Accepted=True e ResolvedRefs=True. Uma request roteada por path
retorna o corpo do backend `web` (ou o port-forward o alcança). O diagnóstico nomeia qual
condition de status falhou e se o campo quebrado vivia no Gateway (infra) ou no
HTTPRoute (app).

### Explanation

O Gateway API separa a propriedade da infra (GatewayClass / listeners do Gateway) da
propriedade da aplicação (parentRefs e backendRefs do HTTPRoute). O tráfego falha fechado até o
controller aceitar o attachment e resolver os backends, então ler os `status.conditions` aponta a
causa e identifica a faixa antes de você reescrever as regras de roteamento.

### Hints

Compare os status.conditions do Gateway com os parentRefs e backendRefs do HTTPRoute;
inspecione o nome da GatewayClass antes de editar a route.
