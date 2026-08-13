# Lab 10 — ConfigMap & Secret (S10) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080"
workshop-web config-v1
pod: web-5f6c8b9d4-abcde
requests served: 1
ready: true
```

A primeira linha diz **`config-v1`** — a image foi construída como `v1`, mas a chave
`VERSION` do ConfigMap a sobrescreveu via ambiente. Essa única linha é a prova de que a
injeção funcionou. `envFrom` + `configMapRef` mapeia **cada chave** do ConfigMap para uma
env var de mesmo nome (então `LOG_LEVEL` também é definida — `kubectl describe pod -l app=s10`
mostra a fiação `Environment Variables from: web-config ConfigMap`). Use `valueFrom` +
`configMapKeyRef` quando quiser apenas uma chave, possivelmente sob um nome de variável
diferente.
</details>

**Pergunta:** de onde vêm os **nomes** das env vars — das chaves do ConfigMap, ou de algo
que você definiu no container?

<details><summary>Resposta</summary>

Com `envFrom`, os nomes das variáveis **são** as chaves do ConfigMap ao pé da letra
(`VERSION`, `LOG_LEVEL`). É por isso que chaves destinadas ao `envFrom` precisam ser nomes
válidos de env var. Com `valueFrom.configMapKeyRef` você escolhe tanto a chave de origem
**quanto** o nome da variável de destino, então pode renomear ou expor apenas uma chave.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl exec deploy/web -c toolbox -- ls /etc/web-config
LOG_LEVEL
VERSION
$ kubectl exec deploy/web -c toolbox -- cat /etc/web-config/VERSION
config-v1
```

Cada **chave** do ConfigMap é projetada como um **arquivo** cujo conteúdo é o valor. Os
dois containers montam o mesmo volume, então o que o toolbox vê é exatamente o que o app
vê. Como montamos o diretório inteiro (sem `subPath`), o Kubernetes mantém esse diretório
em sincronia com o objeto — você vai usar isso no Step 4.
</details>

**Pergunta:** montamos em `/etc/web-config` sem `subPath`. Por que isso importa para o que
vem a seguir?

<details><summary>Resposta</summary>

Um mount de ConfigMap em **diretório inteiro** é atualizado pelo kubelet quando o objeto
muda (em ~60–90s). Um mount com **`subPath`** copia o arquivo **uma vez**, no momento do
mount, e depois **nunca** mais atualiza — ele se comporta como uma env var. Se você precisa
de atualizações ao vivo a partir de um arquivo montado, **não** use `subPath`.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl describe pod -l app=s10 | grep -A2 'API_TOKEN'
      API_TOKEN:  <set to the key 'API_TOKEN' in secret 'web-secret'>  Optional: false
$ kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}'; echo
czNjcjN0
$ kubectl get secret web-secret -o jsonpath='{.data.API_TOKEN}' | base64 -d; echo
s3cr3t
```

Note o que o `describe` mostra: a **referência** (`<set to the key … in secret …>`), nunca
o valor — uma das garantias de manuseio do Secret. Mas o valor em si é pouco protegido: o
valor armazenado é `czNjcjN0` — puro **base64**, reversível por qualquer um com `get` no
Secret. Um Secret **não** é criptografado na API. Suas proteções reais são o **RBAC** (quem
pode lê-lo) e a **criptografia at-rest do etcd** (quem pode ler o disco). `stringData` é
uma conveniência de escrita — você escreve plaintext, a API armazena base64 sob `data`.
</details>

**Pergunta:** então o que colocar um valor em um Secret (vs. um ConfigMap) realmente te dá?

<details><summary>Resposta</summary>

Manuseio, não criptografia: Secrets são controlados por RBAC separadamente dos ConfigMaps,
ficam fora da maior parte da saída de logs/describe, podem ser criptografados at-rest no
etcd e carregam um `type` (`Opaque`, `kubernetes.io/tls`, `kubernetes.io/dockerconfigjson`)
que diz aos consumidores o que eles contêm. O valor em si continua sendo base64 — trate
"pode fazer `get secrets`" como "pode ler todos os secrets".
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080" | head -1
workshop-web config-v1
```

**Não.** Variáveis de ambiente são lidas **uma vez**, quando o container inicia. Editar o
ConfigMap mudou o objeto, não o processo em execução — o corpo da resposta ainda diz
`config-v1`. O valor antigo persiste até o Pod ser recriado.
</details>

```bash
# (b) o arquivo montado como diretório — dê ao kubelet até ~90s, depois leia
sleep 90
kubectl exec deploy/web -c toolbox -- cat /etc/web-config/VERSION
```

**Tarefa:** o arquivo montado mudou?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl exec deploy/web -c toolbox -- cat /etc/web-config/VERSION
config-v2
```

**Sim** — mas não instantaneamente. O kubelet ressincroniza mounts de ConfigMap em
diretório inteiro no seu próprio ciclo (tipicamente abaixo de ~90s). Se ainda mostrar
`config-v1`, aguarde um pouco mais e execute de novo; **não** está quebrado. (Um mount com
`subPath` teria ficado em `config-v1` para sempre.) Então o mesmo Pod agora contém **as
duas** verdades ao mesmo tempo: o env diz `config-v1`, o arquivo diz `config-v2`.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl patch deploy web -p '{"spec":{"template":{"metadata":{"annotations":{"checksum/config":"v2"}}}}}'
deployment.apps/web patched
$ kubectl rollout status deploy/web
deployment "web" successfully rolled out
$ kubectl run tmp -i --rm --restart=Never --image=busybox:1.37 -- wget -qO- "http://$POD_IP:8080" | head -1
workshop-web config-v2
```

Mudar o **pod template** (aqui, uma annotation `checksum/config`) faz o Deployment fazer o
rollout de novos Pods, e novos Pods leem o ConfigMap atual — então o corpo da resposta
agora diz `config-v2`. `kubectl rollout restart deploy/web` faz a mesma coisa manualmente;
a annotation é a versão que você pode automatizar.
</details>

**Pergunta (a principal):** por que a env var não mudou, mas o arquivo montado sim?

<details><summary>Resposta</summary>

Eles têm modelos de atualização diferentes. **Env vars** são materializadas **uma vez** no
início do container e nunca relidas — a única forma de mudá-las é substituir o Pod. Um
**mount de arquivo em diretório inteiro** é **mantido em sincronia** pelo kubelet, então
reflete o novo valor após um pequeno atraso, sem nenhum restart. (Se tivéssemos usado
`subPath`, o arquivo se comportaria como a env var — congelado.)
</details>

**Pergunta:** em produção, o que você colocaria naquela annotation `checksum/config` para
que um rollout aconteça automaticamente sempre que a config mudar?

<details><summary>Resposta</summary>

Um **hash do conteúdo do ConfigMap/Secret** (ex.: `sha256sum` do manifesto renderizado).
Quando a config muda, o hash muda, a annotation do pod template muda, e um rolling update
normal entrega o novo valor — sem passo manual. O Helm (`checksum/config:
{{ include ... | sha256sum }}`) e o Kustomize (nomes de ConfigMap com hash via
`configMapGenerator`) automatizam exatamente isso.
</details>

### Stretch (opcional) — um ConfigMap imutável

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

<details><summary>Solução / o que você está vendo</summary>

```console
$ kubectl patch configmap web-config-v1 --type merge -p '{"data":{"GREETING":"nope"}}'
The ConfigMap "web-config-v1" is invalid: data: Forbidden: field is immutable when
`immutable` is set
```

A API **rejeita** a edição — o `data` de um objeto imutável nunca pode mudar. Para lançar
um valor novo, você cria `web-config-v2` e reaponta o Deployment. A recompensa: o kubelet
para de observar objetos imutáveis (menos carga na API em escala) e nenhuma edição
acidental pode reconfigurar silenciosamente Pods em execução. Limpe com:
`kubectl delete configmap web-config-v1 -n "$NS"`.
</details>

## Expected state / output

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

Status representativos incluem Pods Running/Complete/Failed, PVCs Bound, conditions
Accepted de Gateway ou TARGETS numéricos de HPA — compare o significado, não nomes
efêmeros.

## Explanation

Variáveis de ambiente são resolvidas uma única vez quando o container inicia, e é essa a
causa de edições de ConfigMap ou Secret não reescreverem o env de um processo em execução.
Mounts de arquivo sem subPath são projetados e eventualmente se atualizam; mounts com
subPath congelam como o env. Uma annotation de checksum ou um rollout explícito recria os
Pods para que eles peguem os novos dados.

Os passos guiados acima provam o comportamento do control plane para esta seção; leia os
Events e os campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Se uma chave de ConfigMap rotacionada ainda imprime o valor antigo de env, confirme o
congelamento com `kubectl exec deploy/web -n "$NS" -- printenv`, faça o restore do ConfigMap via
`kubectl apply -f configmap.yaml -n "$NS"`, depois force uma recriação com
`kubectl rollout restart deploy/web -n "$NS"` e aguarde em
`kubectl rollout status deploy/web -n "$NS"`. Arquivos montados como diretório sem
`subPath` podem se atualizar sem esse restart; env e mounts com `subPath` não podem.

## Challenge solution

### Commands / manifest

```bash
kubectl exec deploy/web -n "$NS" -- wget -qO- http://127.0.0.1:8080/ 2>/dev/null || true
kubectl get configmap web-config -n "$NS" -o yaml
kubectl rollout restart deploy/web -n "$NS"
kubectl rollout status deploy/web -n "$NS"
kubectl get pods -n "$NS" -l app=s10
```

### Expected state / output

O primeiro exec imprime o valor de antes da rotação. Após o rollout restart, o novo valor
está presente no Pod recriado. Um arquivo montado como diretório inteiro se atualizaria no
lugar, sem recriar o Pod; valores de env ficam congelados pelo tempo de vida do Pod.

### Explanation

Variáveis de ambiente são resolvidas uma única vez quando o container inicia, e é essa a
causa de edições de ConfigMap ou Secret não reescreverem o env de um processo em execução.
Mounts de arquivo sem subPath são projetados e eventualmente se atualizam; mounts com
subPath congelam como o env. Uma annotation de checksum ou um rollout explícito recria os
Pods para que eles peguem os novos dados.

### Hints

Compare kubectl exec printenv com um arquivo sob o volume do ConfigMap; procure
por subPath no mount e por uma annotation de checksum no template do Pod.
