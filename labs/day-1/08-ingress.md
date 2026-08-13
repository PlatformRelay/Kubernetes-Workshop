# Lab 08 — Ingress (S08)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S08 — Ingress *("linha vermelha" 4/5)* |
| **Environment** | namespace ✓ / kind ✓ *(ingress controller obrigatório)* |
| **Estimated time** | 25 min |

## Objective

Colocar um **Ingress** na frente dos seus Services para rotear HTTP externo por **host** para
dois backends, e aprender a dura verdade de que um objeto `Ingress` não faz nada sem um
**controller** rodando por trás dele. Passo **4 de 5** da red line: o Ingress é o ponto de
entrada north-south na frente do padrão de Service do Lab 07.

O controller deste lab é o **Contour** (CNCF, baseado em Envoy). A *API* de Ingress está
congelada, mas é estável e está em todo lugar; seu controller de referência de longa data
(ingress-nginx) foi aposentado em março de 2026, então o controller por trás da API agora é
uma escolha que você faz — aqui, Contour.

> **Honestidade de ambiente.** O Ingress precisa de um **ingress controller** cluster-wide.
>
> - **kind:** você mesmo instala um (admin) — Contour, a partir de um quickstart com versão
>   fixada. Seu cluster do Lab 00 já publica as portas 80/443 em `localhost`, então nenhum
>   rebuild do cluster é necessário. Caminho preferido do facilitador:
>   `./workshop profile ingress-contour` (mutuamente exclusivo com `gateway-envoy` — nunca
>   execute os dois). Defina o `ingressClassName` explicitamente; não dependa de uma class
>   padrão.
> - **Cluster compartilhado:** o controller já existe; seu facilitador te dá **hostnames**
>   que roteiam até ele. Você **não** instala nada.
>
> Siga o caminho do seu ambiente; ambos convergem para o mesmo manifesto de Ingress e os
> mesmos curls.

## Prerequisites

- Conceitos dos Labs 05–07 (Deployment + Service). Este lab **recria seus próprios backends**,
  então não depende de sobras do Lab 07.
- Lab 00 concluído: `$NS` está definido e é seu namespace padrão
  (`kubectl config view --minify | grep namespace:` o exibe).
- Caminho kind: o cluster `workshop` do Lab 00 (criado a partir de `infra/kind/cluster.yaml`,
  que mapeia as portas 80/443 do container para `127.0.0.1:80/443`) e admin sobre ele.
- Caminho do cluster compartilhado: seu namespace atribuído `$NS`, o **nome da class** do
  ingress controller e dois **hostnames DNS** atribuídos que resolvem para o endpoint do ingress.

Escolha exatamente um ambiente e defina as quatro variáveis. Participantes do cluster
compartilhado devem substituir os placeholders pelos valores do facilitador; não reutilize os
exemplos do kind.

```bash
# kind local: gere um nome de class específico do workshop para este cluster descartável.
export LAB_ENV=kind
export INGRESS_CLASS="platformrelay-lab08-$(openssl rand -hex 6)"
export WEB_HOST=web.example.com
export WEB2_HOST=web2.example.com

# Cluster compartilhado (use estas quatro linhas no lugar, com os valores reais atribuídos):
# export LAB_ENV=shared
# export INGRESS_CLASS=<facilitator-provided-class>
# export WEB_HOST=<assigned-v1-dns-hostname>
# export WEB2_HOST=<assigned-v2-dns-hostname>

case "$LAB_ENV" in kind|shared) ;; *) echo "LAB_ENV must be kind or shared" >&2; false ;; esac
if [ "$LAB_ENV" = shared ]; then
  kubectl get ingressclass "$INGRESS_CLASS" >/dev/null || {
    echo "Ask the facilitator for an existing permitted IngressClass" >&2
    false
  }
fi
```

## Files used

- `backends.yaml` — dois Deployments + Services: `web` (image `workshop-web:v1`) e `web2`
  (image `workshop-web:v2`). A image do workshop é um pequeno servidor Go em **:8080** cujo
  corpo de resposta imprime sua **versão**, nome do pod, contagem de requests e readiness —
  assim você sempre sabe qual backend respondeu.
- `ingressclass.yaml` — a IngressClass gerada, específica do workshop (caminho kind; Step 2).
- `ingress.yaml` — o Ingress que roteia `$WEB_HOST` → `web` e `$WEB2_HOST` → `web2`
  (o manifesto que o magic-move do slide constrói).
- `ingress-no-pathtype.yaml` — uma cópia deliberadamente quebrada com o `pathType` removido
  (Step 6).

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./08-ingress.solution.md#guided-solutions)

### Step 1 (apenas kind) — instale o ingress controller Contour

A versão está fixada para corresponder a `infra/versions.env` (`CONTOUR_VERSION=v1.33.5`).

Primeiro prove que a class gerada ainda não foi reivindicada nem por um objeto IngressClass
nem por um argumento de controller. Pare em vez de assumir uma colisão. Depois instale o Contour
e configure o controller deste lab para observar apenas essa class.

```bash
if kubectl get ingressclass "$INGRESS_CLASS" >/dev/null 2>&1 ||
   kubectl get deployment -A \
     -o jsonpath='{range .items[*]}{range .spec.template.spec.containers[*].args}{.}{"\n"}{end}{end}' \
     | grep -Fx -- "--ingress-class-name=$INGRESS_CLASS"; then
  echo "Ingress class collision: $INGRESS_CLASS" >&2
  false
fi

kubectl apply -f https://raw.githubusercontent.com/projectcontour/contour/v1.33.5/examples/render/contour.yaml
kubectl -n projectcontour patch deployment contour --type=json \
  -p="[{\"op\":\"add\",\"path\":\"/spec/template/spec/containers/0/args/-\",\"value\":\"--ingress-class-name=$INGRESS_CLASS\"}]"

# Espere até que as duas metades estejam prontas: o controller contour (Deployment)
# e o data plane envoy (DaemonSet):
kubectl -n projectcontour rollout status deployment/contour --timeout=180s
kubectl -n projectcontour rollout status daemonset/envoy --timeout=180s
kubectl -n projectcontour get pods
```

---

### Step 2 (apenas kind) — crie a IngressClass

O quickstart do Contour não traz nenhum objeto IngressClass. Crie agora o "casamenteiro"
gerado; seu nome também é o argumento de class que você adicionou ao Deployment do Contour
deste lab:

```bash
cat > ingressclass.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: ${INGRESS_CLASS}
spec:
  controller: projectcontour.io/ingress-controller
EOF

kubectl apply -f ingressclass.yaml
kubectl get ingressclass "$INGRESS_CLASS"
kubectl -n projectcontour get deployment contour \
  -o jsonpath='{.spec.template.spec.containers[0].args}' | grep -F -- "--ingress-class-name=$INGRESS_CLASS"
```

**Pergunta:** como o Contour decide quais Ingresses são *dele*? (Dica: é o nome.)

---

### Step 3 — implante dois backends distinguíveis

O `web` roda a image do workshop em **v1**, o `web2` a mesma image em **v2**. O servidor
escuta na **8080** dentro do container; cada Service a expõe como porta **80** (`port: 80` →
`targetPort: 8080`) — então tudo downstream fala com a porta do Service.

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

### Step 4 — adicione o Ingress

Um Ingress, um ponto de entrada, **dois hosts**: o header `Host` decide qual Service recebe
o request.

```bash
cat > ingress.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: ${INGRESS_CLASS}  # deve corresponder a `kubectl get ingressclass`
  rules:
    - host: ${WEB_HOST}
      http:
        paths:
          - path: /                # tudo neste host → o backend v1
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
    - host: ${WEB2_HOST}           # segundo site, mesmo ponto de entrada único
      http:
        paths:
          - path: /                # → o backend v2
            pathType: Prefix
            backend: { service: { name: web2, port: { number: 80 } } }
EOF

kubectl apply -f ingress.yaml
kubectl get ingress web
kubectl describe ingress web      # confirme as rules, o pathType e os backends
```

> Este é o mesmo manifesto que o magic-move do slide constrói campo a campo. O `backend` de
> cada regra aponta para um **Service** (nunca um Pod diretamente), e o número de porta **80**
> é a porta do *Service* — o Service o mapeia para a 8080 do container. Todo path **precisa**
> carregar um `pathType` — o Step 6 prova o que acontece quando não carrega.

---

### Step 5 — roteie por host

Envie requests para o único ponto de entrada; o header `Host` decide qual backend responde.

```bash
if [ "$LAB_ENV" = kind ]; then
  # O Envoy está publicado no loopback; o Host seleciona a regra do Ingress.
  curl -fsS -H "Host: $WEB_HOST" http://127.0.0.1/
  curl -fsS -H "Host: $WEB2_HOST" http://127.0.0.1/
else
  # Os nomes DNS atribuídos resolvem para o endpoint de ingress gerenciado pelo facilitador.
  curl -fsS "http://$WEB_HOST/"
  curl -fsS "http://$WEB2_HOST/"
fi
```

**Tarefa:** qual versão responde cada hostname? Como você sabe?

**Pergunta:** o que retorna um request para um host que o Ingress **não** define?

**Pergunta:** tutoriais antigos roteiam por *path* em um único host (`/` → v1, `/v2` → v2).
Por que este lab roteia por host?

---

### Step 6 — quebre duas vezes: uma falha ruidosa, uma silenciosa

**Quebra 1 (ruidosa).** O `pathType` **não tem default** — o API server o exige em todo
path. Prove: escreva uma cópia do Ingress com o campo removido e tente aplicá-la.

```bash
cat > ingress-no-pathtype.yaml <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
spec:
  ingressClassName: ${INGRESS_CLASS}
  rules:
    - host: ${WEB_HOST}
      http:
        paths:
          - path: /                # pathType deliberadamente omitido
            backend: { service: { name: web, port: { number: 80 } } }
EOF

kubectl apply -f ingress-no-pathtype.yaml
```

**Tarefa:** o apply funciona? Qual é o erro, e sobre qual linha ele é?

**Quebra 2 (silenciosa).** Agora aponte o `ingressClassName` para uma class gerada que
**ninguém possui**:

```bash
UNOWNED_CLASS="${INGRESS_CLASS}-unowned"
kubectl get ingressclass "$UNOWNED_CLASS" --ignore-not-found
kubectl patch ingress web --type=merge \
  -p "{\"spec\":{\"ingressClassName\":\"$UNOWNED_CLASS\"}}"
if [ "$LAB_ENV" = kind ]; then
  curl -sS -o /dev/null -w 'http=%{http_code}\n' \
    -H "Host: $WEB_HOST" http://127.0.0.1/ ; echo "curl exit=$?"
else
  curl -sS -o /dev/null -w 'http=%{http_code}\n' \
    "http://$WEB_HOST/" ; echo "curl exit=$?"
fi
```

**Tarefa:** o patch funcionou, mas o roteamento parou. Dependendo da configuração atual do
controller, o curl pode receber um 404 ou um reset (`http=000`). Por que a API aceitou a
mudança, e onde você diagnosticaria isso?

**Conserte os dois:** reaplique o manifesto bom e confirme que o roteamento se recupera.

```bash
kubectl apply -f ingress.yaml
if [ "$LAB_ENV" = kind ]; then
  curl -fsS -H "Host: $WEB_HOST" http://127.0.0.1/ | head -1
else
  curl -fsS "http://$WEB_HOST/" | head -1
fi
```

**Pergunta:** você também poderia *digitar errado* o pathType — `pathType: Prefixx`. Ruidoso
ou silencioso?

## Observe

- O controller são **duas metades**: um Deployment `contour` (observa a API) e um DaemonSet
  `envoy` (move os pacotes) — correspondendo ao modelo mental objeto-vs-motor.
- O quickstart **não traz IngressClass**; no kind você gerou um nome específico do workshop
  sem dono, configurou o Contour para observá-lo e criou o objeto de class correspondente. Em
  clusters compartilhados, você reutilizou apenas a class existente aprovada pelo facilitador.
- No kind o **`ADDRESS` do Ingress fica vazio** (o Service `LoadBalancer` do envoy está
  `<pending>` — sem provedor de LB), e mesmo assim o roteamento **funciona** via as portas
  80/443 do node mapeadas para `127.0.0.1`. ADDRESS vazio ≠ quebrado; `describe` + `curl` são
  a verdade.
- O `$WEB_HOST` responde **`workshop-web v1`**, o `$WEB2_HOST` responde
  **`workshop-web v2`** — fan-out por host, comprovável a partir do corpo da resposta.
- Um host não declarado retorna **404** do proxy.
- Um `pathType` faltando (ou digitado errado) é **rejeitado na hora do apply** — ruidoso. Um
  `ingressClassName` errado aplica sem erro e simplesmente **para de rotear** — silencioso.

## Challenge

Crie um cert autoassinado como um Secret e referencie-o no Ingress.

**Difficulty:** Advanced

**Success criteria:** Prove que o HTTPS chega ao backend correto no ambiente que você
selecionou, reporte a versão da aplicação retornada e explique por que o TLS precisa de SNI
em vez de apenas um header Host de HTTP.

**Hints:** Faça branch em `LAB_ENV`; o kind precisa de `curl --resolve` para DNS e SNI,
enquanto clusters compartilhados usam diretamente o host DNS fornecido pelo facilitador.

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout tls.key -out tls.crt -subj "/CN=$WEB_HOST" \
  -addext "subjectAltName=DNS:$WEB_HOST"
kubectl create secret tls web-tls -n "$NS" --cert=tls.crt --key=tls.key
kubectl patch ingress web -n "$NS" --type=merge \
  -p "{\"spec\":{\"tls\":[{\"hosts\":[\"$WEB_HOST\"],\"secretName\":\"web-tls\"}]}}"
if [ "$LAB_ENV" = kind ]; then
  curl --noproxy '*' -sk --resolve "$WEB_HOST:443:127.0.0.1" \
    "https://$WEB_HOST/" | head -1
else
  curl -sk "https://$WEB_HOST/" | head -1
fi
```

[Spoiler: solução do challenge](./08-ingress.solution.md#challenge-solution)

### Extension 2 (opcional, somente leitura) — prévia da tradução para Gateway API

Esta extensão **não faz parte dos critérios de sucesso nem da verificação do challenge**. O
bootstrap não instala nem fixa a versão desta ferramenta, e o formato da saída pode variar
por versão; pule quando ela não estiver disponível.

A ponte do slide da aposentadoria é uma ferramenta real: **`ingress2gateway`**
([kubernetes-sigs/ingress2gateway](https://github.com/kubernetes-sigs/ingress2gateway))
converte mecanicamente recursos Ingress em recursos da Gateway API. Se você a tiver
instalada, execute-a contra seu manifesto — ela não muda nada no cluster:

```bash
# Os providers são nomeados pelos dialetos de annotation que a ferramenta consegue
# traduzir; nosso Ingress usa apenas campos da spec, então a escolha do provider aqui
# só diz à ferramenta qual nome de ingress class ler:
ingress2gateway print --providers=ingress-nginx \
  --ingress-nginx-ingress-class="$INGRESS_CLASS" --input-file ingress.yaml
```

**Tarefa:** quais kinds da Gateway API aparecem na saída, e para onde foram suas duas regras
`host:`?

## Verify

Verifique o objeto vivo e as duas rotas antes do cleanup.

```bash
kubectl get ingress web -n "$NS"
if [ "$LAB_ENV" = kind ]; then
  curl --noproxy '*' -fkSs --resolve "$WEB_HOST:443:127.0.0.1" \
    "https://$WEB_HOST/" | head -1
  curl -fsS -H "Host: $WEB2_HOST" http://127.0.0.1/ | head -1
else
  curl -fkSs "https://$WEB_HOST/" | head -1
  curl -fsS "http://$WEB2_HOST/" | head -1
fi
```

Esperado: o Ingress existe; os dois requests imprimem `workshop-web v1` e
`workshop-web v2`, respectivamente.

## Cleanup / reset

```bash
kubectl delete -f ingress.yaml -f backends.yaml -n "$NS" --ignore-not-found
rm -f ingress-no-pathtype.yaml   # a cópia quebrada nunca foi aplicada; só um arquivo local
kubectl delete secret web-tls -n "$NS" --ignore-not-found   # Secret TLS do Challenge (o Verify precisa de HTTPS)
rm -f tls.key tls.crt                              # arquivos do cert autoassinado do Challenge
# reset completo do namespace:
kubectl delete ingress,svc,deploy,rs,pod --all -n "$NS" --ignore-not-found

# apenas kind — remova os recursos cluster-scoped que este lab instalou:
if [ "$LAB_ENV" = kind ]; then
  kubectl delete -f ingressclass.yaml --ignore-not-found
  kubectl delete -f https://raw.githubusercontent.com/projectcontour/contour/v1.33.5/examples/render/contour.yaml --ignore-not-found
fi
```
