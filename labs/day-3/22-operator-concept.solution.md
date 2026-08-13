# Lab 22 — O padrão operator (S22) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl wait --for=condition=Available --timeout=300s deployment --all -n cert-manager
deployment.apps/cert-manager condition met
deployment.apps/cert-manager-cainjector condition met
deployment.apps/cert-manager-webhook condition met

$ kubectl get pods -n cert-manager
NAME                                       READY   STATUS    RESTARTS   AGE
cert-manager-5b9ff77b7d-xxxxx              1/1     Running   0          75s
cert-manager-cainjector-7d8b8f6c9-xxxxx    1/1     Running   0          75s
cert-manager-webhook-6c9dd58f5-xxxxx       1/1     Running   0          75s
```

Três Deployments compõem o operator: o **controller** (roda o loop de reconciliação), o
**webhook** (valida/aplica defaults nos CRs — a peça que precisa estar de pé antes de você criar um CR) e o
**cainjector** (um auxiliar). Os três são Pods comuns — um operator é só software que você
instala. O registry de images `quay.io/jetstack/*` é do projeto cert-manager, não de um
fornecedor.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get crd | grep cert-manager.io
certificaterequests.cert-manager.io   2026-07-10T09:00:00Z
certificates.cert-manager.io          2026-07-10T09:00:00Z
challenges.acme.cert-manager.io       2026-07-10T09:00:00Z
clusterissuers.cert-manager.io        2026-07-10T09:00:00Z
issuers.cert-manager.io               2026-07-10T09:00:00Z
orders.acme.cert-manager.io           2026-07-10T09:00:00Z

$ kubectl explain certificate.spec --api-version=cert-manager.io/v1 | head -30
GROUP:      cert-manager.io
KIND:       Certificate
VERSION:    v1

FIELD: spec <Object>
...
   secretName    <string> -required-
     SecretName is the name of the secret resource that will be automatically created...
   issuerRef     <Object> -required-
     IssuerRef is a reference to the issuer for this certificate.
   dnsNames      <[]string>
   ...
```

O `kubectl explain` funciona em `Certificate` **porque o CRD traz um schema OpenAPI** — o
mesmo mecanismo que faz o `kubectl explain pod.spec` funcionar para built-ins. O API server agora
trata os kinds de `cert-manager.io/v1` como cidadãos de primeira classe. Nada foi *reconciliado* ainda;
isto é puramente a superfície da API.
</details>

**Pergunta:** você acabou de rodar `kubectl explain` e `kubectl get` contra um kind que o Kubernetes
não traz de fábrica. De onde veio a capacidade de fazer `get`/`explain`/`-w` em um `Certificate`?

<details><summary>Resposta</summary>

Da **CustomResourceDefinition**. Um CRD registra um novo group/version/kind mais um
**schema OpenAPI v3** no API server. Uma vez registrado, o recurso é armazenado no etcd,
validado no apply e exposto pela mesma maquinaria de REST/discovery dos kinds built-in
— então **todos** os verbos padrão (`get`, `describe`, `explain`, `-o yaml`, `-w`, RBAC, ...)
funcionam de graça. Essa é a metade "estende a API" de um operator; o controller (Step 2 em diante) é
a metade que faz a coisa *acontecer*.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
NAME                                 READY   SECRET    AGE
certificate.cert-manager.io/s22-cert   False   s22-tls   0s
certificate.cert-manager.io/s22-cert   True    s22-tls   2s

NAME                 TYPE                DATA   AGE
secret/s22-tls       kubernetes.io/tls   3      2s
```

Você declarou um `Certificate` (estado desejado) e **não criou nenhum Secret** — e ainda assim um
Secret `kubernetes.io/tls` chamado `s22-tls` apareceu, carregando `tls.crt`, `tls.key` e
`ca.crt` (`DATA 3`). O **controller do cert-manager** observou o seu CR, viu que não havia Secret
correspondente (a lacuna), assinou um cert com o Issuer self-signed e escreveu o Secret — e então
virou o Certificate para `READY=True`. Isso é **observe → diff → aja**, sobre um recurso que o
cert-manager inventou. Nenhum comando imperativo criou o Secret.
</details>

**Pergunta:** você nunca rodou um comando que cria um Secret. O que criou o `s22-tls`, e
o que isso faz do cert-manager?

<details><summary>Resposta</summary>

O **controller do cert-manager** o criou, rodando o **loop de reconciliação** sobre o seu
`Certificate`: desejado = *"um cert válido no Secret `s22-tls`"*; observado = *"nenhum Secret
desses"*; aja = *assine o cert e escreva o Secret*. Porque ele (a) adicionou um novo kind de API
via um **CRD** e (b) roda um **controller** que reconcilia instâncias desse kind usando
**conhecimento de domínio sobre certificados** (emitir, guardar como um Secret TLS, depois renovar antes
de expirar), o cert-manager é um **operator** — não apenas um controller. Veja o próximo passo para a
resposta mais afiada de controller-versus-operator.
</details>

---

### Step 3 — leia o status: o controller reportando de volta

O controller não apenas age — ele **escreve estado de volta no seu CR**, para que o `kubectl` possa
te dizer o que aconteceu. Este é o sub-resource `.status` que os slides descreveram.

```bash
kubectl get certificate s22-cert -o jsonpath='{.status.conditions}' | jq .
```

<details><summary>Solução / saída esperada</summary>

```console
[
  {
    "type": "Ready",
    "status": "True",
    "reason": "Ready",
    "message": "Certificate is up to date and has not expired",
    "lastTransitionTime": "2026-07-10T09:01:00Z"
  }
]
```

(Sem `jq`? Use `kubectl describe certificate s22-cert` e leia o bloco **Status → Conditions**.)
A condição `Ready=True` é o **controller reportando o estado observado de volta no objeto de
estado desejado** — `spec` é o que você pediu, `status` é o que o controller alcançou.
Todo operator bem-comportado faz isso; é assim que o `kubectl get` consegue mostrar um CR como
saudável ou não.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
secret/s22-tls   kubernetes.io/tls   3   90s
secret "s22-tls" deleted
secret/s22-tls   kubernetes.io/tls   3   0s     # ← reaparece, segundos depois
```

O Secret some no delete, e então **um Secret de mesmo nome reaparece em segundos** — você
não fez nada para recriá-lo. O loop do controller está sempre rodando: ele reobservou o
`Certificate` (desejado: um Secret `s22-tls` com um cert válido), observou o mundo (Secret
ausente → drift) e **agiu** (reassinou, reescreveu o Secret). Pare o watch em segundo plano
com `kill %1` quando terminar.
</details>

**Pergunta:** o Secret voltou sozinho. Isso foi **garbage collection /
`ownerReferences`** ou o **loop de reconciliação**? (É fácil confundir os dois.)

<details><summary>Resposta</summary>

O **loop de reconciliação** — *não* ownerReferences. `ownerReferences` movem a **garbage
collection**, que só *deleta* filhos quando um pai é removido; a GC nunca **cria** nada.
Aqui o Certificate *pai* ainda existe e o Secret filho dele foi deletado, então o controller
**o recriou** rodando de novo observe → diff → aja. Na verdade, o cert-manager **não**
coloca um `ownerReference` no Secret por padrão (`--enable-certificate-owner-ref` é `false`),
justamente para que o Secret TLS sobreviva se você deletar o Certificate. Regra de bolso:
**o filho reaparece depois que você o deleta → um controller está reconciliando-o; o filho some
quando você deleta o pai dele → GC por ownerReference.**
</details>

---

### Step 5 — a pergunta que fecha a conta: controller *ou* operator?

**Pergunta:** o controller de ReplicaSet também recria coisas que você deleta (delete um Pod, ele
volta). Então o que faz do cert-manager um **operator** e não *apenas* um controller?

<details><summary>Resposta</summary>

Os dois rodam o **mesmo loop de reconciliação** — esse é o ponto, um operator não é um mecanismo novo.
A diferença são duas coisas:

1. **O que ele reconcilia.** Um controller comum reconcilia kinds **built-in** (ReplicaSet →
   Pods). Um operator reconcilia um **CRD que ele adicionou** (`Certificate`) — ele *estendeu a API*.
2. **O que existe no "aja".** O agir de um controller comum é **genérico** (*faça N réplicas*).
   O agir do cert-manager é **conhecimento de domínio**: emitir um cert X.509, guardá-lo como um
   Secret `kubernetes.io/tls` e **renová-lo antes de expirar**. Você não conseguiria expressar
   *"mantenha este certificado válido"* com nenhum kind built-in — essa expertise vive no
   controller, exposta através do CRD `Certificate`.

Então: **operator = CRD (nova API) + controller com conhecimento operacional embutido no loop.**
Um controller pelado não tem opinião sobre o *seu* domínio; um operator *é* a opinião.
</details>

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

<details><summary>O que você está vendo</summary>

```console
$ kubectl get certificaterequest
NAME              APPROVED   DENIED   READY   ISSUER           AGE
s22-cert-xxxxx    True                True    s22-selfsigned   3m

# Events do describe (resumidos):
#   Normal  Issuing    Issuing certificate as Secret does not exist
#   Normal  Generated  Stored new private key in temporary Secret ...
#   Normal  Requested  Created new CertificateRequest resource "s22-cert-xxxxx"
#   Normal  Issuing    The certificate has been successfully issued
```

O controller do `Certificate` criou um **`CertificateRequest`** (mais um CRD) para carregar
a requisição de assinatura, que um segundo controller **Approved** e marcou como **Ready** — operators
rotineiramente reconciliam *cadeias* de CRs próprios. Os **Events** são o controller narrando
o loop de reconciliação dele: ele age *porque* o Secret não existe, e reemite um evento `Issuing`
toda vez que precisa fechar aquela lacuna. Delete o `s22-tls` de novo e veja aparecer um par novo de
`Issuing` → `successfully issued` — o loop, sob demanda.
</details>

## Expected state / output

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

Os status representativos incluem Pods Ready/Running, timeouts de NetworkPolicy, Forbidden de RBAC,
histórico de revisões do Helm, Application Synced/Healthy, Certificate Ready ou targets do Prometheus —
compare o significado, não os nomes efêmeros.

## Explanation

Operators codificam um reconcile de domínio: observe → diff → aja. ownerReferences
deletariam filhos quando o pai desaparece; elas não recriam filhos ausentes. O Secret
volta porque o Certificate ainda existe e o passo de agir do controller o emite de novo — é essa
a causa de a lacuna ser fechada sem nenhuma intervenção humana.

Os passos guiados acima provam o comportamento do control plane desta seção; leia os Events e os
campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Reaplique os manifestos nomeados do lab com `kubectl apply -f <file> -n "$NS"` depois de corrigir o
campo quebrado, ou delete apenas os objetos com label do Cleanup / reset e recomece a guided
task. Prefira os Events de `kubectl describe` a chutar. Não rode deletes amplos no cluster.

## Challenge solution

### Commands / manifest

```bash
kubectl get certificate,secret -n "$NS" -l app=s22
SECRET=$(kubectl get certificate -n "$NS" -l app=s22 -o jsonpath='{.items[0].spec.secretName}')
kubectl delete secret "$SECRET" -n "$NS"
kubectl get secret "$SECRET" -n "$NS" -w
kubectl get certificate -n "$NS" -l app=s22
```

### Expected state / output

Depois do delete, o Secret fica brevemente ausente (Missing) e então é recriado pelo cert-manager. O
Certificate permanece ou volta a Ready=True, provando que o loop reafirma o estado desejado.

### Explanation

Operators codificam um reconcile de domínio: observe → diff → aja. ownerReferences
deletariam filhos quando o pai desaparece; elas não recriam filhos ausentes. O Secret
volta porque o Certificate ainda existe e o passo de agir do controller o emite de novo — é essa
a causa de a lacuna ser fechada sem nenhuma intervenção humana.

### Hints

Use kubectl delete secret no secretName do Certificate, depois kubectl get secret -w
e kubectl describe certificate; procure logs do controller ou Ready=True no CR.
