# Lab 17 — Pod security (S17) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 0 — coloque a barra do `restricted` no seu namespace

O Pod Security Admission é configurado por **labels no objeto Namespace**. Qual caminho você segue
depende do seu ambiente.

**kind (o cluster é seu):** aplique os labels no seu namespace você mesmo.

```bash
kubectl label --overwrite namespace "$NS" \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted \
  pod-security.kubernetes.io/audit=restricted
```

**Cluster compartilhado (namespace designado):** aplicar label em um Namespace é uma escrita em um
objeto **cluster-scoped**, o que a sua Role dentro do namespace normalmente não permite — **então o
seu namespace já foi pré-labelado com `restricted` para você.** Não execute o comando `label`;
apenas confirme que os labels estão presentes:

```bash
kubectl get namespace "$NS" --show-labels
```

**Tarefa:** confirme que os três modos do PSA estão em `restricted` no seu namespace.

```bash
kubectl get namespace "$NS" -o jsonpath='{.metadata.labels}' | tr ',' '\n' | grep pod-security
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get namespace "$NS" -o jsonpath='{.metadata.labels}' | tr ',' '\n' | grep pod-security
"pod-security.kubernetes.io/audit":"restricted"
"pod-security.kubernetes.io/enforce":"restricted"
"pod-security.kubernetes.io/warn":"restricted"
```

`enforce` é o único modo que **rejeita**; o `warn` devolve um `Warning:` ao `kubectl` e o
`audit` escreve no audit log da API — os dois ainda criam o Pod. Definimos os três para que você
*veja* as violations (`warn`) além de *bater* nelas (`enforce`).

Se o comando `label` falhar em um cluster compartilhado com `namespaces ... is forbidden`, isso é
esperado — você não tem direitos sobre o objeto Namespace. Use o namespace pré-labelado, ou
mude para o kind.
</details>

---

### Step 1 — break: o Pod inseguro é recusado na porta

```bash
cat > pod-insecure.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      # sem securityContext nenhum
EOF

kubectl apply -f pod-insecure.yaml
```

**Tarefa:** o apply é **rejeitado**. Leia o erro — quantas regras ele quebrou, o Pod chegou a ser
criado, e quais quatro campos são nomeados?

```bash
kubectl get pod web        # ele está lá?
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply -f pod-insecure.yaml
Error from server (Forbidden): error when creating "pod-insecure.yaml": pods "web" is forbidden:
violates PodSecurity "restricted:latest": allowPrivilegeEscalation != false (container "web" must
set securityContext.allowPrivilegeEscalation=false), unrestricted capabilities (container "web"
must set securityContext.capabilities.drop=["ALL"]), runAsNonRoot != true (pod or container "web"
must set securityContext.runAsNonRoot=true), seccompProfile (pod or container "web" must set
securityContext.seccompProfile.type to "RuntimeDefault" or "Localhost")

$ kubectl get pod web
Error from server (NotFound): pods "web" not found
```

Quatro violations, listadas em uma única mensagem — exatamente os quatro campos que o `restricted`
guarda: `allowPrivilegeEscalation`, `capabilities.drop`, `runAsNonRoot`, `seccompProfile`. Isto é
enforcement no **admission**: o API server recusou a requisição, então o Pod **nunca foi criado**
(`NotFound`) — não há nada para reiniciar, nada para deletar. Contraste com o OOMKill do Lab 13,
onde o Pod existia e *depois* morreu.
</details>

**Pergunta:** aplicamos um **Pod cru** e recebemos a lista completa de violations de imediato. O
que teria acontecido se tivéssemos embrulhado o mesmo container em um **Deployment**?

<details><summary>Resposta</summary>

O **Deployment** seria **admitido** — o PSA não checa o Deployment, ele checa **Pods**.
O controller do Deployment então tenta criar Pods a partir do template, e *esses* é que são
rejeitados no admission. Você veria um Deployment de aparência saudável com `0` réplicas ready, e a
rejeição só apareceria em `kubectl describe rs <name>` / events (`FailedCreate ... violates
PodSecurity`), não no seu `apply`. Um Pod cru falha **de forma síncrona e barulhenta**, e é por isso
que este lab usa um — mas as mesmas regras valem para todo Pod que um controller cria.
</details>

---

### Step 2 — fix: passe pelos quatro gates, um de cada vez

O Pod nunca foi criado, então cada correção é apenas mais um `apply` do mesmo Pod `web` com mais um
campo. Observe a lista de violations encolher em exatamente uma a cada vez.

**2a — adicione `runAsNonRoot` (e um UID non-root de verdade):**

```bash
cat > pod-step.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532          # o usuário non-root embutido na image (o "nonroot" do distroless)
EOF
kubectl apply -f pod-step.yaml
```

<details><summary>Saída esperada — restam três</summary>

```console
Error from server (Forbidden): error when creating "pod-step.yaml": pods "web" is forbidden:
violates PodSecurity "restricted:latest": allowPrivilegeEscalation != false (...), unrestricted
capabilities (...), seccompProfile (...)
```

O `runAsNonRoot != true` sumiu; restam três violations. (Definir `runAsUser: 65532` não é
exigido pelo `restricted` — `runAsNonRoot: true` sozinho já o satisfaz — mas isso deixa o usuário
non-root explícito e garante um UID com o qual esta image realmente consegue rodar.)
</details>

> **⚠️ Por que esta image?** `runAsNonRoot: true` é uma *promessa que a image precisa cumprir*. O
> admission só checa que o **campo está definido**, então ele passa — mas o **kubelet** checa o
> usuário real da image na largada. Aponte este Pod para uma image cujo usuário efetivo é **root**
> — a maioria das base images, ex.: um `busybox` ou `debian` de fábrica — e ele seria **admitido** e
> então falharia no start com `container has runAsNonRoot and image will run as root`
> (CreateContainerError → CrashLoopBackOff). O `workshop-web` vem com o usuário `nonroot` do
> distroless (UID 65532), então a promessa se sustenta. Esta é a **disciplina de image non-root da
> S02** dando retorno.

**2b — adicione `allowPrivilegeEscalation: false`** (re-aplique o arquivo inteiro com mais um campo):

```bash
cat > pod-step.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
EOF
kubectl apply -f pod-step.yaml
```

<details><summary>Saída esperada — restam duas</summary>

```console
Error from server (Forbidden): ... violates PodSecurity "restricted:latest":
unrestricted capabilities (...), seccompProfile (...)
```

O `allowPrivilegeEscalation != false` foi resolvido; restam duas violations.
</details>

**2c — dropar todas as capabilities** (de novo, o arquivo completo mais um campo):

```bash
cat > pod-step.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
EOF
kubectl apply -f pod-step.yaml
```

<details><summary>Saída esperada — resta uma</summary>

```console
Error from server (Forbidden): ... violates PodSecurity "restricted:latest":
seccompProfile (container "web" must set securityContext.seccompProfile.type to "RuntimeDefault"
or "Localhost")
```

Só sobrou o `seccompProfile` — o último gate.
</details>

**2d — adicione o seccomp profile → admitido.** Aplique o manifesto hardened completo:

```bash
cat > pod-hardened.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
        seccompProfile:
          type: RuntimeDefault
EOF

kubectl apply -f pod-hardened.yaml
kubectl get pod web -w        # Ctrl-C assim que estiver Running
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply -f pod-hardened.yaml
pod/web created

$ kubectl get pod web
NAME   READY   STATUS    RESTARTS   AGE
web    1/1     Running   0          12s
```

Os quatro gates passam, o PSA admite o Pod e, como a image realmente roda como non-root, o kubelet
também fica satisfeito — `1/1 Running`. **A policy nunca mudou; o seu manifesto mudou.**
</details>

---

### Step 3 — além do `restricted`: um root filesystem read-only

`readOnlyRootFilesystem: true` **não** é um dos quatro gates do `restricted` — é defesa em
profundidade extra (quem conseguiu um pé dentro não consegue largar ferramentas nem reescrever
binários). Mas ele muda o comportamento em runtime: o container não pode mais escrever no próprio
filesystem, e muitos apps *precisam* de alguns caminhos graváveis. Primeiro, veja o que ele custa a
um app **bem construído** — nada:

```bash
cat > pod-readonly.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web-ro
  labels: { app: s17 }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
        seccompProfile: { type: RuntimeDefault }
        readOnlyRootFilesystem: true
EOF

kubectl apply -f pod-readonly.yaml
kubectl get pod web-ro -w        # Ctrl-C assim que estiver Running
```

**Tarefa:** o Pod roda — por que o `readOnlyRootFilesystem` não o machucou?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pod web-ro
NAME     READY   STATUS    RESTARTS   AGE
web-ro   1/1     Running   0          10s
```

A image de demo foi **construída para isto**: ela é distroless, loga em stdout e mantém o estado em
memória — nunca escreve no próprio filesystem, então montar `/` como read-only não lhe custa nada.
Esse é o estado-alvo para as suas próprias images. A maioria dos apps do mundo real ainda não está
lá, e é justamente esse o próximo movimento.
</details>

Agora o **break**: um container que escreve um PID file na inicialização — o padrão clássico em que
o `readOnlyRootFilesystem` tropeça.

```bash
cat > pod-writer-ro.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: writer-ro
  labels: { app: s17 }
spec:
  containers:
    - name: app
      image: busybox:1.37
      command: ["sh", "-c", "echo $$ > /var/run/app.pid && sleep infinity"]
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532          # o busybox vem como root — fixe um UID non-root para passar pelo gate
        runAsGroup: 65532
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
        seccompProfile: { type: RuntimeDefault }
        readOnlyRootFilesystem: true
EOF

kubectl apply -f pod-writer-ro.yaml
kubectl get pod writer-ro -w        # Ctrl-C depois de ver a falha
```

**Tarefa:** este Pod é **admitido** (ele satisfaz o `restricted`), mas não fica de pé. O que o
`kubectl logs` diz?

```bash
kubectl get pod writer-ro
kubectl logs writer-ro --previous 2>/dev/null || kubectl logs writer-ro
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pod writer-ro
NAME        READY   STATUS             RESTARTS      AGE
writer-ro   0/1     CrashLoopBackOff   3 (20s ago)   90s

$ kubectl logs writer-ro
sh: can't create /var/run/app.pid: Read-only file system
```

O Pod **passou pelo admission** — esta é uma falha de **runtime**. O app precisa escrever o seu PID
file, mas com `readOnlyRootFilesystem: true` o root filesystem inteiro (inclusive `/var/run`) é
read-only, então o comando de inicialização falha → o container sai → `CrashLoopBackOff`.
O erro **nomeia o caminho** que ele não conseguiu escrever — essa é a sua lista do que tornar gravável.
</details>

**Tarefa:** conserte montando um **`emptyDir` gravável** sobre o único caminho de que o app
precisa, mantendo o root filesystem read-only em todo o resto.

```bash
cat > pod-writer-fixed.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: writer-ro
  labels: { app: s17 }
spec:
  containers:
    - name: app
      image: busybox:1.37
      command: ["sh", "-c", "echo $$ > /var/run/app.pid && sleep infinity"]
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
        seccompProfile: { type: RuntimeDefault }
        readOnlyRootFilesystem: true
      volumeMounts:
        - { name: run, mountPath: /var/run }
  volumes:
    - { name: run, emptyDir: {} }
EOF

kubectl delete pod writer-ro --ignore-not-found  # securityContext/volumes são imutáveis — recrie
kubectl apply -f pod-writer-fixed.yaml
kubectl get pod writer-ro -w        # Ctrl-C assim que estiver Running
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pod writer-ro
NAME        READY   STATUS    RESTARTS   AGE
writer-ro   1/1     Running   0          15s
```

O `emptyDir` dá ao container um pequeno volume de rascunho **gravável** exatamente no caminho de que
ele precisa, enquanto `/` e todo o resto continuam read-only. Se um app reclamar de um caminho
*diferente*, leia a linha de log, adicione mais um mount `emptyDir` para ele e re-aplique — o método
é sempre "o erro nomeia o caminho; monte um volume gravável ali". Esta é a resposta para
"como eu dou um lugar gravável a um container com rootfs read-only": **não** é abrindo mão do
`readOnlyRootFilesystem`, e sim recortando apenas os caminhos que precisam ser graváveis.
</details>

---

### Step 4 — observe: prove que está realmente trancado

Duas provas. Primeiro, o app de demo é mesmo non-root — a image dele não tem shell, então anexe um
debug container que compartilha o PID namespace dele e leia a lista de processos:

```bash
kubectl debug -it web-ro --image=busybox:1.37 --target=web -- ps
```

Segundo, o Pod writer (busybox — esse *tem* shell) mostra o root read-only e o recorte gravável:

```bash
kubectl exec writer-ro -- id
kubectl exec writer-ro -- touch /nope
kubectl exec writer-ro -- touch /var/run/ok
```

**Pergunta:** com qual UID os processos rodam, e por que a escrita em `/` falha enquanto
`/var/run` funciona?

<details><summary>Resposta / saída esperada</summary>

```console
$ kubectl debug -it web-ro --image=busybox:1.37 --target=web -- ps
PID   USER     TIME  COMMAND
    1 65532     0:00 /workshop-web
...

$ kubectl exec writer-ro -- id
uid=65532 gid=65532 groups=65532

$ kubectl exec writer-ro -- touch /nope
touch: /nope: Read-only file system
command terminated with exit code 1

$ kubectl exec writer-ro -- touch /var/run/ok      # funciona — o recorte do emptyDir
```

`uid=65532`, não `0` — os dois containers são **non-root** (a promessa de
`runAsNonRoot`/`runAsUser`, cumprida pela image em um caso e pelo `runAsUser` no outro). A escrita
em `/` falha com **`Read-only file system`** porque o `readOnlyRootFilesystem: true` monta o root
como read-only; só o caminho do `emptyDir` (`/var/run`) é gravável.
</details>

## Stretch (opcional) — soft-launch com `warn` antes do `enforce`

No mundo real você não vira o `enforce=restricted` em um namespace movimentado às cegas — você liga
o `warn` primeiro, vê o que *quebraria*, conserta, e só então faz o enforce. Prove a diferença em um
namespace descartável (kind, ou qualquer lugar onde você possa criar namespaces).

```bash
kubectl create namespace psa-demo
kubectl label namespace psa-demo pod-security.kubernetes.io/warn=restricted
# o Pod inseguro É CRIADO, mas o kubectl imprime um warning para cada violation:
kubectl run canary --image=ghcr.io/platformrelay/workshop-web:v1 -n psa-demo
kubectl get pod canary -n psa-demo
```

<details><summary>O que você está vendo</summary>

```console
$ kubectl run canary --image=ghcr.io/platformrelay/workshop-web:v1 -n psa-demo
Warning: would violate PodSecurity "restricted:latest": allowPrivilegeEscalation != false (...),
unrestricted capabilities (...), runAsNonRoot != true (...), seccompProfile (...)
pod/canary created

$ kubectl get pod canary -n psa-demo
NAME     READY   STATUS    RESTARTS   AGE
canary   1/1     Running   0          8s
```

As mesmas quatro violations do Step 1 — mas sob **`warn`** o Pod é **criado assim mesmo** e você só
recebe um aviso. É assim que se migra um namespace para `restricted` sem indisponibilidade: `warn`
(e `audit`) para descobrir os infratores, corrigi-los e *só então* `enforce`. Para limpar:
`kind delete cluster` (descartável) ou remova o Namespace por fora.
</details>

## Expected state / output

- Enforcement no **admission** (PSA): um Pod que viola o `restricted` é **rejeitado no `apply`**
  e **nunca criado** — o erro lista **todas** as regras quebradas de uma vez.
- O `restricted` guarda exatamente **quatro** campos: `runAsNonRoot`, `allowPrivilegeEscalation: false`,
  `capabilities.drop: ["ALL"]`, `seccompProfile: RuntimeDefault|Localhost`. Defina-os → admitido.
- `runAsNonRoot: true` é checado **duas vezes**: o PSA checa o *campo* (admission), o kubelet
  checa o *UID real da image* (runtime) — uma image root é admitida e depois entra em **CrashLoop**.
- O `readOnlyRootFilesystem` está **além** do `restricted`: é um controle de **runtime**, e apps que
  escrevem em disco precisam de um `emptyDir` sobre cada caminho gravável.
- **Admission vs. runtime** é o modelo mental: rejeitado-antes-de-existir vs. existe-e-depois-falha.

Statuses representativos incluem Pods Ready/Running, timeouts de NetworkPolicy, Forbidden de RBAC,
histórico de revisões do Helm, Application Synced/Healthy, Certificate Ready ou targets do
Prometheus — compare o significado, não nomes efêmeros.

## Explanation

O PSA avalia o Pod (ou o template) no admission. Uma image non-root sozinha não
satisfaz o restricted — os quatro campos de securityContext precisam ser declarados para que o API
server consiga provar o contrato antes de o Pod existir. É por essa causa que restaurar esses campos
admite o objeto: o gate vê um pedido explícito de least-privilege, não porque a image por acaso era segura.

Os passos guiados acima provam o comportamento do control plane desta seção; leia os Events e os
campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Reaplique os manifestos nomeados do lab com `kubectl apply -f <file> -n "$NS"` depois de corrigir o
campo quebrado, ou delete apenas os objetos labelados da seção Cleanup / reset e reinicie a tarefa
guiada. Prefira os Events do `kubectl describe` a adivinhar. Não execute deletes amplos no cluster.

## Challenge solution

### Commands / manifest

```bash
kubectl apply -f pod-insecure.yaml --dry-run=server 2>&1 | head -20
# depois de restaurar os quatro campos do restricted no pod-hardened.yaml:
kubectl apply -f pod-hardened.yaml --dry-run=server
kubectl apply -f pod-hardened.yaml
kubectl get pod hardened -n "$NS"
```

### Expected state / output

O apply inseguro é rejeitado e lista as regras do restricted quebradas. Depois que os quatro
campos estão presentes, o dry-run e o apply passam e o Pod chega a Running/Ready sob
enforce=restricted.

### Explanation

O PSA avalia o Pod (ou o template) no admission. Uma image non-root sozinha não
satisfaz o restricted — os quatro campos de securityContext precisam ser declarados para que o API
server consiga provar o contrato antes de o Pod existir. É por essa causa que restaurar esses campos
admite o objeto: o gate vê um pedido explícito de least-privilege, não porque a image por acaso era segura.

### Hints

Compare a lista de violations com runAsNonRoot, allowPrivilegeEscalation, capabilities.drop
e seccompProfile; mantenha enforce=restricted e use kubectl apply --dry-run=server para confirmar.
