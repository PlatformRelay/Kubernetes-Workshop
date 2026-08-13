# Lab 15 — Jobs & CronJobs (S15)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S15 — Jobs & CronJobs |
| **Environment** | namespace ✓ / kind ✓ *(sem cluster-admin; Jobs/CronJobs vivem no seu próprio namespace)* |
| **Estimated time** | 20 min |

## Objective

Executar trabalho finito do jeito que o Kubernetes espera. Você vai rodar um **Job** até a
conclusão e ler seus logs, colocar o mesmo trabalho em um **CronJob** e observá-lo disparar em
um schedule (e podar o próprio histórico), depois quebrar um Job de propósito para que ele tente
de novo até seu **`backoffLimit`** e termine em **`BackoffLimitExceeded`** — sendo o ponto todo o
contraste com um Deployment, que reiniciaria aquele trabalho "terminado" **para sempre**.

> **Defina seu namespace uma vez.** Tudo roda no seu namespace atribuído (ou em um cluster kind).
> Defina uma variável de shell para que todo comando seja copiável e colável:
>
> ```bash
> export NS=<your-assigned-namespace>          # usuários de kind: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Conceitos dos Labs 05–06 (Pod, Deployment). Este lab **cria seus próprios** objetos e não
  depende de sobras de labs anteriores.
- `kubectl` apontando para seu namespace atribuído **ou** um cluster kind local. Sem direitos de admin.
- Acesso de pull à internet para `busybox:1.37` (uma image minúscula; qualquer image pequena serve).
- Um pouco de paciência: um CronJob por minuto dispara no máximo **uma vez por minuto**, então o
  Step 1 envolve alguns minutos de observação.

## Files used

- `job-report.yaml` — um Job de uma só execução que imprime uma linha e sai com `0`.
- `cronjob-report.yaml` — o mesmo trabalho embrulhado em um CronJob por minuto.
- `job-failing.yaml` — um Job cujo comando sai com código diferente de zero, para acionar o `backoffLimit`.
- `job-fixed.yaml` — o mesmo Job com o comando corrigido.

Tudo é rotulado com `app: s15`, então o cleanup é um único label selector.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./15-jobs.solution.md#guided-solutions)

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

**Pergunta:** o Job está `Complete`, mas o `kubectl get pods -l app=s15` ainda mostra o Pod como
`Completed`. Por que o Pod terminado continua por ali em vez de ser deletado?

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

**Tarefa:** deixe rodar alguns minutos, depois confirme que o **history limit** está podando os
Jobs antigos — você nunca deve ver mais do que `successfulJobsHistoryLimit` (3) Jobs
bem-sucedidos mantidos.

```bash
# depois de ~4–5 minutos:
kubectl get jobs -l app=s15
```

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

**Pergunta:** por que o Job que falhava parou depois de apenas um punhado de Pods, e o que teria
sido diferente com `restartPolicy: OnFailure`?

**Pergunta:** seu CronJob noturno às vezes demora mais de um minuto. Com
`concurrencyPolicy: Forbid`, o que acontece no próximo tique — e como `Allow` ou `Replace`
seriam diferentes?

## Observe

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

## Challenge

Preveja e depois prove como o concurrencyPolicy Forbid se comporta quando um tique do
CronJob chega enquanto o Job anterior ainda está Running — depois contraste Allow e Replace
sem redigitar toda a demo de histórico do guiado.

**Difficulty:** Intermediate

**Success criteria:** Identifique pelos Events do CronJob ou pelos timestamps dos Jobs que o Forbid pula um tique
sobreposto, compare um sinal observável para Allow (Jobs concorrentes presentes) versus
Replace, e deixe o CronJob suspenso ou deletado.

**Hints:** Suspenda o CronJob ao terminar; compare o LAST SCHEDULE com os Jobs ativos; leia o
concurrencyPolicy no spec do CronJob.

[Spoiler: solução do challenge](./15-jobs.solution.md#challenge-solution)

## Verify

Confirme as evidências de Job/CronJob antes do cleanup.

```bash
kubectl get cronjob,job,pods -n "$NS" -l app=s15
kubectl get job -n "$NS" -l app=s15 -o custom-columns=NAME:.metadata.name,STATUS:.status.conditions[*].type
```

Esperado: os Jobs/CronJobs rotulados ainda mostram status Complete ou Failed vindos dos passos
guiados (suspenda o CronJob se ele ainda estiver disparando).

## Cleanup / reset

```bash
# cleanup com escopo — tudo que este lab criou é rotulado app=s15
kubectl delete cronjob,job -l app=s15 -n "$NS" --ignore-not-found
kubectl delete pod -l app=s15 -n "$NS" --ignore-not-found     # quaisquer Pods Completed/Error remanescentes
rm -f job-report.yaml cronjob-report.yaml job-failing.yaml job-fixed.yaml job-queue.yaml

# reset de pânico (namespace): remove também qualquer outra coisa que este lab possa ter deixado
# kubectl delete cronjob,job,pod --all -n "$NS" --ignore-not-found
# reset de pânico (kind): make kind-down && make kind-up   # ou: kind delete cluster
```

> **Delete o CronJob quando terminar.** Um CronJob por minuto deixado rodando vai continuar
> gerando Jobs e Pods a cada minuto no seu namespace — `kubectl delete cronjob report` o para (ou
> `kubectl patch cronjob report -p '{"spec":{"suspend":true}}'` o pausa sem deletar).

## Stretch (opcional) — uma fila de trabalho paralela

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

---

> **Nota de entrega (convenção do repo).** Os manifestos aqui foram escritos contra `batch/v1` e
> validados com `kubectl apply --dry-run=server` em um cluster real, mas o lab **não foi executado
> de ponta a ponta** no ambiente de autoria (o único cluster alcançável era um namespace de
> produção compartilhado, fora dos limites para criar objetos). Antes do ensaio, rode isto uma vez
> em um cluster **kind** limpo para confirmar: a contagem exata de Pods em
> `BackoffLimitExceeded`, a cadência de disparo do CronJob por minuto e a poda do history limit
> depois de vários tiques.
