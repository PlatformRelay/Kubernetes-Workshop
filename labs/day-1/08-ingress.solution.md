# Lab 08 — Ingress (S08) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

Defina as mesmas variáveis de ambiente explícitas do lab do participante antes de executar
qualquer step:

```bash
# Defaults do kind local; participantes do cluster compartilhado substituem os quatro valores conforme instruído.
export LAB_ENV=kind
export INGRESS_CLASS="platformrelay-lab08-$(openssl rand -hex 6)"
export WEB_HOST=web.example.com
export WEB2_HOST=web2.example.com
case "$LAB_ENV" in kind|shared) ;; *) echo "LAB_ENV must be kind or shared" >&2; false ;; esac
if [ "$LAB_ENV" = shared ]; then
  kubectl get ingressclass "$INGRESS_CLASS" >/dev/null || {
    echo "Ask the facilitator for an existing permitted IngressClass" >&2
    false
  }
fi
```

### Step 1 (apenas kind) — instale o ingress controller Contour

A versão está fixada para corresponder a `infra/versions.env` (`CONTOUR_VERSION=v1.33.5`).

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl -n projectcontour rollout status deployment/contour --timeout=180s
deployment "contour" successfully rolled out
$ kubectl -n projectcontour rollout status daemonset/envoy --timeout=180s
daemon set "envoy" successfully rolled out
$ kubectl -n projectcontour get pods
NAME                            READY   STATUS      RESTARTS   AGE
contour-58f6f9b7d4-8xkvq        1/1     Running     0          90s
contour-58f6f9b7d4-tzstx        1/1     Running     0          90s
contour-certgen-v1-33-5-w6c8h   0/1     Completed   0          90s
envoy-m5kwp                     2/2     Running     0          90s
```

Duas metades, correspondendo ao modelo mental do slide: **contour** (o controller — observa
objetos Ingress) e **envoy** (o data plane — de fato faz o proxy do tráfego). O Job
`contour-certgen` roda uma vez para configurar o TLS entre eles e depois mostra `Completed`.
O DaemonSet do envoy faz bind dos **hostPorts 80/443** no node; sua configuração do kind do
Lab 00 mapeia essas portas para `127.0.0.1:80/443`, que é por onde seus curls vão entrar.
</details>

<details><summary>Caminho do cluster compartilhado — faça isto em vez dos Steps 1–2</summary>

**Não** instale nem faça patch de nada. Confirme que a class aprovada pelo facilitador existe:

```console
$ kubectl get ingressclass
NAME      CONTROLLER                             PARAMETERS   AGE
contour   projectcontour.io/ingress-controller   <none>       30d
```

Defina `INGRESS_CLASS`, `WEB_HOST` e `WEB2_HOST` com os valores fornecidos pelo facilitador.
Esta é a alternativa segura quando a política impede classes arbitrárias: pule todo step
rotulado `apenas kind`; o caminho compartilhado nunca cria, faz patch nem deleta recursos
cluster-scoped.
</details>

---

### Step 2 (apenas kind) — crie a IngressClass

O quickstart não tem objeto de class. Crie a class gerada cujo nome corresponde ao argumento
do controller adicionado no Step 1:

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply -f ingressclass.yaml
ingressclass.networking.k8s.io/contour created
$ kubectl get ingressclass "$INGRESS_CLASS"
NAME                            CONTROLLER                             PARAMETERS   AGE
platformrelay-lab08-a1b2c3d4   projectcontour.io/ingress-controller   <none>       5s
```

A **IngressClass** gerada agora existe — esse *nome* é o que seu Ingress vai referenciar em
`ingressClassName`. A string `controller:` registra qual implementação possui a class.
</details>

**Pergunta:** como o Contour decide quais Ingresses são *dele*? (Dica: é o nome.)

<details><summary>Resposta</summary>

Pelo **nome da class**. O argumento `--ingress-class-name=$INGRESS_CLASS` restringe a
instância do Contour deste lab ao nome gerado, e o objeto IngressClass publica o mesmo
contrato através da API do Kubernetes. O preflight impede que o lab reivindique um nome
existente. Em um cluster compartilhado você reutiliza a class aprovada pelo facilitador em
vez de mudar a configuração do controller.
</details>

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

Cada pod responde todo request com um corpo como `workshop-web v1` / `workshop-web v2` mais o
nome do pod — nenhum truque de ConfigMap é necessário para distinguir os backends.
</details>

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
  ingressClassName: ${INGRESS_CLASS}
  rules:
    - host: ${WEB_HOST}
      http:
        paths:
          - path: /                # tudo neste host → o backend v1
            pathType: Prefix
            backend: { service: { name: web, port: { number: 80 } } }
    - host: ${WEB2_HOST}
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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get ingress web
NAME   CLASS     HOSTS                              ADDRESS   PORTS   AGE
web    contour   web.example.com,web2.example.com             80      15s

$ kubectl describe ingress web
Name:             web
Ingress Class:    contour
Rules:
  Host              Path  Backends
  ----              ----  --------
  web.example.com
                    /   web:80 (10.244.0.11:8080,10.244.0.12:8080)
  web2.example.com
                    /   web2:80 (10.244.0.13:8080,10.244.0.14:8080)
...
```

**No kind, o `ADDRESS` fica vazio — e isso é esperado, não quebrado.** O Contour publica o IP
externo do seu Service `envoy` (tipo `LoadBalancer`) no status do Ingress, e em um cluster
kind não há provedor de load-balancer, então esse Service fica em `<pending>` para sempre.
O tráfego ainda flui: o DaemonSet do envoy escuta diretamente nas portas 80/443 do node, e a
configuração do kind do Lab 00 mapeia essas portas para `127.0.0.1`. Em um cluster de nuvem
ou compartilhado, o `ADDRESS` é preenchido com o endereço do load-balancer depois de alguns
segundos.

O `describe` é o verdadeiro health check aqui: cada host resolveu para seus **endpoints de
backend na :8080** — o controller aceitou a class, e os Services resolveram.
</details>

---

### Step 5 — roteie por host

Envie requests para o único ponto de entrada; o header `Host` decide qual backend responde.

```bash
if [ "$LAB_ENV" = kind ]; then
  curl -fsS -H "Host: $WEB_HOST" http://127.0.0.1/
  curl -fsS -H "Host: $WEB2_HOST" http://127.0.0.1/
else
  curl -fsS "http://$WEB_HOST/"
  curl -fsS "http://$WEB2_HOST/"
fi
```

**Tarefa:** qual versão responde cada hostname? Como você sabe?

<details><summary>Solução / saída esperada</summary>

Saída representativa do kind (os defaults exportados do kind são mostrados aqui):

```console
$ curl -sH 'Host: web.example.com'  http://127.0.0.1/
workshop-web v1
pod: web-6f8c9d7b4-x2lqp
requests served: 1
ready: true
$ curl -sH 'Host: web2.example.com' http://127.0.0.1/
workshop-web v2
pod: web2-7b9d5c6f8-lm4tt
requests served: 1
ready: true
```

O corpo diz na cara: `workshop-web v1` veio do Service `web`, `workshop-web v2` do `web2` —
um Ingress, um IP, fan-out por host para dois Services. O nome do pod confirma *qual réplica*
te atendeu; faça curl no mesmo host duas vezes e veja-o alternar. (O header `Host:` é como o
controller escolhe a regra; no cluster compartilhado o DNS real o fornece, então você faz
curl direto no hostname. `curl --resolve web.example.com:80:<ip>` é o truque quando o DNS não
está configurado.)
</details>

**Pergunta:** o que retorna um request para um host que o Ingress **não** define?

<details><summary>Resposta</summary>

```bash
if [ "$LAB_ENV" = kind ]; then
  curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: nope.example.com' http://127.0.0.1/
else
  # Use um host não atribuído apenas quando o facilitador confirmar que ele resolve para este endpoint de ingress.
  echo "Ask the facilitator for the shared-cluster unmatched-host check"
fi
```

**404** — direto do proxy. Nenhuma regra correspondeu ao host e este Ingress não define
`defaultBackend`, então não há para onde rotear. Um Ingress só trata hosts/paths que você
declara; todo o resto morre na porta da frente.
</details>

**Pergunta:** tutoriais antigos roteiam por *path* em um único host (`/` → v1, `/v2` → v2).
Por que este lab roteia por host?

<details><summary>Resposta</summary>

Porque o Ingress encaminha o path **como está** — e nossa aplicação só serve `/`. Com uma
regra `path: /v2`, o request que chega ao `web2` ainda tem o path `/v2`, e o backend responde
**404**. Para fan-out por path você precisa de backends que de fato sirvam esses paths, ou de
um **rewrite de path no caminho** — e um rewrite *não é expressável na spec do Ingress*. Ele
só existe como annotations específicas de controller, que é exatamente a dor de "annotation
sprawl" dos slides. A Gateway API (próxima seção) torna rewrites um **campo tipado**
(filtro `URLRewrite`).
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply -f ingress-no-pathtype.yaml
The Ingress "web" is invalid: spec.rules[0].http.paths[0].pathType: Required value: pathType must be specified
```

O manifesto é **rejeitado na hora do apply** — uma falha de validação de schema, não um 404
em runtime. Nada muda no cluster: seu Ingress funcional do Step 4 continua servindo. Como o
`pathType` não tem default no lado do servidor, um exemplo antigo que o omite (eles eram
legais na finada API `extensions/v1beta1`) não vai aplicar em um cluster moderno.
</details>

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

<details><summary>Solução / saída esperada</summary>

Saída representativa do kind:

```console
$ kubectl patch ingress web --type=merge -p '{"spec":{"ingressClassName":"platformrelay-lab08-a1b2c3d4-unowned"}}'
ingress.networking.k8s.io/web patched
$ curl -sS -o /dev/null -w 'http=%{http_code}\n' -H 'Host: web.example.com' http://127.0.0.1/ ; echo "curl exit=$?"
curl: (56) Recv failure: Connection reset by peer
http=000
curl exit=56
```

Este é o replay real de 2026-08-03 no kind/Contour. Um 404 também é válido quando o data
plane mantém um virtual host padrão. O manifesto é válido no schema, então o API server o
aceita; nenhum controller possui a class gerada `-unowned`, o Contour retira a rota, e o
sintoma depende do controller. Diagnostique comparando o `ingressClassName` com
`kubectl get ingressclass`, depois inspecione os events do Ingress e os logs do controller.
</details>

**Conserte os dois:** reaplique o manifesto bom e confirme que o roteamento se recupera.

```bash
kubectl apply -f ingress.yaml
if [ "$LAB_ENV" = kind ]; then
  curl -fsS -H "Host: $WEB_HOST" http://127.0.0.1/ | head -1
else
  curl -fsS "http://$WEB_HOST/" | head -1
fi
```

<details><summary>Solução / saída esperada</summary>

Saída representativa do kind:

```console
$ kubectl apply -f ingress.yaml
ingress.networking.k8s.io/web configured
$ curl -sH 'Host: web.example.com' http://127.0.0.1/ | head -1
workshop-web v1
```

Restaurar `ingressClassName: $INGRESS_CLASS` deixa o controller selecionado reivindicar o
Ingress de novo; ele reprograma o envoy em um ou dois segundos. (A Quebra 1 nunca tocou o
objeto vivo — o API server a rejeitou de imediato — então o patch de class era a única coisa
a desfazer.)
</details>

**Pergunta:** você também poderia *digitar errado* o pathType — `pathType: Prefixx`. Ruidoso
ou silencioso?

<details><summary>Resposta</summary>

```console
$ kubectl apply -f - <<'EOF'
... pathType: Prefixx ...
EOF
The Ingress "web" is invalid: spec.rules[0].http.paths[0].pathType: Unsupported value: "Prefixx": supported values: "Exact", "ImplementationSpecific", "Prefix"
```

Ruidoso — rejeitado pela mesma validação de schema, e o erro do texto digitado errado é
ainda mais útil: ele **lista os três valores válidos**. Regra de bolso: erros *dentro do
schema* falham ruidosamente no apply; erros *sobre o mundo ao redor do objeto* (uma class que
ninguém possui, um Service que não existe) falham silenciosamente em runtime.
</details>

## Expected state / output

- O controller são **duas metades**: um Deployment `contour` (observa a API) e um DaemonSet
  `envoy` (move os pacotes) — correspondendo ao modelo mental objeto-vs-motor.
- O quickstart **não traz IngressClass**; você mesmo criou o "casamenteiro", e
  `kubectl get ingressclass` agora prova quem possui o nome `contour`.
- No kind o **`ADDRESS` do Ingress fica vazio** (o Service `LoadBalancer` do envoy está
  `<pending>` — sem provedor de LB), e mesmo assim o roteamento **funciona** via as portas
  80/443 do node mapeadas para `127.0.0.1`. ADDRESS vazio ≠ quebrado; `describe` + `curl` são
  a verdade.
- O `$WEB_HOST` responde **`workshop-web v1`**, o `$WEB2_HOST` responde
  **`workshop-web v2`** — fan-out por host, comprovável a partir do corpo da resposta.
- Um host não declarado retorna **404** do proxy.
- Um `pathType` faltando (ou digitado errado) é **rejeitado na hora do apply** — ruidoso. Um
  `ingressClassName` errado aplica sem erro e simplesmente **para de rotear** — silencioso.

## Explanation

O objeto Ingress declara o roteamento por host/path, mas ele só funciona porque uma
IngressClass correspondente e um controller
transformam essa declaração em configuração de proxy. Erros de schema falham ruidosamente na
admission; erros de ambiente, como uma class sem dono, falham em runtime — e são a causa de
rotas que somem em silêncio. O roteamento TLS usa adicionalmente SNI antes de existirem
headers HTTP.

## Troubleshooting and recovery

Se o Ingress aplica mas não roteia, compare o
`spec.ingressClassName` com `kubectl get ingressclass` e inspecione os events do controller.
Para o kind local, desfaça o patch de class restaurando o objeto sabidamente bom com
`kubectl apply -f ingress.yaml`.
Em um cluster compartilhado, não instale nem remova o controller; peça ao facilitador a
class e os hostnames atribuídos.

## Challenge solution

### Commands / manifest

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout tls.key -out tls.crt -subj "/CN=$WEB_HOST" \
  -addext "subjectAltName=DNS:$WEB_HOST"
kubectl create secret tls web-tls -n "$NS" --cert=tls.crt --key=tls.key
kubectl patch ingress web -n "$NS" --type=merge \
  -p "{\"spec\":{\"tls\":[{\"hosts\":[\"$WEB_HOST\"],\"secretName\":\"web-tls\"}]}}"
case "$LAB_ENV" in
  kind) curl --noproxy '*' -sk --resolve "$WEB_HOST:443:127.0.0.1" "https://$WEB_HOST/" ;;
  shared) curl --noproxy '*' -sk "https://$WEB_HOST/" ;;
esac
```

### Expected state / output

O HTTPS retorna `workshop-web v1`, provando que o TLS termina na rota de Ingress selecionada.

### Explanation

No kind, `--resolve` fornece tanto o endereço de conexão quanto o SNI do TLS; um header Host
sozinho chega tarde demais para a seleção de certificado — a causa é que o handshake TLS
acontece antes de qualquer header HTTP existir. Em um cluster compartilhado, o nome DNS
fornecido pelo facilitador supre ambos.

### Hints

Faça branch em `LAB_ENV`; o kind precisa de `curl --resolve` para DNS e SNI,
enquanto clusters compartilhados usam diretamente o host DNS fornecido pelo facilitador.

### Resposta da extensão opcional

O `ingress2gateway` não é instalado nem tem versão fixada pelo bootstrap, então sua prévia
deliberadamente não faz parte da verificação do challenge. Quando uma versão aprovada já
estiver disponível, inspecione sua saída em busca de kinds de recursos da Gateway API e de
`hostnames`; não afirme uma contagem fixa de recursos entre versões.
