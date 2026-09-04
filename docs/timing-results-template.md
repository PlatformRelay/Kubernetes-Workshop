# Template de timing-results — tempos MEDIDOS por seção

Um template em branco para registrar tempos **medidos** durante um ensaio ou uma rodada de
beta. Copie este arquivo (ex.: para `timing-results-2026-08-15.md`), preencha as colunas
**MEASURED** conforme você roda, e guarde-o como o registro daquela rodada.

> **Medido ≠ planejado.** As colunas `PLANNED` são copiadas do
> [syllabus](./syllabus.md#per-section-outcomes-timings-and-labs) — são **estimativas de
> planejamento não ensaiadas**, não fatos. As colunas `MEASURED` começam **vazias** e
> guardam **apenas números observados no cronômetro**. **Nunca** copie um valor planejado
> para uma coluna de medição: uma célula de medição vazia significa "ainda não medido", e
> esse é o estado honesto até que alguém realmente cronometre. O objetivo inteiro deste
> template é substituir estimativas por medições — não misture as duas coisas.

## Metadados da rodada

Preencha isto a cada rodada:

- **Data da rodada:** _(YYYY-MM-DD)_
- **Facilitador / cronometrista:** _(quem segurou o relógio)_
- **Ambiente:** _(kind local / namespace compartilhado / misto)_
- **Corte entregue:** _(corte canônico de 3 dias / customizado — liste as seções realmente rodadas)_
- **Notas de cluster / rede:** _(versão do kind, specs do laptop, rede para pulls de image)_

## Como preencher

1. Cronometre **slides** e **lab** separadamente; registre minutos inteiros nas colunas
   `MEASURED slides` e `MEASURED lab`.
2. `Δ slides` / `Δ lab` = **medido − planejado** (deixe em branco até ter um valor
   medido). Um número positivo significa que rodou **acima** da estimativa.
3. Coloque tudo que custou tempo — uma instalação lenta de add-on, um comando quebrado, um
   tropeço da sala inteira — em **Bloqueadores / notas**. É neles que uma correção mira.
4. Deixe uma célula **vazia** se você não rodou ou não cronometrou aquela seção. **Não**
   preencha depois com o número planejado.

## Legenda

- **PLANNED** — vem do syllabus; uma estimativa não ensaiada. Não edite estes valores.
- **MEASURED** — minutos observados no cronômetro nesta rodada. Vazio = não medido.
- **Δ** — medido menos planejado, em minutos; em branco até ser medido. `+` = acima da estimativa.
- **`—`** — não se aplica (S27 não tem lab; S24 é um stub `deferred`).

## Day 1

| ID | Seção | PLANNED slides | PLANNED lab | MEASURED slides | MEASURED lab | Δ slides | Δ lab | Bloqueadores / notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S00 | Welcome & setup | 20 | 15 | | | | | |
| S01 | Containers | 30 | 25 | | | | | |
| S02 | Container security & supply chain | 30 | 25 | | | | | |
| S03 | Kubernetes mental model | 30 | 20 | | | | | |
| S04 | kubectl | 30 | 25 | | | | | |
| S05 | Pod | 30 | 25 | | | | | |
| S06 | Deployment | 35 | 30 | | | | | |
| S07 | Service | 30 | 30 | | | | | |
| S08 | Ingress | 30 | 25 | | | | | |

## Day 2

| ID | Seção | PLANNED slides | PLANNED lab | MEASURED slides | MEASURED lab | Δ slides | Δ lab | Bloqueadores / notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S09 | Gateway API | 35 | 25 | | | | | |
| S10 | ConfigMap & Secret | 30 | 25 | | | | | |
| S11 | Storage (PV/PVC/StorageClass) | 30 | 30 | | | | | |
| S12 | StatefulSet | 30 | 30 | | | | | |
| S13 | Resources & limits | 35 | 30 | | | | | |
| S14 | Health probes | 30 | 30 | | | | | |
| S15 | Jobs & CronJobs | 20 | 20 | | | | | |
| S16 | Autoscaling (HPA) | 20 | 20 | | | | | |

## Day 3

| ID | Seção | PLANNED slides | PLANNED lab | MEASURED slides | MEASURED lab | Δ slides | Δ lab | Bloqueadores / notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S17 | Pod security (securityContext + PSS) | 30 | 25 | | | | | |
| S18 | NetworkPolicy | 25 | 25 | | | | | |
| S19 | RBAC | 25 | 25 | | | | | |
| S20 | Helm | 30 | 30 | | | | | |
| S21 | GitOps with Argo CD | 30 | 25 | | | | | |
| S22 | The operator pattern | 25 | 15 | | | | | |
| S23 | Prometheus Operator | 30 | 25 | | | | | |
| S24 † | Operator dev 101 (kubebuilder) | 40 | 40 | | | | | Stub `deferred` — apenas um slot planejado, não é conteúdo executável. |
| S25 | Security & pod escape | 35 | 30 | | | | | |
| S26 | Best practices (capstone) | 30 | 40 | | | | | |
| S27 | Wrap-up & next steps | 20 | — | | — | | — | Somente slides — sem lab. |

† **S24 planejado = 40/40 é um slot placeholder, não conteúdo entregue.** O lab é um stub
`deferred`; não registre uma medição contra ele como se fosse um lab executável.

## Totais por dia (medido vs planejado)

Os totais **planejados** por dia do syllabus (a partir do corte canônico de 3 dias) são os
alvos a conferir. Preencha os totais medidos apenas depois de cronometrar as seções que
você realmente rodou — some **as suas células MEASURED**, não as planejadas, e anote quais
seções o seu corte incluiu (os totais planejados abaixo assumem o corte canônico, que omite
algumas seções).

| Day | Total PLANNED (corte canônico) | Total MEASURED (esta rodada) | Δ | Seções rodadas nesta rodada |
| --- | --- | --- | --- | --- |
| Day 1 | 375 | | | |
| Day 2 | 360 | | | |
| Day 3 | 420 | | | |

> **Lendo os deltas.** A pergunta em aberto antes da entrega é se o corte cai perto de
> **~390 min/dia com ~50/50 entre slides e lab**. Isso só pode ser respondido pela coluna
> MEASURED. Enquanto essas células não forem preenchidas a partir de uma rodada real, o
> alvo de ~390 continua sendo uma **estimativa**, não um fato medido — não reporte como
> confirmado.

## Resumo de bloqueadores

Liste os bloqueadores transversais ou de alto impacto observados nesta rodada (instalações
de add-on que foram lentas, comandos que falharam, seções que estouraram o tempo
consistentemente). Registre cada um como uma
[issue de beta-feedback](../.github/ISSUE_TEMPLATE/beta-feedback.yml) e linke aqui.

- _(nenhum registrado ainda — preencha durante a rodada)_
