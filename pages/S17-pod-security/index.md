---
layout: section-cover
image: /covers/section-17-armour-fitting.webp
day: Day 3
section: '17'
tier: core
track: Security
---

# Segurança de Pods

Aplique hardening em um Pod; entenda os Pod Security Standards.

**core** · sugerido para o Day 3 · trilha Security

<!--
Seção S17 — Segurança de Pods (securityContext + Pod Security Standards / Admission).
Abre o Day 3 (M5). Tempo: ~30 min de slides + 25 min de lab. Resultado: os participantes
conseguem aplicar hardening em um Pod até o padrão `restricted` definindo os QUATRO campos que
ele verifica, explicar por que o PSA rejeita um Pod na admission (antes de ele existir) e
distinguir o enforcement de admission (PSA) do enforcement de runtime que o kubelet aplica
(runAsNonRoot em uma image que roda como root → CrashLoop).
Beats: problema (root + rootfs gravável em um kernel compartilhado → antecipa o S25) · modelo
mental (securityContext de container vs de Pod; a escada PSS privileged/baseline/restricted) ·
code-annotated (os quatro gates do restricted) · magic-move (inseguro → quatro gates PASSAM o
restricted → +readOnlyRootFilesystem, ALÉM do restricted) · callback ao S02 + a armadilha de
runtime · gate de scan de image com Trivy (o scanner do S02 agora nomeado + o padrão de exit
code em CI; adição de custo zero — 11 slides ainda abaixo da norma de densidade de 30 min do
deck) · PSA via labels de namespace (enforce/warn/audit) · animação AdmissionGate · recap →
S25 · lab.
Trivy ACCURACY LOCKS (verificados contra a documentação de trivy.dev, 2026-08): scanner
open-source da Aqua Security; `trivy image` compara pacotes do SO E dependências de linguagem
contra feeds de CVE (também scan de misconfig/secret/SBOM); `--severity HIGH,CRITICAL
--exit-code 1` é o padrão documentado de gate em CI; o pipeline de build do próprio
workshop-web é genuinamente gated pelo Trivy (ver os comentários em infra/versions.env).
Apenas conceitos: sem pin de TRIVY, sem passo de lab; o S25 adiciona a metade viva in-cluster
(Trivy Operator).
Animação: AdmissionGate.vue (novo, autocontido) — request → verificação do PSA → deny e depois admit.
ACCURACY LOCKS (verificados contra o doc atual de Pod Security Standards):
- `restricted` verifica EXATAMENTE quatro campos de spec para um Pod simples: runAsNonRoot:true,
  allowPrivilegeEscalation:false, capabilities.drop:["ALL"], seccompProfile RuntimeDefault|Localhost.
- readOnlyRootFilesystem NÃO é um requisito do restricted — é hardening além do restricted,
  escrito como o passo FINAL do magic-move e o quebre→conserte pós-admission do lab.
- runAsNonRoot passa na admission do PSA quando o campo está definido, mas o KUBELET aplica em
  runtime: uma image root é admitida e depois entra em CrashLoop ("container has runAsNonRoot
  and image will run as root"). Usamos ghcr.io/platformrelay/workshop-web (distroless nonroot,
  UID 65532, :8080) para o lab de hardening realmente rodar — e como ela nunca escreve em
  disco, readOnlyRootFilesystem não custa nada; o quebre→conserte de runtime do lab usa um Pod
  busybox que escreve em disco.
Amarração CKx: CKAD securityContext + CKA admission/security hardening.
-->

---
layout: statement
kicker: O problema
---

Seu container compartilha o **kernel** do host — e, por padrão, roda como **root** nele.

Todo Pod `web` até aqui rodou como **UID 0**, com um **root filesystem gravável** e o conjunto
completo de Linux capabilities. Em um node compartilhado, isso está a um bug de kernel — ou a
uma dependência comprometida — de distância de um container que escreve onde não deveria,
adiciona capabilities ou escala em direção ao host. Menor privilégio aqui não é burocracia;
é o blast radius.

<!--
Speaker: o beat do "por que se importar", e ele antecipa o S25 (pod escape). Um container não é
uma VM — é um processo no kernel do HOST, isolado por namespaces + cgroups (callback ao
S01/S03). Se o processo é root e o isolamento tem uma brecha, root-no-container está a meio
caminho de root-no-node. Dois defaults concretos para nomear: (1) a maioria das images roda
como UID 0 a menos que se diga o contrário; (2) o root filesystem é gravável, então um invasor
com um ponto de apoio consegue instalar ferramentas/binários. Esta seção entrega as duas
alavancas que encolhem o blast radius: o `securityContext` do próprio Pod (o que o Pod pede
para ser) e o Pod Security Admission (o que a plataforma deixa entrar). O S25 transforma esses
mesmos botões em defesas nomeadas contra um escape real.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Modelo mental · duas perguntas, dois mecanismos</span>

# O que o Pod pede · o que a plataforma permite

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="securityContext — o que o Pod solicita" kind="pod" variant="ok">
      Campos no <strong>Pod</strong> e em cada <strong>container</strong>:
      <code>runAsNonRoot</code>, <code>runAsUser</code>, <code>capabilities</code>,
      <code>allowPrivilegeEscalation</code>, <code>seccompProfile</code>,
      <code>readOnlyRootFilesystem</code>. Quem define é você.
      <div class="kw-muted mt-1">O nível de container sobrescreve o nível de Pod onde houver sobreposição.</div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Pod Security Standards — o que a plataforma exige" icon="🛡️" variant="warn">
      Três perfis nomeados que o cluster pode <strong>impor</strong> na admission. Uma escada,
      do mais frouxo → ao mais estrito.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">a escada — Pod Security Standards</span>

<div class="mt-1" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.8rem;">
  <KwCard heading="privileged" icon="🔓" variant="danger">
    Escancarado. Sem restrições — só para workloads de infra/sistema confiáveis.
  </KwCard>
  <KwCard heading="baseline" icon="🚧" variant="warn">
    Bloqueia o sabidamente perigoso: nada de privileged, host namespaces, hostPath etc.
  </KwCard>
  <KwCard heading="restricted" icon="🔒" variant="ok">
    Baseline <strong>mais</strong> menor privilégio: non-root, sem priv-esc, drop de caps, seccomp.
  </KwCard>
</div>

</div>

</div>

<!--
Speaker: separe as duas ideias com clareza, porque os alunos as fundem. securityContext é o que
o SEU manifesto declara — o nível de Pod (spec.securityContext) define defaults para todos os
containers, o nível de container (spec.containers[].securityContext) sobrescreve para um; o
container vence na sobreposição. Pod Security STANDARDS são os perfis definidos pela CNCF —
privileged (no-op), baseline (bloqueia o obviamente perigoso — hostNetwork, privileged,
hostPath…), restricted (baseline + menor privilégio). É uma escada: cada degrau é um
superconjunto do anterior. A plataforma escolhe um degrau por namespace e o admission
controller embutido confere seu Pod contra ele. Próximo slide: exatamente quais campos o
`restricted` verifica — é uma lista curta e memorizável.
-->

---
layout: code-annotated
heading: 'Os quatro campos que o `restricted` de fato verifica'
compact: true
lab: labs/day-3/17-pod-security.md
---

```yaml {none|3|4|5-6|7-8|all}
spec:
  containers:
    - name: web
      securityContext:
        runAsNonRoot: true                 # 1
        allowPrivilegeEscalation: false    # 2
        capabilities:
          drop: ["ALL"]                    # 3
        seccompProfile:
          type: RuntimeDefault             # 4
```

::notes::

<CodeNote at="1" label="1 · runAsNonRoot" variant="ok">
O container <strong>não</strong> pode rodar como UID 0. Esta é uma <em>promessa que a image
precisa cumprir</em> — veja o próximo slide.
</CodeNote>

<CodeNote at="2" label="2 · sem escalação de privilégio" variant="ok">
Bloqueia ganhos de privilégio estilo <code>setuid</code> acima do processo pai — nada de
<code>sudo</code> para subir de nível dentro do container.
</CodeNote>

<CodeNote at="3" label="3 · drop de TODAS as capabilities" variant="ok">
Comece com zero Linux capabilities. O <code>restricted</code> permite dar <code>add</code> de
volta apenas em <code>NET_BIND_SERVICE</code>, se você realmente precisar de uma porta baixa.
</CodeNote>

<CodeNote at="4" label="4 · seccompProfile: RuntimeDefault" variant="ok">
Aplica o filtro de syscalls padrão do runtime (<code>RuntimeDefault</code> ou
<code>Localhost</code>) — encolhe a superfície de kernel alcançável.
</CodeNote>

<div v-click="5" class="mt-2 text-sm kw-muted">
Defina esses quatro e um Pod simples satisfaz o <code>restricted</code>. Esse é o checklist
inteiro que o gate de admission executa.
</div>

<!--
Speaker: este é o slide de "memorize isto". Para um Pod SIMPLES (sem host namespaces, sem
volumes para se preocupar), o `restricted` verifica exatamente estes quatro campos — nada mais.
runAsNonRoot=true, allowPrivilegeEscalation=false, capabilities.drop precisa conter ALL (você
pode adicionar de volta apenas NET_BIND_SERVICE), e seccompProfile.type é RuntimeDefault ou
Localhost. Aqui definidos no nível de container; parte deles (runAsNonRoot, seccompProfile)
também pode ficar no nível de Pod para cobrir todos os containers de uma vez. Se um aluno
perguntar "e o readOnlyRootFilesystem?" — segure, é o slide depois do próximo, e ele NÃO é um
desses quatro. O lab elimina essas violações uma de cada vez; as strings exatas de violação vêm
direto do admission controller.
-->

---
layout: code-walkthrough
heading: 'Hardening na prática — Pod inseguro → passa no `restricted` → além'
lab: labs/day-3/17-pod-security.md
---

````md magic-move
```yaml
# 0: como rodou até agora — root, caps completas, rootfs gravável. REJEITADO pelo restricted.
apiVersion: v1
kind: Pod
metadata: { name: web, labels: { app: s17 } }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      # (sem nenhum securityContext)
```

```yaml
# 1: +runAsNonRoot / runAsUser — elimina "runAsNonRoot != true"
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532                   # o usuário non-root embutido da image (distroless "nonroot")
```

```yaml
# 2: +allowPrivilegeEscalation:false — elimina "allowPrivilegeEscalation != false"
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
```

```yaml
# 3: +drop de TODAS as capabilities — elimina "unrestricted capabilities"
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
```

```yaml
# 4: +seccompProfile — elimina o último gate. AGORA PASSA no `restricted`.
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
        seccompProfile:
          type: RuntimeDefault
```

```yaml
# 5: +readOnlyRootFilesystem — ALÉM do restricted (não exigido), defesa em profundidade.
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
        seccompProfile: { type: RuntimeDefault }
        readOnlyRootFilesystem: true       # de graça para ESTA aplicação — ela nunca escreve em /
```
````

<!--
Speaker: SEIS frames, e a fronteira da legenda importa. Os frames 0→4 eliminam UMA violação do
restricted cada, na mesma ordem em que o admission controller as lista; no frame 4 os quatro
gates passam e o Pod é admitido. PARE e diga: o frame 4 é compatível com o `restricted`. O
frame 5 adiciona readOnlyRootFilesystem — deixe explícito que isso NÃO faz parte do restricted,
é hardening extra. Seja honesto: a aplicação de demo passa pelo frame 5 sem esforço — ela é
distroless, loga em stdout, mantém estado em memória e nunca escreve no root filesystem, que é
exatamente o que uma image bem construída te compra. O lab então mostra o OUTRO caso: um Pod
busybox que escreve um arquivo de PID quebra sob readOnlyRootFilesystem, e você conserta com um
emptyDir cobrindo só aquele path. Nota sobre a image: workshop-web já roda como o usuário
nonroot do distroless (UID 65532) e escuta na 8080, então runAsNonRoot é uma promessa que ela
cumpre — que é exatamente o ponto de runtime do próximo slide. O lab aplica esses frames como
arquivos reais e observa o gate virar de Forbidden para created.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Callback à higiene de images · admission ≠ runtime</span>

# `runAsNonRoot` é uma promessa que a image precisa cumprir

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="A admission verifica o campo" kind="pod" variant="ok">
      O PSA vê que <code>runAsNonRoot: true</code> está <em>definido</em> e admite o Pod. É tudo
      que a admission pode saber — ela lê YAML, não a image.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="O kubelet verifica a realidade" icon="💥" variant="danger">
      Na inicialização, se o usuário efetivo da image for <strong>root</strong>, o kubelet se
      recusa a executá-la:
      <div class="kw-muted mt-1"><code>container has runAsNonRoot and image will run as root</code>
      → <strong>CreateContainerError → CrashLoopBackOff</strong>.</div>
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">então a image precisa de fato ser non-root</span>

Ou a image define um `USER` non-root (esta é exatamente a **image non-root que você construiu
em segurança de containers**), ou você fixa `runAsUser` em um UID non-root real com o qual a
image consegue rodar. Usamos a `workshop-web` — sua base distroless vem como UID **65532**
(`nonroot`) e ela escuta na **8080**, então a promessa se sustenta e o Pod roda.

</div>

</div>

<!--
Speaker: esta é a armadilha que morde todo mundo, e é a amarração honesta com o S02.
runAsNonRoot: true não é "me torne non-root" — é uma AFIRMAÇÃO que a plataforma verifica de
duas formas diferentes. A admission (PSA) só confere que o campo está presente, então admite. O
kubelet, na criação do container, resolve o UID efetivo da image; se for 0 e runAsNonRoot for
true, ele falha com "container has runAsNonRoot and image will run as root" — o Pod existe mas
nunca inicia (CreateContainerError → CrashLoopBackOff). O conserto não é um campo de
securityContext — é a IMAGE: construa-a non-root (o multi-stage com USER non-root do S02) ou
defina runAsUser com um UID que a image realmente suporte. A maioria das base images (busybox,
debian, …) roda como root e cairia nisso — o callout do lab nomeia o problema; a workshop-web
vem como o usuário nonroot 65532 do distroless, então nosso Pod com hardening realmente serve
tráfego. Aponte de volta para o S02: a razão de toda aquela higiene de image é justamente
tornar possível um hardening de runtime como este.
-->

---
layout: code-annotated
heading: 'Escaneie a image antes de qualquer gate ver o Pod'
compact: true
---

```console {none|1-2|4-5|all}
$ trivy image ghcr.io/platformrelay/workshop-web:v1
  0 CVEs conhecidos — distroless: quase nada para comparar

$ trivy image --severity HIGH,CRITICAL --exit-code 1 app:2019
  47 CVEs (HIGH 31, CRITICAL 16) → exit 1 — o deploy para
```

::notes::

<CodeNote at="1" label="o que um scanner verifica" variant="ok">
<strong>Trivy</strong> — o scanner da seção de segurança de containers —
compara pacotes do SO <em>e</em> dependências de linguagem contra feeds de CVE.
</CodeNote>

<CodeNote at="2" label="o gate de CI" variant="warn">
<code>--exit-code 1</code> falha o pipeline: uma image vulnerável nunca é publicada.
Nosso próprio build do <code>workshop-web</code> tem um gate exatamente assim.
</CodeNote>

<CodeNote at="3" label="duas perguntas diferentes" variant="ok">
O scanner faz o gate do <strong>conteúdo</strong> da image; o PSA (próximo slide) faz o gate da
<strong>spec</strong> do Pod. Defesa em profundidade precisa dos dois.
</CodeNote>

<!--
Speaker: este beat nomeia a ferramenta que a história de scan do S02 usou genericamente. Trivy
é o scanner open-source (Aqua Security) que a maior parte do ecossistema usa — Grype é uma boa
alternativa, e o S25 mantém o enquadramento por categoria, neutro de fornecedor. Primeiro
comando: nossa image de demo volta limpa, e não por sorte — distroless significa que quase não
há inventário de pacotes para comparar, que é a lição do S02 pagando dividendos. Segundo
comando: o idioma de gate de CI direto da documentação do Trivy — filtre para HIGH/CRITICAL,
--exit-code 1, e o deploy para no pipeline; diga com honestidade que a image workshop-web que
eles usaram a semana toda é construída atrás de exatamente esse gate (mais assinatura + SBOM)
no CI deste próprio repositório. A terceira nota é o ponto real do slide e a ponte para o PSA:
conteúdo da image vs spec do Pod são perguntas de admission ORTOGONAIS — o scan não enxerga
privileged:true, o PSA não enxerga um OpenSSL desatualizado. Defesa em profundidade precisa dos
dois, e o S25 adiciona a terceira perna: e os CVEs divulgados DEPOIS de a image ser admitida?
-->

---
layout: code-annotated
heading: 'O enforcement mora no namespace — três labels'
compact: true
lab: labs/day-3/17-pod-security.md
---

```yaml {none|2-3|4|5|all}
metadata:
  labels:
    pod-security.kubernetes.io/enforce: restricted        # rejeita violadores
    pod-security.kubernetes.io/warn: restricted           # avisa no kubectl
    pod-security.kubernetes.io/audit: restricted          # registra no audit log
```

::notes::

<CodeNote at="1" label="enforce — o único com dentes" variant="danger">
Pods violadores são <strong>rejeitados na admission</strong>. Este é o label que o lab liga; os
outros dois nunca bloqueiam.
</CodeNote>

<CodeNote at="2" label="warn — um aviso ao autor" variant="warn">
O Pod ainda é criado, mas o <code>kubectl</code> imprime um <code>Warning:</code> para cada
violação. Ótimo para um rollout suave.
</CodeNote>

<CodeNote at="3" label="audit — uma nota para o log do cluster" variant="ok">
Registra a violação no audit log da API — invisível para o usuário, visível para o time de plataforma.
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
O PSA é <strong>embutido</strong> — nenhum controller para instalar. Cada label também aceita
uma versão fixada (<code>…/enforce-version: v1.34</code>). Adicione <code>warn</code> antes de
<code>enforce</code> para migrar um namespace sem quebrar ninguém.
</div>

<!--
Speaker: Pod Security ADMISSION é como um Standard é aplicado — e são LABELS com escopo de
namespace, nada para instalar (embutido no API server desde a 1.25, estável). Três modos
independentes, cada um pode nomear um perfil e uma versão diferentes: enforce (rejeita — o
único que bloqueia), warn (cria mesmo assim, mas retorna um Warning ao kubectl — o autor vê),
audit (cria mesmo assim, escreve no audit log — a plataforma vê). A jogada de migração, que
vale dizer: rotule warn+audit=restricted primeiro, observe o que quebraria via warnings/audit,
conserte os workloads, e ENTÃO troque para enforce=restricted. O pin de versão
(enforce-version: v1.34) congela o conjunto de regras para um upgrade de cluster não apertá-lo
silenciosamente. O lab define enforce (kind) ou usa um namespace pré-rotulado (cluster
compartilhado). A seguir: veja o gate decidir, ao vivo.
-->

---

<span class="kw-kicker">Mesmo gate, mesmo namespace — o que mudou foi o manifesto</span>

# O gate de admission, ao vivo

<div class="mt-2">
  <AdmissionGate :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- Um Pod cru (root, sem `securityContext`) é submetido a um namespace com `enforce: restricted`.
- O PSA o verifica **antes de ser armazenado** — os quatro gates falham → **Forbidden**, e
  **nada é criado**.
- Defina os quatro campos e reaplique o *mesmo* Pod…
- …todos os gates passam → **admitido** e agendado. A política não se moveu; o Pod, sim.

</v-clicks>
</div>

<!--
Speaker: conduza com os cliques; isto torna o momento da admission físico, e é exatamente o
lab. (0) o Pod inseguro rumo ao gate. (1) o gate decide — quatro ✗ vermelhos, veredito DENIED
(Forbidden); ponto crucial: o Pod NUNCA é criado, não há nada para kubectl get, nada para
deletar — contraste com as falhas de runtime do S13/S14, onde o Pod existe e se comporta mal.
Isso é enforcement de admission: o API server disse não antes de o etcd sequer vê-lo. (2)
reaplique a versão com hardening. (3) quatro ✓ verdes, ADMITTED, o Pod aterrissa no namespace
Running. A lição: você não mudou a política nem implorou a um admin — mudou seu manifesto para
alcançar a régua. Esse é o loop inteiro que o aluno roda no Lab 17.
-->

---
layout: recap
heading: 'Recap — menor privilégio, e quem o impõe quando'
story: 'O Pod inseguro foi recusado antes de existir (admission); o mesmo Pod, com hardening, entrou direto. readOnlyRootFilesystem então quebrou um Pod que escreve em disco em runtime — outra camada, outro conserto.'
next: 'NetworkPolicy — o complemento de rede: default-deny no tráfego pod-a-pod e allows explícitos'
---

- **`securityContext`** = o que o Pod pede para ser; **Pod Security Standards** = privileged →
  baseline → **restricted**, a régua da plataforma
- O `restricted` verifica **quatro** campos: `runAsNonRoot` · `allowPrivilegeEscalation:false` ·
  `drop ["ALL"]` · `seccompProfile` — defina-os e você entra
- **`readOnlyRootFilesystem` está *além* do restricted** — ótima higiene, mas pode quebrar
  aplicações que escrevem em `/` (conserte com um `emptyDir`)
- **PSA = labels de namespace** (`enforce`/`warn`/`audit`), embutido — `warn` primeiro, depois `enforce`
- Duas camadas: a **admission** rejeita antes de o Pod existir (PSA); o **kubelet** impõe em
  runtime (`runAsNonRoot` numa image root → CrashLoop) — prepara as defesas contra **pod escape**

<!--
Speaker: consolide o modelo mental de duas camadas, porque ele é o fio condutor do resto do Day
3. ADMISSION (PSA) decide se o Pod pode sequer existir — verificação pura de YAML, escopo de
namespace, acontece antes do armazenamento. RUNTIME (kubelet + kernel: seccomp, caps, a
verificação de realidade do runAsNonRoot, readOnlyRootFilesystem) governa o que o Pod pode
FAZER depois de rodando. `restricted` são quatro campos; readOnlyRootFilesystem é um quinto bom
hábito que NÃO faz parte dele e precisa de um emptyDir quando a aplicação escreve em disco.
Migre namespaces com warn→enforce para nunca surpreender um time. Tudo isso é o kit que o S25
usa contra um pod escape real, e faz par com o S18 (NetworkPolicy) no lado da rede. Passe o
bastão ao Lab 17: rotule um namespace como restricted, veja seu Pod inseguro ser recusado,
aplique hardening campo a campo até o gate admiti-lo, e então conheça o readOnlyRootFilesystem
— de graça para a aplicação de demo, fatal para um Pod que escreve um arquivo de PID até você
dar a ele um path gravável com emptyDir.
-->

---
layout: lab
lab: labs/day-3/17-pod-security.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 17 — Passe no `restricted`

- Rotule um namespace com `enforce=restricted` (kind) ou use seu namespace compartilhado pré-rotulado
- **Quebre:** aplique um Pod cru, root, sem contexto → **Forbidden**; leia a lista de quatro violações
- **Conserte:** adicione os quatro campos um de cada vez, reaplicando até o gate **admitir**
- Ligue o `readOnlyRootFilesystem` — de graça para a aplicação de demo; depois veja um Pod que
  *escreve* quebrar e dê a ele um `emptyDir`
- Confirme que a aplicação roda como UID 65532 (via `kubectl debug`) e que escritas em `/` são recusadas
