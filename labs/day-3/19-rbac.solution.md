# Lab 19 — RBAC (S19) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 0 — um namespace para trabalhar

### Caminho kind

```bash
kind create cluster --name rbac
export NS=default
kubectl get nodes
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get nodes
NAME                 STATUS   ROLES           AGE   VERSION
rbac-control-plane   Ready    control-plane   40s   v1.3x.x
```

No kind você é **cluster-admin**, então as checagens de impersonation com `--as` dos Steps 2–4
funcionam sem nenhuma configuração extra.
</details>

### Caminho do cluster compartilhado

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
kubectl auth can-i create rolebindings          # deve imprimir: yes
```

<details><summary>Solução / saída esperada</summary>

```console
yes
```

Se isso imprimir `yes`, você consegue criar a SA/Role/RoleBinding no seu namespace. As checagens
com `--as` mais adiante ainda podem ser negadas se você não tiver impersonation — isso é esperado;
nesse caso, use o caminho de dentro do Pod do stretch goal para verificar.
</details>

---

### Step 1 — um Pod para ler, e a identidade + Role + binding

Primeiro, algo para ler:

```bash
cat > workload.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reader-target
  labels: { app: s19 }
spec:
  replicas: 1
  selector: { matchLabels: { app: reader-target } }
  template:
    metadata:
      labels: { app: reader-target, part-of: s19 }
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports: [{ containerPort: 8080 }]
EOF

kubectl apply -f workload.yaml
kubectl rollout status deploy/reader-target
```

Agora os objetos de RBAC — a **ServiceAccount**, a **Role** somente leitura e o **RoleBinding**
que une as duas. Este é exatamente o manifesto do quadro final do magic-move do slide:

```bash
cat > rbac.yaml <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  labels: { app: s19 }
rules:
  - apiGroups: [""]                 # "" = o core API group (é onde vivem os pods)
    resources: ["pods"]
    verbs: ["get", "list", "watch"] # somente leitura: sem create/delete
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-reader-sa
  labels: { app: s19 }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader-binding
  labels: { app: s19 }
subjects:
  - kind: ServiceAccount
    name: pod-reader-sa
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
EOF

kubectl apply -f rbac.yaml
```

<details><summary>Solução / saída esperada</summary>

```console
role.rbac.authorization.k8s.io/pod-reader created
serviceaccount/pod-reader-sa created
rolebinding.rbac.authorization.k8s.io/pod-reader-binding created
```

Três objetos, um arquivo. A **Role** é uma allow-list pura (`get`/`list`/`watch` em `pods`), a
**ServiceAccount** é a identidade e o **RoleBinding** é a junção — seu `roleRef` nomeia a Role e
seus `subjects` nomeiam a SA. Repare que `apiGroups: [""]` (a string vazia) é o **core** API group,
onde vivem os Pods — não o texto literal `"core"`.
</details>

---

### Step 2 — verifique a concessão com `can-i --list`

```bash
kubectl auth can-i --list --as=system:serviceaccount:$NS:pod-reader-sa
```

**Tarefa:** confirme que a SA pode ler Pods (`get`/`list`/`watch`) e não pode escrevê-los.

<details><summary>Solução / saída esperada</summary>

```console
Resources          Non-Resource URLs   Resource Names   Verbs
pods               []                  []               [get list watch]
selfsubjectreviews.authorization.k8s.io   []   []   [create]
selfsubjectaccessreviews.authorization.k8s.io   []   []   [create]
...
```

A linha didática é **`pods … [get list watch]`** — exatamente a Role que você concedeu. As linhas
`selfsubject*` são permissões **de base** que toda identidade ganha (elas deixam um subject
perguntar "o que eu posso fazer?"); elas não dão acesso aos seus workloads. **Não** há
`create`/`delete`/`update` em `pods`, então as escritas são negadas — o que o próximo step prova
contra um Pod real.

> Se o `--as` retornar `Error … cannot impersonate resource "serviceaccounts"`, sua conta não tem o
> verb `impersonate` (comum em um namespace compartilhado). Pule para o stretch goal para verificar
> de dentro de um Pod, ou peça ao seu facilitador para conceder impersonation.
</details>

---

### Step 3 — rode comandos reais como a SA (e chegue à quebra)

Aponte o `kubectl` para a SA com `--as` e aja sobre o Pod real do Step 1.

```bash
# leitura — permitido
kubectl get pods --as=system:serviceaccount:$NS:pod-reader-sa

# capture o nome de um Pod real para agir sobre ele
POD=$(kubectl get pod -l app=reader-target -o jsonpath='{.items[0].metadata.name}')

# escrita — a quebra proposital
kubectl delete pod "$POD" --as=system:serviceaccount:$NS:pod-reader-sa
```

**Tarefa:** o `get pods` deve listar o Pod `reader-target`; o `delete pod` deve ser **Forbidden**.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pods --as=system:serviceaccount:$NS:pod-reader-sa
NAME                             READY   STATUS    RESTARTS   AGE
reader-target-6c9d8f7b5c-abcde   1/1     Running   0          40s

$ kubectl delete pod "$POD" --as=system:serviceaccount:$NS:pod-reader-sa
Error from server (Forbidden): pods "reader-target-6c9d8f7b5c-abcde" is forbidden: User "system:serviceaccount:default:pod-reader-sa" cannot delete resource "pods" in API group "" in the namespace "default"
```

O `get` deu match com o verb `list` da Role → permitido. O `delete` não deu match com **nenhuma**
regra → o API server retorna **`Forbidden`**: *"cannot delete resource pods in API group … in the
namespace …"*. (A autorização é checada **antes** de o objeto sequer ser buscado, então o mesmo
erro aparece para qualquer nome de Pod.) O `In API group ""` é de novo o core group. Este é o
deny-by-default do RBAC fazendo seu trabalho — a Role nunca concedeu um verb de escrita.
</details>

**Pergunta:** você pediu para `delete` um Pod que **existe** e você mesmo é cluster-admin — por que
o comando falhou?

<details><summary>Resposta</summary>

Porque o `--as` fez a requisição rodar **como a ServiceAccount**, não como você. O API server
autoriza o subject **impersonado**, e a Role da `pod-reader-sa` permite apenas
`get`/`list`/`watch`. Seus próprios direitos de cluster-admin deixam você *fazer impersonation*,
mas eles não vazam para as permissões da identidade impersonada — esse é justamente o ponto do
`--as`: ele deixa você testar com segurança o acesso efetivo de **outra** identidade.
</details>

---

### Step 4 — conserte: adicione o verb `delete` e recheque

A quebra é um verb faltando, então o conserto é uma linha na **Role**. Adicione `delete`, reaplique
e rode o `can-i` de novo.

```bash
kubectl patch role pod-reader --type='json' \
  -p='[{"op":"add","path":"/rules/0/verbs/-","value":"delete"}]'

# re-verifique — agora permitido
kubectl auth can-i delete pods --as=system:serviceaccount:$NS:pod-reader-sa
```

**Tarefa:** o `can-i delete pods` agora deve imprimir `yes`, e o delete real deve ter sucesso.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl auth can-i delete pods --as=system:serviceaccount:$NS:pod-reader-sa
yes

$ POD=$(kubectl get pod -l app=reader-target -o jsonpath='{.items[0].metadata.name}')
$ kubectl delete pod "$POD" --as=system:serviceaccount:$NS:pod-reader-sa
pod "reader-target-6c9d8f7b5c-abcde" deleted
```

Adicionar `delete` aos `verbs` da Role amplia imediatamente as permissões da SA — **sem rebind, sem
restart de Pod**. O RBAC é avaliado ao vivo em cada requisição, então no momento em que a Role muda,
o `can-i` inverte e a ação passa. (O Deployment simplesmente sobe um Pod substituto, já que a
contagem desejada de réplicas não mudou.) Você poderia igualmente ter usado
`kubectl edit role pod-reader` e adicionado `delete` à lista de `verbs` na mão.
</details>

**Pergunta:** você mudou apenas a **Role** — não o RoleBinding, não a ServiceAccount. Por que isso
foi suficiente?

<details><summary>Resposta</summary>

O RoleBinding é uma **referência**, não uma cópia — ele amarra o *subject* à *Role pelo nome*. As
permissões efetivas da SA são sempre o que a Role referenciada lista naquele momento, avaliadas na
hora da requisição. Então editar os `verbs` da Role muda instantaneamente o que todo subject
vinculado a ela pode fazer. O binding conecta os dois; a Role guarda a concessão de fato.
</details>

---

### Step 5 — pergunta: quando você precisa de uma ClusterRole no lugar?

Você construiu uma **Role** + um **RoleBinding**, inteiramente dentro de um namespace. Esse é o
padrão certo.

**Pergunta:** quando uma `Role` seria a escolha errada — forçando uma `ClusterRole` (e possivelmente
um `ClusterRoleBinding`) no lugar?

<details><summary>Resposta</summary>

Uma `Role` só consegue conceder acesso a resources **namespaced**, **dentro do seu próprio
namespace**. Recorra a uma `ClusterRole` quando:

- **O resource é cluster-scoped.** `nodes`, `namespaces`, `persistentvolumes`, `storageclasses` e
  URLs non-resource como `/healthz` vivem **fora** de qualquer namespace, então uma Role namespaced
  literalmente não consegue nomeá-los. Só uma ClusterRole consegue — e, para concedê-la, você
  vincula com um **ClusterRoleBinding**.
- **Você quer uma definição só, reusada em vários namespaces.** Defina as regras uma vez como uma
  `ClusterRole` e depois referencie-a a partir de um `RoleBinding` **em cada namespace** — a
  concessão continua namespaced (só os resources daquele namespace), mas você mantém uma única
  definição de Role. Esse é o padrão "somente leitura" mais comum.

Regra de bolso: **acesso namespaced a resources namespaced → Role + RoleBinding.** Qualquer coisa
cluster-scoped, ou compartilhada entre namespaces → **ClusterRole** (vinculada de forma namespaced
*ou* cluster-wide, conforme a necessidade). O menor privilégio continua valendo: prefira o escopo
mais estreito que funcione.
</details>

## Stretch (opcional) — chame a API *de dentro* de um Pod, como a SA

O `--as` faz impersonation de fora. A coisa real é um Pod rodando **como** a SA, usando seu
**token projetado** para chamar a API — exatamente como funcionam o Argo CD (S21) e os operators
(S22).

```bash
# um Pod que roda como a pod-reader-sa
cat > reader-pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: api-reader
  labels: { app: s19 }
spec:
  serviceAccountName: pod-reader-sa
  containers:
    - name: shell
      image: curlimages/curl:8.10.1
      command: ["sleep", "3600"]
EOF
kubectl apply -f reader-pod.yaml
kubectl wait --for=condition=Ready pod/api-reader --timeout=60s

# de dentro: leia o token projetado e chame a API para LISTAR pods
kubectl exec api-reader -- sh -c '
  TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
  NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
  curl -sk -o /dev/null -w "list pods → %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    https://kubernetes.default.svc/api/v1/namespaces/$NS/pods
'
```

<details><summary>O que você deve ver, e por quê</summary>

```console
list pods → 200
```

O kubelet projetou o token da SA em `/var/run/secrets/kubernetes.io/serviceaccount/` (junto com o
`namespace` dela). O Pod o apresenta como Bearer token; o API server o autentica como
`system:serviceaccount:$NS:pod-reader-sa` e autoriza contra a **mesma Role** — `list pods` é
permitido, então **`200`**. Agora sonde um resource que a Role **nunca** concede, para provar que a
fronteira vale de dentro também:

```bash
kubectl exec api-reader -- sh -c '
  TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
  NS=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
  curl -sk -o /dev/null -w "list secrets → %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    https://kubernetes.default.svc/api/v1/namespaces/$NS/secrets
'
```

Isso retorna **`403`** (Forbidden) — a Role só cobriu `pods`, então **qualquer** verb em `secrets` é
negado, não importa o que você fez no Step 4. O mesmo deny-by-default, agora aplicado contra um
cliente real dentro do cluster em vez do `--as`. Esta é a identidade que todo workload usa: sem
`--as`, sem cluster-admin, apenas o token projetado e sua Role. Limpe com a seção **Cleanup**
abaixo (o Pod tem o label `app: s19`), ou com `kubectl delete pod api-reader`.
</details>

## Expected state / output

- **Deny by default:** uma ServiceAccount recém-criada não consegue fazer nada; uma permissão só
  existe porque uma **Role lista o verb** *e* um **RoleBinding** amarra essa Role ao subject.
- **O binding é a junção:** a Role e a SA são inertes sozinhas; o `roleRef` + os `subjects` do
  RoleBinding as conectam. Editar a **Role** muda o acesso ao vivo — sem rebind, sem restart.
- **`get pods --as=…` → permitido; `delete pod --as=…` → `Forbidden`** até a Role ganhar o verb
  `delete`. O erro nomeia o subject, o verb, o resource, o API group `""` e o namespace.
- **`--as` testa outra identidade** sem se tornar ela — seus próprios direitos autorizam a
  impersonation, mas quem decide a resposta é a Role da SA impersonada.
- **Escopo:** `Role`/`RoleBinding` são namespaced; resources cluster-scoped ou reúso entre
  namespaces exigem uma `ClusterRole`.

Statuses representativos incluem Pods Ready/Running, timeouts de NetworkPolicy, Forbidden de RBAC,
histórico de revisões do Helm, Application Synced/Healthy, Certificate Ready ou targets do
Prometheus — compare o significado, não nomes efêmeros.

## Explanation

RBAC é deny-by-default: os verbs de uma Role ficam inertes até um RoleBinding uni-los a um subject,
e é essa ausência de vínculo que causa o Forbidden. Editar a Role vinculada atualiza a autorização
imediatamente porque o API server reavalia a Role a cada can-i/requisição — não é preciso reiniciar
o Pod para checagens puras de RBAC com --as.

Os passos guiados acima provam o comportamento do control plane para esta seção; leia os Events e
os campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Reaplique os manifestos nomeados do lab com `kubectl apply -f <file> -n "$NS"` depois de corrigir o
campo quebrado, ou delete apenas os objetos com label da seção Cleanup / reset e reinicie o guided
task. Prefira os Events do `kubectl describe` a chutar. Não rode deletes amplos no cluster.

## Challenge solution

### Commands / manifest

```bash
kubectl auth can-i delete pods -n "$NS" --as="system:serviceaccount:$NS:pod-reader-sa"
kubectl get rolebinding -n "$NS" -o yaml | sed -n '1,80p'
kubectl patch role pod-reader -n "$NS" --type=json \
  -p='[{"op":"add","path":"/rules/0/verbs/-","value":"delete"}]'
kubectl auth can-i delete pods -n "$NS" --as="system:serviceaccount:$NS:pod-reader-sa"
kubectl delete pod -l app=s19 -n "$NS" --as="system:serviceaccount:$NS:pod-reader-sa" --wait=false
```

### Expected state / output

Antes do patch, o can-i delete apresenta no / Forbidden. Depois que a Role ganha o delete e o
RoleBinding existente continua apontando para ela, o can-i passa a apresentar yes e o delete
impersonado tem sucesso apenas para aquela SA.

### Explanation

RBAC é deny-by-default: os verbs de uma Role ficam inertes até um RoleBinding uni-los a um subject,
e é essa ausência de vínculo que causa o Forbidden. Editar a Role vinculada atualiza a autorização
imediatamente porque o API server reavalia a Role a cada can-i/requisição — não é preciso reiniciar
o Pod para checagens puras de RBAC com --as.

### Hints

Inspecione o roleRef e os subjects do RoleBinding; edite os verbs da Role e use
novamente can-i --list --as=... sem recriar a ServiceAccount.
