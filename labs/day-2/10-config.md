# Lab 10 — ConfigMap & Secret (S10)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S10 — ConfigMap & Secret |
| **Environment** | namespace ✓ / kind ✓ *(sem cluster-admin, sem CRDs)* |
| **Estimated time** | 25 min |

## Objective

Separar a configuração da image. Você vai injetar um **ConfigMap** como variáveis de
ambiente e como arquivos montados, injetar um **Secret** e decodificá-lo (provando que
base64 não é criptografia), depois **rotacionar** um valor e observar exatamente o que muda
e o que não muda — env congelado no início, um arquivo montado como diretório se
atualizando sozinho, e uma annotation de checksum forçando um rollout novo. Este é o
primeiro lab de *camadas* do Day-2: ele pega o mesmo app `web` e o torna configurável.

> **Defina seu namespace uma vez.** Tudo abaixo roda no seu namespace atribuído (ou em um
> cluster kind). Defina uma variável de shell para que todo comando seja copiável e colável:
>
> ```bash
> export NS=<your-assigned-namespace>          # usuários de kind: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Conceitos dos Labs 05–06 (Pod, Deployment). Este lab **cria seu próprio** Deployment
  `web`, então não depende de sobras de labs anteriores.
- `kubectl` contra o seu namespace atribuído **ou** um cluster kind local. Sem direitos de
  admin, sem add-ons, sem CRDs — os caminhos de namespace e de kind são **idênticos**.

## Files used

- `configmap.yaml` — o ConfigMap `web-config` (duas chaves).
- `deployment-env.yaml` — o Deployment `web` consumindo o ConfigMap como **env** (`envFrom`).
- `deployment-mounted.yaml` — o mesmo Deployment, com o ConfigMap **também montado como arquivos**.
- `secret.yaml` — o Secret `web-secret`.
- `deployment-secret.yaml` — Deployment final: env + arquivos montados + uma **env var de Secret**.

Tudo tem o label `app: s10`, então o cleanup é um único label selector.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./10-config.solution.md#guided-solutions)

### Step 1 — um ConfigMap, consumido como variáveis de ambiente

Crie o ConfigMap, depois um Deployment que puxa **todas** as chaves como env vars com
`envFrom`.

```bash
cat > configmap.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
  labels:
    app: s10
data:
  VERSION: "config-v1"    # o app de demo imprime $VERSION no corpo da própria resposta
  LOG_LEVEL: "info"
EOF

cat > deployment-env.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s10
spec:
  replicas: 1                      # uma réplica → um Pod responde toda request
  selector:
    matchLabels:
      app: s10
  template:
    metadata:
      labels:
        app: s10
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: web-config   # cada chave vira uma env var
EOF

kubectl apply -f configmap.yaml
kubectl apply -f deployment-env.yaml
kubectl rollout status deploy/web
```

**Tarefa:** confirme que as env vars realmente chegaram ao container. O app de demo imprime
sua env var `VERSION` no corpo da própria resposta, então busque-a (você vai reutilizar
estas duas linhas o lab inteiro — IPs de Pod mudam a cada rollout, então sempre releia
`POD_IP` primeiro):

```bash
POD_IP=$(kubectl get pod -l app=s10 -o jsonpath='{.items[0].status.podIP}')
kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080"
```

**Pergunta:** de onde vêm os **nomes** das env vars — das chaves do ConfigMap, ou de algo
que você definiu no container?

---

### Step 2 — monte o MESMO ConfigMap como arquivos

O mesmo objeto, uma segunda porta de entrada. Monte-o como um **diretório inteiro** (sem
`subPath`) para que cada chave vire um arquivo — e para que ele continue **atualizável**
mais tarde. A image do app de demo é **distroless** (sem shell, sem `ls`/`cat`), então o
manifesto também adiciona um pequeno sidecar **toolbox** que monta o mesmo volume — essa é
a forma honesta de olhar arquivos montados.

```bash
cat > deployment-mounted.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s10
spec:
  replicas: 1
  selector:
    matchLabels:
      app: s10
  template:
    metadata:
      labels:
        app: s10
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: web-config
          volumeMounts:
            - name: config
              mountPath: /etc/web-config     # diretório inteiro — NÃO subPath
        - name: toolbox                      # a image do app não tem shell —
          image: busybox:1.37                # este sidecar é nossa janela para dentro
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: config
              mountPath: /etc/web-config
      volumes:
        - name: config
          configMap:
            name: web-config
EOF

kubectl apply -f deployment-mounted.yaml
kubectl rollout status deploy/web
```

**Tarefa:** liste os arquivos montados e leia um — a partir do container **toolbox**
(`-c toolbox`).

```bash
kubectl exec deploy/web -c toolbox -- ls /etc/web-config
kubectl exec deploy/web -c toolbox -- cat /etc/web-config/VERSION
```

**Pergunta:** montamos em `/etc/web-config` sem `subPath`. Por que isso importa para o que
vem a seguir?

---

### Step 3 — um Secret, consumido como env var, depois decodificado

Valores sensíveis vão em um Secret. Adicione uma chave ao container como `API_TOKEN`,
depois prove que o valor é apenas **codificado em base64**, não criptografado.

```bash
cat > secret.yaml <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: web-secret
  labels:
    app: s10
type: Opaque
stringData:
  API_TOKEN: "s3cr3t"              # stringData: você escreve plaintext; o k8s armazena base64
EOF

cat > deployment-secret.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s10
spec:
  replicas: 1
  selector:
    matchLabels:
      app: s10
  template:
    metadata:
      labels:
        app: s10
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: web-config
          env:
            - name: API_TOKEN
              valueFrom:
                secretKeyRef:
                  name: web-secret
                  key: API_TOKEN
          volumeMounts:
            - name: config
              mountPath: /etc/web-config
        - name: toolbox
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: config
              mountPath: /etc/web-config
      volumes:
        - name: config
          configMap:
            name: web-config
EOF

kubectl apply -f secret.yaml
kubectl apply -f deployment-secret.yaml
kubectl rollout status deploy/web

# a fiação, como o kubelet a vê:
kubectl describe pod -l app=s10 | grep -A2 'API_TOKEN'
```

**Tarefa:** leia o Secret direto da API e recupere o plaintext.

```bash
kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}'; echo
kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}' | base64 -d; echo
```

**Pergunta:** então o que colocar um valor em um Secret (vs. um ConfigMap) realmente te dá?

---

### Step 4 — rotacione um valor: o que atualiza, o que não

Mude o ConfigMap e observe três resultados diferentes a partir de uma única edição. Esse é
o ponto central da seção.

```bash
# mude VERSION de "config-v1" para "config-v2"
kubectl patch configmap web-config --type merge -p '{"data":{"VERSION":"config-v2"}}'

# (a) a env var — o app imprime $VERSION no corpo da resposta; leia imediatamente
POD_IP=$(kubectl get pod -l app=s10 -o jsonpath='{.items[0].status.podIP}')
kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080" | head -1
```

**Tarefa:** a env var mudou?

```bash
# (b) o arquivo montado como diretório — dê ao kubelet até ~90s, depois leia
sleep 90
kubectl exec deploy/web -c toolbox -- cat /etc/web-config/VERSION
```

**Tarefa:** o arquivo montado mudou?

```bash
# (c) force novos Pods para o ENV pegar a mudança — o truque da annotation de checksum
kubectl patch deploy web -p \
  '{"spec":{"template":{"metadata":{"annotations":{"checksum/config":"v2"}}}}}'
kubectl rollout status deploy/web

# novo Pod → novo IP → releia, depois busque de novo
POD_IP=$(kubectl get pod -l app=s10 -o jsonpath='{.items[0].status.podIP}')
kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080" | head -1
```

**Tarefa:** depois do rollout, o que a env var mostra?

**Pergunta (a principal):** por que a env var não mudou, mas o arquivo montado sim?

**Pergunta:** em produção, o que você colocaria naquela annotation `checksum/config` para
que um rollout aconteça automaticamente sempre que a config mudar?

## Observe

- `envFrom` mapeia cada chave do ConfigMap para uma env var; `valueFrom` mapeia uma chave.
  A `VERSION` injetada fica visível no corpo da própria resposta do app
  (`workshop-web config-v1`).
- O mesmo ConfigMap montado como **diretório** projeta um arquivo por chave — leia através
  do sidecar `toolbox`, porque a image distroless do app não tem shell.
- Um valor de Secret lido da API é **base64** (`czNjcjN0` → `s3cr3t`) — codificação, não
  criptografia; o `describe` mostra apenas a referência, nunca o valor.
- Editando um ConfigMap: **env var inalterada** (o corpo ainda mostra `config-v1`), o
  **arquivo montado como diretório atualiza** em ~60–90s, e uma **mudança no pod template**
  (annotation de checksum / `rollout restart`) é o que atualiza o env (o corpo passa a
  mostrar `config-v2`).

## Challenge

Depois de rotacionar uma chave de ConfigMap que um Deployment consome como variável de
ambiente, o Pod ainda imprime o valor antigo. Prove se o congelamento é a injeção de env,
um mount com subPath ou um rollout faltando — depois faça o novo valor aparecer no processo.

**Difficulty:** Intermediate

**Success criteria:** Mostre o output de env desatualizado, faça o restore de um rollout
para que o Pod imprima o valor rotacionado, e explique por que um mount de arquivo em
diretório inteiro teria atualizado sem essa recriação.

**Hints:** Compare kubectl exec printenv com um arquivo sob o volume do ConfigMap; procure
por subPath no mount e por uma annotation de checksum no template do Pod.

[Spoiler: solução do challenge](./10-config.solution.md#challenge-solution)

## Verify

Confirme que o consumo do ConfigMap/Secret ainda é observável antes do cleanup.

```bash
kubectl get configmap,secret,deploy,pods -n "$NS" -l app=s10
```

Esperado: os Deployments do lab estão Running e ainda referenciam os objetos
ConfigMap/Secret que você criou.

## Cleanup / reset

```bash
# cleanup com escopo — tudo que este lab criou tem o label app=s10
kubectl delete configmap,secret,deployment -l app=s10 -n "$NS" --ignore-not-found
rm -f configmap.yaml deployment-env.yaml deployment-mounted.yaml secret.yaml deployment-secret.yaml

# reset de pânico (namespace): também remove qualquer outra coisa que sobrou no seu namespace
# kubectl delete deploy,rs,pod,configmap,secret --all -n "$NS" --ignore-not-found
# reset de pânico (kind): make kind-down && make kind-up   # ou: kind delete cluster
```

## Stretch (opcional) — um ConfigMap imutável

Prove que `immutable: true` bloqueia edições in-place, de forma que um valor novo exige um
objeto novo.

```bash
cat > configmap-immutable.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config-v1
  labels:
    app: s10
immutable: true
data:
  GREETING: "locked"
EOF

kubectl apply -f configmap-immutable.yaml
# agora tente alterá-lo in place:
kubectl patch configmap web-config-v1 --type merge -p '{"data":{"GREETING":"nope"}}'
```
