# Lab 17 — Pod security (S17)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S17 — Pod security (securityContext + Pod Security Standards) |
| **Environment** | namespace ✓ / kind ✓ *(caminho por namespace: o label `restricted` já é aplicado para você — veja o Step 0)* |
| **Estimated time** | 25 min |

## Objective

Conheça o **Pod Security Standard** `restricted` pelo lado errado. Você vai jogar um Pod cru,
root, sem `securityContext` em um namespace que faz **enforce** de `restricted`, ver o **Pod
Security Admission** recusá-lo *antes de ele sequer ser criado*, e então adicionar os **quatro**
campos que o `restricted` guarda — um de cada vez — até o mesmo gate **admiti-lo**. Por fim, você
vai ligar o `readOnlyRootFilesystem` (que **não** faz parte do `restricted`) — ver que ele não
custa *nada* ao app de demo (ele nunca escreve em disco), depois vê-lo quebrar um Pod que **de
fato** escreve, em **runtime**, e dar a esse app um caminho gravável com um `emptyDir`.

O lab inteiro gira em torno de um contraste: enforcement no **admission** (o PSA recusa o Pod de
saída — nada é criado) vs. enforcement em **runtime** (o Pod existe e depois se comporta mal).

> **Defina seu namespace uma única vez.**
>
> ```bash
> export NS=<your-assigned-namespace>          # usuários de kind: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- `kubectl` apontando para o seu namespace designado **ou** um cluster kind local. Nenhum direito
  de admin é necessário para o loop de hardening em si.
- Acesso de pull à internet para `ghcr.io/platformrelay/workshop-web:v1` — a image de demo do
  workshop, que **já roda como usuário non-root (UID 65532, o usuário `nonroot` do distroless) e
  escuta na 8080**, mais `busybox:1.37` para a quebra em runtime. Veja o callout no Step 2 sobre
  por que uma image que vem rodando como *root* falharia mesmo depois de você definir
  `runAsNonRoot: true`.
- O Pod Security Admission é **embutido no API server** (estável desde a v1.25) — não há
  controller para instalar.

## Files used

- `pod-insecure.yaml` — um Pod cru, sem `securityContext` → viola o `restricted`.
- `pod-hardened.yaml` — o mesmo Pod com os quatro campos do `restricted` definidos → admitido.
- `pod-readonly.yaml` — hardened **mais** `readOnlyRootFilesystem: true` → continua rodando (o app
  de demo nunca escreve no seu root filesystem).
- `pod-writer-ro.yaml` — um Pod que escreve um PID file, mesmo hardening → **quebra em runtime**.
- `pod-writer-fixed.yaml` — adiciona um mount `emptyDir` sobre o caminho gravável → volta a rodar.

Tudo tem o label `app: s17`, então o cleanup é um único label selector.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./17-pod-security.solution.md#guided-solutions)

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

**Pergunta:** aplicamos um **Pod cru** e recebemos a lista completa de violations de imediato. O
que teria acontecido se tivéssemos embrulhado o mesmo container em um **Deployment**?

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

## Observe

- Enforcement no **admission** (PSA): um Pod que viola o `restricted` é **rejeitado no `apply`**
  e **nunca criado** — o erro lista **todas** as regras quebradas de uma vez.
- O `restricted` guarda exatamente **quatro** campos: `runAsNonRoot`, `allowPrivilegeEscalation: false`,
  `capabilities.drop: ["ALL"]`, `seccompProfile: RuntimeDefault|Localhost`. Defina-os → admitido.
- `runAsNonRoot: true` é checado **duas vezes**: o PSA checa o *campo* (admission), o kubelet
  checa o *UID real da image* (runtime) — uma image root é admitida e depois entra em **CrashLoop**.
- O `readOnlyRootFilesystem` está **além** do `restricted`: é um controle de **runtime**, e apps que
  escrevem em disco precisam de um `emptyDir` sobre cada caminho gravável.
- **Admission vs. runtime** é o modelo mental: rejeitado-antes-de-existir vs. existe-e-depois-falha.

## Challenge

Os Pods de um Deployment são recusados com uma lista de violations PodSecurity "restricted" de
várias regras, mesmo com a image já rodando como non-root. Diagnostique quais dos quatro campos do
restricted ainda faltam no template de Pod, depois restaure a admissão sem enfraquecer o label
enforce do namespace.

**Difficulty:** Intermediate

**Success criteria:** Identifique todos os campos do restricted ausentes que a saída de erro do
admission nomeia, faça patch ou re-apply de um template de Pod/Deployment que inclua os quatro
gates, e prove que o apply passa (ou que o dry-run=server admite) com os quatro campos presentes,
enquanto o namespace continua com enforce restricted.

**Hints:** Compare a lista de violations com runAsNonRoot, allowPrivilegeEscalation, capabilities.drop
e seccompProfile; mantenha enforce=restricted e use kubectl apply --dry-run=server para confirmar.

[Spoiler: solução do challenge](./17-pod-security.solution.md#challenge-solution)

## Verify

Confirme as evidências de Pod Security antes do cleanup.

```bash
kubectl get pod -n "$NS" -l app=s17
kubectl get namespace "$NS" --show-labels | tr ',' '\n' | grep pod-security || true
```

Esperado: os Pods hardened/read-only/writer-fixed do caminho guiado ainda existem (ou foram
deletados de propósito) e os labels do namespace explicam o comportamento de admitir vs. rejeitar.

## Cleanup / reset

```bash
# cleanup com escopo — tudo que este lab criou tem o label app=s17
kubectl delete pod -l app=s17 -n "$NS" --ignore-not-found
rm -f pod-insecure.yaml pod-step.yaml pod-hardened.yaml \
      pod-readonly.yaml pod-writer-ro.yaml pod-writer-fixed.yaml

# usuários de kind: remova o label enforce para que os Pods simples dos labs seguintes não sejam rejeitados
# (deixe warn/audit se quiser — eles nunca bloqueiam)
kubectl label namespace "$NS" pod-security.kubernetes.io/enforce- 2>/dev/null || true

# reset de pânico (namespace): remove tudo que este lab possa ter deixado
# kubectl delete pod --all -n "$NS" --ignore-not-found
# reset de pânico (kind): kind delete cluster && <recrie>
```

> **Remova o label `enforce=restricted` quando terminar (kind).** Enquanto ele estiver setado,
> *todo* Pod no namespace precisa estar em conformidade com o `restricted` — labs posteriores que
> aplicam Pods simples vão falhar com `violates PodSecurity`. Em um namespace compartilhado e
> pré-labelado você não pode removê-lo (e nem deve) — lá os labs posteriores já devem entregar
> Pods em conformidade.

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
