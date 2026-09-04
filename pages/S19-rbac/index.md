---
layout: section-cover
image: /covers/section-19-keymaster.webp
day: Day 3
section: '19'
tier: optional
track: Security
---

# RBAC

Conceda acesso de menor privilégio: quem pode fazer o quê, em quais recursos.

**optional** · sugerido para o Day 3 · trilha Security

<!--
Seção S19 — RBAC (Role-Based Access Control). Day 3 (M5), trilha Security, tier optional. O
complemento de autorização do S17/S18: o S17 endureceu o que um Pod É, o S18 controlou com o
que um Pod pode FALAR, o S19 controla o que uma identidade pode FAZER na API. Tempo: ~25 min de
slides + 25 min de lab. Resultado: os participantes conseguem nomear o modelo sujeito × verbo ×
recurso, escolher Role vs ClusterRole e RoleBinding vs ClusterRoleBinding, construir uma Role
somente leitura + ServiceAccount + RoleBinding, e verificar permissões efetivas com `kubectl
auth can-i` (incl. impersonação com `--as`).
Beats: problema (um ServiceAccount que pode demais / de menos — "quem tem permissão para fazer
isto?") · modelo mental (sujeitos × verbos × recursos, ligados por um binding) · 2x2 (Role vs
ClusterRole, RoleBinding vs ClusterRoleBinding — namespaced vs cluster-wide) · magic-move
(construir Role → ServiceAccount → RoleBinding campo a campo; frame final == o manifesto do
lab, byte a byte) · can-i / --as (a ferramenta de verificação; impersonar para testar outra
identidade) · tokens de ServiceAccount + a SA default (antecipa que S21 Argo CD e S22 operators
rodam COMO SAs) · recap → S21 · lab.
Animação: NENHUMA. RBAC não tem transição de estado para animar (conforme o outline); o modelo
é um join estático (sujeito–binding–role). Use a comparação 2x2 + magic-move + cards. NÃO
adicione um componente.

ACCURACY LOCKS (verificados contra a documentação atual de RBAC, rbac.authorization.k8s.io/v1):
- Quatro objetos: Role + RoleBinding (namespaced) e ClusterRole + ClusterRoleBinding
  (cluster-wide). apiVersion é rbac.authorization.k8s.io/v1 para os quatro.
- Uma Role/ClusterRole é uma lista pura de PERMISSÃO (apiGroups × resources × verbs). NÃO
  existe deny. O padrão é negar — nenhuma regra correspondente = forbidden.
- Um RoleBinding concede uma Role (ou uma ClusterRole) a sujeitos DENTRO DO SEU namespace. Um
  ClusterRoleBinding concede uma ClusterRole em todo o cluster. Um RoleBinding pode referenciar
  uma ClusterRole para reutilizar uma definição por namespace (idioma comum, mencionado nas notas).
- Sujeitos: User, Group, ServiceAccount. Users/Groups NÃO são objetos k8s (a API confia no
  autenticador); ServiceAccounts SÃO objetos com escopo de namespace.
- `kubectl auth can-i VERB RESOURCE` responde sim/não para a identidade ATUAL; `--as` impersona
  outro sujeito (exige o verbo `impersonate` — quem chama precisa tê-lo; no kind você é
  cluster-admin, então funciona). `--list` despeja o conjunto efetivo de regras.
- Todo Pod recebe um ServiceAccount (a SA `default` do namespace, se não definido); seu token é
  projetado em /var/run/secrets/kubernetes.io/serviceaccount/. A SA default quase não tem permissões.
Amarração CKx: CKA e CKAD Security — RBAC (Roles, RoleBindings, ServiceAccounts) é item central de exame.
-->

---
layout: statement
kicker: O problema
---

Sua aplicação tem um token para a API. **Quem decidiu o que ela pode fazer?**

Todo Pod roda como um **ServiceAccount**, e essa identidade carrega um token no qual o API
server confia. Deixe sem definir e será a SA **`default`** do namespace — que não pode fazer
quase nada, então seu controller falha silenciosamente ao listar Pods. Conceda demais (o
conserto tentador: fazer o binding para **`cluster-admin`**) e um único Pod comprometido agora
é dono do cluster. Nem o "de menos" nem o "demais" são acidente do Kubernetes — **você**
responde *"quem pode fazer o quê"*, ou herda um default.

<!--
Speaker: o beat do "por que se importar", continuando o arco de segurança do Day 3. O S17
encolheu o que um Pod pode FAZER no node; o S18 encolheu com o que um Pod pode FALAR; o S19 é o
terceiro eixo — o que uma identidade pode fazer na API do KUBERNETES. Enquadre como um problema
de Cachinhos Dourados que a plateia já viveu: um controller que não consegue listar seus
próprios recursos (de menos — sem binding nenhum, ou a SA default quase sem poderes), versus o
desastre de copiar e colar um binding do workload para cluster-admin para "simplesmente
funcionar" (demais — agora um invasor naquele Pod é um invasor no cluster inteiro). RBAC é como
você responde à pergunta deliberadamente: sujeito × verbo × recurso, menor privilégio. Segure
isto: autorização é "quem pode fazer o quê", e o padrão é NEGAR.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · um sujeito, um conjunto de ações permitidas e o join</span>

# RBAC = *quem* × *qual verbo* × *qual recurso* — ligados por um **binding**

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Role — as ações permitidas" icon="📜" variant="ok">
      Uma <strong>Role</strong> é uma pura <strong>lista de permissões</strong>:
      <em>verbos</em> (<code>get</code>, <code>list</code>, <code>create</code>, <code>delete</code>…)
      sobre <em>recursos</em> (<code>pods</code>, <code>secrets</code>…). Não existe deny — o
      padrão é <strong>negar</strong>, então uma ação sem regra correspondente é proibida.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Sujeito — o quem" kind="sa" variant="ok">
      Um <strong>User</strong>, um <strong>Group</strong> ou um
      <strong>ServiceAccount</strong>. Users/Groups não são objetos do Kubernetes (a API confia
      no autenticador); um <strong>ServiceAccount</strong> <em>é</em> um objeto com escopo de
      namespace como o qual seus Pods rodam.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">o join é o ponto central</span>

Uma Role sozinha não concede nada, e um sujeito começa sem nada. Um **binding** é o join:
*"dê a **estes sujeitos** os verbos desta **Role**."* Sem binding, sem acesso. Esse é o modelo
inteiro — **sujeito × verbo × recurso, conectados por um binding** — e todo o resto é apenas
*namespaced vs cluster-wide*.

</div>

</div>

<!--
Speaker: três peças, nesta ordem. (1) Uma Role é uma lista de permissões — regras de
(apiGroups, resources, verbs). Criticamente, NÃO existe regra de deny no RBAC; permissões são
puramente aditivas e a linha de base é negar, então "não permitido" = "nenhuma regra disse
sim". (2) O sujeito — para quem você está concedendo. Três tipos: User, Group, ServiceAccount.
Users e Groups NÃO são objetos no cluster — o Kubernetes não os cria; um autenticador externo
(certificados, OIDC) os afirma e o RBAC apenas referencia a string. ServiceAccounts SÃO objetos
reais com escopo de namespace, e são o que os workloads usam. (3) O join: uma Role e um sujeito
nunca se tocam até um BINDING conectá-los. Este é o erro nº 1 de iniciante — escrevem uma Role
perfeita, nada funciona, porque nada foi vinculado. Diga a frase: "sujeito vezes verbo vezes
recurso, amarrados por um binding". Próximo slide: os quatro objetos são só este modelo em dois
escopos.
-->

---
layout: comparison
heading: 'Dois escopos × dois objetos — o 2×2 do RBAC'
leftHeading: 'Role  ·  RoleBinding'
rightHeading: 'ClusterRole  ·  ClusterRoleBinding'
leftBadge: namespaced
rightBadge: cluster-wide
---

<div class="text-sm">

**`Role`** — regras que valem **dentro de um namespace**. Nomeia recursos com escopo de
namespace (`pods`, `configmaps`, `secrets`).

**`RoleBinding`** — concede uma Role (ou uma ClusterRole) a sujeitos, **restrito ao seu
próprio namespace**. Este é o nosso lab: uma Role + um RoleBinding, tudo no seu namespace.

<div class="mt-2 kw-muted">
Use quando: acesso de menor privilégio a recursos <strong>em um namespace</strong> — o padrão
comum e seguro.
</div>

</div>

::right::

<div class="text-sm">

**`ClusterRole`** — regras que valem **em todo o cluster**, e a única forma de nomear recursos
**com escopo de cluster** (`nodes`, `namespaces`, `persistentvolumes`) ou URLs não-recurso
(`/healthz`).

**`ClusterRoleBinding`** — concede uma ClusterRole em **todos** os namespaces de uma vez.
`cluster-admin` é uma ClusterRole; vincular um workload a ela é a concessão excessiva do slide 1.

<div class="mt-2 kw-muted">
Use quando: recursos com escopo de cluster, ou uma definição reutilizada em <strong>muitos</strong>
namespaces (uma ClusterRole referenciada por um RoleBinding em cada namespace).
</div>

</div>

<!--
Speaker: o 2x2 que responde "qual dos quatro eu uso". Um eixo é a ROLE (o quê): Role = regras
que só fazem sentido dentro de um namespace; ClusterRole = regras que podem abranger o cluster
E a única forma de referenciar recursos com escopo de cluster como nodes/namespaces/PVs (eles
vivem fora de qualquer namespace, então uma Role namespaced literalmente não consegue
nomeá-los). O outro eixo é o BINDING (onde a concessão aterrissa): RoleBinding = concessão
confinada ao próprio namespace; ClusterRoleBinding = concessão vale em todos os namespaces. O
caso do meio, poderoso: um RoleBinding pode referenciar uma ClusterRole — você define
"read-only pods" uma vez como ClusterRole e vincula por namespace, então a concessão continua
namespaced mas a definição é compartilhada. cluster-admin é só uma ClusterRole embutida; o
desastre é vincular a SA de um Pod a ela com um ClusterRoleBinding. Nosso lab fica no canto
seguro: Role + RoleBinding, inteiramente dentro do seu namespace — sem precisar de
cluster-admin. Este é um item central de CKA/CKAD: conheça os quatro e quando cada um se aplica.
-->

---
layout: code-walkthrough
heading: 'Construa: Role → ServiceAccount → RoleBinding'
lab: labs/day-3/19-rbac.md
---

````md magic-move
```yaml
# 1 — uma Role somente leitura: verbos sobre um recurso, em UM namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  labels: { app: s19 }
rules:
  - apiGroups: [""]                 # "" = o grupo core da API (os pods vivem aqui)
    resources: ["pods"]
    verbs: ["get", "list", "watch"] # somente leitura: sem create/delete
```

```yaml
# 2 — o sujeito: um ServiceAccount como o qual seu workload vai rodar
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-reader-sa
  labels: { app: s19 }
```

```yaml
# 3 — o JOIN: vincule a Role ao ServiceAccount (mesmo namespace)
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
```

```yaml
# os três juntos — o manifesto exato que o Lab 19 aplica (byte a byte)
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  labels: { app: s19 }
rules:
  - apiGroups: [""]                 # "" = o grupo core da API (os pods vivem aqui)
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
```
````

<!--
Speaker: QUATRO frames, um por objeto e depois o arquivo inteiro. Frame 1 — a Role: a regra é
(apiGroups, resources, verbs). apiGroups: [""] é o grupo CORE onde os pods vivem (a string
vazia, NÃO "core" como texto — pegadinha clássica; apps/, batch/, rbac.authorization.k8s.io/
são grupos nomeados). verbs get/list/watch = somente leitura; note que não há create nem
delete, que é exatamente a quebra que o lab encontra. Frame 2 — o ServiceAccount:
simplicíssimo, só uma identidade nomeada no namespace; o objeto inteiro é metadata. Frame 3 — o
RoleBinding, o join: `subjects` lista QUEM (nossa SA), `roleRef` nomeia QUAL Role. roleRef é
imutável e seu apiGroup é rbac.authorization.k8s.io (o apiGroup dos subjects para um
ServiceAccount é "", omitido aqui). Frame 4 — os três concatenados: é byte a byte o que o
heredoc do Lab 19 aplica (labels app=s19 para limpeza com escopo). Este frame final é a linha
de base SOMENTE LEITURA; o lab quebra em `delete pods`, e depois edita ESTA Role para
adicionar o verbo delete. Passe ao can-i para verificar.
-->

---
layout: code-annotated
heading: 'Verifique, não adivinhe: `kubectl auth can-i`'
compact: true
lab: labs/day-3/19-rbac.md
---

```bash {none|1-2|4-6|8-9|all}
# a MINHA identidade atual tem uma permissão?
kubectl auth can-i list pods            # → yes / no, para você

# impersone o ServiceAccount — teste as permissões efetivas DELE
kubectl auth can-i get pods \
  --as=system:serviceaccount:$NS:pod-reader-sa      # → yes
kubectl auth can-i delete pods \
  --as=system:serviceaccount:$NS:pod-reader-sa      # → no

# despeje o conjunto efetivo de regras inteiro daquele sujeito
kubectl auth can-i --list --as=system:serviceaccount:$NS:pod-reader-sa
```

::notes::

<CodeNote at="1" label="can-i — sim/não para você" variant="ok">
Responde se a identidade <strong>atual</strong> pode executar uma ação. Sem mudanças no
cluster, sem adivinhação — avalia o mesmo RBAC que o API server avalia.
</CodeNote>

<CodeNote at="2" label="--as — impersone um sujeito" variant="ok">
O nome da SA é <code>system:serviceaccount:&lt;ns&gt;:&lt;sa&gt;</code>. O <code>--as</code>
pergunta "o que <strong>esta</strong> identidade poderia fazer?" — é como você testa uma Role
antes de um workload usá-la.
</CodeNote>

<CodeNote at="3" label="--list — o quadro completo" variant="warn">
Despeja toda regra efetiva do sujeito. Espere uma linha <code>pods [get list watch]</code> —
além das linhas básicas de autoavaliação que toda identidade recebe.
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
O próprio <code>--as</code> exige o verbo <strong>impersonate</strong>. No <strong>kind</strong>
você é cluster-admin, então simplesmente funciona; em um namespace compartilhado, seu
facilitador precisa conceder.
</div>

<!--
Speaker: a ferramenta de verificação — ensine os alunos a NUNCA adivinhar se uma Role funciona.
`kubectl auth can-i VERB RESOURCE` retorna um sim/não simples avaliando exatamente a mesma
autorização que o API server usa, com zero efeitos colaterais. A jogada poderosa é o `--as`:
impersone qualquer sujeito e pergunte o que ELE pode fazer — a forma da string de SA é
system:serviceaccount:<namespace>:<name>. É assim que você valida uma Role antes de vinculá-la
a um workload real. `--list` despeja o conjunto efetivo completo de regras (você verá a linha
pods get/list/watch que concedeu, mais linhas básicas como selfsubjectreviews que todo sujeito
pode — não se surpreenda com elas). A ressalva única: impersonação é em si um verbo
privilegiado — QUEM CHAMA precisa de `impersonate`. No kind você é cluster-admin, então é de
graça; em uma conta namespaced compartilhada pode ser negado ("cannot impersonate"), e a nota
de ambiente do lab + o stretch goal do token dentro do Pod cobrem esse caminho. Este é o loop
exato do Lab 19: conceda, can-i, quebre, can-i, conserte, can-i.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Todo Pod já tem uma identidade · você acabou de conhecer o lado do sujeito</span>

# Tokens de ServiceAccount — a identidade que seus workloads *já* usam

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="O token é projetado para dentro" kind="sa" variant="ok">
      Todo Pod roda como um ServiceAccount e recebe um token de curta duração, rotacionado
      automaticamente, montado em
      <code>/var/run/secrets/kubernetes.io/serviceaccount/</code>. O código no Pod o usa para
      chamar a API — essa é a identidade que o <code>can-i --as</code> estava testando.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="A SA default é quase sem poderes" kind="api" kindVariant="labeled" variant="warn">
      Sem <code>serviceAccountName</code> definido, o Pod usa a SA <code>default</code> do
      namespace — vinculada a <strong>quase nada</strong>. Então um controller que precisa ler
      Pods deve ganhar sua <strong>própria</strong> SA + Role, exatamente como no lab.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">onde isto aparece a seguir</span>

Isto não é acadêmico. O **Argo CD** reconcilia seu cluster **como um ServiceAccount**;
**operators** rodam seus controllers **como um ServiceAccount**. Ambos precisam de uma Role
com escopo preciso — estreita demais e não conseguem reconciliar, larga demais e viram o blast
radius. A mesma Role → SA → binding que você acabou de construir.

</div>

</div>

<!--
Speaker: feche o ciclo entre o sujeito abstrato e o sistema em execução. (1) Todo Pod SEMPRE
tem uma identidade de ServiceAccount, e o kubelet projeta no Pod um JWT de curta duração, com
audience restrita e rotação automática, no path conhecido. Qualquer biblioteca cliente o lê
automaticamente e se autentica na API como aquela SA — esta é literalmente a identidade que
impersonamos com `can-i --as`. (Defina automountServiceAccountToken: false para excluir um Pod
que nunca chama a API — um pequeno ganho de hardening, amarra com o S17.) (2) Se você não
definir serviceAccountName, o Pod usa silenciosamente a SA `default` do namespace, que clusters
modernos vinculam a essencialmente nada — então "minha aplicação não consegue listar pods"
costuma ser "é a SA default sem Role". O conserto é dar a ela sua própria SA + Role de menor
privilégio, precisamente o lab. (3) Antecipação: o S21 Argo CD e o S22 operators são apenas
Pods que falam com a API COMO um ServiceAccount, então toda a postura de segurança deles é uma
Role de RBAC — agora você sabe lê-la e delimitá-la. O stretch goal do Lab 19 monta o token e
chama a API de dentro de um Pod para tornar isso concreto.
-->

---
layout: recap
heading: 'Recap — o padrão é negar; você concede de propósito'
story: 'Um ServiceAccount começa sem nada. Uma Role somente leitura listou os verbos permitidos, um RoleBinding uniu os dois, e o can-i --as provou: get pods sim, delete pods não. Adicionar um verbo à Role inverteu a resposta — sem restart, sem rebind.'
next: 'GitOps com Argo CD — um controller que reconcilia seu cluster como um ServiceAccount, delimitado exatamente por este RBAC'
---

- RBAC é **sujeito × verbo × recurso, unidos por um binding** — o padrão é **negar**, então uma
  permissão só existe porque uma regra e um binding dizem que sim
- O **2×2**: `Role`/`RoleBinding` são **namespaced**; `ClusterRole`/`ClusterRoleBinding` são
  **cluster-wide** e a única forma de nomear recursos com escopo de cluster
- Uma **Role não concede nada** sem um **RoleBinding** — o join é o passo que iniciantes esquecem
- **`kubectl auth can-i … --as=…`** verifica permissões efetivas sem adivinhar nem aplicar
- Todo Pod roda como um **ServiceAccount**; a SA `default` é quase sem poderes — dê aos
  workloads sua **própria** SA com escopo (**Argo CD** e **operators** fazem exatamente isso)
- Menor privilégio vence `cluster-admin`: um binding largo demais transforma um Pod no blast radius

<!--
Speaker: consolide o modelo que segue para o S21/S22. Quatro beats: (1) autorização é um join —
sujeito × verbo × recurso, e é NEGAR por padrão, puramente aditivo, sem regra de deny; nada
funciona até existirem uma Role E um binding. (2) Os quatro objetos são um modelo em dois
escopos — use Role/RoleBinding por padrão, ClusterRole/ClusterRoleBinding só para recursos com
escopo de cluster ou definições compartilhadas. (3) can-i --as é como você verifica em vez de
aplicar por tentativa e erro. (4) Todo workload tem uma identidade de SA; delimite-a bem — a
default é sem poderes, cluster-admin é o blast radius, o ponto ideal é uma Role feita sob
medida como a que eles vão construir. Passe ao Lab 19: crie a SA + Role somente leitura +
binding, prove que get-pods funciona e delete-pods é Forbidden, então adicione o verbo delete e
veja o can-i inverter. Depois o S21 mostra o Argo CD como o controller que vive ou morre por
exatamente este RBAC.
-->

---
layout: lab
lab: labs/day-3/19-rbac.md
duration: 25 min
env: 'namespace ✓ / kind ✓  (--as needs impersonate rights — see the lab note)'
---

## Lab 19 — Identidade somente leitura

- Crie um **ServiceAccount**, uma **Role** somente leitura (`get`/`list`/`watch` em pods) e um
  **RoleBinding** — o manifesto do magic-move do slide, byte a byte
- Verifique com `kubectl auth can-i --list --as=system:serviceaccount:$NS:pod-reader-sa`
- Execute comandos reais **como a SA**: `get pods` funciona; **`delete pod` é Forbidden** — a quebra
- **Conserte:** adicione o verbo `delete` à Role, cheque o `can-i` de novo — agora permitido
- Pergunta: quando você precisa de uma **ClusterRole**? · Stretch: monte o token da SA e chame a
  API de **dentro** de um Pod
