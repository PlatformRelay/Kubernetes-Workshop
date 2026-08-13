# Lab 22 — O padrão operator (S22)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S22 — O padrão operator |
| **Environment** | **kind ✓** (instalação própria) / namespace: **read-only** |
| **Estimated time** | 15 min |

## Objective

Conhecer um **operator de verdade** — sem escrever código. Você vai instalar o **cert-manager** (um
projeto da CNCF: um conjunto de **CRDs** mais um **controller**), inspecionar a API que ele
adicionou, depois declarar um **`Certificate`** e ver o controller reconciliá-lo em um
**`Secret`**. Por fim, você vai **deletar esse Secret** e ver o controller **colocá-lo de volta** — o
loop de reconciliação da S03 (observe → diff → aja) rodando sobre um recurso que o cert-manager
*inventou*.

A única ideia para levar daqui: **um operator = um CRD (um novo kind da API) + um controller que
roda o loop de reconciliação sobre instâncias dele, com conhecimento operacional no passo
"aja".** O conhecimento do cert-manager é *"emita este certificado, guarde-o em um Secret e mantenha-o
válido."*

> **⚠️ O Secret recriado é o *loop* de reconciliação, não garbage collection.** O cert-manager
> **não** coloca um `ownerReference` no Secret por padrão
> (`--enable-certificate-owner-ref` tem `false` como default), então o Secret não é *propriedade* do
> Certificate. Ele volta porque o controller **reassegura continuamente** que
> `spec.secretName` existe — exatamente o loop desejado-versus-observado. Não confunda os dois.

## Prerequisites

- **Caminho kind (recomendado):** Docker + `kind` + `kubectl`, e permissão para criar um cluster
  local. Você vai fazer um cluster descartável chamado `operator`. O cert-manager é uma instalação
  em **escopo de cluster**, então este caminho precisa de um cluster que seja seu — daí o kind.
- **Caminho shared-cluster:** o namespace atribuído a você — **read-only** aqui. Você pode inspecionar
  os CRDs de um operator e dar `explain` no schema dele, mas **não** pode instalar o cert-manager nem
  (em geral) criar os CRs dele, a menos que um facilitador o tenha pré-instalado. Prefira o kind se puder.
- Acesso de pull à internet para as images do cert-manager (`quay.io/jetstack/*`).

## Files used

- `issuer.yaml` — um **`Issuer`** self-signed (o CR mais simples para provar o padrão; sem CA,
  sem ACME, nada externo).
- `certificate.yaml` — um CR **`Certificate`** que pede um cert em um Secret chamado
  `s22-tls`.

Os dois CRs carregam o label `app: s22`, e o Certificate copia esse label para o Secret dele
via `spec.secretTemplate` — assim, um único cleanup por label remove tudo, Secret incluído.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./22-operator-concept.solution.md#guided-solutions)

### Step 0 — um cluster, e o próprio operator

### Caminho kind (faça este)

```bash
kind create cluster --name operator
export NS=default

# instale o cert-manager — CRDs + controller + webhook (stable atual verificada: v1.21.0)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.21.0/cert-manager.yaml
```

Agora **aguarde o controller e o webhook ficarem prontos** — criar um `Certificate` antes de
o webhook estar de pé falha com um erro de `connection refused`, e não porque seu YAML está errado.

```bash
kubectl wait --for=condition=Available --timeout=300s \
  deployment --all -n cert-manager
kubectl get pods -n cert-manager
```

### Caminho shared-cluster (read-only)

Você não consegue fazer uma instalação em escopo de cluster dentro do seu namespace. Em vez disso,
inspecione os CRDs de operator que já existirem no cluster compartilhado e leia o schema deles — o
*padrão* é idêntico, só a instalação difere:

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
kubectl get crd                                  # quaisquer CRDs *.alguma-coisa = um operator instalado
kubectl api-resources --api-group=cert-manager.io  # vazio se o cert-manager não estiver instalado
```

Se o cert-manager (ou qualquer operator) estiver presente, siga o Step 1 com os CRDs dele. Criar CRs
exige o controller do operator em execução — constate isso e leia os manifestos + spoilers para
o resto.

---

### Step 1 — inspecione a API que o operator adicionou

Instalar o cert-manager registrou vários **CRDs**. Essa é a metade "estende a API" do
operator — novos kinds em que você agora pode dar `kubectl get` como em qualquer built-in.

```bash
kubectl get crd | grep cert-manager.io
kubectl explain certificate.spec --api-version=cert-manager.io/v1 | head -30
```

**Pergunta:** você acabou de rodar `kubectl explain` e `kubectl get` contra um kind que o Kubernetes
não traz de fábrica. De onde veio a capacidade de fazer `get`/`explain`/`-w` em um `Certificate`?

---

### Step 2 — declare a intenção: um Issuer e um Certificate

Um `Certificate` precisa de um **issuer** para assiná-lo. O mais simples é um `Issuer` **self-signed** —
sem CA, sem ACME, nada externo para consultar. Depois declaramos o próprio `Certificate`: *"eu quero
um cert para `s22.example.com`, guardado em um Secret chamado `s22-tls`."*

```bash
cat > issuer.yaml <<'EOF'
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: s22-selfsigned
  labels: { app: s22 }
spec:
  selfSigned: {}
EOF

cat > certificate.yaml <<'EOF'
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: s22-cert
  labels: { app: s22 }
spec:
  secretName: s22-tls            # o Secret que o controller vai criar/manter
  secretTemplate:
    labels: { app: s22 }         # copia o nosso label para o Secret gerado
  duration: 2160h                # 90 dias
  renewBefore: 360h              # renova 15 dias antes de expirar
  commonName: s22.example.com
  dnsNames:
    - s22.example.com
  issuerRef:
    name: s22-selfsigned
    kind: Issuer
EOF

kubectl apply -f issuer.yaml -f certificate.yaml
```

**Tarefa:** veja o controller reconciliar o `Certificate` em um `Secret`. Rode o watch
e pare-o (`Ctrl-C`) assim que o Certificate estiver `READY=True` e o Secret existir.

```bash
kubectl get certificate,secret -l app=s22 -w
```

**Pergunta:** você nunca rodou um comando que cria um Secret. O que criou o `s22-tls`, e
o que isso faz do cert-manager?

---

### Step 3 — leia o status: o controller reportando de volta

O controller não apenas age — ele **escreve estado de volta no seu CR**, para que o `kubectl` possa
te dizer o que aconteceu. Este é o sub-resource `.status` que os slides descreveram.

```bash
kubectl get certificate s22-cert -o jsonpath='{.status.conditions}' | jq .
```

---

### Step 4 — break→fix: delete o Secret, veja o loop refazê-lo

Este é o loop de reconciliação tornado visível. O `Secret` é um **filho** que o controller
produziu a partir do seu `Certificate`. Delete-o, e o loop nota a lacuna e a fecha.

```bash
# em um terminal, siga observando:
kubectl get secret s22-tls -w &

# agora delete o filho que o controller produziu:
kubectl delete secret s22-tls
```

**Pergunta:** o Secret voltou sozinho. Isso foi **garbage collection /
`ownerReferences`** ou o **loop de reconciliação**? (É fácil confundir os dois.)

---

### Step 5 — a pergunta que fecha a conta: controller *ou* operator?

**Pergunta:** o controller de ReplicaSet também recria coisas que você deleta (delete um Pod, ele
volta). Então o que faz do cert-manager um **operator** e não *apenas* um controller?

## Observe

- **O operator é só software:** instalar o cert-manager adicionou três Pods comuns
  (controller, webhook, cainjector) e vários **CRDs** — novos kinds da API em que você pode dar
  `get`/`explain`/`-w` como nos built-ins.
- **Um CRD estende a API:** `kubectl explain certificate.spec` funciona porque o CRD traz
  um schema OpenAPI; o API server armazena/valida `Certificate`s como qualquer built-in.
- **O controller reconcilia:** você declarou um `Certificate` e **não criou nenhum Secret**, e ainda
  assim o controller produziu o `s22-tls` e marcou `Ready=True` — observe → diff → aja.
- **`.status` é o relatório:** o controller escreve `Ready=True` de volta no seu CR;
  `spec` = desejado, `status` = alcançado.
- **O loop, não GC:** delete o Secret filho e o controller **o recria** (o
  pai ainda existe). ownerReferences *deletariam* filhos, nunca os recriariam — e
  o cert-manager, de qualquer forma, não coloca um no Secret por padrão.
- **Operator vs controller:** o mesmo loop; o operator reconcilia um **CRD que ele próprio definiu** com
  **conhecimento de domínio embutido** no passo de agir.

## Challenge

O Certificate reporta Ready, mas alguém deletou o Secret tls. Preveja se o
Secret continua ausente, depois prove que o controller o recria e explique por que ownerReferences
sozinhas não produziriam esse comportamento.

**Difficulty:** Intermediate

**Success criteria:** Delete o Secret do Certificate, veja-o reaparecer com o mesmo nome, mostre que a
condição Ready do Certificate permanece ou volta a True, e explique que o reconcile recria
filhos desejados em vez de apenas coletá-los como lixo.

**Hints:** Use kubectl delete secret no secretName do Certificate, depois kubectl get secret -w
e kubectl describe certificate; procure logs do controller ou Ready=True no CR.

[Spoiler: solução do challenge](./22-operator-concept.solution.md#challenge-solution)

## Verify

Confirme as evidências do cert-manager antes do cleanup.

```bash
kubectl get issuer,certificate,secret -n "$NS" -l app=s22
kubectl get certificate -n "$NS" -l app=s22 -o jsonpath='{.items[*].status.conditions[*].type}{"\n"}'
```

Esperado: Certificate/Issuer ainda presentes, com as condições Ready vindas do caminho guiado.

## Cleanup / reset

```bash
# cleanup escopado — os CRs e o Secret gerado carregam todos app=s22
kubectl delete certificate,issuer,secret -l app=s22 -n "$NS" --ignore-not-found
rm -f issuer.yaml certificate.yaml

# opcional: desinstale o próprio operator (remove CRDs + controller + todos os CRs)
# kubectl delete -f https://github.com/cert-manager/cert-manager/releases/download/v1.21.0/cert-manager.yaml

# reset de pânico (kind): jogue o cluster inteiro fora
# kind delete cluster --name operator
```

> No caminho **kind**, o reset mais rápido é `kind delete cluster --name operator` — o
> cluster era descartável, e isso leva junto o operator, os CRDs dele e todo CR. No
> caminho **compartilhado** você não criou nada (read-only), então não há nada a limpar.

> **Nota:** deletar um CRD deleta **todo** custom resource daquele kind em todo o cluster. A
> linha `kubectl delete -f cert-manager.yaml` remove os CRDs do cert-manager, então ela também vai
> remover qualquer `Certificate`/`Issuer` em qualquer lugar do cluster — rode isso apenas no seu
> cluster kind descartável.

## Stretch (opcional) — veja o CR intermediário, e prove que é o loop

O cert-manager não assina o cert diretamente a partir do `Certificate`; ele gera um
**`CertificateRequest`** intermediário — outro CR que o controller dele reconcilia. Espie a
cadeia, depois re-execute o break→fix para vê-lo curar uma segunda vez.

```bash
# o request que o Certificate gerou (um CR que carrega o status do cert emitido).
# sem label selector: o cert-manager nomeia o request sozinho e um cluster
# descartável tem exatamente um — ele também não copia o seu label app=s22 para ele.
kubectl get certificaterequest
kubectl describe certificate s22-cert | sed -n '/Events:/,$p'
```
