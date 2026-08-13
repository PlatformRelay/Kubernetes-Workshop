# Lab 05 — Pod (S05) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 1 — escreva o manifesto canônico do Pod

Construa o `pod.yaml`. Nos slides você o viu crescer campo a campo; aqui está a base finalizada.

```bash
cat > pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web            # este label é como o Service do Lab 07 vai encontrar o Pod
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      resources:        # um pequeno "stub de resources" — o Lab 13 expande isso em QoS
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          cpu: 250m
          memory: 128Mi
EOF
```

**Tarefa:** valide o manifesto **sem** criar nada, depois aplique-o.

```bash
kubectl apply --dry-run=server -f pod.yaml     # o server valida; nenhum objeto é criado
kubectl apply -f pod.yaml
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply --dry-run=server -f pod.yaml
pod/web created (server dry run)

$ kubectl apply -f pod.yaml
pod/web created
```

`--dry-run=server` envia o manifesto pelas checagens de validação e de admission do API
server, mas desfaz em vez de persistir — a forma mais segura de pegar um campo ruim antes que
ele se torne real. (Offline, sem cluster, use `--dry-run=client` para checagens apenas de
schema.)
</details>

---

### Step 2 — observe-o ganhar vida

```bash
kubectl get pod web -w        # -w = watch; Ctrl-C para parar quando estiver Running
```

**Tarefa:** observe as transições de fase. Por quais fases o Pod passa antes de
`Running`?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pod web -w
NAME   READY   STATUS              RESTARTS   AGE
web    0/1     Pending             0          0s
web    0/1     ContainerCreating   0          1s
web    1/1     Running             0          4s
```

`Pending` (aceito, sendo agendado / fazendo pull da image) → `ContainerCreating` → `Running`
com `READY 1/1`. Pressione **Ctrl-C** para sair do watch. O primeiro pull pode demorar mais
enquanto a image é baixada.
</details>

---

### Step 3 — inspecione: describe, logs, debug

Três comandos que você vai usar em toda sessão de debugging pelo resto do workshop.

```bash
kubectl describe pod web        # events, image, node, conditions
kubectl logs web                # o stdout/stderr do container
kubectl exec -it web -- sh      # tente — este FALHA de propósito
```

**Tarefa:** `kubectl exec … sh` falha. Leia o erro e explique por quê — depois obtenha um shell
mesmo assim com `kubectl debug`:

```bash
kubectl debug -it web --image=busybox:1.37 --target=web -- sh
```

Dentro do shell de debug, confirme que você está no contexto do container (não no seu host)
verificando a lista de processos — o servidor de demo deve ser o PID 1. Digite `exit` para sair.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl exec -it web -- sh
error: Internal error occurred: ... exec: "sh": executable file not found in $PATH

$ kubectl debug -it web --image=busybox:1.37 --target=web -- sh
/ # ps
PID   USER     TIME  COMMAND
    1 65532     0:00 /workshop-web
   13 root      0:00 sh
   19 root      0:00 ps
/ # exit
```

A image de demo é **distroless** — contém o binário do servidor e nada mais, nem mesmo `sh`,
então não há nada para o `exec` executar. O `kubectl debug`, em vez disso, anexa um
**ephemeral container** (aqui: busybox, que tem um shell) ao Pod em execução;
`--target=web` compartilha o PID namespace do container da aplicação, então o `ps` mostra
`/workshop-web` como **PID 1** — o container tem seu próprio PID namespace, então seu processo
principal é o processo 1. `kubectl logs web` mostra a linha de inicialização do servidor
(`workshop-web v1 listening on :8080 …`); o `describe` mostra uma seção `Events` terminando em
`Started container web`.
</details>

**Pergunta:** você nunca instalou um shell no Pod — onde o shell do `debug` roda?

<details><summary>Resposta</summary>

O `kubectl debug` adiciona um **ephemeral container** à spec do Pod via API server; o
**kubelet** o inicia a partir da toolbox image que você indicou (`busybox:1.37`) *dentro dos
namespaces do Pod* e transmite a sessão de volta. Não é SSH e não precisa de porta extra — e,
ao contrário de um shell embutido na image da aplicação, ele só existe enquanto você debuga.
(O `kubectl exec` puro funciona da mesma forma, mas só consegue executar binários que já
existem na image do container.)
</details>

---

### Step 4 — quebre: uma image ruim (ImagePullBackOff)

A falha de Pod mais comum de todas. Aplique um Pod cuja tag de image não existe (imagine uma
tag digitada errado):

```bash
kubectl run web-typo --image=ghcr.io/platformrelay/workshop-web:v9.99-nope --restart=Never -n "$NS"
kubectl get pod web-typo          # repita algumas vezes, ou adicione -w
```

**Tarefa:** o Pod nunca chega a `Running`. Leia o `describe` e nomeie a razão exata.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pod web-typo
NAME       READY   STATUS             RESTARTS   AGE
web-typo   0/1     ImagePullBackOff   0          25s

$ kubectl describe pod web-typo | sed -n '/Events:/,$p'
Events:
  Type     Reason     Age                From     Message
  ----     ------     ----               ----     -------
  Normal   Scheduled  30s                default  Successfully assigned .../web-typo to ...
  Normal   Pulling    15s (x2 over 29s)  kubelet  Pulling image "ghcr.io/platformrelay/workshop-web:v9.99-nope"
  Warning  Failed     14s (x2 over 28s)  kubelet  Failed to pull image "ghcr.io/platformrelay/workshop-web:v9.99-nope": ... manifest ... not found
  Warning  Failed     14s (x2 over 28s)  kubelet  Error: ErrImagePull
  Normal   BackOff    2s  (x2 over 27s)  kubelet  Back-off pulling image "ghcr.io/platformrelay/workshop-web:v9.99-nope"
  Warning  Failed     2s  (x2 over 27s)  kubelet  Error: ImagePullBackOff
```

O status é **`ImagePullBackOff`**; os *events* dizem o porquê — a tag `v9.99-nope` não
existe, então o pull falha e o kubelet recua antes de tentar de novo. A seção de events, e não
o status de uma palavra só, é onde a resposta real sempre vive.
</details>

### Step 5 — conserte, e conheça a punchline

Não há forma limpa de "editar" a image de um Pod avulso, então delete o quebrado e (pela
punchline) delete o bom também:

```bash
kubectl delete pod web-typo
kubectl delete pod web
kubectl get pods            # o que sobrou?
```

**Tarefa:** depois de deletar o `web`, ele é recriado?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl delete pod web
pod "web" deleted
$ kubectl get pods
No resources found in <your-namespace> namespace.
```

**Nada o recria.** Um Pod avulso não tem controller observando-o — delete-o (ou deixe seu node
falhar) e ele simplesmente some. Esse é exatamente o problema que um **Deployment** resolve, e
esse é o Lab 06. Guarde seu `pod.yaml`; você o estende em seguida.
</details>

## Expected state / output

- O `web` vai de `Pending → ContainerCreating → Running` e reporta `READY 1/1`.
- `describe` e `logs` funcionam contra o Pod em execução; `exec … sh` falha (distroless — sem
  shell) e o `kubectl debug --target` te dá um shell ao lado da aplicação.
- A image com a tag ruim fica em **`ImagePullBackOff`**, e seus `Events` nomeiam a tag
  inexistente — de forma idêntica no kind e no cluster compartilhado.
- Deletar o Pod **não** o traz de volta — nenhum controller é dono dele.

## Explanation

Um Pod agrupa um ou mais containers sob uma única identidade de ciclo de vida. Justamente
porque o kubelet é dono do ciclo de vida dos containers, ele pode reiniciar
um container que falhou dentro daquele Pod, mas apenas um controller de nível mais alto cria
um Pod substituto após a deleção. Os Events mostram a causa de falhas de pull e de agendamento
que a fase, sozinha, esconde.

## Troubleshooting and recovery

Para `ImagePullBackOff`, inspecione `kubectl describe pod web-typo -n "$NS"`
e restaure a image fixada no `pod.yaml`, depois execute `kubectl apply -f pod.yaml -n "$NS"`.
Remova apenas os Pods nomeados do lab; não apague
os workloads de outros participantes.

## Challenge solution

### Commands / manifest

```bash
kubectl run crash -n "$NS" --image=busybox:1.37 -- sh -c 'sleep 10; exit 1'
UID_BEFORE=$(kubectl get pod crash -n "$NS" -o jsonpath='{.metadata.uid}')
until [ "$(kubectl get pod crash -n "$NS" -o jsonpath='{.status.containerStatuses[0].restartCount}')" -ge 1 ]; do
  sleep 2
done
UID_AFTER=$(kubectl get pod crash -n "$NS" -o jsonpath='{.metadata.uid}')
test "$UID_BEFORE" = "$UID_AFTER"
kubectl get pod crash -n "$NS"
kubectl delete pod crash -n "$NS"
kubectl get pod crash -n "$NS" --ignore-not-found
```

### Expected state / output

O contador de restarts chega a pelo menos um enquanto os dois UIDs capturados permanecem
idênticos. Após a deleção, o `get` final não imprime nada: nenhum controller recria este Pod
avulso.

### Explanation

O kubelet reinicia um container que falhou de acordo com o `restartPolicy` do Pod, mantendo o
objeto Pod e o UID — é essa a causa de o UID não mudar. A substituição do Pod inteiro exige um
controller como um Deployment ou um Job.

### Hints

Capture o `metadata.uid` antes e depois do restart; um controller altera objetos Pod, enquanto
o kubelet reinicia containers dentro de um mesmo Pod.
