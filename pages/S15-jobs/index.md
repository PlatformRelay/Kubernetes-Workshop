---
layout: section-cover
image: /covers/section-15-courier-hourglass.webp
day: Day 2
section: '15'
tier: recommended
track: Workloads
---

# Jobs & CronJobs

Algum trabalho foi feito para **terminar** — e parte dele em um **horário marcado**.

**recommended** · sugerido para o Day 2 · trilha Workloads

<!--
Seção S15 — Jobs & CronJobs. Tempo: ~20 min de slides + 20 min de lab. Vem depois do S14. Tier
recommended, trilha Workloads. Animação: NENHUMA (conforme o outline) — as mudanças de estado
aqui (um Job ficando Complete, um CronJob disparando) são lidas no `kubectl get`, não uma
transição digna de componente.
Resultado: os participantes conseguem escolher run-to-completion vs run-forever, dirigir um Job
com completions/parallelism/backoffLimit/activeDeadlineSeconds, envolvê-lo em um CronJob
(schedule/concurrencyPolicy/limites de histórico), e saber quando um Job supera um Deployment.
Beats: problema (um Deployment reinicia para sempre — errado para trabalho finito) · modelo
mental (Job = run-to-completion, CronJob = Jobs agendados) · code-annotated (botões do Job,
ressalva do restartPolicy) · magic-move (Job one-shot → envolver em um jobTemplate de CronJob)
· controles do CronJob (concorrência, histórico, timeZone) · beat de decisão (Job vs Deployment
vs CronJob) · recap → lab.
CKx: CKAD Workloads (batch) — item explícito do exame.
-->

---
layout: statement
kicker: O problema
---

O trabalho inteiro de um Deployment é **nunca terminar**. Algum trabalho precisa do oposto.

Tudo na red line até agora — Pod, Deployment, Service — assume um processo que deve ficar de pé
**para sempre**; se ele sai, o Deployment o reinicia. Aponte isso para uma **migração de banco de
dados**, um **relatório noturno** ou um **backup** e você tem um desastre: a tarefa tem sucesso,
sai com `0`, e o Kubernetes **a reinicia mesmo assim** — rodando a sua migração em um loop sem
fim. Trabalho finito precisa de um controller que entenda **"pronto"**.

<!--
Speaker: o beat do "por que eu deveria me importar". Deployment/ReplicaSet é construído em torno
de uma suposição de vida contínua — o estado desejado é "N Pods Running", então um container que
sai (mesmo com sucesso) é um desvio que o controller corrige reiniciando-o. Isso é exatamente o
errado para trabalho batch: uma migração que termina deve CONTINUAR terminada. Rode-a sob um
Deployment e ela loopa para sempre; o sucesso com exit 0 é tratado como um crash. O conserto é um
controller cuja condição de sucesso é "o Pod rodou até completar" em vez de "o Pod está de pé".
Esse controller é o Job. Segure isso: run-to-completion é o modelo mental inteiro desta seção.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · dois controllers construídos em torno do "pronto"</span>

# Job roda uma vez · CronJob roda num cronograma

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Job — rodar até completar" kind="job" variant="ok">
      Roda seu(s) Pod(s) até eles <strong>terem sucesso</strong>, então para. Rastreia
      sucesso/falha, tenta de novo em caso de falha até um limite, e reporta
      <code>COMPLETIONS</code>. A ferramenta certa para uma migração, um import em batch, um
      script pontual.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="CronJob — Jobs num horário marcado" kind="cronjob" variant="ok">
      Uma <strong>fábrica de Jobs</strong>: a cada tick do cron ele cria um Job novo a partir de
      um template. A ferramenta certa para um backup noturno, um relatório de hora em hora, uma
      limpeza periódica.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">a única distinção da qual tudo depende</span>

<div class="kw-cols-2 mt-1">
  <KwCard heading="Rodar para sempre" icon="♾️">
    Deployment / ReplicaSet / StatefulSet — estado desejado é <strong>N Pods de pé</strong>. Exit =
    restart. <span class="kw-muted">Services, aplicações web, controllers.</span>
  </KwCard>
  <KwCard heading="Rodar até completar" kind="job" variant="ok">
    Job / CronJob — estado desejado é <strong>o trabalho terminado</strong>. Exit&nbsp;0 = sucesso,
    <strong>pronto</strong>. <span class="kw-muted">Migrações, backups, relatórios.</span>
  </KwCard>
</div>

</div>

</div>

<!--
Speaker: a seção inteira é um eixo — este workload tem um fim natural? Um Job envolve um spec de
Pod e adiciona um contrato de conclusão: ele observa o Pod, e quando o container sai com 0 o Job
está Complete e nada reinicia. Em caso de falha ele tenta de novo (limitado por backoffLimit). Um
CronJob é um agendador fino por cima: ele guarda um jobTemplate e, a cada tick do cronograma,
estampa um Job novo — então um CronJob "possui" Jobs do mesmo jeito que um Deployment "possui"
ReplicaSets. O clique 3 é o chapéu seletor que os alunos devem guardar: controllers run-forever
(Deployment/STS) tratam exit como falta; controllers run-to-completion (Job/CronJob) tratam
exit 0 como a meta. Todo o restante desta seção são os botões desses dois.
-->

---
layout: code-annotated
heading: 'Um Job é um spec de Pod mais um contrato de conclusão'
compact: true
lab: labs/day-2/15-jobs.md
---

```yaml {none|1-2|7|9-10|11-12}
apiVersion: batch/v1
kind: Job
metadata: { name: greeter, labels: { app: s15 } }
spec:
  template:                         # <- um template de Pod normal
    spec:
      restartPolicy: Never          # Jobs: Never ou OnFailure — NUNCA Always
      containers: [{ name: work, image: busybox:1.37, command: ["sh","-c","echo done"] }]
  completions: 1                    # quantos Pods com sucesso = o Job está pronto
  parallelism: 1                    # quantos Pods podem rodar ao mesmo tempo
  backoffLimit: 4                   # tentativas antes de o Job ser marcado Failed
  activeDeadlineSeconds: 120        # teto duro de relógio de parede para o Job inteiro
```

::notes::

<CodeNote at="1" label="batch/v1 — a API de batch" variant="ok">
Job e CronJob vivem ambos em <code>batch/v1</code>. O corpo é um template de Pod que você já
conhece — um Job é isso <em>mais</em> os quatro botões abaixo.
</CodeNote>

<CodeNote at="2" label="restartPolicy: o único campo de Pod que muda" variant="danger">
O Pod de um Job <strong>precisa</strong> ser <code>Never</code> ou <code>OnFailure</code> —
<code>Always</code> é rejeitado ("sempre reiniciar" ⊥ "rodar até completar").
</CodeNote>

<CodeNote at="3" label="completions &amp; parallelism">
<code>1</code>/<code>1</code> = rodar uma vez. Aumente os dois para uma fila de trabalho —
<code>completions: 10, parallelism: 3</code> = 10 sucessos, ≤3 por vez.
</CodeNote>

<CodeNote at="4" label="as duas formas de um Job desistir" variant="warn">
<code>backoffLimit</code> limita as <strong>tentativas</strong> → <code>BackoffLimitExceeded</code>;
<code>activeDeadlineSeconds</code> limita o <strong>relógio de parede</strong> → <code>DeadlineExceeded</code>.
</CodeNote>

<!--
Speaker: leia como "template de Pod + quatro números". A nota do restartPolicy é a que morde as
pessoas — copie o spec de Pod de um Deployment (restartPolicy Always por default) para dentro de
um Job e o API server o rejeita; Jobs só permitem Never ou OnFailure. Never vs OnFailure importa
para o lab: com Never cada tentativa é um Pod novinho (você verá vários Pods se acumulando); com
OnFailure o mesmo Pod reinicia no lugar (o contador de restarts sobe, a contagem de Pods não).
completions/parallelism transformam um Job único em uma fila de trabalho paralela — completions é
a linha de chegada, parallelism a largura. backoffLimit limita as tentativas (default 6);
activeDeadlineSeconds é o teto ortogonal de relógio de parede — as tentativas podem ser cada uma
curta e mesmo assim o Job ficar pendurado, então o deadline é um cinto de segurança separado.
Visão compacta de ensino; o lab entrega os arquivos completos aplicáveis.
-->

---
layout: code-walkthrough
heading: 'Construa passo a passo — um Job one-shot, depois coloque-o num cronograma'
lab: labs/day-2/15-jobs.md
---

````md magic-move
```yaml
# 1: um Job one-shot — roda uma vez, e então está Complete
apiVersion: batch/v1
kind: Job
metadata: { name: report, labels: { app: s15 } }
spec:
  backoffLimit: 4
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: report
          image: busybox:1.37
          command: ["sh", "-c", "echo 'nightly report'; sleep 3"]
```

```yaml
# 2: envolva o MESMO spec de pod em um CronJob — agora ele roda toda noite às 02:00
apiVersion: batch/v1
kind: CronJob
metadata: { name: report, labels: { app: s15 } }
spec:
  schedule: "0 2 * * *"             # min hora dia-do-mês mês dia-da-semana  (02:00 diário)
  jobTemplate:                      # <- o Job do passo 1, um nível mais fundo
    spec:
      backoffLimit: 4
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: report
              image: busybox:1.37
              command: ["sh", "-c", "echo 'nightly report'; sleep 3"]
```

```yaml
# 3: adicione os controles operacionais que tornam um cronograma seguro
apiVersion: batch/v1
kind: CronJob
metadata: { name: report, labels: { app: s15 } }
spec:
  schedule: "0 2 * * *"
  timeZone: "Europe/Berlin"         # o cron dispara NESTE fuso, não no UTC do cluster
  concurrencyPolicy: Forbid         # uma execução ainda em andamento? pule o próximo tick
  startingDeadlineSeconds: 120      # perdeu o tick por >120s? pule, não recupere atrasados
  successfulJobsHistoryLimit: 3     # guarde os últimos 3 Jobs com sucesso (default 3)
  failedJobsHistoryLimit: 1         # guarde o último 1 Job com falha (default 1)
  jobTemplate:
    spec:
      backoffLimit: 4
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: report
              image: busybox:1.37
              command: ["sh", "-c", "echo 'nightly report'; sleep 3"]
```
````

<!--
Speaker: três quadros, um manifesto que cresce. (1) O Job one-shot — aplique, ele roda uma vez,
COMPLETIONS vai de 0/1 → 1/1, pronto. (2) Envolva-o: o jobTemplate.spec de um CronJob É um spec
de Job, então o corpo inteiro do passo 1 encaixa UM NÍVEL MAIS FUNDO
(spec.jobTemplate.spec.template — destaque o aninhamento, é o bug de copy-paste nº 1). O mesmo
Pod, agora num cronograma cron de 5 campos. (3) Os controles que separam um brinquedo de um
cronograma de produção: timeZone (GA — sem ele o cron dispara em UTC e o seu job "das 2h" roda na
hora errada); concurrencyPolicy Forbid (se a execução de ontem à noite ainda está rodando, não
inicie uma segunda — a alternativa Allow sobrepõe, Replace mata a antiga); startingDeadlineSeconds
(se o controller estava fora do ar e perdeu a janela, não faça um estouro de recuperação de cada
execução perdida); e os dois limites de histórico (quantos Jobs terminados guardar para
debugging — defaults 3 com sucesso / 1 com falha). Note que este magic-move é a visão compacta de
ensino; os arquivos do lab são em estilo de bloco e aplicáveis.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">CronJob · o que acontece quando uma execução sobrepõe ou um tick é perdido</span>

# Três controles mantêm um cronograma são

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.85rem;">
  <v-click at="1">
    <KwCard heading="concurrencyPolicy" kind="cronjob">
      <strong>Allow</strong> (default) — execuções podem sobrepor.<br>
      <strong>Forbid</strong> — pule o tick se a última execução ainda está rodando.<br>
      <strong>Replace</strong> — mate a que está rodando, comece do zero.
      <div class="kw-muted mt-1">Backup lento + <code>Allow</code> = dois backups brigando.
      Use <code>Forbid</code>.</div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="limites de histórico" icon="🧹">
      <code>successfulJobsHistoryLimit: 3</code> · <code>failedJobsHistoryLimit: 1</code>.
      <div class="kw-muted mt-1">Jobs terminados antigos (e seus Pods) sofrem garbage collection
      além do limite — guarde o suficiente para ler logs, não o bastante para entupir o
      namespace.</div>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="timeZone & deadline" icon="🕑">
      <code>timeZone</code> fixa o relógio do cron (o default é o <strong>UTC</strong> do controller).
      <code>startingDeadlineSeconds</code> limita quão atrasada uma execução perdida ainda pode iniciar.
      <div class="kw-muted mt-1">Os dois guardam a distância entre "quando eu quis" e "quando disparou".</div>
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-3 kw-muted text-sm">

Um CronJob é só um **agendador** — a cada tick ele apenas cria um Job e passa o bastão. Todo o
comportamento de run-to-completion (tentativas, `completions`, `activeDeadlineSeconds`) vive no
`jobTemplate`, exatamente como se você tivesse aplicado aquele Job à mão.

</div>

</div>

<!--
Speaker: estes são os campos que separam um CronJob de demo de um em que você confiaria em
produção. concurrencyPolicy é o grande: o default Allow deixa execuções sobreporem, o que é ok
para um job rápido e idempotente e catastrófico para um backup lento que agora tem duas cópias
escrevendo ao mesmo tempo — essa é a pergunta do Forbid no lab. Os limites de histórico são
faxina: o controller guarda os últimos N Jobs terminados para você poder ler logs, e faz GC do
resto (com seus Pods) — configure-os altos demais e um CronJob por minuto entulha o namespace com
centenas de Pods Completed. timeZone (GA) conserta o clássico "meu job das 2h rodou às 3h" — sem
ele o cronograma é avaliado no fuso do controller, historicamente UTC. startingDeadlineSeconds
limita a recuperação: se o controller ficou fora do ar durante um tick, isso limita quão velha
uma execução pode ser e ainda disparar, prevenindo um estouro de recuperação de atrasados. O
clique 4 é o enquadramento para deixar com eles: CronJob agenda, Job executa — não procure lógica
de retry no CronJob, está tudo no jobTemplate.
-->

---
layout: comparison
heading: 'Qual controller? Siga o tempo de vida do trabalho'
leftHeading: 'Deployment'
leftBadge: 'roda para sempre'
rightHeading: 'Job / CronJob'
rightBadge: 'roda até completar'
---

**Use um Deployment quando o processo deve ficar de pé.**

- Um servidor, API ou worker que deve estar sempre `Running`.
- Exit é uma **falta** → o ReplicaSet o reinicia para manter `replicas`.
- Escala por **disponibilidade & throughput**, não por "terminar".

<v-clicks>

- ❌ Errado para uma migração: tem sucesso, sai com 0, é **reiniciada para sempre**.

</v-clicks>

::right::

**Use um Job quando o trabalho tem um fim natural** — um **CronJob** se ele também **se repete**.

- Uma migração, import, backup, relatório ou script pontual.
- Exit 0 é **sucesso** → nada reinicia; `COMPLETIONS 1/1`.
- `Job` para rodar-uma-vez-agora; `CronJob` para rodar-num-cronograma.

<v-clicks>

- ✅ Tenta de novo em caso de falha (`backoffLimit`), paraleliza (`completions`/`parallelism`), e
  auto-expira objetos terminados (`ttlSecondsAfterFinished`).

</v-clicks>

<!--
Speaker: o seletor rápido. A única pergunta é "este trabalho tem um fim natural?" Se não — ele
deve estar sempre de pé — Deployment (ou StatefulSet para identidade). Se sim — Job; e se esse
trabalho finito também recorre num relógio — CronJob. A armadilha é rodar trabalho batch sob um
Deployment porque é o controller que as pessoas pegam primeiro: "funciona" até você notar que a
sua migração rodou 4.000 vezes. O erro inverso é mais raro mas real: um servidor de longa duração
sob um Job que fica "completando" e sendo derrubado. Cite ttlSecondsAfterFinished como o botão
atual de auto-limpeza — defina-o em um Job e o objeto (e seus Pods) se auto-deleta N segundos
depois de terminar, então você não precisa dos limites de histórico de um CronJob nem de uma
varredura manual. Passe ao lab: eles vão rodar um Job, agendar um CronJob e forçar uma falha até
BackoffLimitExceeded.
-->

---
layout: recap
heading: 'Recap — algum trabalho deve terminar'
story: 'O Job report saiu com 0 e ficou Complete; envolvido em um CronJob ele rerodou toda noite — um Deployment o teria loopado para sempre.'
next: 'Autoscaling (HPA) — escale um Deployment em execução pela demanda de CPU ao vivo'
---

- **Job** = run-to-completion: exit 0 é sucesso, nada reinicia; **CronJob** = uma fábrica de Jobs num `schedule`
- Pods de Job usam `restartPolicy: Never` (retry = Pod novo) ou `OnFailure` (retry = mesmo Pod) — **nunca `Always`**
- Botões do Job: `completions`/`parallelism` (fila de trabalho), `backoffLimit` (tentativas limitadas → `BackoffLimitExceeded`), `activeDeadlineSeconds` (teto de relógio de parede)
- Botões do CronJob: `schedule` + `timeZone`, `concurrencyPolicy` (Allow/Forbid/Replace), `{successful,failed}JobsHistoryLimit`, `startingDeadlineSeconds`
- Escolha pelo **tempo de vida**: fica de pé → Deployment · termina → Job · termina num relógio → CronJob

<!--
Speaker: amarre o fio condutor. Um eixo decide tudo: o trabalho termina? O Job adiciona um
contrato de conclusão a um spec de Pod (e a ressalva do restartPolicy — Never para "Pod novo por
tentativa", OnFailure para "reiniciar no lugar", Always é ilegal). O CronJob adiciona um relógio
e os controles de sobreposição/tick perdido, mas delega toda a execução ao seu jobTemplate. Os
modos de falha memoráveis: uma tarefa batch sob um Deployment loopa para sempre; um CronJob lento
com concorrência Allow sobrepõe a si mesmo; um CronJob sem timeZone dispara uma hora fora. Passe
o bastão para o Lab 15: rodar um Job até COMPLETIONS 1/1 e ler seus logs, colocá-lo num CronJob
por minuto e ver Jobs surgirem e o histórico aparar, depois forçar um exit diferente de zero e
ver as tentativas subirem até BackoffLimitExceeded. Próxima seção: HPA — escalando os workloads
run-forever que deixamos de lado aqui.
-->

---
layout: lab
lab: labs/day-2/15-jobs.md
duration: 20 min
env: namespace ✓ / kind ✓
---

## Lab 15 — Batch & cronograma

- Rode um **Job** até completar → `COMPLETIONS 1/1`, leia `kubectl logs job/<name>`
- Coloque o mesmo trabalho num **CronJob** (por minuto) → veja Jobs surgirem e os antigos serem aparados
- **Quebre→conserte:** um Job cujo comando sai com código diferente de zero → as tentativas sobem até
  **`BackoffLimitExceeded`** → conserte o comando e confirme a conclusão
- Responda a manchete: *por que o Job que falhava parou depois de um punhado de Pods — e
  por que `concurrencyPolicy: Forbid` importa para um CronJob lento?*
