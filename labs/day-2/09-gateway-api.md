# Lab 09 — Gateway API (S09)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S09 — Gateway API *("linha vermelha" 5/5)* |
| **Environment** | namespace ✓ / kind ✓ *(CRDs + um Gateway controller necessários)* |
| **Estimated time** | 25 min |

## Objective

Substituir um Ingress pelo seu sucessor tipado e com separação de papéis: um **Gateway** (o ponto
de entrada, de propriedade da infra) mais um **HTTPRoute** (as regras, de propriedade do time de
aplicação) que roteia para os **mesmos** Services `web`/`web2` dos Labs 07–08. Você vai ler
`status.conditions` para ver *por que* a conexão aconteceu (ou não), adicionar um **header match** e
apontar um Gateway para um `gatewayClassName` que ninguém possui, para observar seu status
permanecer em `Waiting for controller`. Passo **5 de 5** da red line — esta porta de entrada
**substitui** o `ingress.yaml` do Lab 08; os backends não mudam.

> **Honestidade sobre o ambiente.** Gateway API é **CRDs + um controller**, exatamente como Ingress.
>
> - **kind:** você instala os dois por conta própria (admin) — este caminho é **apenas para kind**
>   na etapa de instalação. Caminho preferido do facilitador: `./workshop profile gateway-envoy`
>   (profile canônico da S09; mutuamente exclusivo com Contour / `ingress-contour`). Sempre defina
>   `gatewayClassName: eg` explicitamente — não dependa de qual GatewayClass por acaso é
>   a padrão.
> - **Cluster compartilhado:** os CRDs e um controller já vêm **provisionados**; seu facilitador
>   informa o nome da `GatewayClass` (os exemplos abaixo usam `eg`). Você **não instala nada**
>   — pule o Step 1 e use o nome da class compartilhada em todos os lugares.
>
> **Checagem na hora da entrega.** Este lab fixa o **Gateway API v1.5.1** (standard channel) e o
> **Envoy Gateway v1.8.2** — a release de CRDs contra a qual esse controller é compilado e
> testado em conformance (`infra/versions.env` é o arquivo de pins). Verifique novamente os dois
> pins antes da sessão; pode existir um standard channel mais novo, mas sempre instale a versão
> de CRDs **contra a qual o seu controller compila**. As duas URLs de release abaixo são as
> únicas linhas sensíveis a versão.

## Prerequisites

- Conceitos dos Labs 05–08 (Deployment, Service, Ingress). Este lab **recria seus próprios
  backends**, então não depende de sobras do Lab 08.
- Caminho kind: `kind` + um container engine, e acesso admin ao seu cluster.
- Caminho do cluster compartilhado: seu namespace atribuído `$NS` e o nome da
  **GatewayClass** pré-instalada (pergunte ao facilitador).

## Files used

- `backends.yaml` — dois Deployments + Services (`web` em `workshop-web:v1`, `web2` em
  `:v2`) cujos corpos de resposta nomeiam o pod e a versão (os backends que ficam atrás do Gateway).
- `gatewayclass.yaml` — a `GatewayClass` que nomeia o controller (caminho kind).
- `gateway.yaml` — o `Gateway` com um listener HTTP na `:80`.
- `route.yaml` — o `HTTPRoute` que se anexa ao Gateway e roteia por path.
- `route-header.yaml` — o `route.yaml` mais um header match para `web2` (Step 5).
- `gateway-broken.yaml` — um Gateway com um `gatewayClassName` que ninguém possui (Step 6).
- `route-canary.yaml` — uma divisão ponderada 90/10 (stretch).

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./09-gateway-api.solution.md#guided-solutions)

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

**Pergunta:** o HTTPRoute lista `hostnames: [web.example.com]`. O que acontece com uma request
cujo header `Host` é outra coisa?

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

**Conserte:** aponte o Gateway quebrado para a class real e observe o controller reivindicá-lo.

```bash
kubectl patch gateway web-broken --type=merge -p '{"spec":{"gatewayClassName":"eg"}}'
kubectl get gateway web-broken -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}){"\n"}{end}'

# agora ele também tem seu próprio data plane — depois remova-o, uma porta de entrada basta:
kubectl delete gateway web-broken
```

**Pergunta:** antes, seu HTTPRoute mostrou `ResolvedRefs=True`. O que o tornaria
`ResolvedRefs=False`, e por que essa é uma condition da *route*, e não do *Gateway*?

## Observe

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

## Challenge

O HTTPRoute de um colega se anexa ao seu Gateway, mas o tráfego nunca chega.
Diagnostique se a falha está na GatewayClass, nos parentRefs ou em um descasamento de selector
do backend — sem reescrever a regra de path que funciona, do Step 4.

**Difficulty:** Intermediate

**Success criteria:** Identifique a condition de status que falhou (Accepted, Programmed ou ResolvedRefs),
prove a recuperação restaurando uma resposta HTTP bem-sucedida do backend roteado por path e
explique qual faixa de propriedade (infra vs app) era dona do campo quebrado.

**Hints:** Compare os status.conditions do Gateway com os parentRefs e backendRefs do HTTPRoute;
inspecione o nome da GatewayClass antes de editar a route.

[Spoiler: solução do challenge](./09-gateway-api.solution.md#challenge-solution)

## Verify

Confirme o attachment do caminho feliz do Gateway antes do cleanup.

```bash
kubectl get gatewayclass
kubectl get gateway,httproute -n "$NS"
curl -fsS -H "Host: web.local" "http://${GATEWAY_IP:-127.0.0.1}/" || true
```

Esperado: uma GatewayClass está Accepted, seus objetos Gateway/HTTPRoute ainda existem, e uma
request roteada por path ou por host alcança um backend (port-forward serve no kind).

## Cleanup / reset

```bash
# pare o port-forward em background do Step 4:
kill %1 2>/dev/null

kubectl delete -f route-header.yaml -f gateway.yaml -f backends.yaml --ignore-not-found
kubectl delete gateway web-broken --ignore-not-found   # se o Step 6 ficou pela metade
rm -f gateway-broken.yaml route.yaml route-canary.yaml # arquivos locais

# reset de pânico (namespace): remove também qualquer outra coisa deixada no seu namespace
# kubectl delete httproute,gateway,svc,deploy,rs,pod --all -n "$NS" --ignore-not-found
# reset de pânico (kind): make kind-down && make kind-up   # ou: kind delete cluster --name workshop

# apenas kind — remova a GatewayClass, o controller e os CRDs para um estado limpo:
# kubectl delete -f gatewayclass.yaml --ignore-not-found
# kubectl delete -f https://github.com/envoyproxy/gateway/releases/download/v1.8.2/install.yaml
# kubectl delete -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.5.1/standard-install.yaml
```

## Stretch (opcional) — um canary ponderado

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
