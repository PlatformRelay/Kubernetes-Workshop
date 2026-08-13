# Lab 18 — NetworkPolicy (S18) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 0 — um cluster para cercar

### Caminho kind (faça este)

```bash
kind create cluster --name netpol
export NS=default
kubectl get nodes
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get nodes
NAME                   STATUS   ROLES           AGE   VERSION
netpol-control-plane   Ready    control-plane   40s   v1.3x.x
```

Um cluster kind padrão roda o **kindnet**, que nas releases atuais do kind aplica NetworkPolicy
(via kube-network-policies). O self-test do Step 2 confirma isso na *sua* versão — se acontecer
de o seu CNI não aplicar, o Step 2 tem um fallback com Calico.
</details>

### Caminho do cluster compartilhado (read-only)

Você não consegue subir um CNI com enforcement em um cluster compartilhado, e uma policy sem
enforcement silenciosamente não faz nada. Então aqui você **apenas lê** uma policy que seu
facilitador pré-aplicou:

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
kubectl get networkpolicy
kubectl describe networkpolicy default-deny-ingress   # se houver uma disponível
```

Leia os blocos `PodSelector`, `PolicyTypes` e `Allowing ingress traffic` na saída do describe,
depois acompanhe o restante lendo os manifestos e os spoilers — os *objetos* são idênticos;
só o enforcement difere.

---

### Step 1 — a rede flat: todo mundo alcança o backend

```bash
cat > apps.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  labels: { app: backend, lab: s18 }
spec:
  replicas: 1
  selector: { matchLabels: { app: backend } }
  template:
    metadata:
      labels: { app: backend, lab: s18 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  labels: { lab: s18 }
spec:
  selector: { app: backend }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: v1
kind: Pod
metadata: { name: frontend, labels: { app: frontend, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
---
apiVersion: v1
kind: Pod
metadata: { name: other, labels: { app: other, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
---
apiVersion: v1
kind: Pod
metadata: { name: scanner, labels: { app: scanner, lab: s18 } }
spec:
  containers: [{ name: curl, image: curlimages/curl:8.10.1, command: ["sleep", "3600"] }]
EOF

kubectl apply -f apps.yaml
kubectl wait --for=condition=Ready pod/frontend pod/other pod/scanner --timeout=90s
kubectl rollout status deploy/backend
```

**Tarefa:** a partir dos **três** clientes, faça curl no Service do backend. Todos devem
retornar `200`.

```bash
for p in frontend other scanner; do
  kubectl exec "$p" -- curl -s -o /dev/null -w "$p → %{http_code}\n" --max-time 5 http://backend
done
```

<details><summary>Solução / saída esperada</summary>

```console
frontend → 200
other → 200
scanner → 200
```

Nenhuma NetworkPolicy existe, então a rede é **flat** — todo Pod consegue alcançar o IP do Pod
do backend (o Service apenas resolve o nome para esse IP). Este é o padrão do Kubernetes:
**allow-all**. O `--max-time 5` importa daqui em diante, então o usamos o tempo todo.
</details>

---

### Step 2 — quebre (e faça o self-test): o `default-deny` cerca o backend

```bash
cat > default-deny-ingress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  labels: { app: s18 }
spec:
  podSelector: {}            # seleciona todos os Pods do namespace
  policyTypes:
    - Ingress                # governa o ingress; sem regras abaixo → nega tudo
EOF

kubectl apply -f default-deny-ingress.yaml
```

**Tarefa:** rode os três curls de novo. Agora eles **travam** até o `--max-time` disparar.
Capture o exit code — ele é a pista, e é o seu self-test de enforcement.

```bash
for p in frontend other scanner; do
  kubectl exec "$p" -- curl -s -o /dev/null -w "$p → %{http_code}" --max-time 5 http://backend; echo " exit=$?"
done
```

<details><summary>Solução / saída esperada</summary>

```console
frontend → 000 exit=28
other → 000 exit=28
scanner → 000 exit=28
```

O `http_code` é `000` (nenhuma resposta) e o curl sai com **28** — *"Operation timed out"*. O
`default-deny` seleciona **todos** os Pods (`podSelector: {}`) para **Ingress** com **nenhuma**
regra de allow, então todas as conexões de entrada são **descartadas**. Os três clientes estão
cortados. **Este é o self-test: se o tráfego realmente quebrou, seu CNI está aplicando.**
</details>

<details><summary>Self-test FALHOU? (os três ainda retornam 200) — fallback do kind</summary>

Se todos os curls ainda retornarem `200` depois de aplicar o default-deny, seu CNI **não está
aplicando** — a policy é um no-op silencioso. Recrie o kind com o CNI padrão desabilitado e
instale o Calico:

```bash
kind delete cluster --name netpol
cat > kind-netpol.yaml <<'EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  disableDefaultCNI: true
  podSubnet: "192.168.0.0/16"     # pod CIDR padrão do Calico
EOF
kind create cluster --name netpol --config kind-netpol.yaml
# fixe a release atual do Calico — verifique a tag na página de releases do Calico
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/calico.yaml
kubectl wait --for=condition=Ready nodes --all --timeout=180s
```

Depois re-execute o Step 1 (reaplique o `apps.yaml`) e o Step 2. Em um cluster compartilhado
você não pode fazer isso — use o caminho read-only.
</details>

**Pergunta:** o curl **travou e estourou o timeout** (exit 28) em vez de falhar na hora. Por que
um drop de NetworkPolicy parece diferente de "connection refused"?

<details><summary>Resposta</summary>

Um drop de NetworkPolicy **descarta silenciosamente** o pacote — o cliente não recebe *nenhuma*
resposta, então espera até o próprio timeout (`--max-time`) desistir: exit **28**, "timed out".
"Connection **refused**" (curl exit 7) é diferente — é o host retornando ativamente um TCP RST
porque **nada está escutando** naquela porta. Refused é rápido e explícito; um drop de policy é
lento e silencioso. Regra de bolso de debugging: **trava/timeout → suspeite de NetworkPolicy ou
firewall; refused → suspeite do app/porta.**
</details>

---

### Step 3 — conserte: abra um portão com um allow aditivo

O `default-deny` **fica**. Nós **adicionamos** uma policy que permite `frontend → backend:8080`.
NetworkPolicies são **unidas (union)** — isso não substitui o deny, apenas empilha um portão
permitido por cima.

```bash
cat > allow-frontend-to-backend.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  labels: { app: s18 }
spec:
  podSelector:
    matchLabels:
      app: backend           # esta policy governa os Pods do backend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend  # …apenas de Pods com o label app=frontend
      ports:
        - protocol: TCP
          port: 8080
EOF

kubectl apply -f allow-frontend-to-backend.yaml
```

**Tarefa:** rode os três curls de novo. O `frontend` recebe `200`; `other` e `scanner` continuam
estourando o timeout.

```bash
for p in frontend other scanner; do
  kubectl exec "$p" -- curl -s -o /dev/null -w "$p → %{http_code}" --max-time 5 http://backend; echo " exit=$?"
done
```

<details><summary>Solução / saída esperada</summary>

```console
frontend → 200 exit=0
other → 000 exit=28
scanner → 000 exit=28
```

O `allow-frontend-to-backend` seleciona o backend e permite ingress **de `app: frontend`** na
porta 8080. Como as policies são **aditivas**, o backend agora permite a **união** do que
qualquer policy permite — exatamente o portão do frontend. `other` e `scanner` nunca foram
permitidos por nada, então o `default-deny` ainda presente continua descartando-os.
</details>

**Pergunta:** nunca deletamos o `default-deny-ingress`. Por que adicionar uma policy de allow
mudou o resultado do `frontend` mas não o de `other`/`scanner`?

<details><summary>Resposta</summary>

Não há "override" nem precedência — a regra efetiva é a **união** das regras de allow de *todas*
as policies que selecionam um Pod. O `allow-frontend-to-backend` adiciona uma origem permitida
(`frontend`) ao backend; nada adiciona `other` ou `scanner`, então eles continuam descartados
pelo default-deny. Delete o `allow-frontend-to-backend` e o backend volta a ser selecionado
apenas pelo default-deny → **os três** ficam cortados. Delete o default-deny **também** e o Pod
não é selecionado por nada → de volta ao **allow-all**.
</details>

---

### Step 4 — observe: ingress ≠ egress (o DNS continua funcionando)

O default-deny é `policyTypes: [Ingress]` — o egress, incluindo o **DNS**, nunca foi tocado. A
prova está escondida no exit code que você já viu.

**Pergunta:** no Step 2, os curls saíram com **28** (timeout), não **6** (*"Could not resolve
host"*). O que isso te diz sobre o DNS sob o nosso default-deny?

<details><summary>Resposta / saída esperada</summary>

Para *estourar o timeout na conexão*, o curl primeiro teve que **resolver `backend` para um
IP** — então o DNS **funcionou**. Um caminho de DNS bloqueado falha rápido e de forma diferente:

```console
$ kubectl exec other -- curl -s --max-time 5 http://backend; echo "exit=$?"
curl: (6) Could not resolve host: backend
exit=6
```

Você veria exit **6** apenas se egress/DNS estivessem bloqueados. Vimos exit **28**, então a
resolução de nome teve sucesso e apenas a conexão de *entrada* foi descartada — exatamente o que
um default-deny **somente de ingress** deve fazer. É por isso que negamos **apenas ingress**: um
default-deny de **egress** sem um allow explícito de DNS (UDP/TCP 53 para o kube-dns) quebra a
resolução de nomes do namespace inteiro e todo app parece misteriosamente quebrado (esse é o
stretch goal).
</details>

---

### Step 5 — observe: a regra de allow é só um label match

O `allow-frontend-to-backend` faz match pelo label `app: frontend`. Mude o label e o match
evapora — sem nenhuma edição de policy.

```bash
kubectl label pod frontend app=stranger --overwrite
kubectl exec frontend -- curl -s -o /dev/null -w "frontend → %{http_code}" --max-time 5 http://backend; echo " exit=$?"
```

<details><summary>Solução / saída esperada</summary>

```console
frontend → 000 exit=28
```

Mesmo Pod, mas ele não carrega mais `app: frontend`, então o `allow-frontend-to-backend` para de
selecioná-lo como origem permitida — o default-deny o descarta como qualquer outro. Recoloque o
label e volta a funcionar:

```bash
kubectl label pod frontend app=frontend --overwrite
kubectl exec frontend -- curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 http://backend   # → 200
```

**Selectors são labels** — NetworkPolicy permite por label selector, então um relabel (ou um
label errado) muda silenciosamente quem pode falar com quem. É também a armadilha nº 1 do mundo
real: uma policy que "parou de funcionar" costuma ser um Pod cujos labels mudaram.
</details>

## Stretch (opcional) — trave o egress também, e libere o DNS de novo

Um default-deny de **egress** é a clássica indisponibilidade autoinfligida: bloqueie a saída e
você também bloqueia o **DNS**, então toda resolução de nome falha. Prove isso, depois conserte
do jeito certo.

```bash
cat > default-deny-egress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-egress
  labels: { app: s18 }
spec:
  podSelector: {}
  policyTypes:
    - Egress
EOF
kubectl apply -f default-deny-egress.yaml

# agora o DNS quebra — a resolução falha rápido (exit 6), não é timeout
kubectl exec frontend -- curl -s --max-time 5 http://backend; echo " exit=$?"
```

<details><summary>O que quebrou, e o allow de DNS que conserta</summary>

```console
curl: (6) Could not resolve host: backend
 exit=6
```

Exit **6** agora, não 28 — o egress está negado, então a query de DNS para o kube-dns nunca sai
do Pod. Libere o DNS de novo (UDP **e** TCP 53) para o `kube-system`, e as consultas voltam a
funcionar (a conexão ainda estoura o timeout com exit 28, a menos que você também permita egress
para o backend):

```bash
cat > allow-dns-egress.yaml <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  labels: { app: s18 }
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - { protocol: UDP, port: 53 }
        - { protocol: TCP, port: 53 }
EOF
kubectl apply -f allow-dns-egress.yaml
```

Lição: os `policyTypes` são chaves independentes, e travar o egress significa que você **é dono
do DNS** — sempre acompanhe um default-deny de egress com um allow explícito de DNS. Limpe as
policies extras com `kubectl delete networkpolicy -l app=s18` (ou deixe-as — o cleanup do Step 6
as cobre).
</details>

## Expected state / output

- **O padrão é flat/allow-all:** sem nenhuma policy, todo Pod alcança todo Pod. O isolamento é
  opt-in.
- Um **ingress `default-deny`** = `podSelector: {}` + `policyTypes: [Ingress]` + nenhuma regra →
  todo o tráfego de entrada é descartado. Tráfego descartado **trava e estoura o timeout** (curl
  exit **28**), **não** é "refused" (exit 7). Essa quebra *é* o self-test de enforcement.
- Policies são **aditivas/allow-only:** o `allow-frontend-to-backend` abre exatamente um portão;
  `other`/`scanner` continuam cortados porque nada os permite. Deny = a ausência de um allow.
- **Ingress ≠ egress:** o default-deny de ingress deixou **DNS/egress funcionando** (exit 28,
  não 6).
- **Selectors são labels:** trocar o label do `frontend` quebra o match do allow sem nenhuma
  mudança de policy.
- **Só um CNI capaz de policies aplica qualquer parte disso** — os mesmos objetos em um CNI sem
  enforcement aplicam sem erro e não fazem nada.

Statuses representativos incluem Pods Ready/Running, timeouts de NetworkPolicy, Forbidden de
RBAC, histórico de revisões do Helm, Application Synced/Healthy, Certificate Ready ou targets do
Prometheus — compare o significado, não nomes efêmeros.

## Explanation

NetworkPolicies são allows aditivos por cima do isolamento. A conectividade só retorna quando o
podSelector e os seletores de ingress.from de alguma policy correspondem aos labels reais do
Pod; por isso um relabel ou um erro de digitação remove o allow sem alterar o nome do arquivo
YAML, causando a perda de conectividade. O timeout (e não refused) é o sinal de drop do CNI de
que a cerca está sendo aplicada.

Os passos guiados acima provam o comportamento do control plane para esta seção; leia os Events
e os campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Reaplique os manifestos nomeados do lab com `kubectl apply -f <file> -n "$NS"` depois de
corrigir o campo quebrado, ou delete apenas os objetos com label da seção Cleanup / reset e
reinicie o guided task. Prefira os Events do `kubectl describe` a chutar. Não rode deletes
amplos no cluster.

## Challenge solution

### Commands / manifest

```bash
kubectl get networkpolicy -n "$NS" -o wide
kubectl get pods -n "$NS" -l lab=s18 --show-labels
kubectl exec deploy/other -n "$NS" -- wget -qO- --timeout=3 http://backend:8080 || echo "exit=$?"
# restaura o match do label do frontend (exemplo):
kubectl label pod -n "$NS" -l app=frontend --overwrite role=frontend
kubectl exec deploy/frontend -n "$NS" -- wget -qO- --timeout=3 http://backend:8080
```

### Expected state / output

Clientes sem match travam/estouram o timeout (curl/wget exit 28). Depois que o selector do allow
volta a fazer match, o frontend retorna 200 enquanto other/scanner continuam em timeout.

### Explanation

NetworkPolicies são allows aditivos por cima do isolamento. A conectividade só retorna quando o
podSelector e os seletores de ingress.from de alguma policy correspondem aos labels reais do
Pod; por isso um relabel ou um erro de digitação remove o allow sem alterar o nome do arquivo
YAML, causando a perda de conectividade. O timeout (e não refused) é o sinal de drop do CNI de
que a cerca está sendo aplicada.

### Hints

Use kubectl get networkpolicy e describe nos Pods com labels lab=s18; compare
o podSelector.matchLabels da regra de allow com os labels dos Pods clientes antes de aplicar o patch.
