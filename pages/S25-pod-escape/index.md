---
layout: section-cover
image: /covers/section-25-breakout-foiled.webp
day: Day 3
section: '25'
tier: recommended
track: Security
---

# Segurança & pod escape

Como configurações fracas de Pod habilitam um container escape — e como evitá-lo.

**recommended** · sugerido para o Day 3 · trilha Security

<!--
Seção S25 — Security & pod escape (contraparte ofensiva-e-depois-DEFENSIVA do S17).
Sugerida para o Day 3 (M5, trilha Security). Tempo: ~35 min de slides + 30 min de lab. Isto é
educação DEFENSIVA de segurança: uma demonstração controlada, só em kind, de um container escape
via configurações perigosas de Pod, imediatamente seguida da defesa (o restricted Pod Security
Admission bloqueia o mesmo Pod no CREATE). O enquadramento é um requisito rígido — o PRIMEIRO
slide de conteúdo depois desta capa é a declaração de ética/escopo; todo beat de ataque é conceitual
(diagrama/cards) nos slides; a única coisa "ao vivo" é uma LEITURA benigna do filesystem do node no lab.
Beats: (1) enquadramento DEFENSIVO + ética/escopo · (2) threat model de kernel compartilhado (containers são
processos, não VMs) · (3) catálogo de configurações perigosas · (4) walkthrough conceitual do escape
(privileged + hostPath / → filesystem do node) · (5) magic-move do Pod atacante → Pod hardened ·
(6) AdmissionGate — o MESMO restricted gate admitindo o Pod hardened · (7) mapa de defesas
(S02/S17/S18 + scan/detect) · (7b) scanning ao vivo — Trivy Operator como o exemplo open-source
trabalhado da metade "scan-do-cluster-em-execução" (adição net-zero: 12 slides em 35 min fica abaixo
da norma de densidade do deck; o slide de categorias e sua postura de não-endossar-nada seguem inalterados) ·
(8) NSA/CISA + MITRE ATT&CK + categorias de ferramentas · (9) recap → lab.
Trivy Operator ACCURACY LOCKS (verificado contra aquasecurity.github.io/trivy-operator,
2026-08): roda DENTRO do cluster; escaneia workloads EM EXECUÇÃO — um scan dispara quando um workload
muda E quando o TTL de um report expira (padrão 24h), NÃO em um cron schedule (diga
"conforme os reports expiram", nunca "de madrugada"); os resultados são CRDs consultáveis com kubectl —
VulnerabilityReport, ConfigAuditReport, ExposedSecretReport…; o ponto vs scanning de CI:
ele pega CVEs divulgados DEPOIS de uma image já admitida ter sido implantada.
Só conceitos: sem pin, sem passo de lab.
Reutilize AdmissionGate.vue (NÃO escreva um novo componente). NOTA: o AdmissionGate renderiza os QUATRO
campos restricted (runAsNonRoot / allowPrivilegeEscalation / drop ALL / seccompProfile) — NÃO
privileged/hostPath. Então ele é narrado APENAS como "o mesmo gate que admite o Pod hardened";
a REJEIÇÃO específica de privileged/hostPath vive nos cards estáticos e na saída real do lab.
Vínculo com CKx: CKA security & hardening (defensivo).
-->

---
layout: statement
kicker: Leia isto primeiro · escopo & ética
---

Isto é segurança **defensiva**. Tudo aqui roda em um **kind cluster descartável que é seu** —
**nunca** contra um cluster compartilhado ou de produção.

Demonstramos um container escape **para que você consiga reconhecê-lo e bloqueá-lo**. O lab lê um único
arquivo **benigno** para *provar* o acesso, depois passa o resto do tempo na defesa. Nenhuma credencial
é despejada, nada é exfiltrado, nada é destruído. Rode o passo ofensivo **apenas** em um
cluster que você criou e vai deletar.

<!--
Speaker: diga isto em voz alta antes de qualquer conteúdo de ataque — é uma regra rígida, não um aviso.
Enquadramento: estamos aprendendo a DEFENDER, e você não consegue defender uma técnica que nunca viu. Então
mostramos UM escape, da forma mais contida possível: um kind cluster que você subiu e vai jogar fora. O
lab tem um context-check.sh que se recusa a rodar a menos que o contexto atual seja um contexto `kind-` —
esse guard controla todo passo ofensivo. O "ataque" em si é uma única LEITURA de /host/etc/os-release
para provar que estamos tocando o filesystem do node; NÃO lemos Secrets, certificados do kubelet, nem o
runtime socket — o ponto é feito demonstrando ACESSO, e o perigo é explicado com palavras.
Depois deletamos o Pod e passamos o resto da seção bloqueando-o. Se alguém estiver num cluster
compartilhado: observe, não digite. Este é o contrato de ética/escopo para a seção inteira.
-->

---
layout: statement
kicker: Modelo mental · a ameaça começa aqui
---

Um container **não é uma VM**. É um **processo no kernel do host**, cercado por namespaces e
cgroups.

Essa cerca é uma **configuração**, não uma parede. Enfraqueça o isolamento — rode como root, adicione
capabilities, monte o host, compartilhe seus namespaces — e "root no container" avança um pequeno passo
rumo a **root no node**. Cada configuração perigosa no próximo slide alarga essa brecha.

<!--
Speaker: esta é toda a razão pela qual o escape é possível, e é um callback ao S01/S03 (namespaces
+ cgroups) e ao S17 (kernel compartilhado, roda como root por padrão). Uma VM tem seu próprio kernel; uma
fronteira de hypervisor. Um container compartilha o único kernel do NODE — isolamento são namespaces Linux (pid, net,
mnt, …) + cgroups, ligados pelo container runtime. São botões. Gire os errados e
o processo consegue ver os processos do host (hostPID), a rede do host (hostNetwork), o
filesystem do host (hostPath), ou ganhar poderes em nível de kernel (privileged, SYS_ADMIN). Nenhum deles é um
"hack" — são todos campos suportados do Pod, destinados a um conjunto minúsculo de system workloads confiáveis, que
viram uma escotilha de fuga num Pod comum de aplicação. A seguir: os campos específicos que fazem isso.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">As configurações perigosas · cada uma troca isolamento por acesso ao host</span>

# O que enfraquece a cerca

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="privileged: true" icon="🔓" variant="danger">
      Poder quase total: (quase) todas as capabilities, acesso a devices, seccomp/AppArmor enfraquecidos. A
      maior alavanca de todas — a maioria dos escapes começa aqui.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="hostPath volume (especialmente /)" kind="pod" variant="danger">
      Monta um diretório do host dentro do Pod. Monte <code>/</code> e você pode ler e escrever no
      <strong>filesystem inteiro do node</strong> de dentro do container.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="hostPID / hostNetwork" kind="node" variant="danger">
      Compartilhe a tabela de processos ou a pilha de rede do node — veja e sinalize processos do host, fareje
      o tráfego do host, alcance serviços locais do node (kubelet, metadata).
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="montar o runtime socket" icon="🐳" variant="danger">
      Um <code>hostPath</code> de <code>/run/containerd/containerd.sock</code> (ou o socket do Docker)
      deixa o Pod iniciar <em>novos</em> containers privilegiados no node — game over.
    </KwCard>
  </v-click>
  <v-click at="5">
    <KwCard heading="SYS_ADMIN / SYS_PTRACE caps" icon="⚙️" variant="danger">
      Capabilities poderosas sem o <code>privileged</code> completo: montar filesystems, manipular
      namespaces (<code>SYS_ADMIN</code>), inspecionar/injetar em outros processos (<code>SYS_PTRACE</code>).
    </KwCard>
  </v-click>
  <v-click at="6">
    <KwCard heading="O fio condutor" icon="🎯" variant="warn">
      Cada uma entrega ao container um pedaço do <strong>host</strong>. O <code>restricted</code>
      proíbe <em>todas</em> elas — essa é a defesa, mais adiante nesta seção.
    </KwCard>
  </v-click>
</div>

</div>

<!--
Speaker: este é o catálogo — nomeie cada uma e qual recurso do host ela vaza. privileged é a
manchete: não é "uma capability", é o conjunto inteiro mais os device nodes mais um perfil seccomp
relaxado — o runtime basicamente para de te cercar. hostPath é a porta do filesystem; hostPath de /
é o caso extremo que o lab usa. hostPID/hostNetwork compartilham os namespaces de PID e net do node —
de repente o `ps` mostra processos do host e você consegue alcançar 169.254.169.254 ou a porta do kubelet. Montar
o socket do container runtime é a catástrofe silenciosa: com o containerd.sock você pede ao próprio
runtime do node para lançar um container privilegiado para você — você nem precisa de um escape, você É o
control plane daquele node. SYS_ADMIN/SYS_PTRACE são as capabilities "privileged-lite" que as pessoas adicionam sem
pensar. O ponto a fixar: nenhuma delas é exótica; são todas campos do Pod spec. E cada uma
é bloqueada pelo Pod Security Standard `restricted` do S17 — guarde esse pensamento para a correção.
-->

---
layout: statement
kicker: Walkthrough conceitual · nenhum exploit ao vivo aqui
---

# privileged + `hostPath: /` → domine o node

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="1 · O atacante ganha um ponto de apoio" icon="🚪" variant="warn">
      Uma dependência comprometida ou um manifesto permissivo demais aterrissa um Pod que define
      <code>privileged: true</code> e monta <code>hostPath: /</code> em <code>/host</code>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="2 · O filesystem do host está bem ali" kind="node" variant="danger">
      <code>/host</code> dentro do Pod <em>é</em> o <code>/</code> do node. Leia
      <code>/host/etc/kubernetes</code>, certificados do kubelet, os Secrets de todos os Pods sob
      <code>/host/var/lib/kubelet</code>…
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="3 · Ler vira escrever vira node" icon="✍️" variant="danger">
      Um host root gravável significa largar um static Pod em
      <code>/host/etc/kubernetes/manifests</code>, ou um cron job, ou chaves SSH — código arbitrário como
      <strong>root no node</strong>.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="4 · Um node → o cluster" icon="🌐" variant="danger">
      Node-root lê as credenciais do kubelet e todo Secret agendado ali. De um worker,
      pivote rumo a tokens que alcançam o API server. Blast radius = o cluster.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-3 text-sm kw-muted">
O lab prova o passo 2 com uma única <strong>leitura benigna</strong> — <code>cat
/host/etc/os-release</code> — e então para. Demonstramos <em>acesso</em>; não exfiltramos.
</div>

<!--
Speaker: SÓ conceitual — não há exploit ao vivo neste slide, apenas a cadeia de raciocínio, para que
os participantes entendam por que as configurações importam. Percorra os quatro cards: (1) o ponto de apoio é banal — uma
dependência npm/pip envenenada, ou um colega que copiou um manifesto privileged "pra funcionar" da
internet. (2) hostPath / montado em /host significa que o diretório /host do container é literalmente o
inode raiz do node — não precisa de exploit, é um mount suportado; você agora consegue ler o certificado de cliente
do kubelet, a CA, e sob /var/lib/kubelet todo ServiceAccount token projetado e Secret de todo
Pod naquele node. (3) por ser de leitura-E-ESCRITA, você escala: /etc/kubernetes/manifests é o diretório de
static-pod que o kubelet observa — largue um manifesto ali e o kubelet o roda como root, sem API
server envolvido. (4) o comprometimento do node cascateia: os Secrets daquele node, sua identidade de kubelet, movimento
lateral. O lab deliberadamente para numa LEITURA de /etc/os-release — esse único arquivo prova que estamos
no filesystem do node (é o SO do NODE, não da container image), e o perigo de
todo o resto é explicado no spoiler "por que é perigoso", não executado. Diga claramente: fazemos
o ponto mostrando acesso, não roubando nada.
-->

---
layout: code-walkthrough
heading: 'O Pod atacante → o manifesto que um namespace restricted admite'
lab: labs/day-3/25-pod-escape.md
---

````md magic-move
```yaml
# 0: o Pod de ESCAPE — privileged + o filesystem inteiro do host em /host.
#    Um namespace restricted REJEITA isto no admission (antes de existir).
apiVersion: v1
kind: Pod
metadata: { name: escape, labels: { app: s25 } }
spec:
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      securityContext:
        privileged: true                  # ← poder quase total no node
      volumeMounts:
        - { name: host, mountPath: /host }  # ← o / do node agora é /host
  volumes:
    - name: host
      hostPath: { path: / }               # ← monta o host root inteiro
```

```yaml
# 1: remova o privileged + o mount hostPath — as duas alavancas de escape se foram.
apiVersion: v1
kind: Pod
metadata: { name: escape, labels: { app: s25 } }
spec:
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      # sem privileged, sem hostPath volume
```

```yaml
# 2: +os quatro gates restricted (Pod security), fixados a um UID não-root real.
spec:
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000                   # UID não-root explícito (alpine roda em qualquer UID)
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
        seccompProfile: { type: RuntimeDefault }
```

```yaml
# 3: o Pod HARDENED por completo — é isto que o `enforce: restricted` ADMITE.
apiVersion: v1
kind: Pod
metadata: { name: hardened, labels: { app: s25 } }
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
```
````

<!--
Speaker: quatro frames, e a fronteira no meio é toda a história. O Frame 0 é o Pod do
atacante — privileged:true mais um hostPath de / montado em /host; essas duas linhas SÃO o escape. Num
namespace permissivo ele roda; num namespace `restricted` ele é REJEITADO no admission e nunca
existe. O Frame 1 remove exatamente as duas alavancas de escape (privileged, o hostPath volume) — necessário
mas ainda não suficiente: um Pod pelado ainda falha no `restricted` nos quatro campos do S17. O Frame 2
adiciona esses quatro gates (runAsNonRoot, allowPrivilegeEscalation:false, drop ALL, seccompProfile) e
fixa runAsUser:1000 — o alpine roda feliz em qualquer UID, então, diferente da armadilha da root-image do S17
(runAsNonRoot numa image que vem como root), não há nada para o kubelet recusar. O Frame 3 é o manifesto hardened final que o gate restricted admite — repare runAsNonRoot /
runAsUser / seccomp elevados ao nível de Pod para cobrir o Pod inteiro. Mesmo namespace, mesma policy; o
que mudou foi o manifesto. Este magic-move É o arco escape → block → harden do lab.
-->

---

<span class="kw-kicker">O mesmo gate restricted do Pod security — agora admitindo o Pod hardened</span>

# O admission gate segura a linha

<div class="mt-2">
  <AdmissionGate :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- Um violador do `restricted` é verificado **antes de ser armazenado** — os quatro gates falham → **Forbidden**,
  nada criado. (O Pod de escape do lab *também* tropeça em `privileged` + `hostPath` — violações reais
  que este gate não desenha.)
- Remova as alavancas de escape, defina os quatro campos, e reaplique o **mesmo** workload…
- …todo gate passa → **admitido** e agendado.
- Mesma policy, mesmo namespace — o **manifesto** atingiu o critério, não o contrário.

</v-clicks>
</div>

<!--
Speaker: nota de reúso — este é o AdmissionGate do S17, e ele visualiza os QUATRO campos restricted
(runAsNonRoot / allowPrivilegeEscalation / drop ALL / seccompProfile). Ele NÃO desenha a
verificação de privileged/hostPath, então NÃO afirme que a animação mostra "privileged bloqueado" — diga isso com
palavras. Narre: (bullet 1, falado durante o step 0) o Pod de escape seria rejeitado por privileged +
hostPath — essa rejeição é real (você a verá no lab) mas é a STRING, não este diagrama.
Este diagrama então faz a lição geral: (step 1) mesmo o Pod pelado com as alavancas de escape removidas é
NEGADO nos quatro campos; (step 2) reaplique o hardened; (step 3) ADMITIDO. A conclusão é idêntica
à do S17 e é o ponto da seção inteira: o `restricted` proíbe as configurações de escape E
exige least privilege — um label de namespace fecha a porta pela qual o Pod de escape entrou.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Defesa em profundidade · você já tem a maioria destas</span>

# O mapa de defesas

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Higiene de image" icon="📦" variant="ok">
      <code>USER</code> não-root, base mínima, sem shell/ferramentas para pivotar, escaneada por CVEs conhecidos.
      Uma image menor é um ponto de apoio menor.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Restricted PSS + admission" kind="ns" variant="ok">
      <code>enforce: restricted</code> proíbe <code>privileged</code>, <code>hostPath</code>, host
      namespaces, e exige drop-ALL + não-root + seccomp. <strong>Este é o bloqueio primário.</strong>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="NetworkPolicy" kind="netpol" variant="ok">
      Default-deny do tráfego leste-oeste para que um ponto de apoio não consiga escanear e pivotar livremente para outros Pods ou o
      endpoint de metadata.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Escanear + detectar" icon="🔎" variant="ok">
      Escaneie images por CVEs <em>antes</em> do deploy; rode um runtime detector para alertar sobre os
      comportamentos de escape (mounts inesperados, acesso ao host, novos containers privilegiados) <em>depois</em>.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-3 text-sm kw-muted">
Nenhum controle isolado basta — o <strong>admission</strong> barra o manifesto, a
<strong>image</strong> encolhe o ponto de apoio, a <strong>rede</strong> contém a explosão, e a
<strong>detecção</strong> pega o que escapa.
</div>

</div>

<!--
Speaker: amarre cada beat de segurança anterior do Day 3 a este escape como uma defesa nomeada — esse é o payoff
da trilha inteira. S02 (image hygiene): uma image não-root, estilo distroless, sem shell dá ao
atacante muito menos com que trabalhar mesmo se um Pod estiver com permissões demais; o scanning pega a
dependência envenenada antes de ela ir para produção. S17 (restricted PSS no admission) é o controle PRIMÁRIO aqui — ele
literalmente proíbe todo campo de que o Pod de escape precisa, e faz isso ANTES de o Pod existir; se você
levar uma coisa, é "rotule seus namespaces como restricted". S18 (NetworkPolicy): default-deny para que um
Pod comprometido não consiga varrer o namespace ou alcançar 169.254.169.254 sem obstáculo — contém o blast
radius. Depois duas categorias além deste workshop: image scanning (shift-left, gate de CVE pré-deploy)
e runtime detection (observar syscalls/comportamento exatamente por esses padrões de escape). Camadas: nenhuma
delas é suficiente, todas juntas encolhem o problema a ruído. Vendor-neutral — nomeamos
CATEGORIAS a seguir, não produtos.
-->

---
layout: code-annotated
heading: 'O scan não pode parar na pipeline — CVEs envelhecem no lugar'
compact: true
---

```console {none|1-4|all}
$ kubectl get vulnerabilityreports -n team-a
NAME                     REPOSITORY           CRITICAL  HIGH
replicaset-web-5d4b-web  library/legacy-app   2         11

$ kubectl describe vulnerabilityreport replicaset-web-5d4b-web
```

::notes::

<CodeNote at="1" label="escaneie o cluster em execução" variant="ok">
O <strong>Trivy Operator</strong> roda <em>dentro</em> do cluster e escaneia
<strong>workloads em execução</strong> — quando um workload muda, e de novo conforme cada
report expira. Uma image que estava limpa na hora do deploy é reverificada contra
o feed de CVE de <em>hoje</em>.
</CodeNote>

<CodeNote at="2" label="findings são objetos Kubernetes" variant="ok">
Os resultados aterrissam como CRDs — <code>VulnerabilityReport</code>,
<code>ConfigAuditReport</code>, <code>ExposedSecretReport</code> — você consulta com
<code>kubectl</code> puro. O <strong>operator pattern</strong> da
trilha de operators, aplicado à segurança.
</CodeNote>

<!--
Speaker: isto fecha o loop que o beat do Trivy no S17 abriu. O gate de CI escaneia uma image
UMA VEZ, na hora do build — mas CVEs são divulgados continuamente, então o risco da frota
deriva enquanto as images ficam paradas; a image limpa do ano passado é o finding
crítico deste ano. O Trivy Operator é a resposta in-cluster e o exemplo open-source
trabalhado do card "scan" do mapa de defesas: ele observa workloads, escaneia na
mudança, e reescaneia conforme os TTLs dos reports expiram (padrão 24h — é dirigido por expiração, não um
cron de madrugada), publicando findings como CRDs por workload. Como os reports são apenas
objetos Kubernetes, eles herdam tudo o que o workshop ensinou: kubectl get/
describe, RBAC sobre quem pode lê-los, e tooling baseado em watch. Diga a conexão com o operator
em voz alta — CRD + controller, exatamente o padrão do S22. Mantenha a
postura vendor-neutral do próximo slide intacta: o Trivy é UM exemplo open-source
da categoria image-scanner (o mesmo scanner que o S02/S17 usou), a detecção comportamental
em runtime segue sendo sua própria categoria, e o workshop não endossa nenhum produto. Nada
é instalado aqui — só conceitos; o lab permanece focado no arco escape/block.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Padrões & frameworks · aprenda com o campo, não nomeie vendor</span>

# Para onde aprofundar

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="NSA/CISA Kubernetes Hardening Guidance" icon="📕" variant="ok">
      Baseline de hardening vendor-neutral, escrito pelo governo: pod security, separação de rede,
      autenticação, audit logging, higiene de upgrade. Um checklist que você pode adotar por inteiro.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="MITRE ATT&CK for Containers" icon="🗺️" variant="ok">
      Um catálogo de técnicas reais de adversário mapeadas para containers/Kubernetes —
      <em>Escape to Host</em>, <em>privileged container</em>, credential access. Use-o para raciocinar
      sobre contra o que você está defendendo.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-3 text-sm">

<span class="kw-kicker">categorias de ferramentas — escolha uma ferramenta por categoria; este workshop não endossa nenhuma</span>

<div class="mt-1" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.8rem;">
  <KwCard heading="Benchmark scanner" icon="✅" variant="ok">
    Audita um cluster contra um benchmark de hardening (ex.: o CIS Kubernetes Benchmark) e reporta
    o drift.
  </KwCard>
  <KwCard heading="Image scanner" icon="🔎" variant="ok">
    Escaneia images por CVEs conhecidos e misconfigurations <strong>antes</strong> de serem implantadas.
  </KwCard>
  <KwCard heading="Runtime detector" icon="🚨" variant="ok">
    Observa syscalls/comportamento em <strong>runtime</strong> e alerta sobre padrões de escape conforme
    acontecem.
  </KwCard>
</div>

</div>

</div>

<!--
Speaker: duas referências nomeadas — ambas são corpos de padrões / frameworks, nomeados sem endosso,
que é exatamente o que cabe aqui. O NSA/CISA Kubernetes Hardening Guidance é um documento gratuito, governamental,
vendor-neutral — o caminho mais rápido para uma baseline defensável; aponte as pessoas para ele como leitura
obrigatória. O MITRE ATT&CK for Containers é o vocabulário compartilhado para comportamento de adversário — o escape
que fizemos mapeia para a técnica "Escape to Host"; é como blue teams raciocinam sobre cobertura. Depois as
CATEGORIAS de ferramentas, deliberadamente sem marca: um benchmark scanner (audita o cluster contra um benchmark
de hardening como o CIS Kubernetes Benchmark — CIS é um padrão, não um produto), um image scanner
(gate de CVE pré-deploy), um runtime detector (alertas comportamentais). Diga explicitamente: escolha uma ferramenta por
categoria segundo seus próprios critérios — este workshop não endossa nenhuma. Mantenha vendor-neutral em voz alta.
-->

---
layout: recap
heading: 'Recap — você viu o escape para poder fechá-lo'
story: 'Um Pod privileged com o host root montado leu o filesystem do node. Então um label de namespace — enforce: restricted — rejeitou aquele exato Pod no admission, antes que ele pudesse sequer existir.'
next: 'Trilha de segurança do Day 3 completa — image hygiene, pod security, network policy, e o escape contra o qual elas defendem, tudo uma só história'
---

- Um container é um **processo no kernel do host**, não uma VM — o isolamento é *configuração*, e as
  configurações erradas o burlam
- As alavancas de escape: **`privileged`**, **`hostPath: /`**, **`hostPID`/`hostNetwork`**, o
  **runtime socket**, **`SYS_ADMIN`/`SYS_PTRACE`** — cada uma entrega um pedaço do host
- **O `restricted` PSA é o bloqueio primário** — ele proíbe cada uma dessas configurações e rejeita
  o Pod **no admission, antes de ele existir**
- **Defesa em profundidade:** image hygiene + restricted admission + NetworkPolicy +
  image scanning + runtime detection — nenhuma camada isolada basta
- Aprofunde com o **NSA/CISA Hardening Guidance** e o **MITRE ATT&CK for Containers**; o lab faz
  isto **só em kind, defensivamente** — demonstrar acesso, depois bloqueá-lo

<!--
Speaker: assente o arco. Fizemos algo assustador de propósito e num sandbox para que você o reconhecesse e,
mais importante, conhecesse o único controle que o para. O modelo mental é o fio condutor: um
container é um processo cercado num kernel compartilhado, e campos perigosos de Pod o descercam. As cinco
alavancas de escape todas entregam recursos do host. O `restricted` Pod Security Admission é a defesa
primária — ele proíbe TODAS elas e faz isso no admission, então o Pod nunca existe (contraste: um
runtime detector o pega DEPOIS, e é por isso que você quer os dois). Defesa em profundidade amarra a trilha de
segurança inteira do Day 3: S02 encolhe o ponto de apoio, S17 bloqueia o manifesto, S18 contém a explosão,
scanning/detection cobrem as brechas. Mande-os para NSA/CISA + MITRE ATT&CK para o mapa do mundo real. Depois
o lab: estritamente só em kind, um context-check.sh o controla, lemos UM arquivo benigno para provar acesso,
deletamos o Pod, rotulamos o namespace como restricted, e vemos o mesmo Pod ser rejeitado. Defensivo do
começo ao fim.
-->

---
layout: lab
lab: labs/day-3/25-pod-escape.md
duration: 30 min
env: kind-only · strictly defensive
---

## Lab 25 — Escape, depois bloqueie

- **Início protegido:** o `context-check.sh` se recusa a rodar a menos que você esteja num contexto **kind**
- Num namespace **permissivo**: aplique um Pod `privileged` + `hostPath: /` e leia **um arquivo
  benigno do node** (`/host/etc/os-release`) para provar acesso ao host — sem secrets, sem escritas
- **Correção:** delete o Pod, rotule o namespace com `enforce=restricted`, **reaplique o mesmo Pod** →
  veja o PSA **rejeitá-lo no admission** com as violações de privileged/hostPath
- Aplique o manifesto **hardened** → admitido e rodando; reset de pânico = **delete o kind cluster**
