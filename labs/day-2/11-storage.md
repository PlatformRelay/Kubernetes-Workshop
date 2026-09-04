# Lab 11 — Storage (PV/PVC/StorageClass) (S11)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S11 — Storage (PV/PVC/StorageClass) |
| **Environment** | namespace ✓ / kind ✓ *(sem cluster-admin; assume-se uma StorageClass padrão)* |
| **Estimated time** | 30 min |

## Objective

Dar ao app `web` storage **durável**. Você vai aplicar uma **PersistentVolumeClaim** contra
a **StorageClass** padrão do cluster, montá-la em um Deployment, escrever um arquivo
**sentinela**, depois **deletar o Pod** e provar que o arquivo sobrevive. No caminho, você
vai ver por que uma PVC pode ficar em `Pending` por duas razões bem diferentes — um binding
mode `WaitForFirstConsumer` (normal) versus uma StorageClass que não existe (o break→fix) —
e ler a **reclaim policy**, que decide se deletar a claim também destrói os dados.

> **Defina seu namespace uma vez.** Tudo roda no seu namespace atribuído (ou em um cluster
> kind). Defina uma variável de shell para que todo comando seja copiável e colável:
>
> ```bash
> export NS=<your-assigned-namespace>          # usuários de kind: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Conceitos dos Labs 05–06 (Pod, Deployment). Este lab **cria seu próprio** Deployment
  `web`, então não depende de sobras de labs anteriores.
- `kubectl` contra o seu namespace atribuído **ou** um cluster kind local. Sem direitos de
  admin e sem add-ons — o kind já vem com uma StorageClass padrão `standard` (o provisioner
  `local-path`); clusters compartilhados têm uma StorageClass padrão fornecida para você.
- Ler o **PV** criado automaticamente exige leitura cluster-scoped (PVs não são
  namespaced). Em um namespace restrito isso pode ser negado — o Step 5 dá uma alternativa
  segura por namespace.

## Files used

- `pvc.yaml` — a PVC `web-data` (o pedido: 1Gi, `ReadWriteOnce`, StorageClass padrão).
- `deployment-emptydir.yaml` — o Deployment `web` com um volume `emptyDir` **efêmero**.
- `deployment-pvc.yaml` — o mesmo Deployment, com o `emptyDir` trocado pela **PVC**.
- `pvc-bad-storageclass.yaml` — uma claim nomeando uma StorageClass **inexistente** + um
  Pod consumidor, para o break→fix.

Tudo tem o label `app: s11`, então o cleanup é um único label selector.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./11-storage.solution.md#guided-solutions)

### Step 0 — veja a StorageClass padrão

O provisionamento dinâmico precisa de uma StorageClass **padrão** (a que entra em ação
quando uma PVC não nomeia nenhuma). Encontre-a e anote sua reclaim policy e seu binding
mode.

```bash
kubectl get storageclass
```

---

### Step 1 — aplique a PVC (e entenda o `Pending`)

Crie a claim. Ela omite `storageClassName`, então usa a padrão do Step 0.

```bash
cat > pvc.yaml <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: web-data
  labels:
    app: s11
spec:
  accessModes: ["ReadWriteOnce"]     # um node a monta em leitura e escrita
  resources:
    requests:
      storage: 1Gi
  # storageClassName omitido → a StorageClass padrão do cluster
EOF

kubectl apply -f pvc.yaml
kubectl get pvc web-data
```

**Tarefa:** a PVC já está `Bound`? Verifique o *porquê* com `describe`.

```bash
kubectl describe pvc web-data | sed -n '/Events/,$p'
```

---

### Step 2 — monte a PVC e escreva um sentinela

Agora dê à claim um consumidor. Primeiro mostre a linha de base efêmera, depois a versão
durável. Como no Lab 10, a image do app de demo é distroless (sem shell), então cada
Deployment carrega um pequeno sidecar **toolbox** montando o mesmo volume — é a caneta com
que você escreve o sentinela.

```bash
cat > deployment-emptydir.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s11
spec:
  replicas: 1                        # uma réplica → `exec` é inequívoco
  selector:
    matchLabels:
      app: s11
  template:
    metadata:
      labels:
        app: s11
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          volumeMounts:
            - name: data
              mountPath: /data
        - name: toolbox              # a image do app não tem shell — o sidecar é nossa caneta
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          emptyDir: {}               # efêmero — compartilha o ciclo de vida do Pod
EOF

cat > deployment-pvc.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: s11
spec:
  replicas: 1
  selector:
    matchLabels:
      app: s11
  template:
    metadata:
      labels:
        app: s11
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          volumeMounts:
            - name: data
              mountPath: /data        # mount idêntico — só a origem do volume muda
        - name: toolbox
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: web-data        # durável, sobrevive ao Pod
EOF

# aplique a versão durável e espere o rollout
kubectl apply -f deployment-pvc.yaml
kubectl rollout status deploy/web

# o Pod agora é o "first consumer" — a claim deve fazer bind
kubectl get pvc web-data
```

**Tarefa:** confirme que a claim agora está `Bound`, depois escreva um arquivo sentinela no
volume.

```bash
kubectl exec deploy/web -c toolbox -- sh -c 'echo "written by $(hostname) at boot" > /data/data.txt'
kubectl exec deploy/web -c toolbox -- cat /data/data.txt
```

**Pergunta:** você nunca criou um PersistentVolume — de onde veio o `VOLUME` (o nome
`pvc-…`)?

---

### Step 3 — delete o Pod, prove que os dados sobrevivem

Esse é o ponto central da seção.

```bash
# delete o Pod em execução; o Deployment recria um imediatamente
kubectl delete pod -l app=s11
kubectl rollout status deploy/web

# leia o sentinela a partir do Pod NOVINHO EM FOLHA
kubectl exec deploy/web -c toolbox -- cat /data/data.txt
```

**Tarefa:** o arquivo sobreviveu até o Pod substituto?

**Pergunta:** o sentinela diz que foi escrito pelo hostname do Pod *antigo*. Por que essa é
exatamente a prova que queríamos?

---

### Step 4 — break→fix: uma StorageClass que não existe

Uma claim em `Pending` nem sempre é a espera inofensiva do `WaitForFirstConsumer`. Aqui
está a outra causa — e como o `describe` as distingue. Esta claim vem **com** um Pod
consumidor, para você ver a falha acontecer mesmo *com* um first consumer presente.

```bash
cat > pvc-bad-storageclass.yaml <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: web-data-bad
  labels:
    app: s11
spec:
  storageClassName: no-such-class    # <-- provisioner inexistente
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: binder
  labels:
    app: s11
spec:
  containers:
    - name: c
      image: ghcr.io/platformrelay/workshop-web:v1
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: web-data-bad
EOF

kubectl apply -f pvc-bad-storageclass.yaml
kubectl get pvc web-data-bad
kubectl get pod binder
kubectl describe pvc web-data-bad | sed -n '/Events/,$p'
```

**Tarefa:** a claim tem um consumidor (o Pod `binder`) — então por que ela ainda está em
`Pending`, e como isso é diferente do Step 1?

**Tarefa:** conserte. O `storageClassName` de uma PVC é imutável, então a claim precisa
ser recriada na classe padrão. Um Pod que referencia uma PVC a prende com um finalizer
`pvc-protection`, então **remova o consumidor primeiro** (ou o delete trava), depois recrie
a claim **e** um consumidor novo juntos — o `WaitForFirstConsumer` precisa de um Pod
presente para fazer bind.

```bash
# 1) derrube o consumidor primeiro — uma PVC referenciada não termina de deletar enquanto um Pod a segura
kubectl delete pod binder

# 2) delete a claim que falhou (storageClassName é imutável → recrie, não faça patch)
kubectl delete pvc web-data-bad

# 3) recrie a claim na classe PADRÃO + um consumidor novo, juntos
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: web-data-bad
  labels:
    app: s11
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
  # storageClassName omitido → a classe padrão
---
apiVersion: v1
kind: Pod
metadata:
  name: binder
  labels:
    app: s11
spec:
  containers:
    - name: c
      image: ghcr.io/platformrelay/workshop-web:v1
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: web-data-bad
EOF

kubectl get pvc web-data-bad -w      # Ctrl-C quando mostrar Bound
kubectl get pod binder
```

---

### Step 5 — leia a reclaim policy

A reclaim policy decide o que acontece com o PV (e com seus dados) quando a **claim** é
deletada. Ela é carimbada no PV a partir da StorageClass.

```bash
# encontre o PV por trás de web-data, depois leia sua reclaim policy (exige leitura cluster-scoped)
PVNAME=$(kubectl get pvc web-data -o jsonpath='{.spec.volumeName}')
kubectl get pv "$PVNAME" -o custom-columns=\
NAME:.metadata.name,RECLAIM:.spec.persistentVolumeReclaimPolicy,SC:.spec.storageClassName,STATUS:.status.phase
```

**Tarefa:** qual é a reclaim policy, e o que deletar `web-data` faria com os dados?

## Observe

- Uma PVC que omite `storageClassName` usa a StorageClass **padrão** do cluster.
- Com `WaitForFirstConsumer`, a PVC fica **`Pending` até um Pod montá-la** — normal, e
  distinguível de uma falha real apenas pelos **events** do `describe`.
- O provisionamento dinâmico cria o **PV** sob demanda; você nunca escreveu um manifesto
  de PV.
- Um sentinela escrito em um volume respaldado por PVC **sobrevive a um delete de Pod** (o
  Pod substituto refaz o bind da mesma claim); um sentinela em `emptyDir` não sobreviveria.
- Uma StorageClass inexistente gera `ProvisioningFailed … not found` e uma claim (e Pod
  consumidor) permanentemente em `Pending`.
- PVs provisionados dinamicamente vêm por padrão com reclaim policy **`Delete`** — deletar
  a claim destrói os dados.

## Challenge

Uma PVC continua em Pending depois que você a aplica. Distinga uma StorageClass ausente de
um atraso normal de WaitForFirstConsumer, depois restaure um volume Bound em que o Pod
possa escrever.

**Difficulty:** Intermediate

**Success criteria:** Identifique a razão do Pending a partir dos Events, restaure ou
aguarde conforme apropriado, prove que a PVC atinge o status Bound com um mount de Pod, e
mostre um arquivo sentinela que permanece presente após um delete de Pod.

**Hints:** Verifique os Events de kubectl describe pvc para distinguir StorageClass de
WaitForFirstConsumer; compare com kubectl get storageclass antes de editar a claim.

[Spoiler: solução do challenge](./11-storage.solution.md#challenge-solution)

## Verify

Confirme que a PVC está Bound e que o caminho do sentinela ainda importa antes do cleanup.

```bash
kubectl get pvc,deploy,pods -n "$NS" -l app=s11
kubectl describe pvc -n "$NS" -l app=s11 | sed -n '/Events:/,$p' | head -n 20
```

Esperado: pelo menos uma PVC Bound permanece, e os Events não mostram um
ProvisioningFailed não resolvido para a sua claim que funciona.

## Cleanup / reset

```bash
# cleanup com escopo — tudo que este lab criou tem o label app=s11
# delete os consumidores (Pods) ANTES das claims, ou finalizers pvc-protection travam o delete
kubectl delete pod binder --ignore-not-found -n "$NS"
kubectl delete deployment -l app=s11 -n "$NS" --ignore-not-found
kubectl delete pvc -l app=s11 -n "$NS" --ignore-not-found   # depois que os Pods as liberarem
rm -f pvc.yaml deployment-emptydir.yaml deployment-pvc.yaml pvc-bad-storageclass.yaml

# NOTA: com reclaim policy Delete, os PVs somem junto com suas claims. Se a sua classe padrão
# usa Retain, um PV Released pode sobrar — um admin o remove: kubectl delete pv <name>

# reset de pânico (namespace): também remove qualquer outra coisa que sobrou no seu namespace
# kubectl delete deploy,rs,pod,pvc --all -n "$NS" --ignore-not-found
# reset de pânico (kind): make kind-down && make kind-up   # ou: kind delete cluster
```

## Stretch (opcional) — o contraexperimento do `emptyDir`

Prove o contraste: com `emptyDir`, o *mesmo* delete perde os dados.

```bash
kubectl apply -f deployment-emptydir.yaml         # troque o volume PVC por emptyDir
kubectl rollout status deploy/web
kubectl exec deploy/web -c toolbox -- sh -c 'echo ephemeral > /data/data.txt'
kubectl delete pod -l app=s11                     # recrie o Pod
kubectl rollout status deploy/web
kubectl exec deploy/web -c toolbox -- cat /data/data.txt || echo "FILE GONE"
```
