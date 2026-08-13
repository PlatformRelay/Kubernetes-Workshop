# Lab 15 — Jobs & CronJobs (S15) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 0 — um Job que roda até a conclusão

Um **Job** embrulha uma spec de Pod e adiciona um contrato de conclusão: ele roda o Pod até que
ele **tenha sucesso** (exit `0`), e então para. Note o `restartPolicy: Never` do Pod — um Job só
pode usar `Never` ou `OnFailure`, nunca `Always`.

```bash
cat > job-report.yaml <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: report
  labels: { app: s15 }
spec:
  backoffLimit: 4
  template:
    metadata:
      labels: { app: s15 }
    spec:
      restartPolicy: Never
      containers:
        - name: report
          image: busybox:1.37
          command: ["sh", "-c", "echo 'nightly report generated'; sleep 3"]
EOF

kubectl apply -f job-report.yaml
kubectl get job report -w        # espere por COMPLETIONS 1/1, depois Ctrl-C
```

**Tarefa:** confirme que o Job concluiu, depois leia a saída do Pod que ele criou.

```bash
kubectl get job report
kubectl logs job/report          # logs do Pod do Job, pelo nome do Job
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get job report
NAME     STATUS     COMPLETIONS   DURATION   AGE
report   Complete   1/1           4s         30s

$ kubectl logs job/report
nightly report generated
```

`COMPLETIONS 1/1` significa que um Pod bem-sucedido satisfez `completions: 1` (o padrão), então o
Job está `Complete` e **nada reinicia** — o container saiu com `0` e o Kubernetes trata isso como
o objetivo, não como falha. O `kubectl logs job/report` resolve o Job até seu Pod para você.
Contraste isso com um Deployment: ali um exit `0` seria um "crash" e o Pod seria recriado.
</details>

**Pergunta:** o Job está `Complete`, mas o `kubectl get pods -l app=s15` ainda mostra o Pod como
`Completed`. Por que o Pod terminado continua por ali em vez de ser deletado?

<details><summary>Resposta</summary>

Um Job **mantém seus Pods terminados de propósito**, para que você ainda possa ler os logs deles e
inspecionar a saída do `describe` depois do fato — o `STATUS` do Pod é `Completed` (fase
`Succeeded`), não em execução. Eles são limpos quando você deleta o Job, quando o history limit de
um CronJob os poda (Step 1), ou automaticamente se você definir **`ttlSecondsAfterFinished`** no
Job (por exemplo, `100` → o Job e seus Pods se autodeletam 100s depois de terminar). Sem uma
dessas coisas, Jobs concluídos se acumulam — que é exatamente o motivo de CronJobs terem history
limits.
</details>

---

### Step 1 — coloque o mesmo trabalho em um schedule (CronJob)

Um **CronJob** é uma fábrica de Jobs: a cada tique do cron ele carimba um novo Job a partir do
seu `jobTemplate`. Use um schedule **por minuto** para não esperar muito. (Um minuto é a
granularidade mais fina do cron — você não consegue agendar mais rápido que isso.)

```bash
cat > cronjob-report.yaml <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: report
  labels: { app: s15 }
spec:
  schedule: "*/1 * * * *"            # a cada minuto
  concurrencyPolicy: Forbid         # nunca sobrepor execuções
  successfulJobsHistoryLimit: 3      # mantenha os 3 últimos Jobs bem-sucedidos
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      backoffLimit: 4
      template:
        metadata:
          labels: { app: s15 }
        spec:
          restartPolicy: Never
          containers:
            - name: report
              image: busybox:1.37
              command: ["sh", "-c", "echo 'scheduled report'; sleep 3"]
EOF

# o CronJob "report" colidiria com o Job "report" do Step 0 — remova aquele primeiro
kubectl delete job report --ignore-not-found
kubectl apply -f cronjob-report.yaml
```

**Tarefa:** observe o CronJob disparar. Em ~60–120s você deve ver `LAST SCHEDULE` ser preenchido
e os Jobs gerados aparecerem.

```bash
kubectl get cronjob report                       # observe LAST SCHEDULE ir de <none> para um horário
kubectl get jobs -l app=s15 --sort-by=.metadata.creationTimestamp
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get cronjob report
NAME     SCHEDULE      TIMEZONE   SUSPEND   ACTIVE   LAST SCHEDULE   AGE
report   */1 * * * *   <none>     False     0        30s             2m

$ kubectl get jobs -l app=s15 --sort-by=.metadata.creationTimestamp
NAME              STATUS     COMPLETIONS   DURATION   AGE
report-29...01    Complete   1/1           5s         2m
report-29...02    Complete   1/1           4s         62s
report-29...03    Complete   1/1           5s         2s
```

A cada minuto o CronJob cria um novo Job chamado `report-<timestamp>`. O `LAST SCHEDULE` mostra há
quanto tempo o tique mais recente disparou; `ACTIVE 0` significa que nada está rodando neste
momento (cada Job termina em segundos). `TIMEZONE <none>` significa que o schedule é avaliado na
zona padrão do controller (UTC) — defina `spec.timeZone: "Europe/Berlin"` para fixá-la.
</details>

**Tarefa:** deixe rodar alguns minutos, depois confirme que o **history limit** está podando os
Jobs antigos — você nunca deve ver mais do que `successfulJobsHistoryLimit` (3) Jobs
bem-sucedidos mantidos.

```bash
# depois de ~4–5 minutos:
kubectl get jobs -l app=s15
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get jobs -l app=s15
NAME              STATUS     COMPLETIONS   DURATION   AGE
report-29...05    Complete   1/1           4s         2m
report-29...06    Complete   1/1           5s         62s
report-29...07    Complete   1/1           4s         3s
```

Mesmo depois de cinco ou seis tiques, restam apenas **3** Jobs bem-sucedidos — o controller do
CronJob faz garbage collection dos Jobs terminados mais antigos (e dos Pods deles) além do
`successfulJobsHistoryLimit`. Aumente o limite para guardar mais histórico para debugging;
mantenha-o baixo para que um CronJob por minuto não soterre seu namespace em Pods `Completed`.
**Suspenda-o agora para que ele pare de disparar enquanto você faz o Step 2:**

```console
$ kubectl patch cronjob report -p '{"spec":{"suspend":true}}'
cronjob.batch/report patched
```

</details>

---

### Step 2 — quebre→conserte: um Job que falha até bater no `backoffLimit`

Um Job não tenta de novo para sempre. A cada falha ele faz uma nova tentativa, até
`backoffLimit` vezes; então desiste e é marcado como **Failed** com o motivo
**`BackoffLimitExceeded`**. Reproduza isso com um comando que sempre sai com código diferente de
zero. Usamos `restartPolicy: Never`, então **cada nova tentativa é um Pod novinho em folha** —
você consegue literalmente contar as tentativas.

```bash
cat > job-failing.yaml <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: flaky
  labels: { app: s15 }
spec:
  backoffLimit: 3                    # desiste depois desta quantidade de tentativas falhas
  template:
    metadata:
      labels: { app: s15 }
    spec:
      restartPolicy: Never
      containers:
        - name: flaky
          image: busybox:1.37
          command: ["sh", "-c", "echo 'trying...'; exit 1"]   # sempre falha
EOF

kubectl apply -f job-failing.yaml
kubectl get job flaky -w            # espere até o STATUS mostrar que ele parou de tentar, depois Ctrl-C
```

**Tarefa:** o Job nunca tem sucesso. Quantos Pods ele criou, e o que o `describe` diz que
finalmente o parou?

```bash
kubectl get pods -l app=s15 --field-selector=status.phase=Failed
kubectl describe job flaky | sed -n '/Events/,$p'
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pods -l app=s15 --field-selector=status.phase=Failed
NAME          READY   STATUS   RESTARTS   AGE
flaky-abc12   0/1     Error    0          70s
flaky-def34   0/1     Error    0          55s
flaky-ghi56   0/1     Error    0          35s
flaky-jkl78   0/1     Error    0          10s

$ kubectl describe job flaky
...
Events:
  Type     Reason                Age   From            Message
  ----     ------                ----  ----            -------
  Normal   SuccessfulCreate      70s   job-controller  Created pod: flaky-abc12
  Normal   SuccessfulCreate      55s   job-controller  Created pod: flaky-def34
  Normal   SuccessfulCreate      35s   job-controller  Created pod: flaky-ghi56
  Normal   SuccessfulCreate      10s   job-controller  Created pod: flaky-jkl78
  Warning  BackoffLimitExceeded  2s    job-controller  Job has reached the specified backoff limit
```

O Job para depois de um número **pequeno e limitado** de Pods falhos (governado pelo
`backoffLimit: 3`) e reporta **`BackoffLimitExceeded`** — o sinal nomeado no AC. Como o
`restartPolicy` é `Never`, cada tentativa falha é um **Pod separado** (todos em `Error`), então
você consegue contá-los. O `kubectl get job flaky` agora mostra `STATUS Failed`. As tentativas
também têm **rate limit** com um backoff exponencial (10s, 20s, 40s…), que é o motivo de elas
ficarem espaçadas em vez de instantâneas.

> O número exato de Pods é uma contagem pequena e limitada, atrelada ao `backoffLimit` — ancore-se
> no motivo **`BackoffLimitExceeded`**, não em um número decorado. (Este lab foi escrito contra
> `batch/v1` em um servidor real, mas a execução do Job que falha não foi feita de ponta a ponta
> aqui — veja a nota no final; confirme a contagem precisa no seu cluster.)
</details>

**Tarefa:** conserte o comando para que o container saia com `0`, e confirme que o Job conclui.
(O template de Pod de um Job é imutável, então delete e recrie.)

```bash
cat > job-fixed.yaml <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: flaky
  labels: { app: s15 }
spec:
  backoffLimit: 3
  template:
    metadata:
      labels: { app: s15 }
    spec:
      restartPolicy: Never
      containers:
        - name: flaky
          image: busybox:1.37
          command: ["sh", "-c", "echo 'fixed — exiting 0'; exit 0"]   # tem sucesso
EOF

kubectl delete job flaky
kubectl apply -f job-fixed.yaml
kubectl get job flaky            # COMPLETIONS 1/1, STATUS Complete
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get job flaky
NAME    STATUS     COMPLETIONS   DURATION   AGE
flaky   Complete   1/1           3s         8s
```

Um Pod bem-sucedido, `COMPLETIONS 1/1`, `Complete`, nenhum `BackoffLimitExceeded`. No mundo real o
"conserto" costuma ser o comando / a image / a config do container que estava errada — o
`backoffLimit` apenas impede que um Job condenado fique tentando de novo até a eternidade
enquanto você a encontra.
</details>

**Pergunta:** por que o Job que falhava parou depois de apenas um punhado de Pods, e o que teria
sido diferente com `restartPolicy: OnFailure`?

<details><summary>Resposta</summary>

O `backoffLimit` (aqui `3`) limita o número de novas tentativas; esgotadas, o Job é marcado como
**Failed** (`BackoffLimitExceeded`) e para de criar Pods — essa é a proteção que impede um job de
batch quebrado de ficar em loop para sempre do jeito que um Deployment ficaria. Com
**`restartPolicy: Never`** cada tentativa é um **Pod novo**, então você viu vários Pods em `Error`
se acumularem. Com **`restartPolicy: OnFailure`** o Job reinicia o container **no lugar**, no
**mesmo** Pod, então você veria um único Pod com um contador de `RESTARTS` subindo e nenhuma pilha
de Pods — mesmo teto de `backoffLimit`, formato diferente. É por isso que este lab usa `Never`:
isso torna a contagem de tentativas visível como Pods distintos.
</details>

**Pergunta:** seu CronJob noturno às vezes demora mais de um minuto. Com
`concurrencyPolicy: Forbid`, o que acontece no próximo tique — e como `Allow` ou `Replace`
seriam diferentes?

<details><summary>Resposta</summary>

- **`Forbid`** (o que definimos): se a execução anterior ainda está ativa quando o próximo tique
  chega, o CronJob **pula** aquele tique por inteiro — nenhuma segunda execução começa. Seguro
  para um job que não pode se sobrepor a si mesmo (um backup escrevendo em um único destino, uma
  migração).
- **`Allow`** (o padrão): a próxima execução começa **mesmo assim**, então duas (ou mais)
  execuções rodam concorrentemente — tudo bem para um job rápido e idempotente, perigoso para um
  job lento e com estado.
- **`Replace`**: o CronJob **mata o Job ainda em execução** e começa um novo, então só a execução
  mais recente sobrevive — útil quando apenas o último resultado importa.

</details>

### Stretch (opcional) — uma fila de trabalho paralela

Um único Job pode rodar muitos Pods. Defina `completions` (quantos sucessos terminam o Job) e
`parallelism` (quantos rodam ao mesmo tempo) para processar um lote em paralelo.

```bash
cat > job-queue.yaml <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: batch
  labels: { app: s15 }
spec:
  completions: 6                     # 6 Pods bem-sucedidos = pronto
  parallelism: 2                     # no máximo 2 rodando por vez
  backoffLimit: 4
  template:
    metadata:
      labels: { app: s15 }
    spec:
      restartPolicy: Never
      containers:
        - name: worker
          image: busybox:1.37
          command: ["sh", "-c", "echo \"worker $(date +%s)\"; sleep 4"]
EOF

kubectl apply -f job-queue.yaml
kubectl get job batch -w           # COMPLETIONS sobe 0/6 → 2/6 → 4/6 → 6/6, depois Ctrl-C
```

<details><summary>Solução / o que você está vendo</summary>

```console
$ kubectl get job batch
NAME    STATUS     COMPLETIONS   DURATION   AGE
batch   Complete   6/6           14s        20s
```

O Job agenda Pods em ondas de `parallelism` (2 por vez) até alcançar `completions` (6 sucessos), e
então para. O `kubectl get pods -l app=s15` mostra seis Pods worker `Completed`. Esse é o fan-out
embutido para trabalho de batch embaraçosamente paralelo — nenhuma fila externa é necessária para
o caso simples de contagem fixa. (Para uma fila de trabalho dinâmica, remova `completions` e faça
os workers puxarem tarefas até a fila esvaziar.) Cleanup: `kubectl delete job batch`.
</details>

## Expected state / output

- Um **Job** roda até a conclusão: exit `0` → `COMPLETIONS 1/1`, `Complete`, nada reinicia.
  Os Pods terminados ficam por ali (como `Completed`) por causa dos logs, até o GC ou o
  `ttlSecondsAfterFinished`.
- Um **CronJob** cria um novo Job por tique (`*/1` = a cada minuto), acompanha o `LAST SCHEDULE` e
  poda os Jobs terminados além de `successfulJobsHistoryLimit` / `failedJobsHistoryLimit`.
- Um Job que falha tenta de novo até o **`backoffLimit`** (com rate limit e backoff exponencial) e
  então fica **Failed** com **`BackoffLimitExceeded`**; com `restartPolicy: Never` cada tentativa é um Pod novo.
- O `concurrencyPolicy` decide a sobreposição: **Forbid** pula, **Allow** sobrepõe, **Replace** substitui.
- O contraste central com S06: um **Deployment** trata o exit `0` como falha e reinicia para
  sempre; um **Job** o trata como sucesso e para.

Status representativos incluem Pods Running/Complete/Failed, PVCs Bound, conditions
Accepted de Gateway ou TARGETS numéricos de HPA — compare o significado, não nomes efêmeros.

## Explanation

O concurrencyPolicy é o contrato de sobreposição do CronJob. Forbid protege trabalho de batch
não reentrante pulando tiques; Allow permite fan-out; Replace mantém apenas a execução mais
recente. Escolher a policy errada é uma classe de incidente de produção — ela é a causa direta
de execuções sobrepostas ou perdidas —, então o challenge é diagnosticar a semântica da policy,
e não redigitar o schedule.

Os passos guiados acima provam o comportamento do control plane desta seção; leia os Events e
os campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Para um Job travado em `BackoffLimitExceeded`, inspecione `kubectl describe job -n "$NS"` e tire
a execução falha com `kubectl delete job <name> -n "$NS" --ignore-not-found` antes de reaplicar um
manifesto de Job corrigido. Quando tiques do CronJob se sobrepõem sob
`concurrencyPolicy: Forbid`, leia `kubectl describe cronjob -n "$NS"` em busca dos schedules
pulados; suspenda as sobras com
`kubectl patch cronjob <name> -n "$NS" --type=merge -p '{"spec":{"suspend":true}}'` para que o
namespace não continue gerando trabalho depois do lab.

## Challenge solution

### Commands / manifest

```bash
kubectl get cronjob report -n "$NS" -o jsonpath='{.spec.concurrencyPolicy}{"\n"}'
kubectl get jobs -n "$NS" -l app=s15 --sort-by=.metadata.creationTimestamp
kubectl describe cronjob report -n "$NS" | sed -n '/Events:/,$p'
kubectl patch cronjob report -n "$NS" -p '{"spec":{"suspend":true}}'
```

### Expected state / output

Com o Forbid, um tique sobreposto não cria um segundo Job ativo. O Allow mostraria Jobs
concorrentes presentes; o Replace encerraria o Job mais antigo e iniciaria um novo. O
CronJob termina suspenso ou deletado, então para de disparar.

### Explanation

O concurrencyPolicy é o contrato de sobreposição do CronJob. Forbid protege trabalho de batch
não reentrante pulando tiques; Allow permite fan-out; Replace mantém apenas a execução mais
recente. Escolher a policy errada é uma classe de incidente de produção — ela é a causa direta
de execuções sobrepostas ou perdidas —, então o challenge é diagnosticar a semântica da policy,
e não redigitar o schedule.

### Hints

Suspenda o CronJob ao terminar; compare o LAST SCHEDULE com os Jobs ativos; leia o
concurrencyPolicy no spec do CronJob.
