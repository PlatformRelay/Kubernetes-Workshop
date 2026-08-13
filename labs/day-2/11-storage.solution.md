# Lab 11 — Storage (PV/PVC/StorageClass) (S11) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 0 — veja a StorageClass padrão

O provisionamento dinâmico precisa de uma StorageClass **padrão** (a que entra em ação
quando uma PVC não nomeia nenhuma). Encontre-a e anote sua reclaim policy e seu binding
mode.

```bash
kubectl get storageclass
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get storageclass
NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
standard (default)   rancher.io/local-path   Delete          WaitForFirstConsumer   false                  10d
```

O marcador `(default)` indica a classe usada quando uma PVC omite `storageClassName`. No
kind é a `standard` (o provisioner `local-path`); em um cluster compartilhado o
nome/provisioner mudam, mas haverá exatamente uma padrão. Note duas colunas que você vai
reencontrar: **RECLAIMPOLICY** `Delete` (deletar a claim destrói o disco) e
**VOLUMEBINDINGMODE** `WaitForFirstConsumer` (a claim não faz bind até um Pod consumi-la).
</details>

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

<details><summary>Solução / saída esperada</summary>

No kind (e em qualquer padrão `WaitForFirstConsumer`) a claim fica **Pending** — de
propósito:

```console
$ kubectl get pvc web-data
NAME       STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
web-data   Pending                                     standard       5s

$ kubectl describe pvc web-data | sed -n '/Events/,$p'
Events:
  Type    Reason                Age   From                         Message
  ----    ------                ----  ----                         -------
  Normal  WaitForFirstConsumer  3s    persistentvolume-controller  waiting for first consumer to be created before binding
```

`waiting for first consumer` significa que a StorageClass adia o bind até um Pod montar a
claim, para que o disco caia no node em que o Pod for agendado. **Este Pending é esperado —
não é uma falha.** (Em um cluster cuja StorageClass padrão usa binding `Immediate`, você
verá `STATUS: Bound` de imediato. Ambos estão corretos.) Guarde o texto do event
`waiting for first consumer` — a quebra do Step 4 mostra uma mensagem de Pending
*diferente*.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pvc web-data
NAME       STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
web-data   Bound    pvc-3d1f...-9a2b                           1Gi        RWO            standard       40s

$ kubectl exec deploy/web -c toolbox -- cat /data/data.txt
written by web-6f8c9b7d5-abcde at boot
```

Agendar o Pod acionou o provisioner: ele criou um **PV**, fez o bind de `web-data` a ele
(`STATUS: Bound`, e um nome de `VOLUME` aparece) e o montou em `/data`. O sentinela agora
vive no PV, não na camada gravável do Pod.
</details>

**Pergunta:** você nunca criou um PersistentVolume — de onde veio o `VOLUME` (o nome
`pvc-…`)?

<details><summary>Resposta</summary>

**Provisionamento dinâmico.** O provisioner da StorageClass padrão observou uma claim
apta a fazer bind e, assim que um Pod consumiu `web-data`, criou um PV do tamanho do pedido
e fez o bind 1:1 entre eles. Você escreve apenas a **claim**; a StorageClass cunha o
**volume**. (O provisionamento estático — um admin pré-criando PVs — ainda existe, mas hoje
é a exceção.)
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl delete pod -l app=s11
pod "web-6f8c9b7d5-abcde" deleted
$ kubectl rollout status deploy/web
deployment "web" successfully rolled out
$ kubectl exec deploy/web -c toolbox -- cat /data/data.txt
written by web-6f8c9b7d5-abcde at boot
```

**Sim.** O novo Pod (note o hostname *antigo* dentro do arquivo — ele não foi reescrito)
refez o bind da **mesma** PVC `web-data` e do **mesmo** PV. A PVC e o PV têm seu próprio
ciclo de vida, independente de qualquer Pod, então os dados sobreviveram ao delete.
</details>

**Pergunta:** o sentinela diz que foi escrito pelo hostname do Pod *antigo*. Por que essa é
exatamente a prova que queríamos?

<details><summary>Resposta</summary>

Porque o arquivo foi escrito **uma vez**, pelo Pod original, e lido de volta por um Pod
**diferente** após um delete/recriação. Se o volume fosse `emptyDir` (ou o filesystem do
próprio container), o novo Pod começaria com um `/data` vazio e o `cat` falharia — os dados
estão atrelados à PVC/PV, não ao Pod. (O stretch opcional executa esse contraexperimento.)
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pvc web-data-bad
NAME           STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS    AGE
web-data-bad   Pending                                      no-such-class   5s

$ kubectl get pod binder
NAME     READY   STATUS    RESTARTS   AGE
binder   0/1     Pending   0          5s

$ kubectl describe pvc web-data-bad | sed -n '/Events/,$p'
Events:
  Type     Reason              Age   From                         Message
  ----     ------              ----  ----                         -------
  Warning  ProvisioningFailed  3s    persistentvolume-controller  storageclass.storage.k8s.io "no-such-class" not found
```

No Step 1 o event era `waiting for first consumer` (um adiamento normal). **Aqui** é um
`Warning` — `storageclass "no-such-class" not found` — e nenhum provisioner *jamais* vai
agir, mesmo com o Pod `binder` esperando para consumi-la. O Pod também está `Pending`,
porque não pode iniciar até a claim dele fazer bind. **Leia os events, não apenas a fase:**
os dois dizem `Pending`, mas só um está quebrado.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pvc web-data-bad -w
NAME           STATUS    VOLUME            CAPACITY   ACCESS MODES   STORAGECLASS   AGE
web-data-bad   Pending                                              standard        1s
web-data-bad   Bound     pvc-a1b2...-c3d4  1Gi        RWO            standard        3s
$ kubectl get pod binder
NAME     READY   STATUS    RESTARTS   AGE
binder   1/1     Running   0          30s
```

Com uma StorageClass válida (a padrão) e um Pod `binder` novo como first consumer, o
provisionamento funciona: a PVC faz bind e o Pod é agendado. Duas coisas importaram —
corrigir o nome da classe foi o reparo, e **deletar o Pod consumidor primeiro** foi o que
permitiu à claim antiga terminar de ser deletada (um Pod que referencia uma PVC segura um
finalizer `pvc-protection` que bloqueia a deleção dela até o Pod sumir).
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pv "$PVNAME" -o custom-columns=NAME:...,RECLAIM:...,SC:...,STATUS:...
NAME               RECLAIM   SC         STATUS
pvc-3d1f...-9a2b   Delete    standard   Bound
```

A policy é **`Delete`** (o padrão para PVs provisionados dinamicamente). Deletar a PVC
liberaria o PV e o provisioner **destruiria o disco subjacente e os dados**. Uma policy
**`Retain`**, em vez disso, manteria o PV (e os dados) em estado `Released` para
recuperação manual — mas ele não seria reutilizado automaticamente.

**Alternativa segura por namespace** (se `get pv` for proibido para a sua conta — PVs são
cluster-scoped): o PV herda a policy da StorageClass, então leia-a lá. Substitua pelo nome
da **sua** StorageClass padrão do Step 0 (`standard` no kind):

```console
$ kubectl get sc <your-default-sc> -o jsonpath='{.reclaimPolicy}'; echo
Delete
```

</details>

### Stretch (opcional) — o contraexperimento do `emptyDir`

Prove o contraste: com `emptyDir`, o *mesmo* delete perde os dados.

```bash
kubectl apply -f deployment-emptydir.yaml         # troque o volume PVC por emptyDir
kubectl rollout status deploy/web
kubectl exec deploy/web -c toolbox -- sh -c 'echo ephemeral > /data/data.txt'
kubectl delete pod -l app=s11                     # recrie o Pod
kubectl rollout status deploy/web
kubectl exec deploy/web -c toolbox -- cat /data/data.txt || echo "FILE GONE"
```

<details><summary>Solução / o que você está vendo</summary>

```console
$ kubectl exec deploy/web -c toolbox -- cat /data/data.txt || echo "FILE GONE"
cat: /data/data.txt: No such file or directory
FILE GONE
```

O `emptyDir` é criado **vazio** com cada Pod e deletado junto com ele, então o Pod
substituto começa com um `/data` vazio — o arquivo se foi. Mesmo delete, resultado oposto:
a durabilidade vem do fato de a PVC/PV terem um ciclo de vida **separado** do Pod.
Reaplique `deployment-pvc.yaml` se quiser a versão durável de volta, ou rode o cleanup
acima.
</details>

## Expected state / output

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

Status representativos incluem Pods Running/Complete/Failed, PVCs Bound, conditions
Accepted de Gateway ou TARGETS numéricos de HPA — compare o significado, não nomes
efêmeros.

## Explanation

O provisionamento dinâmico precisa de uma StorageClass real; o WaitForFirstConsumer mantém
intencionalmente uma PVC em Pending até um Pod ser agendado, e as duas situações parecem
iguais até você ler os Events, que revelam a causa real. A persistência vem do PV por trás
da claim — deletar o Pod não deleta esse volume, a menos que a reclaim policy determine
isso.

Os passos guiados acima provam o comportamento do control plane para esta seção; leia os
Events e os campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Quando uma PVC fica em Pending, rode `kubectl describe pvc -n "$NS"` e compare os Events
com `kubectl get storageclass`. Uma StorageClass ausente exige uma claim corrigida —
`kubectl apply -f pvc.yaml -n "$NS"` depois de consertar `storageClassName` — enquanto
WaitForFirstConsumer é normal até um Pod montá-la. Após um break→fix malsucedido, remova
apenas a claim nomeada com `kubectl delete pvc <name> -n "$NS" --ignore-not-found` antes de
reaplicar.

## Challenge solution

### Commands / manifest

```bash
kubectl describe pvc -n "$NS" | sed -n '/Events:/,$p'
kubectl get storageclass
kubectl apply -f pvc.yaml -n "$NS"
kubectl apply -f deployment-pvc.yaml -n "$NS"
kubectl get pvc -n "$NS"
kubectl exec -n "$NS" deploy/web -c toolbox -- sh -c 'echo survived > /data/sentinel'
kubectl delete pod -n "$NS" -l app=s11
kubectl get pods -n "$NS" -l app=s11
```

### Expected state / output

Os Events nomeiam ou uma StorageClass desconhecida ou a espera por um first consumer. Após
a correção, o status da PVC é Bound, e o sentinela permanece presente após a recriação do
Pod, provando que o volume reteve os dados.

### Explanation

O provisionamento dinâmico precisa de uma StorageClass real; o WaitForFirstConsumer mantém
intencionalmente uma PVC em Pending até um Pod ser agendado, e as duas situações parecem
iguais até você ler os Events, que revelam a causa real. A persistência vem do PV por trás
da claim — deletar o Pod não deleta esse volume, a menos que a reclaim policy determine
isso.

### Hints

Verifique os Events de kubectl describe pvc para distinguir StorageClass de
WaitForFirstConsumer; compare com kubectl get storageclass antes de editar a claim.
